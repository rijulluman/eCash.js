// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var block = require('app/controllers/block.server.controller');
var user = require('app/controllers/user.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    app.route('/api/block/id/:blockId').post(block.read);
    app.route('/api/block/latest').get(block.latestBlock);


    app.route('/api/block/create/new').post(user.setUserDetails, block.create); 		// For Testing only
    app.route('/api/block/create/new100').post(user.setUserDetails, block.create100Blocks); 		// For Testing only

    app.route('/api/balance/:userId').get(block.getUserBalance);

    // Finish by binding the id middleware
    app.param('blockId', block.blockByID);
    app.param('userId', block.bindUserId);
};