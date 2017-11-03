// @key.server.controller
// Author: Rijul Luman
// To generate Elliptic Curve Digital Signature key pair using the Secp256k1 curve

'use strict';
var async = require('async');
var crypto = require('crypto');
var secp256k1 = require('secp256k1/elliptic');

/**
 * Generate Public and Private Keys
 */
exports.generate = function(req, res, next) {
    
	var privateKey;
	do {
	  privateKey = crypto.randomBytes(Constants.PRIVATE_KEY_LENGTH);
	} while (!secp256k1.privateKeyVerify(privateKey))

	var publicKey = secp256k1.publicKeyCreate(privateKey, true); 	// Create Compressed Public key

	var jsonResp = {
		privateKey : CommonFunctions.bufferToHexString(privateKey),
		publicKey  : CommonFunctions.bufferToHexString(publicKey)
	};

	res.jsonp(jsonResp);
};


