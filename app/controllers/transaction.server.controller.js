// @transaction.server.controller
// Author: Rijul Luman
// To store and fetch Unconfirmed Transactions

'use strict';
var async = require('async');

function decimalPlaces(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
       0,
       // Number of digits right of decimal point.
       (match[1] ? match[1].length : 0)
       // Adjust for scientific notation.
       - (match[2] ? +match[2] : 0));
}

var validateCoinValue = function (coinValue) {
    if(!coinValue) return false;
    coinValue = Number(coinValue);
    if(coinValue < 0) return false;
    if(decimalPlaces(coinValue) > 8) return false;  // Decimals upto 8 places only
    return coinValue;
 }

/**
 * Transaction Bind middleware
 */
exports.transactionByID = function(req, res, next, id) {
    if(['add'].indexOf(id)!==-1){
        next();
    }else{
        RedisHandler.getUnconfirmedTransactionById(id, function(err, transaction){
            req.transaction = transaction;
            next();
        });
    }
};

/**
 * Fetch a Transaction
 */
exports.read = function(req, res) {
    res.jsonp(req.transaction);
};

exports.validate = function (req, res, next) {
    var transaction = req.transaction != null ? req.transaction : req.body;
    if(!transaction){
        return ErrorCodeHandler.getErrorJSONData({'code':5, 'res':res});
    }
    transaction.amount = validateCoinValue(transaction.amount);
    if(!transaction.amount){
        return ErrorCodeHandler.getErrorJSONData({'code':6, 'res':res});
    }
    transaction.fees = validateCoinValue(transaction.fees);
    if(!transaction.fees){
        return ErrorCodeHandler.getErrorJSONData({'code':7, 'res':res});
    }
    if(!transaction.sender || !CommonFunctions.validatePublicKeyHexString(transaction.sender)){
        return ErrorCodeHandler.getErrorJSONData({'code':8, 'res':res});
    }
    transaction.sender = transaction.sender.toLowerCase();
    if(!transaction.receiver || !CommonFunctions.validatePublicKeyHexString(transaction.receiver)){
        return ErrorCodeHandler.getErrorJSONData({'code':9, 'res':res});
    }
    transaction.receiver = transaction.receiver.toLowerCase();
    if(!transaction.nonce || isNaN(parseInt(transaction.nonce)) || parseInt(transaction.nonce) < Constants.MINIMUM_TRANSACTION_NONCE){
        return ErrorCodeHandler.getErrorJSONData({'code':13, 'res':res});
    }
    transaction.nonce = parseInt(transaction.nonce);
    if(CommonFunctions.generateTransactionHash(transaction) != transaction.txId){
        return ErrorCodeHandler.getErrorJSONData({'code':14, 'res':res});
    }
    transaction.txId = transaction.txId.toLowerCase();
    if(!CommonFunctions.verifySignature(transaction.txId, transaction.sender, transaction.signature)){
        return ErrorCodeHandler.getErrorJSONData({'code':15, 'res':res});
    }
    transaction.signature = transaction.signature.toLowerCase();
    req.transaction = transaction;
    next();

};

exports.create = function (req, res, next) {
    var transaction = {
        txId        : "",   // Unique Hash for this transaction
        sender      : "",
        receiver    : "",
        amount      : 0,
        fees        : 0,
        deadline    : 0,
        nonce       : 0,
        signature   : ""
    };
    if(!req.body){
        return ErrorCodeHandler.getErrorJSONData({'code':5, 'res':res});
    }
    transaction.amount = validateCoinValue(req.body.amount);
    if(!transaction.amount){
        return ErrorCodeHandler.getErrorJSONData({'code':6, 'res':res});
    }
    transaction.fees = validateCoinValue(req.body.fees);
    if(!transaction.fees){
        return ErrorCodeHandler.getErrorJSONData({'code':7, 'res':res});
    }
    if(!req.body.sender || !CommonFunctions.validatePublicKeyHexString(req.body.sender)){
        return ErrorCodeHandler.getErrorJSONData({'code':8, 'res':res});
    }
    transaction.sender = req.body.sender.toLowerCase();
    if(!req.body.receiver || !CommonFunctions.validatePublicKeyHexString(req.body.receiver)){
        return ErrorCodeHandler.getErrorJSONData({'code':9, 'res':res});
    }
    transaction.receiver = req.body.receiver.toLowerCase();
    if(!req.body.privateKey || !CommonFunctions.validatePrivateKeyHexString(req.body.privateKey)){
        return ErrorCodeHandler.getErrorJSONData({'code':10, 'res':res});
    }
    var privateKey = CommonFunctions.hexStringToBuffer(req.body.privateKey.toLowerCase());

    async.waterfall([
        function defaultDeadline(cb){
            if(!req.body.deadline){
                RedisHandler.getCurrentBlock(function(err, deadline){
                    if(err){
                        return ErrorCodeHandler.getErrorJSONData({'code':3, 'res':res});
                    }
                    else{
                        transaction.deadline = deadline + Constants.TRANSACTION_DEADLINE_OFFSET;
                    }
                    cb();
                });
            }
            else if(isNaN(parseInt(req.body.deadline))){
                return ErrorCodeHandler.getErrorJSONData({'code':11, 'res':res});
            }
            else{
                transaction.deadline = parseInt(req.body.deadline);
                cb();
            }
        },
        function generateNonce(cb){
            CommonFunctions.generateTransactionNonce(function(err, nonce){
                if(err){
                    return ErrorCodeHandler.getErrorJSONData({'code':12, 'res':res});
                }
                transaction.nonce = nonce;
                cb();
            });
        },
        function generateTransactionId(cb){
            transaction.txId = CommonFunctions.generateTransactionHash(transaction);
            cb();
        },
        function generateSignature(cb){
            transaction.signature = CommonFunctions.generateSignature(transaction.txId, privateKey);
            cb();
        },
        

        ], function(){
            req.transaction = transaction;
            next();
        });

    
};

exports.broadcast = function (req, res, next) {
    res.status(200).jsonp(req.transaction);
};

exports.addUnconfirmed = function (req, res, next) {
    RedisHandler.addUnconfirmedTransaction(req.transaction, function (err, reply) {
        next();
    });
};