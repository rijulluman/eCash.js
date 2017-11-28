// @RedisHandler
// Author: Rijul Luman
// To read/write data to/from Redis in the desired format. 

var async = require("async");
var redisPath = Constants.redisPath;

var RedisHandler = {

    getCurrentBlock : function(callback){       // Should not be used when making a new block
        RedisStoreSL.get(redisPath.currentBlock, function(err, reply){
            if(err){
                callback(err);  
            }
            else if(reply == null){
                MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
                    RedisStoreMA.setex(redisPath.currentBlock, Constants.CURRENT_BLOCK_REDIS_TTL, blockNumber, function(err, reply){
                        callback(null, blockNumber);
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

    removeUnconfirmedTransactions : function(transactions){
        async.each(transactions, function(transaction, cb){
            RedisHandler.removeUnconfirmedTransaction(transaction.txId, cb);
        },

        function(errs, reply){
            // callback();
        });
    },

    cachedCoinAge : function(block, callback){
        RedisStoreSL.get(redisPath.coinAge + block.blockHash , function(err, reply){
            if(err){
                callback(err);  
            }
            else if(reply == null){
                MongoHandler.calculateCoinAge(block.blockCreatorId, block.blockNumber, function(err, coinAge){
                    RedisStoreMA.setex(redisPath.coinAge + block.blockHash, Constants.BLOCK_COIN_AGE_REDIS_TTL, ""+coinAge, function(err, reply){
                        callback(null, coinAge);
                    });   
                });
            }
            else{
                callback(null, Number(reply));
            }
        });
    },

    isBlockchainUpdateInProgress : function(callback){
        RedisStoreSL.get(redisPath.blockchainUpdateInProgress , function(err, reply){
            if(err){
                callback(err);  
            }
            if(reply){
                callback(null, true);
            }
            else{
                callback(null, false);
            }
        });
    },

    setBlockchainUpdateInProgress : function(callback){
        RedisStoreMA.incr(redisPath.blockchainUpdateInProgress, function(err, reply){         
            if(reply == 1){
                RedisStoreMA.expire(redisPath.blockchainUpdateInProgress, Constants.BLOCKCHAIN_UPDATE_HOLD_TTL_MULTIPLIER * Constants.AVERAGE_BLOCK_TIME_MS / 1000); // Limits update fail to BLOCKCHAIN_UPDATE_HOLD_TTL_MULTIPLIER blocks, will auto retry after BLOCKCHAIN_UPDATE_HOLD_TTL_MULTIPLIER blocks, 
                // TODO : will face issues if expire set fails, add fix
                callback(null, true);
            }
            else{
                callback(err, false);
            }
        });
    },

    resetBlockchainUpdateInProgress : function(){
        RedisStoreMA.del(redisPath.blockchainUpdateInProgress, function(err, reply){
            // callback(err);
        });
        RedisStoreMA.del(redisPath.setUpdateSocketId, function(err, reply){
            // callback(err);
        });
    },

    setUpdaterDetails : function(socketId, callback){
        RedisStoreMA.setex(redisPath.setUpdateSocketId, Constants.BLOCKCHAIN_UPDATE_HOLD_TTL_MULTIPLIER * Constants.AVERAGE_BLOCK_TIME_MS / 1000, socketId, function(err, reply){
            callback(err);
        }); 
    },

    getUpdaterDetails : function(callback){
        RedisStoreSL.get(redisPath.setUpdateSocketId, callback);
    },

    setUserDetails : function(userData, callback){
        RedisStoreMA.set(redisPath.userKeys, JSON.stringify(userData), function(err, reply){
            callback(err);
        }); 
    },

    getUserDetails : function(callback){
        RedisStoreSL.get(redisPath.userKeys, function(err, reply){
            if(reply && reply.length){
                var userData = JSON.parse(reply);
                userData.privateKey = CommonFunctions.hexStringToBuffer(userData.privateKey);
                callback(null, userData);
            }
            else{
                callback(err);
            }
        });
    },
  
//End of export   
}

module.exports = RedisHandler;