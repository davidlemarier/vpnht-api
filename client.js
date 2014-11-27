var assert = require('assert');
var restify = require('restify');


var client = restify.createStringClient({
  url: 'http://fr01.vpn.ht:8080',
});
client.basicAuth('API_KEY', 'API_SECRET');

// add new user
client.post('/user', { username: 'david1', password: 'test123', expiration: '2016/10/08 19:30:00' }, function (err, req, res, obj) {
  console.log('Server returned: %j', obj);
});

// update TTL
//client.put('/user/david', { expiration: 478568425 }, function (err, req, res, obj) {
//  console.log('Server returned: %j', obj);
//});

// delete user 'david'
//client.del('/user/david', function (err, req, res, obj) {
//  console.log('Server returned: %j', obj);
//});
