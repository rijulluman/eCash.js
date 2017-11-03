// Author : Rijul Luman
// @Common Functions

var crypto = require('crypto');

var CommonFunctions = {
  // @Get unique Id for optionId, LD, RA, etc.
  generateTransactionNonce : function(callback){
    crypto.randomBytes(3, function (err, nonceHex) {
      if(err){
        callback(err); 
      }
      else{
        callback(null, parseInt(nonceHex.toString('hex'), 16));
      }
    });
  },

}

// export
module.exports = CommonFunctions;