"use strict";

const fs = require("fs");
const os = require("os");
const https = require("https");
const readline =  require("readline");
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const clc = require('cli-color');
const ejs = require('ejs');
const jen = (new require('node-jen'))();

const errorColor = clc.xterm(196);
const okColor = clc.xterm(46);
const noteColor = clc.xterm(214);

console.ok = function(l) {
  for(var a in arguments) {
    var ar = arguments[a];
    arguments[a] = "["+okColor('OK')+"] "+ar;
  }
  console.log.apply(this, arguments);
}

console.error = function(l) {
  for(var a in arguments) {
    var ar = arguments[a];
    arguments[a] = "["+errorColor('FAIL')+"] "+ar;
  }
  console.log.apply(this, arguments);
}

console.note = function(l) {
  for(var a in arguments) {
    var ar = arguments[a];
    arguments[a] = "["+noteColor('NOTE')+"] "+ar;
  }
  console.log.apply(this, arguments);
}

var downloadList = [
  'satellite',
  'gate',
  'gateWaf',
];

class satellite {
  constructor() {
    /* */
    var baseUrl = '/download/'+os.type()+'/'+os.arch()+'/'+os.release();
    var self = this;

    /* load readline */
    this.rl = readline.createInterface({
    	input: process.stdin,
    	output: process.stdout
    });

    /* check for old installation */
    try {
      var oldVersion = JSON.parse(fs.readFileSync('/application/satellite/package.json').toString('utf8'));
    } catch(e) { oldVersion = null; }
    if(oldVersion) {
      this.rl.question('You are already running a Satellite WAF (v'+oldVersion.version+'), '+
        'Would you like to Continue? (Yes/No) ', function(answer) {
        if(answer.match(/y(es)?/i))
          stage2(true);
        else {
          console.log("Aborting");
          process.exit(0);
        }
      });
    }
    else
      stage2(false);

    function forever(cmd) {
        if(cmd == 'start') {
          var f = 'forever -a -l /application/data/logs/forever.log '+
            '-o /application/data/logs/satellite.log '+
            '-e /application/data/logs/satellite-error.log '+
            '--uid satellite '+
            cmd+' '+
            '--max_old_space_size=2000 /application/satellite/bin/ews.js --config=/etc/satellite/config.js';
        }
        else {
          var f = 'forever '+
            cmd+' '+
            'satellite';
        }
        return(f);
      }

    function stage2(old) {
      if(old) {
        var stop = {
          'Stopping old Installation': forever('stop')
        }
        self.listExec(stop);
      }

      var dl = downloadList.slice(0);
      var counter = 1;

      function pop() {
        var file = dl.pop();
        if(!file) {
          console.ok('Download Completed');
          return(stage3());
        }

        var filename = '/application/data/download/'+file+'.tar.gz';
        self.mkdirDeep(filename);

        console.ok('Downloading file '+counter+'/'+downloadList.length);
        self.download(baseUrl+'/'+file, filename, (e) => {
          if(e) {
            console.error('Error occurs while downloading: '+e.message);
            process.exit(-1);
            return;
          }
          counter++;
          process.nextTick(pop);
        });

      }
      process.nextTick(pop);
    }

    /* stage 3 only for satellite */
    function stage3() {
      /* prepare config.js */
      var token = jen.password(50);
      var data = fs.readFileSync('/tmp/satellite/config.js').toString();
      data = ejs.render(data, {token: token});
      fs.writeFileSync('/tmp/satellite/config.js', data)

      /* prepare the configuration */
      var csr  = 'openssl req -new -key server.key -out server.csr '+
      '-subj "/C=CH/ST=Switzerland/L=Lausanne/O=inGen Security/OU=Satellite Appliance/CN=waf.ingensec.lo"';

      /* First first big step  */
      var cmds = {
        /* System base */
        'Cleaning Installation': 'rm -rf /application/satellite',
        'Decompressing Satellite Archive': 'cd /application/data/download/; rm -rf satellite; tar zxf satellite.tar.gz',
        'Moving Installation': 'mv /application/data/download/satellite /application',
        'Preparing NPM Dependencies': 'cd /application/satellite; npm install',
        'Configuring Satellite Appliance': 'mkdir /etc/satellite; cp /tmp/satellite/config.js /etc/satellite',
        'Preparing Logs Data': 'mkdir -p /application/data/logs',

        /* Nodejs port cap */
        'Setting NodeJS 80,443 Capability': 'echo "setcap CAP_NET_BIND_SERVICE=+eip /usr/bin/nodejs" > /etc/ingen.rc.local; chmod +x /etc/ingen.rc.local',
        'Executing NodeJS Capability': '/bin/bash /etc/ingen.rc.local',
        'Setting Post Invoke Success': 'echo "DPkg::Post-Invoke-Success { \'/etc/ingen.rc.local\';};" > /etc/apt/apt.conf.d/99ingen',

        /* prepare gate */
        'Cleaning Gatejs Installation': 'rm -rf /application/gate',
        'Decompressing Gate Archive': 'cd /application/data/download/; rm -rf gate; tar zxf gate.tar.gz',
        'Moving Gate Installation': 'mv /application/data/download/gate /application',
        'Configuring Gate Module': 'mkdir /etc/gatejs; cp /tmp/satellite/gate-config.js /etc/gatejs/config.js',

        /* prepare gateWaf */
        'Cleaning WAF Installation': 'rm -rf /application/gateWaf',
        'Decompressing WAF Archive': 'cd /application/data/download/; rm -rf gateWaf; tar zxf gateWaf.tar.gz',
        'Moving WAF Installation': 'mv /application/data/download/gateWaf /application',

        /* Signing interface */
        'Preparing Local Signing System': 'mkdir /etc/gatejs/sign',
        'Generating 4K RSA Signing Private Key': 'cd /etc/gatejs/sign; openssl genrsa -out server.key 4096',
        'Generating 4K RSA Signing Public Key': 'cd /etc/gatejs/sign; openssl rsa -in server.key -out server.pub.key -outform PEM -pubout',
        'Fixing RSA Private Key Permissions': 'chmod 600 /etc/gatejs/sign/server.key',

        /* SSH */
        'Cleaning SSH Key Agent': 'rm -rf /home/satellite/.ssh',
        'Generating 4K SSH Key Agent': 'su satellite -s /bin/bash -c "ssh-keygen -b 4096 -t rsa -N \\\"\\\" -f /home/satellite/.ssh/id_rsa"',

        /* TLS for Satellite */
        'Satellite: Preparing Local TLS System': 'mkdir -p /etc/satellite/ssl',
        'Satellite: Generating 4K RSA TLS Private Key': 'cd /etc/satellite/ssl; openssl genrsa -aes256 -passout pass:x -out server.pass.key 4096',
        'Satellite: Cleaning Private Key Password': 'cd /etc/satellite/ssl; openssl rsa -passin pass:x -in server.pass.key -out server.key; rm server.pass.key',
        'Satellite: Generating Certificate Signing Request': 'cd /etc/satellite/ssl; '+csr,
        'Satellite: Signing TLS Certificate': 'cd /etc/satellite/ssl; openssl x509 -req -days 3650 -in server.csr -signkey server.key -out server.crt',
        'Satellite: Fixing TLS Permissions': 'chmod 600 /etc/satellite/ssl/server.key; chmod 600 /etc/satellite/ssl/server.csr;',

        /* TLS for Gate */
        'Gate: Preparing Local TLS System': 'mkdir -p /etc/gatejs/ssl',
        'Gate: Generating 4K RSA TLS Private Key': 'cd /etc/gatejs/ssl; openssl genrsa -aes256 -passout pass:x -out server.pass.key 4096',
        'Gate: Cleaning Private Key Password': 'cd /etc/gatejs/ssl; openssl rsa -passin pass:x -in server.pass.key -out server.key; rm server.pass.key',
        'Gate: Generating Certificate Signing Request': 'cd /etc/gatejs/ssl; '+csr,
        'Gate: Signing TLS Certificate': 'cd /etc/gatejs/ssl; openssl x509 -req -days 3650 -in server.csr -signkey server.key -out server.crt',
        'Gate: Fixing TLS Permissions': 'chmod 600 /etc/gatejs/ssl/server.key; chmod 600 /etc/gatejs/ssl/server.csr;',

        /* End of system */
        'Adding Satellite System User': 'useradd -r -s /usr/sbin/nologin satellite',
        'Fixing Data Permissions': 'chown -R satellite: /application',
        'Fixing Configuration Permissions': 'chown -R satellite: /etc/satellite',
        'Fixing GateJS Permissions': 'chown -R satellite: /etc/gatejs',
        'Preparing Satellite User': 'mkdir /home/satellite; chown -R satellite: /home/satellite',

        /* Place Satellite in forever list */
        'Daemonizing Satellite System': "su satellite -s /bin/bash -c '"+forever('start')+"'",

        /* Place the daemonizer in boot */
        'Setting On-Boot Flag': 'echo "@reboot '+forever('start')+'" | su satellite -s /bin/bash -c "crontab -"',

        /* Fix gatejs permission */
        'Setting Proxy Data directory permissions': 'mkdir /application/data/gatejs; chown -R satellite: /application/data/gatejs'
      };

      self.listExec(cmds);
      console.note('You can change your TLS Certificate in /etc/gatejs/ssl/server.*');

      console.note('We also Recommand You To Reboot your installation bacause some updates has been installed');
      console.note('You can connect and finish the installation using your Web Browser @ https://<your-ip>');
      console.note('-');
      console.note('To finish the installation please go to Ultimate Interface as Administrator');
      console.note('Then go to Administration > Satellite');
      console.note('Add new Satellite, provide the IP (of this satellite) using port 3000');
      console.note('A Token will be asked then provide the following one: '+token);
      process.exit(0);
    }
  }

