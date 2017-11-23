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
 * UserId Bind middleware
 */
exports.bindUserId = function(req, res, next, id) {
  req.userId = id;
  next();
};


/**
 * Fetch Users Balance Amount
 */
exports.getUserBalance = function(req, res, next){
    if(!CommonFunctions.validatePublicKeyHexString(req.userId)){
        return ErrorCodeHandler.getErrorJSONData({'code':20, 'res':res});
    }
    MongoHandler.calculateAccountBalance(req.userId, function(err, balance){
        res.jsonp({balanceAmount : balance});
    });
};

/**
 * Accept, verify and add broadcasted block into Blockchain
 */

exports.acceptBroadcastBlock = function(block){
    // TODO: Re broadcast ? Will need to handle infinite loop handling
    // TODO : Make blockNumber unique in Mongo Index
    // console.log("Incoming BroadcastBlock : ", block);
    MongoHandler.getCurrentBlock(function(err, existingBlock){
        if(existingBlock.blockNumber == block.blockNumber - 1){
            MongoHandler.insertNetworkBlock(block, function(err, reply){});
        }
        else if(existingBlock.blockNumber == block.blockNumber){
            async.parallel([
                    function(cb){
                        RedisHandler.cachedCoinAge(existingBlock, cb);
                    },
                    function(cb){
                        MongoHandler.calculateCoinAge(block.blockCreatorId, block.blockNumber, cb);
                    },
                ], function(errs, results){
                    if(errs){
                        console.log("Mongo/Redis Err: ", errs);
                    }
                    if(results[1] > results[0]){
                        MongoHandler.validateAndReplaceBlock(existingBlock, block);        // TODO : Test this case
                    }
                    // else{
                    //     // Ignore lower coin stake block
                    // }
            });
        }
        else if(existingBlock.blockNumber + 1 < block.blockNumber){
            MongoHandler.updateBlockchain();
        }
        // else{
        //     // Ignore older block
        // }
    });
};

/**
 * Send latest block hashes in the Blockchain
 */
exports.sendLatestBlocks = function(requestData, requestSocket){
    // TODO : Validate request data here (and sort decending by Block Number)
    // TODO : Add checkpoints to prevent attacks
    if(requestData[Constants.MY_HASHES].length){
        MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
            var blockNumbers = [];
            var blockHashes = [];
            requestData[Constants.MY_HASHES].forEach(function(block){
                blockNumbers.push(block.blockNumber);
                blockHashes.push(block.blockHash);
            });
            BlockCollection.find({ blockNumber : { $in : blockNumbers }, blockHash : { $in : blockHashes } }, {_id : 1, blockNumber : 1}).sort({blockNumber : -1}).toArray(function(err, docs){
                var findQuery = {};
                var returnQuery = {};
                var responseObj = {};
                responseObj[Constants.LAST_BLOCK_NUMBER] = blockNumber;

                if(err){
                    console.log("Mongo Err: ", err);
                }
                else if(docs.length == 0){                                                      // CASE RESET : None of the recieved hashes match, send 100 equispaced hashes
                    responseObj[Constants.YOUR_UPDATE_STATUS] = Constants.RESET;

                    var delta = parseInt(blockNumber/Constants.NETWORK_BLOCK_SHARE_LIMIT);  // Divide into NETWORK_BLOCK_SHARE_LIMIT number of equispaced hashes
                    var blockNumbers = [];
                    for(var i = delta; i <= blockNumber; i += delta){
                        blockNumbers.push(i);
                    }

                    findQuery = { blockNumber : { $in : blockNumbers } };
                    returnQuery = { _id : 0, blockNumber : 1, blockHash : 1 };

                }
                else if(docs.length == requestData[Constants.MY_HASHES].length){            // CASE UPDATE : All hashes match, send next blocks
                    responseObj[Constants.YOUR_UPDATE_STATUS] = Constants.UPDATE;
                    findQuery = { blockNumber : { $gt : docs[0].blockNumber } }
                    returnQuery = {_id : 0};
                }
                else{                                                                       // CASE FORK : Some of the hashes match (Sender need to update to forked blockchain)
                    responseObj[Constants.YOUR_UPDATE_STATUS] = Constants.FORK;
                    findQuery = { blockNumber : { $gt : docs[0].blockNumber } };
                    returnQuery = {_id : 0};
                }

                BlockCollection.find(findQuery, returnQuery).sort({blockNumber : 1}).limit(Constants.NETWORK_BLOCK_SHARE_LIMIT).toArray(function(err, nextBlocks){
                    if(nextBlocks && nextBlocks[0] && nextBlocks[0].blockHash){
                        responseObj[Constants.NEXT_BLOCKS] = nextBlocks;
                        requestSocket.emit(Constants.SOCKET_GET_LATEST_BLOCK_REPLY, responseObj);
                        
                    }
                });
            });
        });
    }
};

