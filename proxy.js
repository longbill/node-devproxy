var net = require('net');
var fs = require('fs');
var local_port = 2000;



var CAPTURES = [],CAPTURE_IGNORE = {};
exports.HTTPProxy = null;  // { host: "localhost", port:8000 }
exports.cacheFileTypes = {};
exports.clearCache = function() {};
exports.setCapture = function(captures)
{
    CAPTURES = captures;
};
exports.setCaptureIgnore = function(s)
{
    CAPTURE_IGNORE = s;
};

exports.filter = function(req,res,next)
{
    next();
};

exports.listen = function(port)
{
    if (port) local_port = port;

    var CACHE = {};

	exports.clearCache = function()
	{
		CACHE = {};
	};
	
    net.createServer(function (client)
    {
        var buffer = new Buffer(0);
        client.on('data',function(data)
        {
            buffer = buffer_add(buffer,data);
            if (buffer_find_body(buffer) == -1) return;
            var req = parse_request(buffer);
            if (req === false) return;
            client.removeAllListeners('data');


            exports.filter(req, client, function()
            {
                if (req.method == 'GET')
                {
                    var ftype = req.url.split('?').shift().split('.').pop().toLowerCase();
                    if ( exports.cacheFileTypes[ftype] && CACHE[req.path])
                    {
                        client.end(CACHE[req.path]);
                    }
                    else
                    {
                        relay_connection(req);
                    }
                }
				else
				{
					relay_connection(req);
				}
            });
        });

        //从http请求头部取得请求信息后，继续监听浏览器发送数据，同时连接目标服务器，并把目标服务器的数据传给浏览器
        function relay_connection(req)
        {
            //console.log(req.method+' '+req.host+':'+req.port);

            //如果请求不是CONNECT方法（GET, POST），那么替换掉头部的一些东西
            if (req.method != 'CONNECT')
            {
                //先从buffer中取出头部
                var _body_pos = buffer_find_body(buffer);
                if (_body_pos < 0) _body_pos = buffer.length;
                var header = buffer.slice(0,_body_pos).toString('utf8');

                if (checkCapture(req))
                {
                    header = header.replace(/Accept\-Encoding\:.+\r\n/i,'');
                }

                //替换connection头
                header = header.replace(/(proxy\-)?connection\:.+\r\n/ig,'')
                        .replace(/Keep\-Alive\:.+\r\n/i,'')
                        .replace("\r\n",'\r\nConnection: close\r\n');

                buffer = buffer_add(new Buffer(header,'utf8'),buffer.slice(_body_pos));
            }
            
            try
            {
                if (exports.HTTPProxy)
                {
                    var server = net.createConnection(exports.HTTPProxy.port,exports.HTTPProxy.host);
                }
                else
                {
                    var server = net.createConnection(req.port,req.host);
                }
            }catch(e)
            {
                return;
            }
            //交换服务器与浏览器的数据
            client.on("data", function(data)
            {
                buffer = buffer_add(buffer,data);
                server.write(data);
            });

            var server_response_buffer = new Buffer(0);
            server.on("data", function(data)
            {
                server_response_buffer = buffer_add(server_response_buffer,data);
                if (client.writable) client.write(data);
            });

            server.on('end',function()
            {
                if (req.method == 'GET')
                {
                    var ftype = req.url.split('?').shift().split('.').pop().toLowerCase();
                    if (exports.cacheFileTypes[ftype])
                    {
                        var _body_pos = buffer_find_body(server_response_buffer);
                        if (_body_pos > 0)
                        {
                            var header = server_response_buffer.slice(0,_body_pos).toString('utf8');
                            header = header.replace("\r\n","\r\nFromcache: yes\r\n");
                            server_response_buffer = buffer_add(new Buffer(header,'utf8'),server_response_buffer.slice(_body_pos));
                        }
                        CACHE[req.path] = server_response_buffer;
                        console.log('PROXY cached: '+req.path);
                    }
                }
                if (req.method != 'CONNECT')
                {
                    logHTTP(req,"REQUEST",buffer);
                    logHTTP(req,"RESPONSE",server_response_buffer);
                }
                else
                {
                    logHTTP(req,"CONNECT","CONNECT to "+req.host+':'+req.port);
                }
            });

            server.on('error',function()
            {
                console.log('PROXY error '+req.method+':'+req.host);
                client.end();
            });

            if (req.method == 'CONNECT')
            {
                if (exports.HTTPProxy)
                {
                    server.write(buffer);
                }
                else
                {
                    client.write(new Buffer("HTTP/1.1 200 Connection established\r\nConnection: close\r\n\r\n"));
                }
            }
            else
                server.write(buffer);
        }
    }).listen(local_port);

    console.log('PROXY server running at localhost:'+local_port);

};


