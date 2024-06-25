// functions/serverless.js
const server = require('./server');
const { createServer, proxy } = require('aws-serverless-express');
const app = createServer(server);

exports.handler = (event, context) => {
  return proxy(app, event, context);
};
