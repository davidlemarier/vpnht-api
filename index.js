var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var execSync = require("exec-sync");
var fs = require('fs');

var server = restify.createServer({
  name: 'vpnht-api',
  version: '1.0.0'
});

String.prototype.fmt = function (hash) {
        var string = this, key; for (key in hash) string = string.replace(new RegExp('\\{' + key + '\\}', 'gm'), hash[key]); return string
}

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(restify.authorizationParser());

server.use(function authenticate(req, res, next) {
    if (req.username === CREDENTIALS.API_KEY && req.authorization.basic.password === CREDENTIALS.API_SECRET) {
        return next();
    } else {
        return next(new restify.NotAuthorizedError());
    }
});

// new user with POST
server.post('/user', function (req, res, next) {
    var status,
        result = {};

    fs.readFile('templates/add.vpnht', function (err, data) {

        data = data.toString();
        data = data.fmt(req.params);

        fs.writeFile(CONFIG.FILES.ADD, data, function(err) {
            if(err) {
                status = 'Failed'
                res.send({code: status, message: result.stdout});
                return next();
            } else {
                result = execSync(CONFIG.LOCAL_COMMAND.ADD, true);
                if (result.stderr === '') {
                    status = 'SuccessPost'
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

// update user with PUT
server.put('/user/:username', function (req, res, next) {
    var status,
        result = {};

    // req.params.username

    result = execSync(CONFIG.LOCAL_COMMAND.UPDATE, true);
    if (result.stderr === '') {
        status = 'SuccessPut'
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

    result = execSync(CONFIG.LOCAL_COMMAND.DELETE, true);
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
  console.log('%s listening at %s', server.name, server.url);
});

function puts(error, stdout, stderr) { sys.puts(stdout) }
