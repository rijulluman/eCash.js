// @MongoHandler
// Author: Rijul Luman
// To read/write data to/from Mongo in the desired format. 

var async = require("async");

var MongoHandler = {
    getCurrentBlockNumber : function(callback){
        async.parallel([
                function(cb){   
                    UnconfirmedBlockCollection.find({}, {_id : 0, blockNumber : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
                        cb(null, docs[0] && docs[0].blockNumber ? docs[0].blockNumber : 0);
                    });
                },

                function(cb){
                    BlockChainCollection.find({}, {_id : 0, blockNumber : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
                        cb(null, docs[0] && docs[0].blockNumber ? docs[0].blockNumber : 0);
                    });
                },
            ], function(errs, results){
                if(results[0] > results[1]){
                    callback(null, results[0]);
                }
                else{
                    callback(null, results[1]);
                }
        });
    },

    getCurrentBlock : function(callback){
        async.parallel([
                function(cb){   
                    UnconfirmedBlockCollection.find({}, {_id : 0}).sort({"blockNumber" : -1, "stake" : -1}).limit(1).toArray(function(err, docs){
                        cb(null, docs[0] && docs[0].blockNumber ? docs[0] : {});
                    });
                },

                function(cb){
                    BlockChainCollection.find({}, {_id : 0}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
                        cb(null, docs[0] && docs[0].blockNumber ? docs[0] : {});
                    });
                },
            ], function(errs, results){
                if(results[0].blockNumber && results[0].blockNumber > results[1].blockNumber){
                    callback(null, results[0]);
                }
                else{
                    callback(null, results[1]);
                }
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
                        var prevBlockNumber = blockNumber - 2 - Constants.DIFFICULTY_CHANGE_EVERY_BLOCKS;
                        if(prevBlockNumber < 0){
                            prevBlockNumber = 0;
                        }
                        BlockChainCollection.find({ $or : [ 
                            { blockNumber : blockNumber - 2 },      // -1 since next block may not exist yet, -1 since last block in generally in unconfirmed blocks
                            { blockNumber : prevBlockNumber } 
                        ] }, {blockNumber : 1, timestamp : 1}).sort({blockNumber : 1}).toArray(function(err, docs){
                            if(!docs[0].timestamp || !docs[1].timestamp){     
                                console.log("Missing Timestamp while calculating Target");      // TODO : Handle Properly
                                return cb();
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

                                console.log("newDifficulty", newDifficulty);      // TODO : Remove

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

                                console.log("New target : ", newZerosStr + newTarget);      // TODO : Remove

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
        BalanceCollection.find({}, {blockNumber : 1}).sort({blockNumber : 1}).toArray(function(err, docs){
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
                            MongoHandler.setBlockBalances(blockNumber, cb);
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
                BlockChainCollection.find({blockNumber : blockNumber}).toArray(function(err, doc){
                    if(err || !doc){
                        console.log("No Such Block : ", blockNumber);
                        callback();
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

                        async.each(users, function(userId, cb){
                            MongoHandler.calculateAccountBalanceTillBlock(userId, blockNumber, function(err, balance){
                                balances.push({
                                    user : userId,
                                    balance : balance
                                });
                                cb();
                            });

                        }, function(errs, results){
                            var balanceObj = {
                                blockNumber : blockNumber,
                                blockHash : block.blockHash,
                                blockCreatorId : block.blockCreatorId,
                                balances : balances
                            };
                            BalanceCollection.insert(balanceObj, function(err, result){
                                if(err){
                                    console.log("Mongo Insert Error");
                                }
                                callback();
                            });
                        });
                    }

                });
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
                    BlockChainCollection.aggregate([
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
                    BlockChainCollection.aggregate([
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
                    BlockChainCollection.aggregate([
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

    /**
     * Calculate CoinAge/Stakable coins for POS (Ignores stake in the last block, which is generally in the unconfirmed blocks)
     */
    calculateCoinAge : function(userId, suppliedBlockNumber, callback){
        // TODO : Add lastBlock stake from Unconfirmed Blocks?
        var totalStake = 0;
        async.waterfall([
                function(cb){
                    MongoHandler.setAllBlockBalances(function(){
                        cb();
                    });
                },

                function(cb){
                    if(suppliedBlockNumber){
                        cb(null, suppliedBlockNumber);
                    }
                    else{
                        MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
                            cb(null, blockNumber);
                        });
                    }
                },

                function(endBlock, cb){
                    var startBlock = endBlock - Constants.MAX_STAKEABLE_BLOCKS - Constants.MIN_HOLD_FOR_STAKE_BLOCKS;
                    if(startBlock < 0){
                        startBlock = 0;
                    }
                    var stakeStartBlock = endBlock - Constants.MAX_STAKEABLE_BLOCKS;
                    if(stakeStartBlock < 0){
                        stakeStartBlock = 0;
                    }
                    if(startBlock != stakeStartBlock - Constants.MIN_HOLD_FOR_STAKE_BLOCKS){ 
                        stakeStartBlock = startBlock + Constants.MIN_HOLD_FOR_STAKE_BLOCKS;
                        if(stakeStartBlock > endBlock){
                            return cb();        // 0 stake since minimum hold blocks not satisfied
                        }
                    }
                    var blocks = [];
                    var balances = {};

                    for(var i = startBlock; i <= endBlock; i++ ){
                        blocks.push(i);
                    }
                    
                    BalanceCollection.find({
                        $or : [
                            { "balances.user"  : userId },
                            { "blockCreatorId" : userId }
                        ],
                        blockNumber : { $in : blocks }
                        // $and : [ 
                        // { blockNumber : {$gte : startBlock } }, 
                        // { blockNumber : {$lte : endBlock} }
                        // ]
                        }).sort({blockNumber : 1}).toArray(function(err, docs){
                            if(err){
                                console.log("Mongo Err: ", err);
                                return;
                            }
                            docs.forEach(function(data){                            // Load users Balance in each block here
                                for(var i = 0; i < data.balances.length; i++){
                                    if(data.balances[i].user == userId){
                                        balances[data.blockNumber] = data.balances[i].balance; 
                                        break;
                                    }
                                }
                            });

                            BalanceCollection.find({ "balances.user"  : userId, blockNumber : {$lt : startBlock}}).sort({blockNumber : -1}).limit(1).toArray(function(err, lastBalance){
                                if(err){
                                    console.log("Mongo Err: ", err);
                                    return;
                                }
                                else if(!lastBalance || !lastBalance.length|| !lastBalance[0].balances.length){
                                    if(balances[startBlock] == null){               // If no transaction before startBlock, Balance = 0
                                        balances[startBlock] = 0;
                                    }
                                }
                                else{
                                    if(balances[startBlock] == null){               // Load last balance as balance of startBlock
                                        lastBalance[0].balances.forEach(function(data){
                                            if(data.user == userId){
                                                balances[startBlock] = data.balance;
                                            }
                                        });
                                    }
                                }

                                for(var i = startBlock + 1; i <= endBlock; i++){       // Load previous balance as current balance for all blocks without any transaction by given user
                                    if(balances[i] == null){
                                        balances[i] = balances[i-1];
                                    }
                                }

                                docs.forEach(function(data){
                                    if(data.blockCreatorId == userId){
                                        var lastBlock = data.blockNumber + Constants.MIN_HOLD_FOR_STAKE_BLOCKS;
                                        if(lastBlock > endBlock){
                                            lastBlock = endBlock;
                                        }
                                        for(var i = data.blockNumber; i < lastBlock ; i++){
                                            balances[i] -= 1;               // Remove 1 Stake-able coin from next hold blocks, since coin stake used for creation of current block
                                        }
                                    }
                                });

                                for(var i = stakeStartBlock; i <=endBlock ; i++){       // Add all blocks stake
                                    totalStake += balances[i];
                                }

                                cb();
                            });
                    });
                },
                
            ], function(errs, results){
                callback(null, totalStake);
        });
    },

    addUnconfirmedBlock : function(block, callback){
        MongoHandler.calculateCoinAge(block.blockCreatorId, block.blockNumber - 1, function(err, stake){
            block.stake = stake;
            UnconfirmedBlockCollection.insert(block, function(err, reply){
                callback(err, reply);
            });
        });
    },

};

module.exports = MongoHandler;