  listExec(cmds) {

    for(var cmd in cmds) {
      var t = cmd+'...';
      process.stdout.write(t);

      var isErr = false;
      var errMsg = '';
      try {
        execSync(cmds[cmd], {stdio: [null, null, null]});
      } catch(e) {
        errMsg = e.stderr.toString('utf8').trim();
        isErr = true;
      }
      var b = '\b'.repeat(t.length);
      process.stdout.write(b);

      if(!isErr)
        console.ok(cmd);
      else
        console.error(cmd+': '+errMsg);
    }
  }

  exec(cmd) {
    console.log(execSync(cmd).toString());
  }

  mkdirDeep(dir) {
  	var stage = '';
  	var tab = dir.split("/");
  	tab.pop();

  	for(var a = 1; a<tab.length; a++) {
  		stage += '/'+tab[a];
  		try  {
  			try {
  				var fss = fs.statSync(stage);
  			} catch(a) {
  				fs.mkdirSync(stage);
  			}
  		}
  		catch(e) {
  			console.log('Error: can not create '+dir);
  			process.exit(0);
  		}
  	}
  	return(true);
  };


  followExec(cmds, cb) {
  	function popCmd() {
  		var cmd = cmds.shift(1);
  		if(!cmd) {
  			if(cb) cb();
  			return;
  		}

  		exec(cmd, (error, stdout, stderr) => {
  			if(stdout)
  				console.notice(`Executing: ${cmd}: ${stdout}`);
  			if(stderr)
  				console.error(`Executing: ${cmd}: ${stderr}`);
  			popCmd();
  		});
  	}

  	popCmd();
  }

