// @RedisHandler
// Author: Rijul Luman
// To read data from Redis in the desired format. 

var async = require("async");
var redisPath = Constants.redisPath;

var RedisHandler = {
  
  addUnconfirmedTransaction: function(transaction, callback) {
  	async.waterfall([
  			function getCurrentBlockNumber(cb){
  				RedisHandler.getCurrentBlock(cb);
  			},
  			function setTransaction(currentBlock, cb){
  				// Set TTL to block difference * block time
  				var blockDifference = transaction.deadline - currentBlock;
  				if(blockDifference < 0){
  					return callback(null, true); 		// Expired transaction, need not be added to unconfirmed Transactions
  				}
  				var ttl = blockDifference * Constants.UNCONFIRMED_TRANSACTION_TTL_SECONDS_PER_BLOCK;
  				RedisStoreMA.setex(redisPath.unconfirmedTransaction + transaction.txId, ttl, JSON.stringify(transaction), function(err, reply){
  					cb(err);
  				});
  			},
  			function sortTransactionByFee(cb){
  				RedisStoreMA.zadd([redisPath.sortedUnconfirmedTransaction, transaction.fees * 10000, transaction.txId], function(err, reply){ 		// * 10000 to aoide approximation by Redis
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

  getCurrentBlock : function(callback){
  	RedisStoreSL.get(redisPath.currentBlock, function(err, reply){
  		if(err){
  			callback(err);	
  		}
  		else if(reply == null){
  			// TODO : Read & Load from Mongo Here
  			callback(null, 65);
  		}
  		else{
  			callback(null, parseInt(reply));
  		}
  	});
  },
//End of export   
}

module.exports = RedisHandler;