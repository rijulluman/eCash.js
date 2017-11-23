// @MongoHandler
// Author: Rijul Luman
// To read/write data to/from Mongo in the desired format. 
require('rootpath')();

var async = require("async");
var redisPath = Constants.redisPath;
var blockController = require("app/controllers/block.server.controller");

var MongoHandler = {
    getCurrentBlockNumber : function(callback){
        BlockCollection.find({}, {_id : 0, blockNumber : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
            var blockNumber = docs[0] ? docs[0].blockNumber : 0;
            callback(null, blockNumber);
        });
    },

    getCurrentBlock : function(callback){
        BlockCollection.find({}, {_id : 0}).sort({"blockNumber" : -1}).limit(1).toArray(function(err, docs){
            var block = docs[0] ? docs[0] : null;
            callback(null, block);
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

    setAllBlockBalances : function (callback){          // To be used for stake calculation only. Not to be used for creating new blocks
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

    setBlockBalances : function (blockNumber, callback) {          // To be used for stake calculation only. Not to be used for creating new blocks
        BalanceCollection.find({blockNumber : blockNumber}).toArray(function(err, docs){
            if(docs && docs.length == 0){
                BlockCollection.find({blockNumber : blockNumber}).toArray(function(err, doc){
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

    /**
     * Calculate CoinAge/Stakable coins for POS
     */
    calculateCoinAge : function(userId, suppliedBlockNumber, callback){
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

    insertBlock : function(block, callback){
        // If block with same blockNumber already exists, incoming block will be ignored (Handled by Mongo Unique Indexing)
        BlockCollection.insert(block, function(err, reply){
            if(err){
                console.log("Insert Mongo Error", err);
            }
            else{
                // TODO: Remove Unconfirmed Transactions from Redis & zlist
            }
            callback(err);
        });
    },

    insertNetworkBlock : function(block, callback){
        blockController.validateAndParseBlock(block, function(isValid, parsedBlock){
            if(isValid){
                MongoHandler.insertBlock(parsedBlock, callback);
            }
        });
    },

    insertNetworkBlocks : function(blocks, callback){
        // TODO: Sort blocks in assending order by blockNumber
        async.eachSeries(blocks, function(block, cb){
                MongoHandler.insertNetworkBlock(block, cb);
            }, function(errs, results){
                callback();
        });
    },

    updateNetworkBlocks : function(blocks, callback){
        // TODO: Sort blocks in assending order by blockNumber
        async.eachSeries(blocks, function(block, cb){
                blockController.validateAndParseBlock(block, function(isValid, parsedBlock){
                    if(isValid){
                        BlockCollection.update({blockNumber : block.blockNumber}, parsedBlock, {upsert : true}, function(err, reply){
                            if(err){
                                console.log("Update Mongo Error", err);
                            }
                            cb();
                        });
                    }
                });
            }, function(errs, results){
                callback();
        });
    },

    validateAndReplaceBlock : function(existingBlock, block){
        // If block with same blockNumber already exists, incoming block will be ignored (Handled by Mongo Unique Indexing)
        if(existingBlock.blockNumber == block.blockNumber){
            blockController.validateAndParseBlock(block, function(isValid, parsedBlock){
                if(isValid){
                    BlockCollection.update({blockNumber : existingBlock.blockNumber, blockHash : existingBlock.blockHash}, parsedBlock, {upsert : true}, function(err, reply){
                        if(err){
                            console.log("Update Mongo Error", err);
                        }
                    });
                }
            });
            // TODO : Remove old block transactions and Add new block transactions to Unconfirmed Transactions Redis and Zlist
        }
    },

    // getLatestBlockHashes : function(count, callback){
    //     BlockCollection.find({}, {_id : 0, blockNumber : 1, blockHash : 1}).sort({"blockNumber" : -1}).limit(count).toArray(function(err, docs){
    //         callback(null, docs);
    //     });
    // },

    updateBlockchain : function(){
        RedisHandler.isBlockchainUpdateInProgress(function(err, inProgress){
            if(!inProgress){
                RedisHandler.setBlockchainUpdateInProgress(function(err, set){
                    if(set){
                        BlockCollection.find({}, {_id : 0, blockNumber : 1, blockHash : 1}).sort({"blockNumber" : -1}).limit(Constants.UPDATE_REQUEST_BLOCK_HASH_COUNT).toArray(function(err, docs){
                            var sendObj = {};
                            sendObj[Constants.MY_HASHES] = docs;
                            MongoHandler.sendDataToRandomNodeInNetwork(Constants.SOCKET_GET_LATEST_BLOCK_HASHES, sendObj);
                        });
                    }
                });
            }
            // else{
            //     // Skip, since blochchain update already in progress
            // }
        });
        
    },

    updateBlockchainFromBlock : function(blockNumber){
        BlockCollection.find({ blockNumber : { $gt : blockNumber, $lte : blockNumber + Constants.UPDATE_REQUEST_BLOCK_HASH_COUNT} }, {_id : 0, blockNumber : 1, blockHash : 1}).sort({"blockNumber" : -1}).toArray(function(err, docs){
            var sendObj = {};
            sendObj[Constants.MY_HASHES] = docs;
            MongoHandler.sendDataToRandomNodeInNetwork(Constants.SOCKET_GET_LATEST_BLOCK_HASHES, sendObj);
        });
    },

    sendDataToRandomNodeInNetwork : function(socketCommand, data){
        // Currently only outgoing nodes used for random connections
        var socket = OutgoingSockets[Math.floor(Math.random() * (OutgoingSockets.length))];
        while(socket == null && Object.keys(BroadcastMaster.sockets.connected).length){
            var sockets = Object.keys(BroadcastMaster.sockets.connected);
            var randomIndex = Math.floor(Math.random() * (sockets.length + 1));
            socket = BroadcastMaster.sockets.connected[sockets[randomIndex]];
        }
        
        if(socket){
            var socketId = socket.id ? socket.id : socket.io.opts.hostname;
            RedisStoreMA.expire(redisPath.blockchainUpdateInProgress, Constants.BLOCKCHAIN_UPDATE_HOLD_TTL_MULTIPLIER * Constants.AVERAGE_BLOCK_TIME_MS / 1000);    // Extend update TTL
            RedisHandler.setUpdaterDetails(socketId, function(err, reply){         // Save random node name in redis, only update on reply from that node (For Security)
                socket.emit(socketCommand, data);
            });
        }
    },
};

module.exports = MongoHandler;