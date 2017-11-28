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
                res.send("Login Failure ! (Redis Error)");
            }
        });
        
    }
    else{
        res.send("Invalid Key pair");
    }
    // res.jsonp(req.transaction);
};

exports.getCoinAge = function(req, res) {
    // TODO : Read from Login
    var user = 
    // {
    //     "privateKey": "fcbd864a695f0fef7162af1ff80641d351fc31e2ff35347488d83d1f386376e5",
    //     "publicKey": "036efa45411e658bcafd151abe923334568ddd734e43e6432de38dac5a622c7756"
    // };
    {
        "privateKey": "418836c2f238940f9f62115800075b956ec0f167a60bce42663e9958f62eae7b",
        "publicKey": "027ce749cc99715d1dd0904c7ccf5e3a9988e57fbbecfe9b0d73f7fff32f3b12a6"
    };
    var userId = user.publicKey;
    var suppliedBlockNumber;
    
    MongoHandler.calculateCoinAge(userId, suppliedBlockNumber, function(err, totalStake){
        res.jsonp({stake : totalStake});
    });

};