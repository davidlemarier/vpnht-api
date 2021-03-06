var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var cluster = require('cluster');
var mysql = require('mysql');
var _ = require('lodash');
var request = require('request');

var vpnServers = require('./servers');

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

		if (req.url !== '/servers' && req.url !== '/smartdns') {
			if (req.username === CREDENTIALS.API_KEY && req.authorization.basic.password === CREDENTIALS.API_SECRET) {
				return next();
			} else {
				return next(new restify.NotAuthorizedError());
			}
		} else {

			// auth with freeradius
			if (req.username && req.authorization && req.authorization.basic) {
				var connection = mysql.createConnection({
					host: CONFIG.MYSQL.HOST,
					user: CONFIG.MYSQL.USER,
					password: CONFIG.MYSQL.PASS,
					database: CONFIG.MYSQL.DB
				});

				connection.connect();

				connection.query(
					'SELECT value FROM radcheck WHERE attribute = "NT-Password" AND username=?', [req.username],
					function (err, result) {
						if (err) {
							res.send(401);
						} else {
							var nthash = require('smbhash').nthash;
							// check passwd match
							if (result[0] && result[0].value == nthash(req.authorization.basic.password)) {
								next();
							} else {
								res.send(401);
							}
						}
					}
				);
			} else {
				res.send(401);
			}
		}

	});

	// add user
	server.post('/user', function (req, res, next) {
		var pq;

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		connection.config.queryFormat = function (query, values) {
			if (!values) return query;
			return query.replace(/\:(\w+)/g, function (txt, key) {
				if (values.hasOwnProperty(key)) {
					return this.escape(values[key]);
				}
				return txt;
			}.bind(this));
		};

		// add expiration
		connection.query('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)', {
			username: req.params.username,
			attr: 'Expiration',
			op: ':=',
			value: req.params.expiration
		}, function (err, result) {
			if (err) throw err;

			// NT PASSWORD
			connection.query('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)', {
				username: req.params.username,
				attr: 'NT-Password',
				op: ':=',
				value: req.params.password
			}, function (err, result) {
				if (err) throw err;

				connection.end();

				res.send({
					code: 'Success'
				});
				return next();
			});
		});

	});

	// update user password
	server.put('/password/:username', function (req, res, next) {

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		connection.query(
			'UPDATE radcheck SET value=? WHERE attribute = "NT-Password" AND username=?', [req.params.password, req.params.username],
			function (err, result) {
				if (err) throw err;

				connection.end();

				res.send({
					code: 'Success'
				});
				return next();
			}
		);

	});

	// renew user
	server.put('/activate/:username', function (req, res, next) {

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		connection.query(
			'SELECT id FROM radcheck WHERE attribute = "Expiration" AND username=?', [req.params.username],
			function (err, result) {
				if (err) throw err;

				connection.query('UPDATE radcheck SET value=? WHERE attribute = "Expiration" AND username=?', [req.params.expiration, req.params.username],
					function (err, result) {
						if (err) throw err;

						connection.end();

						res.send({
							code: 'Success'
						});
						return next();
					}
				);

			}
		)

	});

	// delete user with DEL
	server.del('/user/:username', function (req, res, next) {

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		connection.query('DELETE FROM radcheck WHERE username=?', [req.params.username],
			function (err, result) {
				if (err) throw err;

				connection.end();

				res.send({
					code: 'Success'
				});
				return next();
			}
		);
	});

	server.get('/user/:username', function (req, res, next) {

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		connection.query('select * from radacct WHERE username=?', [req.params.username],
			function (err, result) {
				if (err) throw err;

				connection.end();
				if (result[0]) {
					res.send({
						user: result[0]
					});
				} else {
					res.send({
						user: false
					});
				}

				return next();
			}
		);
	});

	// pt client login
	server.get('/servers', function (req, res, next) {
		res.send(
			{
				"user": {
					"username": req.username
				},
				"servers": vpnServers
			}
		);

		return next();
	});

	// smartdns whitelist
	server.get('/smartdns', function (req, res, next) {
		var ip = req.headers['x-forwarded-for'] ||
	    	req.connection.remoteAddress ||
	     	req.socket.remoteAddress ||
	     	req.connection.socket.remoteAddress;

		// todo whitelist IP
		res.send(
			{
				"user": {
					"username": req.username,
					"ip": ip
				},
				"dns": ['178.62.106.191', '104.131.49.85']
			}
		);

		return next();
	});

	// delete user with DEL
	server.get('/stats', function (req, res, next) {

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			database: CONFIG.MYSQL.DB
		});

		connection.connect();

		var finalStats = [];
		var totaluserlive = 0;

		connection.query('select * from radacct GROUP by nasipaddress;',
			function (err, result) {
				if (err) throw err;

				// we start @ 0;
				var totalAcct = result.length-1;
				_.each(result, function(server, key) {

						connection.query('select count(*) as count from radacct WHERE nasipaddress = ?', [server.nasipaddress],
							function (err, total) {
								if (err) throw err;

								connection.query('select count(*) as count from radacct WHERE nasipaddress = ? AND acctstoptime IS NULL', [server.nasipaddress],
									function (err, totalLive) {
										if (err) throw err;

										request('https://myip.ht/ip/'+server.nasipaddress, function (error, response, body) {

											var serverD = JSON.parse(body);
											var host = false;
											if (serverD && serverD.host) {
												host = serverD.host;
											}
											finalStats.push({
												server: server.nasipaddress,
												connexions: total[0].count,
												connected: totalLive[0].count,
												hostname: host
											});

											totaluserlive = totaluserlive + parseInt(totalLive[0].count);

											// if last server we push content
											if (key >= totalAcct) {
												connection.end();

												res.send({
													stats: finalStats,
													totalLive: totaluserlive
												});

												return next();
											}
										});

								});

						});
				});

			}
		);
	});


	server.listen(8080, function () {
		console.log('CLUSTER: %s listening at %s', server.name, server.url);
	});

};
