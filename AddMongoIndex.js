// Author : Rijul Luman
'use strict';

require('rootpath')();
var async = require('async');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var config = require("config/env/" + process.env.NODE_ENV + ".json");

// mongo config
const MONGO_URL             = config.mongo_url;
const MONGO_COLL_BLOCK      = config.mongo_coll_block;
const MONGO_COLL_BALANCE    = config.mongo_coll_balance;
const MONGO_COLL_TARGET     = config.mongo_coll_target;

var role_readwrite = [
  { role: "readWrite", db: MONGO_COLL_BLOCK },
  { role: "readWrite", db: MONGO_COLL_BALANCE },
  { role: "readWrite", db: MONGO_COLL_TARGET }
];

// @MongoIndex
var MongoIndex = {
  // add index
  addIndexes : function(mongoConnection, collection_name, indexes, options, callback){
    mongoConnection.collection(collection_name).ensureIndex( indexes, options, function(err, index_info){
      if(err){
        console.log('Set Indexes for - ',collection_name);  
        console.log('err - ',err);
        console.log('Index info - ',index_info);  
        console.log('-----------------------------------'); 
      }
      callback(err, index_info);
    });
  },
  
  addUser : function(db, username, password, roles, callback){
    db.addUser(username, password, { roles : roles }, function(err, result) {
      if(err && err.code != 11000){
        console.log('Create user ERROR: ', err);
      }
      callback(err, result);
    });
  },

  // add index
  getIndexes : function(mongoConnection, collection_name){
    mongoConnection.collection(collection_name).indexInformation(function(err, index_info){
      console.log('Get Indexes for - ',collection_name);  
      console.log('err - ',err);  
      console.log('Index info - ',index_info);
      console.log('-----------------------------------'); 
    });
  },
};

var MongoClient = require('mongodb').MongoClient;

MongoClient.connect(MONGO_URL, function(err, db) {
    // on error
    if(err) {
      console.log(MONGO_URL + " Mongo Connection Error - ", err);
    }
    else{
      // index here
      async.series([
        function(callback){
          MongoIndex.addIndexes(db, MONGO_COLL_BLOCK, {blockNumber : -1}, { unique: true }, callback);          // Will fail to set unique, if db already contains duplicate blockNumber values
        },
        function(callback){
          MongoIndex.addIndexes(db, MONGO_COLL_BALANCE, {blockNumber : -1}, {}, callback);
        },
        function(callback){
          MongoIndex.addIndexes(db, MONGO_COLL_TARGET, {blockNumber : -1}, {}, callback);
        },
        // function(callback){      // To be used when database is external
        //   MongoIndex.addUser(db, 'username', 'password', role_chat_read, callback);      
        // },
      ], function(errs, results){
        MongoIndex.getIndexes(db, MONGO_COLL_BLOCK);
        MongoIndex.getIndexes(db, MONGO_COLL_BALANCE);
        MongoIndex.getIndexes(db, MONGO_COLL_TARGET);
        db.close();
      });
    }
});