/**
 * Receive latest block hashes from the network
 */
exports.receiveLatestBlocks = function(responseData, responseSocket){
    // TODO : Validate response data here (and sort assending by Block Number)
    // TODO : Reset Redis update ttl, so that update continues

    // TODO : Remove all balance and difficulty entries on FORK !

    async.parallel([
            function(cb){
                RedisHandler.isBlockchainUpdateInProgress(cb);
            },
            function(cb){
                RedisHandler.getUpdaterDetails(cb);
            },
        ], function(errs, results){
            var socketId = responseSocket.id ? responseSocket.id : responseSocket.io.opts.hostname;
            if(results[0] && results[1] == socketId){
                if(responseData[Constants.YOUR_UPDATE_STATUS] == Constants.UPDATE){
                    MongoHandler.insertNetworkBlocks(responseData[Constants.NEXT_BLOCKS], function(){
                        MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
                            if(blockNumber < parseInt(responseData[Constants.LAST_BLOCK_NUMBER]) ){
                                MongoHandler.updateBlockchainFromBlock(blockNumber);             // Recursive call till we reach the latest block
                            }
                            else{
                                RedisHandler.resetBlockchainUpdateInProgress();
                            }
                        });
                    });
                }
                else if(responseData[Constants.YOUR_UPDATE_STATUS] == Constants.FORK){
                    var updateBlocks = [];
                    MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
                        for(var i = 0; i < responseData[Constants.NEXT_BLOCKS].length; i++){
                            if(responseData[Constants.NEXT_BLOCKS][i].blockNumber <= blockNumber){
                                updateBlocks.push(responseData[Constants.NEXT_BLOCKS][i]);
                                responseData[Constants.NEXT_BLOCKS].splice(i, 1);
                                i--;
                            }
                        }

                        MongoHandler.updateNetworkBlocks(updateBlocks, function(){
                            MongoHandler.insertNetworkBlocks(responseData[Constants.NEXT_BLOCKS], function(){
                                MongoHandler.getCurrentBlockNumber(function(err, blockNumber){
                                    if(blockNumber < parseInt(responseData[Constants.LAST_BLOCK_NUMBER]) ){
                                        MongoHandler.updateBlockchainFromBlock(blockNumber);             // Recursive call till we reach the latest block
                                    }
                                    else{
                                        RedisHandler.resetBlockchainUpdateInProgress();
                                    }
                                });
                            });
                        });
                    });
                }
                else if(responseData[Constants.YOUR_UPDATE_STATUS] = Constants.RESET){
                    var blockNumbers = [];
                    var blockHashes = [];
                    responseData[Constants.NEXT_BLOCKS].forEach(function(block){
                        blockNumbers.push(block.blockNumber);
                        blockHashes.push(block.blockHash);
                    });
                    BlockCollection.find({ blockNumber : { $in : blockNumbers }, blockHash : { $in : blockHashes } }, { _id : 0, blockNumber : 1, blockHash : 1 }).sort({blockNumber : -1}).toArray(function(err, matchedBlocks){
                        if(matchedBlocks && matchedBlocks.length && matchedBlocks[0] && matchedBlocks[0].blockHash){
                            MongoHandler.updateBlockchainFromBlock(matchedBlocks[0].blockNumber);    // Recursive call till be reach a forking point
                        }
                        else if(matchedBlocks.length == 0){
                            // If We have checkpoints, checkpoint number will be passed from here
                            MongoHandler.updateBlockchainFromBlock(0);   // Since none of the blocks match
                        }
                        else{
                            RedisHandler.resetBlockchainUpdateInProgress();
                        }
                    });
                }
                else{
                    // Invalid case
                    RedisHandler.resetBlockchainUpdateInProgress();
                }
            }
    });
}