  request(path, cb, cookie) {
  	var self = this;

  	var options = {
  		hostname: 'l.ingensec.com',
  		port: 443,
  		path: path,
  		method: 'GET',
  		headers: {},
  		rejectUnauthorized: false
  	};

  	/* check if there is a session cookie */
  	if(cookie)
  		options.headers.cookie = "ewl="+cookie;
  	else if(this.cookieSession)
  		options.headers.cookie = "ewl="+this.cookieSession;

  	var req = https.request(options, (res) => {
  		if(res.statusCode != 200) {
  			cb(null, null);
  			return;
  		}

  		var data = '';
  		res.on('data', (d) => {
  			data += d;
  		});
  		res.on('end', () => {

  			try {
  				var json = JSON.parse(data);
  			} catch(e) {
  				cb(null, null);
  				return;
  			}

  			cb(res, json);
  		});

  	}).on('error', (e) => {
  		cb(null, null);
  	});

  	req.end();
  }

  download(uri, savefile, cb, cookie) {
  	var self = this;

  	var options = {
  		hostname: 'l.ingensec.com',
  		port: 443,
  		path: uri,
  		method: 'GET',
  		headers: {},
  		rejectUnauthorized: false
  	};

  	/* check if there is a session cookie */
  	if(cookie)
  		options.headers.cookie = "ewl="+cookie;
  	else if(this.cookieSession)
  		options.headers.cookie = "ewl="+this.cookieSession;

  	var req = https.request(options, (res) => {
  		/* check origin fingerprint */
  		/*
  		res.fingerprint = res.connection.getPeerCertificate().fingerprint;

  		if(authorizedFingerprint[res.fingerprint] != true) {
  			cb(null, null);
  			return;
  		}
  		*/

  		/* sanatize */
  		if(res.statusCode != 200) {
  			cb({message: 'Bad Status Code'});
  			return;
  		}

  		/* create saved file */
  		self.mkdirDeep(savefile);
  		var output = fs.createWriteStream(savefile);
  		output.on('error', (e) => {
  				cb(e);
  		})
  		res.on('end', () => {
  			cb(null);
  		});
  		/* record file */
  		res.pipe(output);

  	}).on('error', (e) => {
  		cb(e);
  	});

  	req.end();
  }

}


new satellite;
