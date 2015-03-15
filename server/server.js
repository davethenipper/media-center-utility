// To run in full debug mode, use set DEBUG=express:* & node server/server.js
// on Windows or DEBUG=express:* node server/server.js on unix

var express = require('express'),
	morgan = require('morgan'),
	path = require('path'),
	colors = require('colors'),
	ip = require('ip'),
	utorrent = require('utorrent-api'),
	bodyParser = require('body-parser'),
	gmailSender = require('gmail-sender'),
	dataStore = require('docstore');

var utorrentUrl = 'http://' + ip.address() + ':9090/gui/latest.html';
var serverdeets = { canSend: false, email: '', password: ''};
var fileList = [];
var plexPath = '';
var db = {};

var utClient = new utorrent('localhost', '9090');
var app = express();

utClient.setCredentials('admin', 'password');
dataStore.open('./server/datastore', function(err, store) {
	if (err) {
		console.log(err);
	}
	else {
		db = store;
	}
});

app.use(morgan(':remote-addr - ' + 
			   '[:date] '.cyan + 
			   '":method :url '.green + 
			   'HTTP/:http-version" '.gray + 
			   ':status '.yellow + 
			   ':res[content-length] ' + 
			   '":referrer" ":user-agent" '.gray + 
			   'time=:response-time ms',
	{
		skip: function(req, res) { return (req.path === '/finished'); }
	}
));
app.use(express.static(path.join(__dirname + '/../src')));
app.use(bodyParser.json());

app.set('port', process.argv[2] || 8080);

app.get('/finished', function(req, res) {
	console.log('Torrent job done!');
	console.log('Details: ' + colors.yellow('{name: ' + 
				req.query.name + ', directory: ' + req.query.directory + '}'));

	var fileNotifier = findNotifierForFile(req.query.name, fileList);

	console.log(fileNotifier);
	if (fileNotifier.found && serverdeets.canSend) {
		gmailSender.send({
			smtp: {
				service: 'Gmail',
				user: serverdeets.email,
				pass: serverdeets.password
			},
			to: {
				email: fileNotifier.file.notifyEmail,
				name: fileNotifier.file.notifyEmail,
				surname: ''
			},
			subject: 'Download done!',
			template: './server/email-template.html',
			data: {
				fileName: fileNotifier.file.name
			}
		});
	}

	res.sendStatus(200);
});
app.get('/utorrentlist', function(req, res) {
	utClient.call('list', function(err, torrentList) {
		if (!err) {
			res.status(200).json(torrentList);
		}
		else {
			res.status(500).json(err);
		}
	});
});
app.get('/serverdeets', function(req, res) {
	db.get('serverdeets', function(err, doc) {
		if (err) {
			res.status(200).json(serverdeets);
		}
		else {
			res.status(200).json(JSON.parse(doc.jsonStr));
		}
	});
});

app.get('/plexdeets', function(req, res) {
	res.status(200).json({
		path: plexPath
	});
});
app.get('/refreshplex', function(req, res) {
	console.log('Refresh Plex here');
});

app.post('/serverdeets', function(req, res) {
	db.get('serverdeets', function(err, doc) {
		if (err) {
			db.save(
			{
				key: 'serverdeets',
				_id: 'serverdeets',
				jsonStr: JSON.stringify(req.body)
			}, 
			function(err, doc) {
				if (err) {
					console.log(err);
				}
				else {
					console.log('Document with key ' + doc.key + ' stored.');
				}
			});

		}
		else {
			if (doc.jsonStr !== JSON.stringify(req.body)) {
				db.save(
				{
					key: 'serverdeets',
					_id: 'serverdeets',
					jsonStr: JSON.stringify(req.body)
				}, 
				function(err, doc) {
					if (err) {
						console.log(err);
					}
					else {
						console.log('Document with key ' + doc.key + ' modified.');
					}
				});
			}
		}
	});
	serverdeets = req.body;
	res.sendStatus(200);
});
app.post('/filelisting', function(req, res) {
	console.log(req.body);
	fileList.push(req.body);
	res.sendStatus(200);
});

app.post('/plexdeets', function(req, res) {
	console.log(req.body);
	plexPath = req.body.path;
	res.sendStatus(200);
});

app.listen(app.get('port'), function() {
	console.log('media-center-utility app listening on port ' + colors.green(app.get('port')));
});

var findNotifierForFile = function(filename, fileList) {
	console.log(filename);
	console.log(fileList);
	var returnVal = {found: false, file: {}};
	for (var i = 0; i < fileList.length; i++) {
		if (filename === fileList[i].name) {
			returnVal.found = true;
			returnVal.file = fileList[i];
			break;
		}
	}
	return returnVal;
};