var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var cluster = require('cluster');
var mysql = require('mysql');
var _ = require('lodash');

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

		connection.query('select * from radacct GROUP by nasipaddress;',
			function (err, result) {
				if (err) throw err;

				// we start @ 0;
				var total = result.length-1;
				_.each(result, function(server, key) {

						connection.query('select count(*) as count from radacct WHERE nasipaddress = ?', [server.nasipaddress],
							function (err, total) {
								if (err) throw err;

								connection.query('select count(*) as count from radacct WHERE nasipaddress = ? AND acctstoptime IS NULL', [server.nasipaddress],
									function (err, totalLive) {
										if (err) throw err;

										finalStats.push({
											server: nasipaddress,
											connexions: total[0].count,
											connected: totalLive[0].count
										});

										// if last server we push content
										if (total === key) {
											connection.end();

											res.send({
												stats: finalStats
											});

											return next();
										}
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
