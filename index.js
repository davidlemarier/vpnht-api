var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var cluster = require('cluster');
var Client = require('mariasql');
var c = new Client();

// helper for templates
String.prototype.fmt = function (hash) {
	var string = this,
		key;
	for (key in hash) string = string.replace(new RegExp('\\{' + key + '\\}', 'gm'), hash[key]);
	return string
}

if (cluster.isMaster) {

	// Count the machine's CPUs
	var cpuCount = require('os').cpus().length;

	// Create a worker for each CPU
	for (var i = 0; i < cpuCount; i += 1) {
		cluster.fork();
	}

} else {

	var server = restify.createServer({
		name: 'vpnht-api',
		version: '1.0.0'
	});

	server.use(restify.acceptParser(server.acceptable));
	server.use(restify.queryParser());
	server.use(restify.bodyParser());
	server.use(restify.authorizationParser());

	// auth
	server.use(function authenticate(req, res, next) {
		if (req.username === CREDENTIALS.API_KEY && req.authorization.basic.password === CREDENTIALS.API_SECRET) {
			return next();
		} else {
			return next(new restify.NotAuthorizedError());
		}
	});

	// add user
	server.post('/user', function (req, res, next) {
		var pq;

		c.connect({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			db: CONFIG.MYSQL.DB
		});

		// add expiration
		pq = c.prepare('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)');
		c.query(pq({
			username: req.params.username,
			attr: 'Expiration',
			op: ':=',
			value: req.params.expiration
		}))

		// add password
		pq = c.prepare('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)');
		c.query(pq({
			username: req.params.username,
			attr: 'NT-Password',
			op: ':=',
			value: req.params.password
		}))

		res.send({
			code: 'Success'
		});
		return next();

	});

	// update user password
	server.put('/password/:username', function (req, res, next) {

		c.connect({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			db: CONFIG.MYSQL.DB
		});

		var pq = c.prepare('UPDATE radcheck SET value=:password WHERE attribute = "NT-Password" AND username=:username');
		c.query(pq({
			username: req.params.username,
			password: req.params.password
		}));

		res.send({
			code: 'Success'
		});
		return next();
	});

	// renew user
	server.put('/activate/:username', function (req, res, next) {

		c.connect({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			db: CONFIG.MYSQL.DB
		});

		c.query('SELECT id FROM radcheck WHERE attribute = "Expiration" AND username="' + req.params.username + '"')
			.on('result', function (res) {

				if (res) {
					var pq = c.prepare('UPDATE radcheck SET value=:expiration WHERE attribute = "Expiration" AND username=:username');
					c.query(pq({
						username: req.params.username,
						expiration: req.params.expiration
					}));
				} else {
					var pq = c.prepare('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)');
					c.query(pq({
						username: req.params.username,
						attr: 'Expiration',
						op: ':=',
						value: req.params.expiration
					}))
				}

			});

		c.end();
		res.send({
			code: 'Success'
		});

		return next();
	});

	// delete user with DEL
	server.del('/user/:username', function (req, res, next) {

		c.connect({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			db: CONFIG.MYSQL.DB
		});

		c.query('DELETE FROM radcheck WHERE username="' + req.params.username + '"');
		c.end();

		res.send({
			code: 'Success'
		});
		return next();
	});

	server.listen(8080, function () {
		console.log('CLUSTER: %s listening at %s', server.name, server.url);
	});

};