/**
 * Create a Block
 */

exports.create = function(req, res) {
    createBlock(req.body, function(err, block){
        res.jsonp(block);
    });
};

exports.create100Blocks = function(req, res) {
    var arr = [];
    for(var i = 0; i < 100; i++){
        arr[i] = i;
    }
    //TODO : Change input method / Read from Login
    var user = 
    // {
    //     "privateKey": "fcbd864a695f0fef7162af1ff80641d351fc31e2ff35347488d83d1f386376e5",
    //     "publicKey": "036efa45411e658bcafd151abe923334568ddd734e43e6432de38dac5a622c7756"
    // };
    {
        "privateKey": "418836c2f238940f9f62115800075b956ec0f167a60bce42663e9958f62eae7b",
        "publicKey": "027ce749cc99715d1dd0904c7ccf5e3a9988e57fbbecfe9b0d73f7fff32f3b12a6"
    };
    async.eachSeries(arr, function(a, cb){
        createBlock(user, cb);
    }, function(err, results){
        res.send("Done!");
    });
};

var createBlock = function(userData, callback) {
    // TODO : Call from Cron Script
    // TODO : Add block internal variable names to Constants
    // TODO : Make a new thread, so that REST API calls remain unaffected
    var block = {
      blockNumber           : 0,
      nonce                 : 0,
      blockCreatorId        : "",
      previousBlockHash     : "",
      proofHash             : "",
      timestamp             : 0,
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
                user.publicKey = userData.publicKey;
                user.privateKey = CommonFunctions.hexStringToBuffer(userData.privateKey);
                
                block.blockCreatorId = user.publicKey;
                cb();
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
                    block.totalFees += transaction.fees * Constants.SUM_DECIMAL_CORRECTION;
                    block.totalAmount += transaction.amount * Constants.SUM_DECIMAL_CORRECTION;
                });
                block.totalFees = block.totalFees / Constants.SUM_DECIMAL_CORRECTION;
                block.totalAmount = block.totalAmount / Constants.SUM_DECIMAL_CORRECTION;
                cb();
            },

            function updateBlockChain(cb){
                // Also delete unconfirmed transactions present in block from memory
                MongoHandler.updateBlockchain();
                setTimeout(function(){ cb(); }, Constants.CREATE_BLOCK_UPDATE_TIMEOUT);
            },

            function getPreviousBlock(cb){
                BlockCollection.find({}, {_id : 0, blockNumber : 1, blockHash : 1}).sort({"blockNumber" : -1}).limit(1).toArray(function(errs, docs){
                    var previousBlock = docs[0];
                    block.blockNumber = previousBlock.blockNumber + 1;
                    block.previousBlockHash = previousBlock.blockHash;
                    cb();    
                });
            },

            function generateHashesAndSignatures(cb){
                block.transactionHash = CommonFunctions.generateTransactionArrayHash(block.transactions);
                block.transactionSignature = CommonFunctions.generateSignature(block.transactionHash, user.privateKey);
                
                MongoHandler.getTargetForBlock(block.blockNumber, function(err, target){
                    console.time("BlockGenerationTime");
                    var nonceAndHash = CommonFunctions.generateProofHashAndNonce(target, block);
                    block.nonce = nonceAndHash.nonce;
                    block.proofHash = nonceAndHash.hash;
                    block.timestamp = new Date().getTime();
                    block.blockHash = CommonFunctions.generateBlockHash(block);
                    block.blockSignature = CommonFunctions.generateSignature(block.blockHash, user.privateKey);
                    console.timeEnd("BlockGenerationTime");
                    cb();
                });
                
            },

            function validateGeneratedBlock(cb){
                validateAndParseBlock(block, function(isValid, parsedBlock){
                    if(!isValid){
                        console.log("Invalid Block Generated !!", JSON.stringify(block, null, 2));
                    }
                    block = parsedBlock;
                    cb(!isValid);
                });
            },

            function addBlockToDb(cb){
                MongoHandler.insertBlock(block, function(){});
                cb();
            },

            function broadcastGeneratedBlock(cb){
                broadcastBlock(block);
                cb();
            },

            function removeTransactionsFromMemory(cb){
                // TODO : Remove only after block accepted/ also remove when new block added
                RedisHandler.removeTransactionsFromZlist(zaddClear);
                RedisHandler.removeUnconfirmedTransactions(block.transactions);
                RedisHandler.clearCurrentBlock();
                cb();
            }

        ], function(errs, result){
            console.log("Block Done !");
            callback(null, block);
        });
};

