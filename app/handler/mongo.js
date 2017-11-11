// @MongoHandler
// Author: Rijul Luman
// To read/write data to/from Mongo in the desired format. 

var async = require("async");

var MongoHandler = {
        setBlockBalances : function (blockNumber, blockHash, balances, callback) {
            BalanceCollection.find({blockNumber : blockNumber}).toArray(function(err, docs){
                if(docs && docs.length == 0){
                    var balanceObject = {
                        blockNumber : blockNumber,
                        blockHash : blockHash,
                        balances : []
                    };
                    var users = Object.keys(balances);
                    users.forEach();
                    BalanceCollection.insert(, function(err, reply){
                        if(err){
                            console.log("Insert Mongo Error", err);
                        }
                    });
                }
                else{
                    console.log("Duplicate Balance Insert : Block Number : " + blockNumber + "  BlockHash : " + blockHash);
                    // TODO: Handle Duplicate insert here 
                }
            });
        }
};

module.exports = MongoHandler;