function checkCapture(req)
{
    for(var i=0,c; c=CAPTURES[i];i++)
    {
        if (req.url.match(c.reg))
        {
            var ftype = req.url.split('?').shift().split('.').pop().toLowerCase();
            if (CAPTURE_IGNORE[ftype]) continue;
            return true;
        }
    }
    return false;
}

function logHTTP(req,type,buffer)
{
    if (!checkCapture(req)) return;
    for(var i=0,c; c=CAPTURES[i];i++)
    {
        if (req.url.match(c.reg))
        {
            fs.appendFile(c.file,type+' '+req.url+"\n<"+type+">\n\t");
            fs.appendFile(c.file,buffer.toString('utf-8').replace(/\n/g,"\n\t"));
            fs.appendFile(c.file,"\n</"+type+">\n\n\n");
            console.log('CAPTURED '+req.url+' into '+c.file );
        }
    }
}


//处理各种错误
// process.on('uncaughtException', function(err)
// {
//     console.log("\nError!!!!");
//     console.log(err);
// });



/**
* 从请求头部取得请求详细信息
* 如果是 CONNECT 方法，那么会返回 { method,host,port,httpVersion}
* 如果是 GET/POST 方法，那么返回 { metod,host,port,path,httpVersion}
*/
function parse_request(buffer)
{
    var s = buffer.toString('utf8');
    var method = s.split('\n')[0].match(/^([A-Z]+)\s/)[1];
    if (method == 'CONNECT')
    {
        var arr = s.match(/^([A-Z]+)\s([^\:\s]+)\:(\d+)\sHTTP\/(\d\.\d)/);
        if (arr && arr[1] && arr[2] && arr[3] && arr[4])
            return { method: arr[1], host:arr[2], port:arr[3],httpVersion:arr[4], path:'https://'+arr[2], url:'https://'+arr[2] };
    }
    else
    {
        var arr = s.match(/^([A-Z]+)\s([^\s]+)\sHTTP\/(\d\.\d)/);
        if (arr && arr[1] && arr[2] && arr[3])
        {
            var host = s.match(/Host\:\s+([^\n\s\r]+)/)[1];
            if (host)
            {
                var _p = host.split(':',2);
                return { method: arr[1], host:_p[0], port:_p[1]?_p[1]:80, path: arr[2], url: arr[2],httpVersion:arr[3] };
            }
        }
    }
    return false;
}




/**
* 两个buffer对象加起来
*/
function buffer_add(buf1,buf2)
{
    var re = new Buffer(buf1.length + buf2.length);
    buf1.copy(re);
    buf2.copy(re,buf1.length);
    return re;
}

/**
* 从缓存中找到头部结束标记("\r\n\r\n")的位置
*/
function buffer_find_body(b)
{
    for(var i=0,len=b.length-3;i<len;i++)
    {
        if (b[i] == 0x0d && b[i+1] == 0x0a && b[i+2] == 0x0d && b[i+3] == 0x0a)
        {
            return i+4;
        }
    }
    return -1;
}
