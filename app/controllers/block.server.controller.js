// @block.server.controller
// Author: Rijul Luman
// To Create, store and fetch Blocks

'use strict';
var async = require('async');

/**
 * Block Bind middleware
 */
exports.blockByID = function(req, res, next, id) {
  console.log("id", id);
    // TODO : Fetch block from Mongo
};

/**
 * Fetch a Block
 */
exports.read = function(req, res) {
    res.jsonp(req.block);
};

/**
 * Create a Block
 */
exports.create = function(req, res) {

    var block = {
      blockNumber           : 0,
      nonce                 : 0,
      blockCreatorId        : "",
      previousBlockHash     : "",
      totalAmount           : 0,
      totalFees             : 0,
      transactionCount      : 0,
      transactionHash       : "",
      transactionSignature  : "",
      blockHash             : "",
      blockSignature        : "",
      transactions          : []
    };

    var user = {};
    var zaddClear = [];

    async.waterfall([
            function getBlockCreatorDetails(cb){
                user.publicKey = req.body.publicKey;
                user.privateKey = CommonFunctions.hexStringToBuffer(req.body.privateKey);
                //TODO : Change input method (Maybe Redis via login)

                block.blockCreatorId = user.publicKey;
                cb();
            },

            function generateNonce(cb){
                CommonFunctions.generateBlockNonce(function(err, nonce){
                    block.nonce = nonce;
                    cb(err);
                });
            },

            function getTransactionArray(cb){
                makeTransactionArray(Constants.BLOCK_MAX_TRANSACTIONS_COUNT, function(err, ids, transactions){
                    block.transactions = transactions;
                    block.transactionCount = transactions.length;
                    zaddClear = ids;        // Transaction ids to remove after creation of block
                    cb(err);
                });
            },

            function calculateTotalCoins(cb){
                block.transactions.forEach(function(transaction){
                    block.totalFees += transaction.fees * 10000000;
                    block.totalAmount += transaction.amount * 10000000;
                });
                block.totalFees = block.totalFees / 10000000;
                block.totalAmount = block.totalAmount / 10000000;
                cb();
            },

            function updateBlockChain(cb){
                // TODO : Call Blockchain update here
                cb();
            },

            function getPreviousBlock(cb){
                // TODO : Read from Mongo
                BlockCollection.find({}).;
                block.blockNumber = 0;
                block.previousBlockHash = Constants.GENESIS_BLOCK_PREV_HASH;
                cb();
            },

            function generateHashesAndSignatures(cb){
                block.transactionHash = CommonFunctions.generateTransactionArrayHash(block.transactions);
                block.transactionSignature = CommonFunctions.generateSignature(block.transactionHash, user.privateKey);
                
                block.blockHash = CommonFunctions.generateBlockHash(block);
                block.blockSignature = CommonFunctions.generateSignature(block.blockHash, user.privateKey);
                cb();
            },

            function validateGeneratedBlock(cb){
                if(validateBlock(block)){
                    cb();
                }
                else{
                    console.log("Invalid Block");
                    return;             // TODO : Handle Properly
                }
            },

            function addBlockToDb(cb){
                BlockCollection.insert(block, function(err, reply){
                    if(err){
                        console.log("Insert Mongo Error", err);
                    }
                    cb();
                });
                cb();
            },

            function broadcastGeneratedBlock(cb){
                broadcastBlock(block);
                cb(); // Next call should be independent of broadcast failure
            },

            function removeTransactionsFromMemory(cb){
                // TODO : remove zadd entries and 
                RedisHandler.removeTransactionsFromZlist(zaddClear);
                RedisHandler.removeUnconfirmedTransactions(block.transactions);
                cb();
            }

        ], function(errs, result){
            res.jsonp(block);   // TODO : Remove for cron script
        });
};

var makeTransactionArray = function(count, callback){
    RedisHandler.getMaxFeeTransactionIds(count, function(err, ids){
        if(ids.length == 0){
            return callback(null, [], []);
        }
        RedisHandler.getTransactionArray(ids, function(err, txArr){
            // TODO : Validate Balance amounts for Transactions Here
            // Also consider fee amounts in calculations

            if(txArr.length < count && ids.length == count){

                makeTransactionArray(count - txArr.length, function(err, recId, recArr){
                    callback(null, ids.concat(recId), txArr.concat(recArr));
                });
                
            }
            else{
                callback(null, ids, txArr);
            }
        });
    });
};

var validateBlock = function(block){
    // TODO
    return true;
};

var broadcastBlock = function(block){
    //TODO
};

