var assert = require('assert');
var restify = require('restify');


var client = restify.createStringClient({
  url: 'http://localhost:8080',
});
client.basicAuth('452X87MdQW', 'f00r36bPc11sb6mlEPqy2XzMfCp5O8hr');
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
