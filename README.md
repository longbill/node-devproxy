### An HTTP proxy which could replace http requests with local files by rules



# INSTALLATION

```javascript
npm install -g node-devproxy
```
this command will install a global tool named "devproxy" to your system


# GET A SAMPLE RULE FILE

in your working directory, run :

```javascript
	devproxy -init
```

# GET STARTED

```javascript
	devproxy path/to/rules.ini
```





## RULES 


SYNTAX:
  		URL	LOCALFILE [method]
where:
	URL is the file url on server
	LOCALFILE is the replacement file on local disk
	method is optional, could only be GET or POST. default is GET

	in URL, 
		you can use * to represent any character ( except / )
		you can use *** to represent any character ( including / )
	in LOCALFILE,
		you can use * to represent any file name ( only in that folder )
		you can use *** to represent any file name ( including in sub-folder )

	when using * or ***, files will only be replaced if there is a local file with the same name

EXAMPLES:

	http://www.google.com/js/jquery.js  /var/www/googlejs/jquery.js
	http://www.google.com/js/*			/var/www/googlejs/*
	http://www.google.com/js/***		/var/www/googlejs/***


MORE EXAMPLES AND SETTINGS COULD BE FOUND IN rule-example.ini
or
create an example at your working directory using devproxy -init



