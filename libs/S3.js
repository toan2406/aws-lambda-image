var ImageData = require("./ImageData");

var aws     = require("aws-sdk");
var Promise = require("es6-promise").Promise;
var client  = new aws.S3({apiVersion: "2006-03-01"});

/**
 * Get object data from S3 bucket
 *
 * @param String bucket
 * @param String key
 * @return Promise
 */
function getObject(bucket, key, acl) {
    return new Promise(function(resolve, reject) {
        client.getObject({ Bucket: bucket, Key: key }, function(err, data) {
            if ( err ) {
                reject("S3 getObject failed: " + err);
            } else {
                if ("img-processed" in data.Metadata) {
                    reject("Object was already processed.");
                    return;
                }

                resolve({
                    metadata: data.Metadata,
                    data: new ImageData(key, bucket, data.Body, { ContentType: data.ContentType, CacheControl: data.CacheControl }, acl)
                });
            }
        });
    });
}

/**
 * Put object data to S3 bucket
 *
 * @param String bucket
 * @param String key
 * @param Buffer buffer
 * @return Promise
 */
function putObject(bucket, key, buffer, headers, acl) {
    return new Promise(function(resolve, reject) {
        var params = {
            Bucket: bucket,
            Key: key,
            Body: buffer,
            Metadata: {"img-processed": "true"},
            ContentType: headers.ContentType,
            CacheControl: headers.CacheControl
        };
        if( acl ){
            params['ACL'] = acl;
        }
        client.putObject(params, function(err) {
            if ( err ) {
                reject(err);
            } else {
                resolve("S3 putObject success");
            }
        });
    });
}

/**
 * Put objects data to S3 bucket
 *
 * @param Array<ImageData> images
 * @return Promise.all
 */
function putObjects(images) {
    return Promise.all(images.map(function(image) {
        return new Promise(function(resolve, reject) {
            putObject(image.getBucketName(), image.getFileName(), image.getData(), image.getHeaders(), image.getACL())
            .then(function() {
                resolve(image);
            })
            .catch(function(message) {
                reject(message);
            });
        });
    }));
}

module.exports = {
    getObject: getObject,
    putObject: putObject,
    putObjects: putObjects
};



