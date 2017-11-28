// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var transaction = require('app/controllers/transaction.server.controller');
var user = require('app/controllers/user.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    app.route('/api/transaction/create').post(user.setUserDetails, transaction.create);
    app.route('/api/transaction/unconfirmed/:transactionId').get(transaction.read);

    // Finish by binding the id middleware
    app.param('transactionId', transaction.transactionByID);
};