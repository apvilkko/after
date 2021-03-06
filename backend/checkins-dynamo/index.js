"use strict";

var https = require('https');
var qs = require('querystring');
var _ = require('lodash');
var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();
var config = require('./config');

// Get latest checkins in a geographical area and store them to DynamoDB.
exports.handler = function(event, context) {

  // Helper that removes keys which have empty string as value (DynamoDB does not allow them)
  function delete_empty_strings(obj) {
    for (var k in obj) {
      if (obj[k] === '') {
        delete obj[k];
      } else if (typeof obj[k] === 'object') {
        delete_empty_strings(obj[k]);
      }
    }
  }

  function write_items(checkins) {
    delete_empty_strings(checkins);
    console.log('Received checkins: ' + checkins.length);

    var dynamoParams = {
      RequestItems: {},
      ReturnConsumedCapacity: 'TOTAL',
      ReturnItemCollectionMetrics: 'SIZE'
    };
    dynamoParams.RequestItems[config.tableCheckin] = [];

    checkins.forEach(function(checkin) {
      dynamoParams.RequestItems[config.tableCheckin].push({
        PutRequest: {
          Item: checkin
        }
      });
    });

    dynamo.batchWriteItem(dynamoParams, context.done);
  }

  var httpQueryParams = {
    client_id: config.remoteClientId,
    client_secret: config.remoteClientSecret,
    lat: config.area.lat,
    lng: config.area.lng,
    radius: config.area.radius
  };

  var httpOptions = {
    host: config.remoteHost,
    path: config.remotePath + '?' + qs.stringify(httpQueryParams)
  };

  https.get(httpOptions, function(res) {
    console.log('Remote server rate limit remaining: ', res.headers['x-ratelimit-remaining']);
    if (res.statusCode != 200) {
      console.log('Received non-ok status code from remote: ', res.statusCode);
      context.fail('Request to remote failed');
    }

    var responseBody = '';
    res.on('data', function(chunk) { responseBody += chunk; });
    res.on('end', function() {
      console.log('Received response, remaining millis ' + context.getRemainingTimeInMillis());

      var checkins = JSON.parse(responseBody).response.checkins.items;
      write_items(checkins);
    });

  }).on('error', function(e) {
    console.log(e.message);
    context.fail('Failed to get response from remote');
  });

};
