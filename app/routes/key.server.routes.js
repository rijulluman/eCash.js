// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Module dependencies.
 */

var key = require('app/controllers/key.server.controller');

module.exports = function (app) {

	// Setting up the listings api
    app.route('/api/key/generate').get(key.generate);
};