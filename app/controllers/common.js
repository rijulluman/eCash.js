// Author : Rijul Luman
// @Common Functions

var crypto = require('crypto');
var secp256k1 = require('secp256k1/elliptic');
var hexadecimal   =   /^[0-9A-F]+$/i;

var CommonFunctions = {

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

  // generateBlockNonce : function(callback){
  //   crypto.randomBytes(5, function (err, nonceHex) {
  //     if(err){
  //       callback(err); 
  //     }
  //     else{
  //       var nonce = parseInt(nonceHex.toString('hex'), 16);
  //       if(nonce > Constants.MINIMUM_BLOCK_NONCE){
  //         callback(null, nonce);
  //       }
  //       else{
  //         CommonFunctions.generateBlockNonce(callback);
  //       }
  //     }
  //   });
  // },

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

  generateTransactionArrayHash : function(transactions){
    var hash = crypto.createHash('sha256');
    transactions.forEach(function(transaction){
      hash.update(transaction.txId );
      hash.update("" + transaction.nonce );
      hash.update(transaction.sender );
      hash.update(transaction.receiver );
      hash.update("" + transaction.amount );
      hash.update("" + transaction.fees );
      hash.update("" + transaction.deadline );
      hash.update("" + transaction.signature );
    });
    return hash.digest('hex');        // TODO : Test for max number of transactions
  },

  generateProofHashAndNonce : function(target, block){
    // var time = new Date().getTime();
    for(var i = 0; i < Number.MAX_SAFE_INTEGER; i++){    // Add Randomness to i to prevent halting of the blockchain, if only 1 node active on the network
      block.nonce = i;
      var hash = CommonFunctions.generateProofHash(block);
      
      if(CommonFunctions.validateProofHash(hash, target)){
        return { hash : hash, nonce: block.nonce } ;
      }
      // else if(i%100000 == 0 && new Date().getTime() - time > Constants.PROOF_HASH_AVG_BLOCK_TIME_MULTIPLIER * Constants.AVERAGE_BLOCK_TIME_MS){
      //   return { hash : hash, nonce: block.nonce } ;  // Will generate invalid block, but we need to stop trying this, or try again with different transactions
      // }
    }
  },

  validateProofHash : function(hash, target){
    var initialZeros = 2 * parseInt(target.substring(0,2), 16);
    var targetNum = parseInt(target.substring(2), 16);
    for(var i = 0; i < initialZeros; i++){
      if(hash.charAt(i) != "0"){
        return false;
      }
    }
    var blockHashNum = parseInt(hash.substring(initialZeros, initialZeros + 6), 16);
    return (targetNum > blockHashNum);
  },

  generateProofHash : function(block){
    var hash = crypto.createHash('sha256');

    hash.update(""+block.blockNumber);
    hash.update(""+block.nonce );
    hash.update(block.blockCreatorId );
    hash.update(block.previousBlockHash );
    hash.update(""+block.totalAmount );
    hash.update(""+block.totalFees );
    block.transactions.forEach(function(transaction){
      hash.update(transaction.txId );
      hash.update("" + transaction.nonce );
      hash.update(transaction.sender );
      hash.update(transaction.receiver );
      hash.update("" + transaction.amount );
      hash.update("" + transaction.fees );
      hash.update("" + transaction.deadline );
      hash.update("" + transaction.signature );
    });
    hash.update(""+block.transactionCount );
    hash.update(block.transactionHash );
    hash.update(block.transactionSignature);

    return hash.digest('hex');        // TODO : Test for max number of transactions
  },

  generateBlockHash : function(block){
    var hash = crypto.createHash('sha256');

    hash.update(""+block.blockNumber);
    hash.update(""+block.nonce );
    hash.update(block.proofHash);
    hash.update(""+block.timestamp);
    hash.update(block.blockCreatorId );
    hash.update(block.previousBlockHash );
    hash.update(""+block.totalAmount );
    hash.update(""+block.totalFees );
    block.transactions.forEach(function(transaction){
      hash.update(transaction.txId );
      hash.update("" + transaction.nonce );
      hash.update(transaction.sender );
      hash.update(transaction.receiver );
      hash.update("" + transaction.amount );
      hash.update("" + transaction.fees );
      hash.update("" + transaction.deadline );
      hash.update("" + transaction.signature );
    });
    hash.update(""+block.transactionCount );
    hash.update(block.transactionHash );
    hash.update(block.transactionSignature);

    return hash.digest('hex');        // TODO : Test for max number of transactions
  },

  generateSignature : function(sha256Hash, privateKey){
    return CommonFunctions.bufferToHexString(secp256k1.sign(CommonFunctions.hexStringToBuffer(sha256Hash), privateKey).signature);
  },

  verifySignature : function(sha256Hash, publicKey, signature){
    return secp256k1.verify(CommonFunctions.hexStringToBuffer(sha256Hash), CommonFunctions.hexStringToBuffer(signature), CommonFunctions.hexStringToBuffer(publicKey));
  },

  verifyWalletKeyPair : function(privateKey, publicKey){
    var sampleMessage = Constants.GENESIS_BLOCK_PREV_HASH;
    privateKey = CommonFunctions.hexStringToBuffer(privateKey);
    return CommonFunctions.verifySignature(sampleMessage, publicKey, CommonFunctions.generateSignature(sampleMessage, privateKey));
  }

}

// export
module.exports = CommonFunctions;