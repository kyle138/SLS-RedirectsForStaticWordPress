'use strict';

// Lambda@Edge doesn't allow env vars, so load them from json file.
const config = require('../resources/config.json');

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

// getPostID
// Retrieves post ID from a queryString of type p=###
// @param {string} qs - the queryString to extract Post ID from
// @return {promise} - Error or response PostID
function getPostID(qs) {
  return new Promise((resolve,reject) => {
    // Extract value after p= and check if it's a postive number.
    qs = qs.split('p=');
    if(Math.sign(parseInt(qs[1],10))) {
      console.log(`getPostID: qs[1]: ${qs[1]}`);  // DEBUG:
      return resolve(qs[1]);
    } else {
      console.log(`Error: getPostID: qs: ${qs}`); // DEBUG:
      return reject(new Error(`Error: getPostID`));
    }
  }); // End Promise
} // End getPostID

// generateNewUri
// Retrieves URI from settings.redirects for given PostID
// @param {string} pid - The PostID to retrieve a redirect for
// @return {promise} - Error or response newURI
function generateNewUri(pid) {
  return new Promise((resolve,reject) => {
    // settings.redirects is an array with the old PostID's as the keys
    // If redirects[] has an entry for pid
    // and that entry has a redir value
    // and that redir value has some length
    // return it
    if( settings.redirects[pid]
     && settings.redirects[pid].hasOwnProperty('redir')
     && settings.redirects[pid].redir.length > 0) {
      console.log(`generateNewUri: redir found: ${settings.redirects[pid].redir}`); // DEBUG:
      return resolve(settings.redirects[pid].redir);
    } else {
      // No redir found for the given pid
      console.log(`PostID ${pid} not found.`);  // DEBUG:
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
    console.log('createResponseObject:');  // DEBUG:
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

  // Only redirect requests to /?p=###, otherwise skip.
  if(uriOld !== '/' || !/^p=\d/.test(queryString)) {
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
   // Required Env Vars validated, load redirect settings.
   console.debug('Environment variables exist.'); // DEBUG:
   await loadSettingsFromS3File(
     config.envvars.SETTINGSS3BUCKET,
     config.envvars.SETTINGSS3KEY
   );
  }) // End Promise.all.then
  .then(async () => {
    // Extract postID from queryString
    return await getPostID(queryString);
  }) // End Promise.all.then.then
  .then(async (postID) => {
    // Generate new URI ******************
    return await generateNewUri(postID);
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
   // Something went wrong. Create a 404 response.
   console.error(err);
   const response = await createResponseObject(null);
   console.log('Error Response: '+JSON.stringify(response,null,2)); // DEBUG:
   // Return the 404 response and shut down Lambda.
   return callback(null, response);
  }); // End Promise.all.catch
};  // End module.exports.handler
