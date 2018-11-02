'use strict';

var uuid = require('uuid-v4');
var Promise = require('promise');
var util = require('../util');


/**
 *
 * @param {Agent} agent
 * @param {Object} availableFunctions
 * @constructor
 */
function RPCModule(agent, availableFunctions, options) {
  this.agent = agent;
  this.receiveOriginal = agent._receive;
  this.queue = {};
  this.promiseTimeout = options && options.timeout || 1500; // 1 second

  // check the available functions
  if (availableFunctions instanceof Array) {
    this.functionsFromArray(availableFunctions);
  }
  else if (availableFunctions instanceof Object) {
    this.availableFunctions = availableFunctions;
  }
  else {
    console.log('cannot use RPC with the supplied functions', availableFunctions);
  }
  //TODO: Add getMethods(), getId(), getUrls(), getType() functions to agent
  this.availableFunctions["getId"] = function(){ return agent.id };
  this.availableFunctions["getType"] = function(){ return agent.constructor.name };
  this.availableFunctions["getMethods"] = this.getMethods.bind(this);
  this.availableFunctions["getUrls"] = function (){ return agent.getUrls()};
}

RPCModule.prototype.getMethods = function (){
  var res = {};
  for (var func in this.availableFunctions){
    if (this.availableFunctions.hasOwnProperty(func)){
       var method = this.availableFunctions[func];
       //TODO: find a way to further describe the function parameters....
       res[func] = {"type":"method","returns":"object","params":[{"type":"object","required":false,"name":"*"}],"required":false};
    }
  }
  return res;
};


RPCModule.prototype.type = 'rpc';

/**
 *
 * @param availableFunctions
 */
RPCModule.prototype.functionsFromArray = function (availableFunctions) {
  this.availableFunctions = {};
  for (var i = 0; i < availableFunctions.length; i++) {
    var fn = availableFunctions[i];
    this.availableFunctions[fn] = this.agent[fn];
  }
};


/**
 *
 * @param to
 * @param message
 * @returns {Promise}
 */
RPCModule.prototype.request = function (to, message) {
  var me = this;
  return new Promise(function (resolve, reject) {
    // prepare the envelope
    if (typeof message  !=  'object' ) {reject(new TypeError('Message must be an object'));}
    if (message.jsonrpc !== '2.0'    ) {message.jsonrpc = '2.0';}
    if (message.id      === undefined) {message.id = uuid();}
    if (message.method  === undefined) {reject(new Error('Property "method" expected'));}
    if (message.params  === undefined) {message.params = {};}

    // add the request to the list with requests in progress
    me.queue[message.id] = {
      resolve: resolve,
      reject: reject,
      timeout: setTimeout(function () {
        delete me.queue[message.id];
        reject(new Error('RPC Promise Timeout surpassed. Timeout: ' + me.promiseTimeout / 1000 + 's'));
      }, me.promiseTimeout)
    };
    var sendRequest = me.agent.send(to, message);
    if (util.isPromise(sendRequest) == true) {
      sendRequest.catch(function (err) {reject(err);});
    }
  });
};



/**
 *
 * @param from
 * @param message
 * @returns {*}
 */
RPCModule.prototype.receive = function (from, message, oobParams) {
  if (typeof message == 'object') {
    if (message.jsonrpc == '2.0') {
      this._receive(from, message, oobParams);
    }
    else {
      this.receiveOriginal.call(this.agent, from, message, oobParams);
    }
  }
  else {
    this.receiveOriginal.call(this.agent, from, message, oobParams);
  }
};


/**
 *
 * @param from
 * @param message
 * @returns {*}
 * @private
 */
RPCModule.prototype._receive = function (from, message, oobParams) {
  // define structure of return message
  var returnMessage = {jsonrpc:'2.0', id:message.id};

  // check if this is a request
  if (message.method !== undefined) {
    // check is method is available for this agent
    var method = this.availableFunctions[message.method];
    if (method !== undefined) {
      var response = method.call(this.agent, message.params, from, oobParams) || null;
      // check if response is a promise
      if (util.isPromise(response)) {
        var me = this;
        response
          .then(function (result) {
            returnMessage.result = result;
            me.agent.send(from, returnMessage)
          })
          .catch(function (error) {
            returnMessage.error = error.message || error.toString();
            me.agent.send(from, returnMessage);
          })
      }
      else {
        returnMessage.result = response;
        this.agent.send(from, returnMessage);
      }
    }
    else {
      var error = new Error('Cannot find function: ' + message.method);
      returnMessage.error = error.message || error.toString();
      this.agent.send(from, returnMessage);
    }
  }
  // check if this is a response
  else if (message.result !== undefined || message.error !== undefined) {
    var request = this.queue[message.id];
    if (request !== undefined) {
      // if an error is defined, reject promise
      if (message.error != undefined) { // null or undefined
        if (typeof message == 'object') {
          request.reject(message.error);
        }
        else {
          request.reject(new Error(message.error));
        }
      }
      else {
        request.resolve(message.result);
      }
    }
  }
  else {
    // send error back to sender.
    var error = new Error('No method or result defined. Message:' + JSON.stringify(message));
    returnMessage.error = error.message || error.toString();
    // FIXME: returned error should be an object {code: number, message: string}
    this.agent.send(from, returnMessage);
  }
};

/**
 * Get a map with mixin functions
 * @return {{_receive: function, request: function}}
 *            Returns mixin function, which can be used to extend the agent.
 */
RPCModule.prototype.mixin = function () {
  return {
    _receive: this.receive.bind(this),
    request: this.request.bind(this)
  }
};

module.exports = RPCModule;