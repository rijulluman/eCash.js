// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var user = require('app/controllers/user.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    // app.route('/api/user/login').get(user.login); 	// TODO : Login using Redis
    app.route('/api/user/getCoinAge').get(user.getCoinAge);
};