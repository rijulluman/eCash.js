// Author : Rijul Luman
// @Common Functions

var crypto = require('crypto');
var secp256k1 = require('secp256k1/elliptic');
var hexadecimal   =   /^[0-9A-F]+$/i;

var CommonFunctions = {
  // @Get unique Id for optionId, LD, RA, etc.
  generateTransactionNonce : function(callback){
    crypto.randomBytes(3, function (err, nonceHex) {
      if(err){
        callback(err); 
      }
      else{
        var nonce = parseInt(nonceHex.toString('hex'), 16);
        if(nonce > Constants.MINIMUM_TRANSACTION_NONCE){
          callback(null, nonce);
        }
        else{
          CommonFunctions.generateTransactionNonce(callback);
        }
      }
    });
  },

  bufferToHexString : function(privateKey){
    var privateHex = "";
    for(var i = 0; i < privateKey.length; i++){
      privateHex = privateHex + ('0' + (privateKey.readUInt8(i) & 0xFF).toString(16)).slice(-2);
    }
    return privateHex;
  },

  hexStringToBuffer : function(privateHex){
    var intArr = [];
    for(var i = 0; i < privateHex.length; i+=2){
      intArr.push(parseInt(privateHex[i] + privateHex[i+1], 16));
    }
    return Buffer.from(intArr);
  },

  validatePublicKeyHexString : function(hexKey){
    return !(!hexKey || hexKey.length != Constants.VALID_HEX_PUBLIC_KEY_LENGTH || !hexadecimal.test(hexKey));
  },

  validatePrivateKeyHexString : function(hexKey){
    return !(!hexKey || hexKey.length != Constants.VALID_HEX_PRIVATE_KEY_LENGTH || !hexadecimal.test(hexKey));
  },

  generateTransactionHash : function(transaction){
    var hash = crypto.createHash('sha256');
    hash.update("" + transaction.nonce    );
    hash.update(transaction.sender   );
    hash.update(transaction.receiver );
    hash.update("" + transaction.amount   );
    hash.update("" + transaction.fees     );
    hash.update("" + transaction.deadline );
    return hash.digest('hex');
  },

  generateSignature : function(txId, privateKey){
    return CommonFunctions.bufferToHexString(secp256k1.sign(CommonFunctions.hexStringToBuffer(txId), privateKey).signature);
  },

  verifySignature : function(txId, publicKey, signature){
    return secp256k1.verify(CommonFunctions.hexStringToBuffer(txId), CommonFunctions.hexStringToBuffer(signature), CommonFunctions.hexStringToBuffer(publicKey));
  },

}

// export
module.exports = CommonFunctions;