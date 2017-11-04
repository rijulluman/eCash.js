// Author : Rijul Luman
module.exports = Object.freeze({

  "PRIVATE_KEY_LENGTH"  : 32,
  "VALID_HEX_PRIVATE_KEY_LENGTH"  : 64,      // this.PRIVATE_KEY_LENGTH * 2,
  "VALID_HEX_PUBLIC_KEY_LENGTH"   : 66,
  "MINIMUM_TRANSACTION_NONCE"     : 1000000,
  "MINIMUM_BLOCK_NONCE"           : 10000000000,
  "BLOCK_MAX_TRANSACTIONS_COUNT"  : 512,
  "GENESIS_BLOCK_PREV_HASH"       : "b0eb91df40525d01f1cd319fe875f7d229d2e7de665d9065795a4083e4f4ee50",
  "TRANSACTION_DEADLINE_OFFSET"   : 100,     // Number of blocks before expiring


  "UNCONFIRMED_TRANSACTION_TTL_SECONDS_PER_BLOCK" : 3600,  // Seconds per block difference


  "redisPath" : {
    "unconfirmedTransaction"        : "UT.",
    "sortedUnconfirmedTransaction"  : "SUT",
    "currentBlock"                  : "CB"
  }

});
