// Author : Rijul Luman
'use strict';

require('rootpath')();
/**
 * Required configs
 */
// config vars
global.Constants  =   require("config/constants.js");

// Extract from config
// Env mode
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
if (process.env.NODE_ENV == "production") {
  // require('newrelic');
}

var config                  =    require("config/config");
// listening port for Express/http server
const PORT                  =   config.express_port;
// mongo config
const MONGO_URL             = config.mongo_url;
const MONGO_COLL_TRANSACTION= config.mongo_coll_transaction;
const MONGO_COLL_BLOCK      = config.mongo_coll_block;
const MONGO_COLL_BALANCE    = config.mongo_coll_balance;

// redis config
const REDIS_MA_HOST        =   config.redis.MA.host;
const REDIS_MA_PORT        =   config.redis.MA.port;
const REDIS_SL_HOST        =   config.redis.SL.host;
const REDIS_SL_PORT        =   config.redis.SL.port;

/**
 * Express
 */
global.express        =   require('express');
global.app            =   express();

/**
 * @Express Configurations
 */
// Parse urlencoded request bodies into req.body
var bodyParser = require('body-parser');
var path = require('path');

app.use(bodyParser.urlencoded({extended:false}));
// parse application/json
app.use(bodyParser.json());

// Enable CORS - Cross-Origin Request Services
app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

/**
 * Redis
 * Setting & Configurations
 */
var redis           =   require('redis');  
global.RedisStoreMA =   redis.createClient(REDIS_MA_PORT,REDIS_MA_HOST,{no_ready_check:true});
global.RedisStoreSL =   redis.createClient(REDIS_SL_PORT,REDIS_SL_HOST,{no_ready_check:true});

// on connection error
RedisStoreMA.on("error", function (err) {
  console.log("Redis Master Connection Error - ", err);
  throw err;
});
RedisStoreSL.on("error", function (err) {
  console.log("Redis Slave Connection Error - ", err);
  throw err;
});
//redis.debug_mode = true;

// Root / Starting Point
app.get('/', function (req, res, next) {  
  res.send('Welcome!'); 
});

// Listen to port
var server = app.listen(PORT, function () {

  var lHost = server.address().address;
  var lPort = server.address().port;
});

/**
  * Mongo DB
*/

var MongoClient         =   require('mongodb').MongoClient;
global.ObjectId         =   require('mongodb').ObjectID;

global.mongoConnection        =   null;
global.TransactionCollection  =   null;
global.BlockCollection        =   null;
global.BalanceCollection      =   null;

MongoClient.connect(MONGO_URL, function(err, db) {  
  // on error
  if(err) {
    console.log("Mongo Connection Error - ", err);
    throw err;
  }

  //console.log(db.serverConfig.connections().length);
  //console.log(db.serverConfig);
  
  // save mongo connection
  mongoConnection       =   db;
  
  // set collection
  TransactionCollection    = mongoConnection.collection(MONGO_COLL_TRANSACTION);
  BlockCollection          = mongoConnection.collection(MONGO_COLL_BLOCK);
  BalanceCollection        = mongoConnection.collection(MONGO_COLL_BALANCE);

  // mongo db started
  console.log('Mongo DB Started');
});


/**
 * Other Required Module
 */
// Common functions
global.CommonFunctions    =   require('app/controllers/common');
// For Handling Error Codes
global.ErrorCodeHandler   =   require('app/handler/errorCode');
// Redis Handler
global.RedisHandler       =   require('app/handler/redis');
// Mongo Handler
global.MongoHandler       =   require('app/handler/mongo');


// Add Routes
// For APIs
// Globbing routing files
config.getGlobbedFiles('app/routes/**/*.js').forEach(function(routePath) {
    require(path.resolve(routePath))(app);
});

//
// For webiste
// app.use('/website', express.static(__dirname+'/admin-panel'));

