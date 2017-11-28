// @user.server.controller
// Author: Rijul Luman
// All User Specific operations here

'use strict';
var async = require('async');

/**
 * Save Wallet info in Redis
 */
exports.login = function(req, res) {
    var user = {};
    var sampleMessage = "test";
    if(
            CommonFunctions.validatePublicKeyHexString(req.body.publicKey)
        &&  CommonFunctions.validatePrivateKeyHexString(req.body.privateKey)
        &&  CommonFunctions.verifyWalletKeyPair(req.body.privateKey, req.body.publicKey)
        ){
        user.publicKey = req.body.publicKey.toLowerCase();
        user.privateKey = req.body.privateKey.toLowerCase();

        RedisHandler.setUserDetails(user, function(err, reply){
            if(!err){
                res.send("Login Successful !");
            }
            else{
                return ErrorCodeHandler.getErrorJSONData({'code':3, 'res':res});
            }
        });
        
    }
    else{
        return ErrorCodeHandler.getErrorJSONData({'code':30, 'res':res});
    }
    // res.jsonp(req.transaction);
};

exports.setUserDetails = function(req, res, next){
    RedisHandler.getUserDetails(function(err, userData){
        if(userData){
            req.user = userData;
        }
        next();
    });
}

exports.getCoinAge = function(req, res) {
    if(req.user){
        var userId = req.user.publicKey;
        var suppliedBlockNumber;
        
        MongoHandler.calculateCoinAge(userId, suppliedBlockNumber, function(err, totalStake){
            res.jsonp({stake : totalStake});
        });
    }
    else{
        return ErrorCodeHandler.getErrorJSONData({'code':4, 'res':res});
    }
};