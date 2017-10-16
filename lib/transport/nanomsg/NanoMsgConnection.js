'use strict';

var NanoMsg = require('nanomsg');
var Promise = require('promise');
var staticCounter = 0;

/**

 */
function NanoMsgConnection(transport, id, receive) {

  var createUrl = function (config, id) {
    if (!config) {
      return "inproc://" + id;
    }
    if (config.port && config.interface) {
      return "tcp://" + config.interface + ":" + config.port;
    } else if (config.baseport && config.interface) {
      return "tcp://" + config.interface + ":" + (config.baseport + (staticCounter++));
    } else if (config.url) {
      return config.url.replace("nanomsg:", "").replace(":id", id);
    } else {
      return "inproc://" + id;
    }
  };

  this.transport = transport;
  this.id = id;
  this.url = createUrl(transport.config, id)
  this.socketConfig = transport.config.socketConfig || {'ipv6': false, 'tcpnodelay': true};
  //TODO: socket config from transport.config, not only predefined

  this.insocket = NanoMsg.socket('pull', this.socketConfig);

  var me = this;
  //Bind to local socket for receiving messages, setup receive method
  this.ready = new Promise(function (resolve, reject) {
    me.insocket.bind(me.url);

    me.insocket.on('data', function (msg) {
      //TODO: provide an session id to not having to send sender on each call.
      var wrapper = JSON.parse(String(msg));
      receive(wrapper.sender, wrapper.message);
    });
    resolve();
  });

  //Keep list of peer connections, trying to reuse them when possible.
  this.outSockets = {};


}

NanoMsgConnection.prototype.getMyUrl = function () {
  return this.transport.type + ":" + this.url;
};

/**
 * Send a message to an agent.
 * @param {string} to
 * @param {*} message
 * @return {Promise} returns a promise which resolves when the message has been sent
 */
NanoMsgConnection.prototype.send = function (to, message) {
  if (!this.outSockets[to]) {
    this.outSockets[to] = NanoMsg.socket('push', this.socketConfig);
    this.outSockets[to].dontwait(true);
    this.outSockets[to].connect(to.replace(this.transport.type + ":", ""));
  }
  this.outSockets[to].send(JSON.stringify({"sender": this.getMyUrl(), "message": message}));

  return Promise.resolve();
};

/**
 * Close the connection
 */
NanoMsgConnection.prototype.close = function () {

  //Remove local socket
  if (this.insocket) {
    this.insocket.close();
  }
  //Close all remaining peer connections
  if (this.outSockets) {
    for (var peer in this.outSockets) {
      if (this.outSockets.hasOwnProperty(peer)) {
        this.outSockets[peer].close();
      }
    }
    this.outSockets = {};
  }
};

module.exports = NanoMsgConnection;