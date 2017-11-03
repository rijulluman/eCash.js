// @RedisHandler
// Author: Rijul Luman
// To read data from Redis in the desired format. 

var RedisHandler = {
  
  addUnconfirmedTransaction: function(transaction, callback) {
  	// Set TTL to block differenc * block time
    RedisStoreMA.setex(redisPath.unconfirmedTransaction + transaction.id, Constants.LOG_IN_EXPIRY, JSON.stringify(user) , function(err, reply){
      callback(err, token);
    });
  },
//End of export   
}

module.exports = RedisHandler;