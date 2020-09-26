'use strict';

// Lambda@Edge doesn't allow env vars, so load them from json file.
const config = require('../resources/config.json');

// Load modules
const querystring = require('querystring');

// Instantiate
const settings = {};

// validateRequiredVar
// Checks if the supplied variable is of type string and has length
// @param {var} reqvar - the variable to check
// @return {promise} - Error or response object
function validateRequiredVar(reqvar) {
  return new Promise((resolve,reject) => {
    // Is the envar a string and have some length?
    if(typeof reqvar === 'string' && reqvar.length > 0) {
      return resolve();
    } else {
      return reject(new Error(`Missing Required Variable: ${reqvar}`));
    }
  }); // End Promise
} // End validateEnvar

// loadSettingsFromS3File
// Only loads into the global 'settings' object if it is empty.
// @param {string} bucket - The S3 bucket containing the settings file.
// @param {string} key - The S3 key to the settings file.
// @return {promise} - Error or response object
function loadSettingsFromS3File(bucket,key) {
  return new Promise((resolve,reject) => {
    // Check if 'redirects' are already stored in the global 'settings' object.
    if(settings.hasOwnProperty('redirects')) {
      console.log('loadSettingsFromS3File: redirects already set.'); // DEBUG:
      // Return
      return resolve();
    }
    // Load AWS modules
    const AWS = require('aws-sdk');
    AWS.config.update({region: 'us-east-1'});
    // Set S3 parameters.
    const params = {
      Bucket: bucket,
      Key: key
    };
    // Create S3 object.
    const S3 = new AWS.S3({
      maxRetries: 0
    });
    // Get the object from S3
    S3.getObject(params, (err, data) => {
      if (err) {
        console.log('loadSettingsFromS3File: err:',err);
        return reject(new Error("Error in loadSettingsFromS3File(): Unable to get S3 object."));
      }
      // Parse the data
      const body = JSON.parse(data.Body.toString('utf8'));
      // Assign redirs to global 'settings' object.
      settings.redirects = body;
      console.log('loadSettingsFromS3File: redirects assigned to settings.'); // DEBUG:
      // Return
      return resolve();
    }); // End s3.getObject
  }); // End Promise
} // End loadSettingsFromS3File

// generateNewUri
// Retrieves URI from settings.redirects for given CategoryID, PostID, or PageID
// @param {object} qsObject - The parsed querystring for this request.
// @return {promise} - Error or response newURI
function generateNewUri(qs) {
  return new Promise((resolve,reject) => {
    // settings.redirects[cats] is an array with the old categoryIDs as the keys
    // settings.redirects[posts] is an array with the old PostIDs and PageIDs as the keys
    let type;
    let pid;
    // If query type is cat, the redirect is found in redirects['cats']
    if('cat' in qs && qs.cat > 0) {
      type = 'cats';
      pid = qs.cat;
    } else {
    // Must be either p or page_id, these are both found in redirects['posts'].
      type = 'posts';
      pid = ('p' in qs && qs.p > 0)
          ? qs.p
          : ('page_id' in qs && qs.page_id > 0)
            ? qs.page_id
            : 0;
    }
//    console.log(JSON.stringify(settings.redirects[type],null,2)); // DEBUG:
    // If redirects.[type][pid] has an entry
    // and that entry has a redir value
    // and that redir value has some length
    // return it
    if( settings.redirects[type][pid]
     && settings.redirects[type][pid].hasOwnProperty('redir')
     && settings.redirects[type][pid].redir.length > 0) {
      console.log(`generateNewUri: redir found: ${settings.redirects[type][pid].redir}`); // DEBUG:
      return resolve(settings.redirects[type][pid].redir);
    } else {
      // No redir found for the given pid
      console.log(`Type: ${type} : PostID ${pid} not found.`);  // DEBUG:
      return reject(new Error('Not Found'));
    }
  }); // End Promise
} // End generateNewUri

