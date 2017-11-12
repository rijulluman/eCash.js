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
    var user = {
        "privateKey": "fcbd864a695f0fef7162af1ff80641d351fc31e2ff35347488d83d1f386376e5",
        "publicKey": "036efa45411e658bcafd151abe923334568ddd734e43e6432de38dac5a622c7756"
    };
    async.eachSeries(arr, function(a, cb){
        createBlock(user, cb);
    }, function(err, results){
        res.send("Done!");
    });
};

var createBlock = function(userData, callback) {
    // TODO :  Call from Cron Script
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
                //TODO : Change input method (Maybe Redis via login)

                block.blockCreatorId = user.publicKey;
                cb();
            },

            function getTransactionArray(cb){
                makeTransactionArray(Constants.BLOCK_MAX_TRANSACTIONS_COUNT, function(err, ids, transactions){
                    // if(transactions.length == 0){
                    //     console.log("No Unconfirmed Transactions found to create Block !")
                    //     return;             // TODO : Handle Properly
                    // }
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
                // TODO : Call Blockchain update here
                // Also delete unconfirmed transactions present in block from memory
                cb();
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
                BlockCollection.insert(block, function(err, reply){
                    if(err){
                        console.log("Insert Mongo Error", err);
                    }
                });
                cb();
            },

            function broadcastGeneratedBlock(cb){
                broadcastBlock(block);
                cb(); // Next call should be independent of broadcast failure
            },

            function removeTransactionsFromMemory(cb){
                // TODO : Remove only after block accepted/ also remove when new block added
                RedisHandler.removeTransactionsFromZlist(zaddClear);
                RedisHandler.removeUnconfirmedTransactions(block.transactions);
                RedisHandler.clearCurrentBlock();
                cb();
            }

        ], function(errs, result){
            console.log("Block Done");
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

var validateAndParseBlock = function(block, callback){
    block.blockNumber = parseInt(block.blockNumber);
    block.nonce = parseInt(block.nonce);
    block.transactionCount = parseInt(block.transactionCount);
    block.transactionHash = block.transactionHash.toLowerCase();
    block.transactionSignature = block.transactionSignature.toLowerCase();
    block.blockHash = block.blockHash.toLowerCase();
    block.blockSignature = block.blockSignature.toLowerCase();
    block.blockCreatorId = block.blockCreatorId.toLowerCase();
    block.totalFees = Number(block.totalFees);
    block.totalAmount = Number(block.totalAmount);
    block.proofHash = block.proofHash.toLowerCase();
    block.timestamp = parseInt(block.timestamp);

    block.previousBlockHash = block.previousBlockHash.toLowerCase();

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

                BlockCollection.find({ blockNumber : block.blockNumber - 1 }, {_id : 0, blockNumber : 1, blockHash : 1, timestamp : 1}).limit(1).toArray(function(errs, docs){
                    var previousBlock = docs[0];
                    if(
                            previousBlock.blockHash == block.previousBlockHash 
                        &&  previousBlock.timestamp < block.timestamp 
                        // &&  block.timestamp - previousBlock.timestamp <= 2 * Constants.AVERAGE_BLOCK_TIME_MS         // TODO : Uncomment
                    ){
                        return callback(true, block);
                    }
                    
                    return callback(false, null);
                });
            }

        ], function(errs, results){

    });

    
};

var broadcastBlock = function(block){
    //TODO
};

