var ImageResizer = require("./ImageResizer");
var ImageReducer = require("./ImageReducer");
var S3           = require("./S3");
var Promise      = require("es6-promise").Promise;
var request      = require("request-promise");

/**
 * Image processor
 * management resize/reduce image list by configration,
 * and pipe AWS Lambda's event/context
 *
 * @constructor
 * @param Object s3Object
 * @param Object context
 */
function ImageProcessor(s3Object) {
    this.s3Object = s3Object;
}

/**
 * Run the process
 *
 * @public
 * @param Config config
 */
ImageProcessor.prototype.run = function ImageProcessor_run(config) {
    var self = this;
    var targetedImage;
    return new Promise(function(resolve, reject) {
        // If object.size equals 0, stop process
        if ( this.s3Object.object.size === 0 ) {
            reject("Object size equal zero. Nothing to process.");
            return;
        }

        if ( ! config.get("bucket") ) {
            config.set("bucket", this.s3Object.bucket.name);
        }

        S3.getObject(
            this.s3Object.bucket.name,
            unescape(this.s3Object.object.key.replace(/\+/g, ' '))
        )
        .then(function(image) {
            targetedImage = image;
            if (targetedImage.metadata.res) {
                return request(`http://dreamworks-asia.com/api/v1/resolution/${targetedImage.metadata.res}`);
            } else {
                resolve('No image to be proceeded.');
            }
        })
        .then(function(serializedResolution) {
            var resolution = JSON.parse(serializedResolution);
            config.set('resizes', [{
                width: resolution.width || '',
                height: resolution.height || '',
                directory: resolution.label
            }]);
            return self.processImage(targetedImage.data, config);
        })
        .then(function(results) {
            return S3.putObjects(results);
        })
        .then(function(images) {
            console.log('===== IMAGES =====\n', images);
            var imageUrl = `//${images[0].getBucketName()}.s3.amazonaws.com/${images[0].getFileName()}`;
            return request.put({
                url: 'http://dreamworks-asia.com/api/v1/set-image',
                formData: {
                    model: targetedImage.metadata.model,
                    doc: targetedImage.metadata.doc,
                    path: targetedImage.metadata.path,
                    image_url: imageUrl
                }
            });
        })
        .then(function() {
            resolve('1 images has proceeded.');
        })
        .catch(function(error) {
            reject(error);
        });
    }.bind(this));
};

ImageProcessor.prototype.processImage = function ImageProcessor_processImage(imageData, config) {
    var jpegOptimizer = config.get("jpegOptimizer", "mozjpeg");
    var promiseList = config.get("resizes", []).filter(function(option) {
            return (option.size && option.size > 0)   ||
                   (option.width && option.width > 0) ||
                   (option.height && option.height > 0);
        }).map(function(option) {
            if ( ! option.bucket ) {
                option.bucket = config.get("bucket");
            }
            if ( ! option.acl ){
                option.acl = config.get("acl");
            }
            option.jpegOptimizer = option.jpegOptimizer || jpegOptimizer;
            return this.execResizeImage(option, imageData);
        }.bind(this));

    if ( config.exists("reduce") ) {
        console.log('===== REDUCE IMAGE =====');
        var reduce = config.get("reduce");

        if ( ! reduce.bucket ) {
            reduce.bucket = config.get("bucket");
        }
        reduce.jpegOptimizer = reduce.jpegOptimizer || jpegOptimizer;
        promiseList.unshift(this.execReduceImage(reduce, imageData));
    }

    return Promise.all(promiseList);
};

/**
 * Execute resize image
 *
 * @public
 * @param Object option
 * @param imageData imageData
 * @return Promise
 */
ImageProcessor.prototype.execResizeImage = function ImageProcessor_execResizeImage(option, imageData) {
    return new Promise(function(resolve, reject) {
        var resizer = new ImageResizer(option);

        resizer.exec(imageData)
        .then(function(resizedImage) {
            var reducer = new ImageReducer(option);

            return reducer.exec(resizedImage);
        })
        .then(function(reducedImage) {
            resolve(reducedImage);
        })
        .catch(function(message) {
            reject(message);
        });
    });
};

/**
 * Execute reduce image
 *
 * @public
 * @param Object option
 * @param ImageData imageData
 * @return Promise
 */
ImageProcessor.prototype.execReduceImage = function(option, imageData) {
    return new Promise(function(resolve, reject) {
        var reducer = new ImageReducer(option);

        reducer.exec(imageData)
        .then(function(reducedImage) {
            resolve(reducedImage);
        })
        .catch(function(message) {
            reject(message);
        });
    });
};

module.exports = ImageProcessor;