// createResponseObject
// Creates 301 or 404 response object based on supplied uri
// @param {string} uri - The uri to redirect to.
// @return {promise} - 301 or 404 response object
function createResponseObject(uri) {
  return new Promise((resolve) => {
    console.log('createResponseObject:'+ uri );  // DEBUG:
    // If the uri is null, return 404 object.
    if(uri === null) {
      return resolve(
        {
          status: '404',
          statusDescription: 'Not Found'
        }
      );  // End resolve
    } else {  // Build 301 object.
      // Prepend / to new uri, unless the new uri is just '/'
      uri = (uri != '/') ? '/'+uri : uri;
      // Return 301 object.
      return resolve(
        {
          status: '301',
          statusDescription: 'Moved Permanently',
          headers: {
            location: [{
              key: 'Location',
              // Prepend domain if not in URI.
              value: config.envvars.DEFAULTDOMAIN+uri
            }]
          }
        }
      );  // End resolve
    } // End if/else
  }); // End Promise
} // End createResponseObject

module.exports.handler = async (event, context, callback) => {
  console.log(`Received event: `+JSON.stringify(event,null,2)); // DEBUG:

  // Get URI and querystring from CF request.
  let uriOld = event.Records[0].cf.request.uri;
  let queryString = event.Records[0].cf.request.querystring;

  // Only redirect requests to ?p=###, ?page_id=###, ?cat=###, ?paged=###...
  // otherwise skip.
  if(uriOld !== '/'
  || !/(p|cat|page_id|paged)=\d/.test(queryString)) {
    console.log(`URI and queryString don't match redirects. ${uriOld}?${queryString}`); // DEBUG:
    // Return request, no redirect needed.
    return callback(null, event.Records[0].cf.request);
  }

  // Validate that required environment variables are set
  await Promise.all([
   config.envvars.DEFAULTDOMAIN,
   config.envvars.SETTINGSS3BUCKET,
   config.envvars.SETTINGSS3KEY
  ].map(async (avar) => await validateRequiredVar(avar)))
  .then(async () => {
    console.debug('Environment variables exists.'); // DEBUG:
    // Required Env Vars validated, parse the querystring.
    let parsedQS = querystring.decode(queryString);
    console.log('parsedQS: '+JSON.stringify(parsedQS,null,2)); // DEBUG:
    return parsedQS;
  })
  .then(async (QS) => {
    // If querystring contains ?paged=## convert to /page/##/, no need to look up.
    if('paged' in QS && QS.paged >= 0) {
      // If paged is 0 treat it as 1, otherwise keep it as-is.
      QS.paged = (QS.paged == 0) ? 1 : QS.paged;
      // Return 301 to /page/##/ and throw a not-an-error to end promise chain.
      throw new Error(`page/${QS.paged}/`);
    } else {
      // querystring must be p, cat, or page_id, this requires a lookup.
      // Load redirect settings from S3.
      await loadSettingsFromS3File(
        config.envvars.SETTINGSS3BUCKET,
        config.envvars.SETTINGSS3KEY
      );
      return QS;
    } // End If(paged)
  })  // end Promise.all.then
  .then(async (QS) => {
    // Generate new URI
    return await generateNewUri(QS);
  })  // End Promise.all.then.then.then
  .then(async (newURI) => {
    // Create the response object
    return await createResponseObject(newURI);
  })
  .then((responseObject) => {
    console.log(`responseObject: `+JSON.stringify(responseObject,null,2));  // DEBUG:
    // Return the 301 response and shut down Lambda.
    return callback(null, responseObject);
  })  // End Promise.all.then.then.then.then (This always makes me giggle.)
  .catch(async (err) => {
   // If err.message starts with page/ it's not really an error, create 301.
   console.error(err);  // DEBUG
   if(/^page\//.test(err.message)) {
     console.log('Not really an error, just breaking chains.');
     return callback(null, await createResponseObject(err.message));
   } else {
     // Something really went wrong. Create a 404 response.
     console.log('A real error.');  // DEBUG
     return callback(null, await createResponseObject(null));
   }
  }); // End Promise.all.catch
};  // End module.exports.handler
