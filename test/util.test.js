var assert = require('assert');
var Promise = require('promise');
var util = require('../lib/util');
var URL = require('url');

describe('util', function() {

  it('should check whether an object is a Promise using ducktyping', function () {
    assert.equal(util.isPromise({}), false);
    assert.equal(util.isPromise('promise'), false);
    var obj = {
      'then': 'foo',
      'catch': 'bar'
    };
    assert.equal(util.isPromise(obj), false);

    assert.equal(util.isPromise(new Promise(function() {})), true);
    assert.equal(util.isPromise(Promise.resolve()), true);
    assert.equal(util.isPromise(Promise.reject()), true);

    var myPromise = {
      'then': function() {},
      'catch': function() {}
    };
    assert.equal(util.isPromise(myPromise), true);
  });

  it ('should normalize an url', function () {
    assert.equal(util.normalizeURL('http://foo.com/bar'), 'http://foo.com/bar');
    assert.equal(util.normalizeURL('http://foo.com/bar/'), 'http://foo.com/bar');
    assert.equal(util.normalizeURL('http://foo.com/'), 'http://foo.com');
  });

});
