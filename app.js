#! /usr/bin/env node

var proxy = require('./proxy');
var fs = require('fs');




//copy example rule file
if (process.argv[2] == '-init')
{
	var ex = fs.readFileSync(__dirname+'/rule-example.ini');
	fs.writeFileSync("devproxy.ini",ex);
	console.log("example rule file generated as ./devproxy.ini");
	process.exit();
}



var defaultRuleFile = '';
if (process.argv[2]) defaultRuleFile = process.argv[2];

if (defaultRuleFile == '')
{
	console.log("Welcome to devproxy!\n\
Usage:\n\
	to generate example rule file at current working directory,\n\
	you can use the following command:\n\
		\n\
		$ devproxy -init\n\
		\n\
	to start devproxy with rule file, use the following:\n\
	\n\
		$ devproxy path/to/devproxy.ini\n\
		\n\
Have fun!\n\
");
	process.exit();
}






var RULES = [];
var SETTINGS = {};
var CAPTURES = [];


proxy.filter = function(req,res,next)
{
	if (req.method != 'GET' && req.method != 'POST')
	{
		next();
		return;
	}

	var filePath = '';
	for(var i=0,rule; rule=RULES[i]; i++)
	{
		if (req.method == rule.method && req.url && rule.reg && req.url.match(rule.reg))
		{
			if (rule.match.match(/\/\*\*\*$/) && rule.file.match(/\/\*\*\*$/))
			{
				var basePath = rule.match.replace(/\*\*\*$/,'');
				var rPath = req.url.replace(basePath,'');
				rPath = rPath.split('?').shift();
				filePath = rule.file.replace(/\*\*\*$/,rPath);
			}
			else if (rule.match.match(/\/\*$/) && rule.file.match(/\/\*$/))
			{
				var baseName = basename(req.url);
				filePath = rule.file.replace(/\*$/,baseName);
			}
			else
			{
				filePath = rule.file;
			}
		}
	}




	if (filePath)
	{
		fs.exists(filePath,function(exists)
		{
			if (exists)
			{
				fs.readFile(filePath,function(err,data)
				{
					if (err)
					{
						console.log('local file not found: '+filePath);
						res.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
					}
					else
					{
						console.log('local file: '+filePath);
						res.write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: "+data.length+"\r\n");
						res.write("Content-Type: "+getContentType(filePath)+"\r\n\r\n");
		                res.end(data);
					}
				});
			}
			else
			{
				next();
			}
		});
	}
	else
	{
		next();
	}
};




fs.exists(defaultRuleFile,function(exists)
{
	if (exists)
	{
		syncRules(function()
		{
			fs.watchFile(defaultRuleFile,{persistent:true,interval:3000},syncRules);
			var port = SETTINGS.LISTEN_PORT || 2000;
			port = parseInt(port,10);
			proxy.listen(port);
		});
	}
	else
	{
		console.log('Error: can not find rule file '+defaultRuleFile);
		process.exit(0);
	}
});


function syncRules(cb)
{
	fs.readFile(defaultRuleFile, function (err, data)
    {
        if (!err)
        {
        	RULES = [];
        	SETTINGS = {};
        	CAPTURES = [];
			var s = data.toString();
			var lines = s.split("\n");
			for(var i=0;i<lines.length;i++)
			{
				var line = lines[i];
				if (line.match(/^\s*\#/)) continue;
				line = line.replace(/^\s+|\s+$/g,'');
				if (!line) continue;
				var p = line.split(/\s+/);


				if (p[0] == 'SET')
				{
					SETTINGS[p[1]] = p[2];
					continue;
				}

				if (p[0] == 'CAPTURE')
				{
					CAPTURES.push({ reg: createURLReg(p[1]), file: getRelativePath(p[2])});
					continue;
				}


				if (p[0] && p[1])
				{
					var rule = {};
					rule.reg = createURLReg(p[0]);
					rule.match = p[0];
					rule.file = p[1];
					rule.method = p[2] || 'GET';
					RULES.push(rule);
				}
			}
			console.log('rule file '+defaultRuleFile+' has '+ RULES.length + ' rules');
			syncSetting();
			if (typeof cb == 'function') cb();
		}
		else
		{
			console.log('reading rules file error');
		}
    });
}

function syncSetting()
{
	if (SETTINGS['HTTPPROXY_HOST'] && SETTINGS['HTTPPROXY_PORT'])
	{
		proxy.HTTPProxy = { host: SETTINGS['HTTPPROXY_HOST'], port: parseInt(SETTINGS['HTTPPROXY_PORT'],10) };
		console.log("SET HTTPPROXY to "+proxy.HTTPProxy.host+':'+proxy.HTTPProxy.port);
	}
	else
	{
		proxy.HTTPProxy = null;
	}

	if (SETTINGS['CACHE_FILE_TYPE'])
	{
		var arr = SETTINGS['CACHE_FILE_TYPE'].split(',');
		var ftypes = {};
		for(var i=0,ftype; ftype=arr[i]; i++)
		{
			ftype = ftype.toLowerCase().replace(/^[\s\t]+|[\s\t]+$/g,'');
			if (ftype) ftypes[ftype] = true;
		}
		proxy.cacheFileTypes = ftypes;
		console.log('SET CACHE FILE TYPES to '+SETTINGS['CACHE_FILE_TYPE'] );
	}
	else
	{
		proxy.cacheFileTypes = {};
		proxy.clearCache();
	}

	proxy.setCapture(CAPTURES);

	if (SETTINGS['CAPTURE_IGNORE'])
	{
		var arr = SETTINGS['CAPTURE_IGNORE'].split(',');
		var ftypes = {};
		for(var i=0,ftype; ftype=arr[i]; i++)
		{
			ftype = ftype.toLowerCase().replace(/^[\s\t]+|[\s\t]+$/g,'');
			if (ftype) ftypes[ftype] = true;
		}
		proxy.setCaptureIgnore(ftypes);
		console.log('SET CAPTURE_IGNORE to '+SETTINGS['CAPTURE_IGNORE']);
	}
	else
	{
		proxy.setCaptureIgnore({});
	}
	
	console.log(CAPTURES.length +' CAPTURE RULES');
	
}

function createURLReg(line)
{
	line = line.replace(/([\.\/\:\-\?\&\[\]\(\)\,\=\%])/g,"\\$1");
	line = line.replace(/\*{3}/g,'{+}{+}{+}');
	line = line.replace(/\*/g,'[^\\/\\s\\r\\n]*');
	line = line.replace(/\{\+\}\{\+\}\{\+\}/g,'.*');
	return new RegExp('^'+line+'$');
}

function basename(url)
{
	if (!url) return '';
	var l = url.split('/').pop();
	return l.split('?').shift();
}

function getRelativePath(f)
{
	var arr = defaultRuleFile.split('/');
	arr.pop();
	arr.push(f);
	return arr.join('/');
}

function getContentType(url)
{
    if (url.match(/\.css\b/i))
    {
        return 'text/css; charset=UTF-8';
    }
    else if (url.match(/\.js\b/i))
    {
        return 'text/javascript; charset=UTF-8';
    }
    else
    {
        return 'text/html; charset=utf-8';
    }
}



process.on('uncaughtException', function(err)
{
	console.log("\nError!!!!");
	//console.log(err);
});