var makeTransactionArray = function(count, callback){
    RedisHandler.getMaxFeeTransactionIds(count, function(err, ids){
        if(ids.length == 0){
            return callback(null, [], []);
        }
        RedisHandler.getTransactionArray(ids, function(err, txArr){
            validateAccountBalances(txArr, function(err, validTxArr, invalidTxArr){

                invalidTxArr.forEach(function(tx){      // Remove ids to avoid removing them from Redis later
                    ids.splice(ids.indexOf(tx.txId), 1);
                });
                removeTransactionsAlreadyInBlockChain(validTxArr, function(err, finalTxArr){
                    if(finalTxArr.length < count && ids.length == count){
                        makeTransactionArray(count - finalTxArr.length, function(err, recId, recArr){
                            callback(null, ids.concat(recId), finalTxArr.concat(recArr));
                        });
                    }
                    else{
                        callback(null, ids, finalTxArr);
                    }
                });
            });
        });
    });
};

var validateAccountBalances = function(transactions, callback){
    var validTx = [];
    var invalidTx = [];

    async.each(transactions, function(transaction, cb){

        MongoHandler.calculateAccountBalance(transaction.sender, function(err, balance){
            if(balance < (transaction.amount + transaction.fees)){
                invalidTx.push(transaction);
            }
            else{
                validTx.push(transaction);
            }
            cb();
        });
    

    }, function(errs, results){
        callback(null, validTx, invalidTx);
    });

};

var removeTransactionsAlreadyInBlockChain = function(transactions, callback){
    var validTransactions = [];
    async.each(transactions, function(transaction, cb){
        BlockCollection.find({"transactions.txId" : transaction.txId}, {_id : 1}).limit(1).toArray(function(err, docs){
            if(docs && docs.length){
                RedisHandler.removeTransactionsFromZlist([transaction.txId]);
                RedisHandler.removeUnconfirmedTransactions([transaction]);
            }
            else{
                validTransactions.push(transaction);
            }
            cb();
        });
    }, function(errs, result){
        callback(null, validTransactions);
    });
};

