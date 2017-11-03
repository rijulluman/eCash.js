// Author : Rijul Luman
// Common Errors
var dataNotComplete =   'Request does not contain all required values';
var dbError         =   'Database error';
var notSignIn       =   'User not signed In'

// For Chatting API
// Array of All Codes
var ERROR_CODES  =   new Array();
/* ALL            */ ERROR_CODES[0]    =  '';
/* ALL            */ ERROR_CODES[1]    =  dataNotComplete;
/* ALL            */ ERROR_CODES[2]    =  dbError;
/* ALL            */ ERROR_CODES[3]    =  'Redis Error';

/* TRANSACTION    */ ERROR_CODES[5]    =  'Transaction Data Missing';
/* TRANSACTION    */ ERROR_CODES[6]    =  'Invalid Transaction Amount';
/* TRANSACTION    */ ERROR_CODES[7]    =  'Invalid Transaction Fees';
/* TRANSACTION    */ ERROR_CODES[8]    =  'Invalid Sender Address';
/* TRANSACTION    */ ERROR_CODES[9]    =  'Invalid Receiver Address';

/* TRANSACTION    */ ERROR_CODES[10]   =  'Invalid Private Key';
/* TRANSACTION    */ ERROR_CODES[11]   =  'Given Deadline is invalid';
/* TRANSACTION    */ ERROR_CODES[12]   =  'Error Generating Nonce';
/* TRANSACTION    */ ERROR_CODES[13]   =  'Invalid Nonce / Nonce too small';
/* TRANSACTION    */ ERROR_CODES[14]   =  'Invalid txId (Transaction Hash does not match)';
/* TRANSACTION    */ ERROR_CODES[15]   =  'Signature Mismatch / Unauthenticated Transaction';



// @Response Handler
var ErrorCodeHandler = {
  // @Get Error JSON data
  getErrorJSONData : function(data_param){
    // data
    var code  =   data_param.code;
    var res   =   data_param.res;
    var data  =   "";
    if(data_param.data){
      data = data_param.data;
    }

    // response
    var errResp =   {};

    // Get Error Description
    var error_text = ERROR_CODES[code];

    if(data_param.text && data_param.text.length > 0){
      error_text = data_param.text;
    }
    
    if(data_param.dbErr){
      if(data_param.dbErr.errors){
        var errors = data_param.dbErr.errors;
        for(var i in errors){
          if(errors[i].message){
            error_text = errors[i].message;
            break;
          }
        }
      }
      else if(data_param.dbErr.code == 11000){
        error_text = 'Value already exists (Duplicate key detected)';
      }
    }

    errResp =   {
            "data": data, 
            "error": {
              "code": code,
              "text": error_text
            }
          };
    res.send(errResp);
    return;
  },

}

// export
module.exports = ErrorCodeHandler;