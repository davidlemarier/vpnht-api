var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var execSync = require("exec-sync");
var fs = require('fs');
var cluster = require('cluster');



// helper for templates
String.prototype.fmt = function (hash) {
        var string = this, key; for (key in hash) string = string.replace(new RegExp('\\{' + key + '\\}', 'gm'), hash[key]); return string
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
        var status,
            result = {};

        fs.readFile('templates/add.vpnht', function (err, data) {

            data = data.toString();
            data = data.fmt(req.params);

            fs.writeFile("/tmp/add." + req.params.username + ".vpnht", data, function(err) {
                if(err) {
                    status = 'Failed'
                    res.send({code: status, message: result.stdout});
                    return next();
                } else {
                    result = execSync(CONFIG.LOCAL_COMMAND.ADD + " " + req.params.username, true);
                    if (result.stderr === '') {
                        status = 'SuccessAdd'
                        res.send({code: status, message: result.stdout});
                        return next();
                    } else {
                        result.stdout = result.stderr;
                        status = 'Failed'
                        res.send({code: status, message: result.stdout});
                        return next();
                    }
                }
            });
        });


    });

    // update user password
    server.put('/password/:username', function (req, res, next) {
        var status,
            result = {};

        result = execSync(CONFIG.LOCAL_COMMAND.PASSWORD + " " + req.params.username + " " + req.params.password, true);
        if (result.stderr === '') {
            status = 'SuccessPassword'
        } else {
            result.stdout = result.stderr;
            status = 'Failed'
        }

        res.send({code: status, message: result.stdout});
        return next();
    });

    // renew user
    server.put('/update/:username', function (req, res, next) {
        var status,
            result = {};

        result = execSync(CONFIG.LOCAL_COMMAND.RENEW + " " + req.params.username + " " + req.params.expiration, true);
        if (result.stderr === '') {
            status = 'SuccessPassword'
        } else {
            result.stdout = result.stderr;
            status = 'Failed'
        }

        res.send({code: status, message: result.stdout});
        return next();
    });

    // delete user with DEL
    server.del('/user/:username', function (req, res, next) {
        var status,
            result = {};

        // req.params.username

        result = execSync(CONFIG.LOCAL_COMMAND.DELETE  + " " + req.params.username, true);
        if (result.stderr === '') {
            status = 'SuccessDel'
        } else {
            result.stdout = result.stderr;
            status = 'Failed'
        }

        res.send({code: status, message: result.stdout});
        return next();
    });

    server.listen(8080, function () {
      console.log('CLUSTER: %s listening at %s', server.name, server.url);
    });

};
