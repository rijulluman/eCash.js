// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var transaction = require('app/controllers/transaction.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    app.route('/api/transaction/create').post(transaction.create);
    app.route('/api/transaction/unconfirmed/:transactionId').get(transaction.read);

    // Finish by binding the id middleware
    app.param('transactionId', transaction.transactionByID);
};