var validateAndParseBlock = function(blockInput, callback){
    var block = {};

    try{
        block = {
          blockNumber           : parseInt(blockInput.blockNumber),
          nonce                 : parseInt(blockInput.nonce),
          blockCreatorId        : blockInput.blockCreatorId.toLowerCase(),
          previousBlockHash     : blockInput.previousBlockHash.toLowerCase(),
          proofHash             : blockInput.proofHash.toLowerCase(),
          timestamp             : parseInt(blockInput.timestamp),
          totalAmount           : Number(blockInput.totalAmount),
          totalFees             : Number(blockInput.totalFees),
          transactionCount      : parseInt(blockInput.transactionCount),
          transactionHash       : blockInput.transactionHash.toLowerCase(),
          transactionSignature  : blockInput.transactionSignature.toLowerCase(),
          blockHash             : blockInput.blockHash.toLowerCase(),
          blockSignature        : blockInput.blockSignature.toLowerCase(),
          transactions          : blockInput.transactions
        };
    }
    catch(e){
        return callback(false, null);
    }

    if(
            block.blockNumber < 0
        ||  block.transactions.length > Constants.BLOCK_MAX_TRANSACTIONS_COUNT
        ||  block.transactionCount != block.transactions.length
    ){
        return callback(false, null);
    }

    var totalFees = 0;
    var totalAmount = 0;

    for(var i = 0; i < block.transactions.length; i++){

        block.transactions[i].fees  = Number(block.transactions[i].fees);
        block.transactions[i].amount = Number(block.transactions[i].amount);
        block.transactions[i].nonce = parseInt(block.transactions[i].nonce);

        if(
                !block.transactions[i].sender
            ||  block.proofHash != CommonFunctions.generateProofHash(block)
            ||  !CommonFunctions.validatePublicKeyHexString(block.transactions[i].sender)
            ||  !block.transactions[i].receiver
            ||  !CommonFunctions.validatePublicKeyHexString(block.transactions[i].receiver)
            ||  block.transactions[i].nonce < Constants.MINIMUM_TRANSACTION_NONCE
            
        ){
            return callback(false, null);
        }

        block.transactions[i].sender    = block.transactions[i].sender.toLowerCase();
        block.transactions[i].receiver  = block.transactions[i].receiver.toLowerCase();
        block.transactions[i].txId      = block.transactions[i].txId.toLowerCase();
        block.transactions[i].signature = block.transactions[i].signature.toLowerCase();

        // Hashing is case-sensitive
        if(
                block.transactions[i].txId != CommonFunctions.generateTransactionHash(block.transactions[i])
            ||  !CommonFunctions.verifySignature(block.transactions[i].txId, block.transactions[i].sender, block.transactions[i].signature)
        ){
            return callback(false, null);
        }

        totalFees   += block.transactions[i].fees   * Constants.SUM_DECIMAL_CORRECTION;
        totalAmount += block.transactions[i].amount * Constants.SUM_DECIMAL_CORRECTION;

    }

    totalFees   = totalFees     / Constants.SUM_DECIMAL_CORRECTION;
    totalAmount = totalAmount   / Constants.SUM_DECIMAL_CORRECTION;

    if(
            totalFees   != block.totalFees
        ||  totalAmount != block.totalAmount
    ){
        return callback(false, null);
    }

    if(
            block.transactionHash != CommonFunctions.generateTransactionArrayHash(block.transactions)
        ||  !CommonFunctions.verifySignature(block.transactionHash, block.blockCreatorId, block.transactionSignature)
        ||  block.blockHash != CommonFunctions.generateBlockHash(block)
        ||  !CommonFunctions.verifySignature(block.blockHash, block.blockCreatorId, block.blockSignature)
    ){
        return callback(false, null);
    }

    async.waterfall([
            function(cb){
                MongoHandler.getTargetForBlock(block.blockNumber, function(err, target){
                    cb(null, target);
                });
            },

            function(target, cb){
                if(!CommonFunctions.validateProofHash(block.proofHash, target)){
                    return callback(false, null);
                }
                cb();
            },

            function(cb){
                if(block.blockNumber == 0 && block.previousBlockHash == Constants.GENESIS_BLOCK_PREV_HASH){         // TODO : Add genesis block hash check here
                    return callback(true, block);
                }

                // if(!validatePreviousBlockHash){
                //     var hexadecimal = /^[0-9A-F]+$/i;
                //     if(!isNaN(block.timestamp) && block.previousBlockHash.length == 64 && hexadecimal.test(block.previousBlockHash)){
                //         return callback(true, block);
                //     }
                //     else{
                //         return callback(false, null);
                //     }
                // }

                BlockCollection.find({ blockNumber : block.blockNumber - 1 }, {_id : 0, blockNumber : 1, blockHash : 1, timestamp : 1}).limit(1).toArray(function(errs, docs){
                    var previousBlock = docs[0];
                    if(
                            previousBlock.blockHash == block.previousBlockHash 
                        &&  previousBlock.timestamp < block.timestamp 
                        // &&  block.timestamp - previousBlock.timestamp <= 2 * Constants.AVERAGE_BLOCK_TIME_MS         // TODO : Uncomment
                    ){
                        return callback(true, block);
                    }

                    if(previousBlock.blockHash != block.previousBlockHash){
                        return callback(false, Constants.FORK);
                    }
                    
                    return callback(false, null);
                });
            }

        ], function(errs, results){

    });

};

exports.validateAndParseBlock = validateAndParseBlock;

var broadcastBlock = function(block){
    validateAndParseBlock(block, function(isValid, parsedBlock){
        if(isValid){
            BroadcastMaster.sockets.emit(Constants.SOCKET_BROADCAST_BLOCK, parsedBlock);
            OutgoingSockets.forEach(function(socket){
                socket.emit(Constants.SOCKET_BROADCAST_BLOCK, parsedBlock);
            });
        }
    });
};




