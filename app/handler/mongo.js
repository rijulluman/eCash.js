// @MongoHandler
// Author: Rijul Luman
// To read/write data to/from Mongo in the desired format. 

var async = require("async");

var MongoHandler = {
    getCurrentBlockNumber : function(callback){
        BlockCollection.find({}, {_id : 0, blockNumber : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
            var blockNumber = docs[0] ? docs[0].blockNumber : 0;
            callback(null, blockNumber);
        });
    },

    setAllBlockBalances : function (callback){
        BalanceCollection.find({}, {blockNumber : 1}).toArray(function(err, docs){
            if(err){
                console.log("MongoErr: ", err);
                callback(err);
            }
            else{
                var blocks = [];
                docs.forEach(function(doc){
                    blocks.push(parseInt(doc.blockNumber));
                });
                MongoHandler.getCurrentBlockNumber(function(err, currentBlockNumber){
                    var toFillBlocks = [];
                    for(var i = 0; i <= currentBlockNumber; i++){
                        if(blocks.indexOf(i) == -1){
                            toFillBlocks.push(i);
                        }
                    }

                    async.each(toFillBlocks, function(blockNumber, cb){
                            BlockCollection.find({blockNumber : blockNumber}).toArray(function(err, doc){
                                if(err || !doc){
                                    console.log("No Such Block : ", blockNumber);
                                    cb();
                                }
                                else{
                                    var block = doc[0];
                                    var transactions = block.transactions ? block.transactions : [];
                                    var users = [block.blockCreatorId];
                                    var balances = [];

                                    transactions.forEach(function(transaction){
                                        if(users.indexOf(transaction.sender) == -1){
                                            users.push(transaction.sender);
                                        }
                                        if(users.indexOf(transaction.receiver) == -1){
                                            users.push(transaction.receiver);
                                        }
                                    });

                                    async.each(users, function(userId, cb2){
                                        MongoHandler.calculateAccountBalanceTillBlock(userId, blockNumber, function(err, balance){
                                            balances.push({
                                                user : userId,
                                                balance : balance
                                            });
                                            cb2();
                                        });

                                    }, function(errs, results){
                                        var balanceObj = {
                                            blockNumber : blockNumber,
                                            blockHash : block.blockHash,
                                            balances : balances
                                        };
                                        BalanceCollection.insert(balanceObj, function(err, result){
                                            if(err){
                                                console.log("Mongo Insert Error");
                                            }
                                            cb();
                                        });
                                    });
                                }

                            });

                        }, function(errs, results){
                            callback();
                        });
                });
            }
        });
    },

    setBlockBalances : function (blockNumber, callback) {
        BalanceCollection.find({blockNumber : blockNumber}).toArray(function(err, docs){
            if(docs && docs.length == 0){
                var balanceObject = {
                    blockNumber : blockNumber,
                    blockHash : blockHash,
                    balances : []
                };
                var users = Object.keys(balances);
                // users.forEach();
                // BalanceCollection.insert(, function(err, reply){
                //     if(err){
                //         console.log("Insert Mongo Error", err);
                //     }
                // });
            }
            else{
                console.log("Duplicate Balance Insert : Block Number : " + blockNumber + "  BlockHash : " + blockHash);
                // TODO: Handle Duplicate insert here 
            }
        });
    },

    calculateAccountBalance : function(userId, callback){
        MongoHandler.calculateAccountBalanceTillBlock(userId, null, callback);
    },

    calculateAccountBalanceTillBlock : function(userId, blockNumber, callback){
        var matchSenderQuery = {
           "transactions.sender" : userId 
        };

        var matchReceiverQuery = {
           "transactions.receiver" : userId 
        };

        var matchCreatorQuery = {
           "blockCreatorId" : userId 
        };

        if(blockNumber || blockNumber === 0){
            matchSenderQuery.blockNumber = { $lte : blockNumber };
            matchReceiverQuery.blockNumber = { $lte : blockNumber };
            matchCreatorQuery.blockNumber = { $lte : blockNumber };
        }

        async.parallel([
                function sentCoins(cb){
                    BlockCollection.aggregate([
                            {                                               // This match will reduce the number of unwind operations
                                $match : matchSenderQuery
                            },
                            {
                                $unwind : "$transactions"
                            },
                            { 
                                $match : {
                                   "transactions.sender" : userId 
                                }
                            },
                            {
                                $group : {
                                    _id : "$transactions.sender",
                                    amount : { $sum : { $multiply: [ "$transactions.amount", Constants.SUM_DECIMAL_CORRECTION ] } },
                                    fees   : { $sum : { $multiply: [ "$transactions.fees", Constants.SUM_DECIMAL_CORRECTION ] } }
                                }
                            }

                        ], function(err, docs){
                            cb(err, docs[0] ? (docs[0].amount + docs[0].fees) / Constants.SUM_DECIMAL_CORRECTION : 0);
                    }); 
                },

                function receivedCoins(cb){
                    BlockCollection.aggregate([
                            {                                               // This match will reduce the number of unwind operations
                                $match : matchReceiverQuery
                            },
                            {
                                $unwind : "$transactions"
                            },
                            { 
                                $match : {
                                   "transactions.receiver" : userId 
                                }
                            },
                            {
                                $group : {
                                    _id : "$transactions.receiver",
                                    amount : { $sum : { $multiply: [ "$transactions.amount", Constants.SUM_DECIMAL_CORRECTION ] } }
                                }
                            }

                        ], function(err, docs){
                            cb(err, docs[0] ? (docs[0].amount) / Constants.SUM_DECIMAL_CORRECTION : 0);
                    }); 
                },

                function earnedFees(cb){
                    BlockCollection.aggregate([
                            {                                               // This match will reduce the number of unwind operations
                                $match : matchCreatorQuery
                            },
                            {
                                $group : {
                                    _id : "$blockCreatorId",
                                    amount : { $sum : { $multiply: [ "$totalFees", Constants.SUM_DECIMAL_CORRECTION ] } }
                                }
                            }

                        ], function(err, docs){
                            cb(err, docs[0] ? (docs[0].amount) / Constants.SUM_DECIMAL_CORRECTION : 0);
                    }); 
                },

            ], function(errs, amounts){
                callback(null, amounts[1] + amounts[2] - amounts[0]);       // received + fees earned - sent
        });
            
    },
};

module.exports = MongoHandler;