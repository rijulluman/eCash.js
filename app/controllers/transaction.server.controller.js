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
        // TODO
    }
};

/**
 * Fetch a Transaction
 */
exports.read = function(req, res) {
    res.jsonp(req.transaction);
};

exports.validate = function (req, res, next) {
    
};

exports.create = function (req, res, next) {
    var transaction = {
        txId        : "",   // Unique Hash for this transaction
        sender      : "",
        receiver    : "",
        amount      : 0,
        fees        : 0,
        deadline    : "",
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

    async.waterfall([
        function generateNonce(cb){
            CommonFunctions.generateTransactionNonce(function(err, nonce){
                if(err){
                    return ErrorCodeHandler.getErrorJSONData({'code':9, 'res':res});
                }
                transaction.nonce = nonce;
                cb();
            });
        },


        ], function(){
            console.log(transaction);
        });

    
};

exports.broadcast = function (req, res, next) {
    
};

exports.addUnconfirmed = function (req, res, next) {
    var transaction = {};
    redisHandler.addUnconfirmedTransaction(transaction, function () {
        // body...
    });
};