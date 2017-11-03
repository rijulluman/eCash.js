// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var key = require('app/controllers/key.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    app.route('/api/key/create').post(key.create);

    // Finish by binding the Listing middleware
    app.param('transactionId', transaction.transactionByID);
};