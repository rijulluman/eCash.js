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
      blockNumber       : 0,
      nonce             : 0,
      blockCreatorId    : "",
      previousBlockHash : "",
      totalAmount       : 0,
      totalFees         : 0,
      transactions      : [],
      payloadSize       : 0,
      payloadHash       : "",
      payloadSignature  : "",
      blockSignature    : ""
    };

    var user;

    async.waterfall([
            function getBlockCreatorDetails(cb){
                user.publicKey = req.body.publicKey;
                user.privateKey = req.body.privateKey;
                //TODO : Change input method

                block.blockCreatorId = user.publicKey;
                cb();
            },

            function generateNonce(cb){
                // TODO
                block.nonce;
                cb();
            },

            function makeTransactionArray(cb){
                var transactions = [];
                // TODO : Fetch and push transactions here

                block.transactions = transactions;
                cb();
            },

            function calculateTotalCoins(cb){
                // TODO
                totalFees;
                totalAmount;
            },

            function updateBlockChain(cb){
                // TODO : Call Blockchain update here
                cb();
            },

            function getPreviousBlock(cb){
                // TODO : Read from Mongo
                block.blockNumber = "prevBlock" + 1;
                block.previousBlockHash = "";
                cb();
            },

            function generatePayloadDetails(cb){
                block.payloadSize;// TODO : Need Bytes here
                block.payloadSignature;
                block.payloadHash;
                block.blockSignature;
                cb();
            },

            function generateBlockSignature(cb){
                // TODO
                cb();
            }

        ], function(errs, result){

        });


};