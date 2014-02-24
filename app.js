/**
 * Module dependencies.
 */

var _express = require('express');
var _routes = require('./routes');
var _notifications = require('./routes/notifications');
var _http = require('http');
var _path = require('path');
var _io = require('socket.io');
var _redis = require('redis');
var _httpProxy = require('http-proxy');

var app = _express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', _path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(_express.favicon());
app.use(_express.logger('dev'));
app.use(_express.json());
app.use(_express.urlencoded());
app.use(_express.methodOverride());
app.use(app.router);
app.use(_express.static(_path.join(__dirname, 'public')));

// development only
if ('development' === app.get('env')) {
  app.use(_express.errorHandler());
}

var server = _http.createServer(app);
var io = _io.listen(server);
var proxy = _httpProxy.createProxyServer();

function pythonProxy(req, res) {
  console.log("Proxying request...");
  proxy.web(req, res, {
    target : 'http://localhost:3010'
  }, function(e) {
    console.log("err: " + e);
    var respondeBody = 'ERROR: ' + e;
    res.writeHead(200, {
      'Content-Length' : respondeBody.length,
      'Content-Type' : 'text/plain'
    });
    res.end(respondeBody);
  });
}

// map urls
app.get('/', _routes.index);
app.get('/notifications', _notifications.notifications);
app.get('/python', pythonProxy);

function xxxxxxx(socket, redisClient, redisKey, redis_err, redis_reply) {

  console.log('redisClient.get() - redis_err: "' + redis_err
      + '" - redis_reply: "' + redis_reply + '"');

  if (redis_err !== null) {
    socket.emit('internal', {
      type : 'error',
      code : 'USER_ID_RETRIEVAL_RETURNED_ERROR',
      message : 'Error detected when trying to get user id.'
    });
    return;
  }

  if (redis_reply === null) {
    socket.emit('internal', {
      type : 'error',
      code : 'USERID_IS_NULL',
      message : 'Couldn\'t get userId.'
    });
    return;
  }

  // FIXME: should use something like 'get-and-delete'
  console.log("Remoging retrieved key");
  redisClient.del(redisKey);

  var userId = redis_reply;

  redisClient.on("error", function(err) {
    // TODO: infor this error to client (using websocket)
    // TODO: close this websocket (so the client knows and reconnect)
    console.log("Error " + err);
  });

  redisClient.on('message', function(pattern, data) {
    console.log('Suscriber received a message: ' + data);
    socket.emit('notification', {
      message : data
    });
  });

  var url = '/app/user/' + userId + '/notifications';
  console.log("Subscribing to " + url);
  redisClient.subscribe(url);

  socket.emit('internal', {
    type : 'success',
    code : 'SUBSCRIPTION_OK',
    message : 'Subscription to pub/sub ok.'
  });

}

io.of('/io/user/notifications').on('connection', function(socket) {
  console.log('Connection from ' + socket);

  socket.on('subscribe-to-notifications', function(data) {
    console.log('subscribe-to-notifications - data.uuid: "' + data.uuid);

    var redisKey = 'cookie-' + data.uuid;
    var redisClient = _redis.createClient();
    redisClient.get(redisKey, function(err, reply) {
      xxxxxxx(socket, redisClient, redisKey, err, reply);
    });
  });

});

server.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});
