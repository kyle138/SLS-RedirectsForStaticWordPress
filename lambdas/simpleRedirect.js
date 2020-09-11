'use strict';

module.exports.handler = async event => {
  console.log(`Received event: `+JSON.stringify(event,null,2)); // DEBUG: 
  return {
    status: '301',
    statusDescription: 'Moved Permanently',
    headers: {
      location: [{
        key: 'Location',
        value: 'https://nighthawk.kylemunz.com/654/replacing-the-sight-glass/img_20161118_153752/'
      }],
    },
  };

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};
