// @RedisHandler
// Author: Rijul Luman
// To read data from Redis in the desired format. 

var async = require("async");
var redisPath = Constants.redisPath;

var RedisHandler = {

    getCurrentBlock : function(callback){       // Should not be used when making a new block
        RedisStoreSL.get(redisPath.currentBlock, function(err, reply){
            if(err){
                callback(err);  
            }
            else if(reply == null){
                BlockCollection.find({}, {_id : 0, blockNumber : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(errs, docs){
                    var previousBlock = docs[0] ? docs[0] : {blockNumber : 0};
                    RedisStoreMA.setex(redisPath.currentBlock, Constants.CURRENT_BLOCK_REDIS_TTL, previousBlock.blockNumber, function(err, reply){
                        callback(null, previousBlock.blockNumber);
                    });   
                });
            }
            else{
                callback(null, parseInt(reply));
            }
        });
    },

    clearCurrentBlock : function(callback){
        RedisStoreMA.del(redisPath.currentBlock, callback);
    },

  
    addUnconfirmedTransaction: function(transaction, callback) {
        async.waterfall([
            function getCurrentBlockNumber(cb){
                RedisHandler.getCurrentBlock(cb);
            },
            function setTransaction(currentBlock, cb){
                // Set TTL to block difference * block time
                var blockDifference = transaction.deadline - currentBlock;
                if(blockDifference < 0){
                    return callback(null, true);        // Expired transaction, need not be added to unconfirmed Transactions
                }
                var ttl = blockDifference * Constants.UNCONFIRMED_TRANSACTION_TTL_SECONDS_PER_BLOCK;
                RedisStoreMA.setex(redisPath.unconfirmedTransaction + transaction.txId, ttl, JSON.stringify(transaction), function(err, reply){
                    cb(err);
                });
            },
            function sortTransactionByFee(cb){
                RedisStoreMA.zadd([redisPath.sortedUnconfirmedTransaction, transaction.fees * 10000000, transaction.txId], function(err, reply){        // * 10000000 to avoid approximation by Redis
                    cb(err);
                });
            },
        ], 
        function(errs, result){
            if(errs && errs.length){
                callback(true, null);
            }
            else{
                callback(null, true);
            }
        });
    },

    getUnconfirmedTransactionById: function(txId, callback) {
        RedisStoreSL.get(redisPath.unconfirmedTransaction + txId, function(err, reply){
            if(err){
                callback(err);  
            }
            else{
                callback(null, reply ? JSON.parse(reply) : null);
            }
        });
    },

    getMaxFeeTransactionIds : function(count, callback){
        RedisStoreSL.zrevrange([redisPath.sortedUnconfirmedTransaction, 0, count-1], function(err, reply){
            callback(err, reply ? reply : []);
        });
    },

    getTransactionArray : function(ids, callback){
        var transactions = [];
        var expiredIds = [];
        async.each(ids, function(txId, cb){ // Use eachSeries for ordered list
            RedisHandler.getUnconfirmedTransactionById(txId, function(err, reply){
                if(!err && !reply){
                    expiredIds.push(txId);
                }
                else if(!err){
                    transactions.push(reply);
                }
                cb();
            });
        }, 

        function(errs){
            callback(null, transactions);
            if(!errs && expiredIds.length > 0){
                RedisHandler.removeTransactionsFromZlist(expiredIds);
            }
        });
    },

    removeTransactionsFromZlist : function(ids){
        async.each(ids, function(txId, cb){
            RedisStoreMA.zrem([redisPath.sortedUnconfirmedTransaction, txId], function(err, reply){
                // console.log("Removed from zlist : ", txId);
            });
        });
    },

    removeUnconfirmedTransaction : function(txId, callback){
        RedisStoreMA.del(redisPath.unconfirmedTransaction + txId, function(err, reply){
            // console.log("Deleted Unconfirmed Transaction : ", txId);
        });
    },

    removeUnconfirmedTransactions : function(transactions, callback){
        async.each(transactions, function(transaction, cb){
            RedisHandler.removeUnconfirmedTransaction(transaction.txId, cb);
        },

        function(errs, reply){
            callback();
        });
    },

  
//End of export   
}

module.exports = RedisHandler;