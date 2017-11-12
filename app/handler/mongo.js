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

    setAllBlockTargets : function(callback){
        MongoHandler.getCurrentBlockNumber(function(err, currentBlockNumber){
            TargetCollection.find({}).toArray(function(err, docs){
                var targetExist = [];
                var addTarget = [];
                if(err){
                    console.log("MongoErr: ", err);
                }
                docs.forEach(function(doc){
                    targetExist.push(doc.blockNumber);
                });
                for(var i = 0; i <= currentBlockNumber+1; i = i + Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS){         // +1 to precalculate incase next block needs new target
                    if(targetExist.indexOf(i) == -1){
                        addTarget.push(i);                        
                    }
                }

                async.eachSeries(addTarget, function(blockNumber, cb){
                    var targetObj = {
                        blockNumber : blockNumber        
                    };
                    if(blockNumber == 0){
                        targetObj.target = Constants.GENESIS_BLOCK_TARGET;
                        TargetCollection.insert(targetObj, function(err, result){
                            cb();
                        });
                    }
                    else{
                        BlockCollection.find({ $or : [ 
                            { blockNumber : blockNumber - 1 },      // -1 since next block may not exist yet
                            { blockNumber : blockNumber - Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS } 
                        ] }, {blockNumber : 1, timestamp : 1}).sort({blockNumber : 1}).toArray(function(err, docs){
                            if(!docs[0].timestamp || !docs[0].timestamp){     
                                console.log("Missing Timestamp while calculating Target");      // TODO : Handle Properly
                                cb();
                            }
                            var timeDifference = docs[1].timestamp - docs[0].timestamp;
                            TargetCollection.find({blockNumber : blockNumber - Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS}).toArray(function(err, targetDocs){
                                if(err){
                                    return console.log("MongoDB error: ", err);
                                }
                                var prevTarget = targetDocs[0].target;
                                var maxDifficulty = parseInt("ffffff", 16);


                                var oldZeros   = parseInt(prevTarget.substring(0,2), 16);
                                var oldDifficulty = parseInt(prevTarget.substring(2), 16);
                                var newZeros = oldZeros;

                                var newDifficulty = oldDifficulty * timeDifference / (Constants.AVERAGE_BLOCK_TIME_MS * Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS);

                                console.log("newDifficulty", newDifficulty);

                                while(newDifficulty > maxDifficulty){
                                    newZeros++;
                                    newDifficulty = newDifficulty / 256;
                                }
                                
                                // while(newDifficulty < 1){
                                //     newZeros++;
                                //     newDifficulty = newDifficulty * 256;
                                // }

                                var newTarget = parseInt(newDifficulty).toString(16);
                                while(newTarget.length < 6){
                                    newTarget = "0" + newTarget;
                                }
                                var newZerosStr = newZeros.toString(16);
                                while(newZerosStr.length < 2){
                                    newZerosStr = "0" + newZerosStr;
                                }

                                console.log("New target : ", newZerosStr + newTarget);

                                targetObj.target = newZerosStr + newTarget;

                                TargetCollection.insert(targetObj, function(err, result){
                                    cb();
                                });
                                
                            });
                                
                        });
                    }
                }, function(errs, results){
                    callback();
                });
            });
        });
    },

    getTargetForBlock : function(blockNumber, callback){
        MongoHandler.setAllBlockTargets(function(){
            var targetBlockNumber = blockNumber - (blockNumber % Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS);
            TargetCollection.find({blockNumber : targetBlockNumber}).toArray(function(err, docs){
                if(err){
                    return console.log("MongoDB error: ", err);
                }
                callback(null, docs[0].target);
            });
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