// Author : Rijul Luman
module.exports = Object.freeze({

  "PRIVATE_KEY_LENGTH"  : 32,
  "VALID_HEX_PRIVATE_KEY_LENGTH"  : 64,      // this.PRIVATE_KEY_LENGTH * 2,
  "VALID_HEX_PUBLIC_KEY_LENGTH"   : 66,
  "SUM_DECIMAL_CORRECTION"        : 10000000,
  "MINIMUM_TRANSACTION_NONCE"     : 1000000,
  "MINIMUM_BLOCK_NONCE"           : 10000000000,
  "BLOCK_MAX_TRANSACTIONS_COUNT"  : 512,
  "GENESIS_BLOCK_PREV_HASH"       : "0123456789abcdeffedcba98765432100123456789abcdeffedcba9876543210",
  "TRANSACTION_DEADLINE_OFFSET"   : 100,     // Number of blocks before expiring


  "CURRENT_BLOCK_REDIS_TTL"       : 200,     // Idealy equal to average block time
  "UNCONFIRMED_TRANSACTION_TTL_SECONDS_PER_BLOCK" : 3600,  // Seconds per block difference


  "redisPath" : {
    "unconfirmedTransaction"        : "UT.",
    "sortedUnconfirmedTransaction"  : "SUT",
    "currentBlock"                  : "CB"
  }

});
