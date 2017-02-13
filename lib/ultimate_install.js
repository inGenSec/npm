"use strict";

const fs = require("fs");
const os = require("os");
const https = require("https");
const readline =  require("readline");
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const clc = require('cli-color');

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
  'ultimate',
];

class ultimate {
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
      var oldVersion = JSON.parse(fs.readFileSync('/application/ultimate/package.json').toString('utf8'));
    } catch(e) { oldVersion = null; }
    if(oldVersion) {
      this.rl.question('You are already running an Ultimate WAF (v'+oldVersion.version+'), '+
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
            '-o /application/data/logs/ultimate.log '+
            '-e /application/data/logs/ultimate-error.log '+
            '--uid ultimate '+
            cmd+' '+
            '--max_old_space_size=2000 /application/ultimate/index.js /etc/ultimate';
        }
        else {
          var f = 'forever '+
            cmd+' '+
            'ultimate';
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

    /* stage 3 only for ultimate */
    function stage3() {

      /* prepare the configuration */
      var csr  = 'cd /etc/ultimate/ssl; openssl req -new -key server.key -out server.csr '+
      '-subj "/C=CH/ST=World/L=Wide/O=inGen Security/OU=Ultimate Appliance/CN=waf.ingensec.lo"';

      /* First first big step  */
      var cmds = {
        /* System base */
        'Installing MongoDB': 'apt-get install -yq mongodb',
        'Installing InfluxDB': 'apt-get install -yq influxdb',
        'Preparing InfluxDB': 'cp /tmp/ultimate/influxdb.conf /etc/influxdb',
        'Restarting InfluxDB': '/etc/init.d/influxdb restart',
        'Cleaning Installation': 'rm -rf /application/ultimate',
        'Decompressing Ultimate Archive': 'cd /application/data/download/; rm -rf ultimate; tar zxf ultimate.tar.gz',
        'Moving Installation': 'mv /application/data/download/ultimate /application',
        'Preparing NPM Dependencies': 'cd /application/ultimate; npm install',
        'Configuring Ultimate Appliance': 'mkdir /etc/ultimate; cp /tmp/ultimate/config.js /etc/ultimate',
        'Preparing Logs Data': 'mkdir -p /application/data/logs',

        /* Nodejs port cap */
        'Setting NodeJS 80,443 Capability': 'echo "setcap CAP_NET_BIND_SERVICE=+eip /usr/bin/nodejs" > /etc/ingen.rc.local; chmod +x /etc/ingen.rc.local',
        'Executing NodeJS Capability': '/bin/bash /etc/ingen.rc.local',
        'Setting Post Invoke Success': 'echo "DPkg::Post-Invoke-Success { \'/etc/ingen.rc.local\';};" > /etc/apt/apt.conf.d/99ingen',

        /* Signing interface */
        'Preparing Local Signing System': 'mkdir /etc/ultimate/sign',
        'Generating 4K RSA Signing Private Key': 'cd /etc/ultimate/sign; openssl genrsa -out server.key 4096',
        'Generating 4K RSA Signing Public Key': 'cd /etc/ultimate/sign; openssl rsa -in server.key -out server.pub.key -outform PEM -pubout',
        'Fixing RSA Private Key Permissions': 'chmod 600 /etc/ultimate/sign/server.key',

        /* SSH */
        'Cleaning SSH Key Agent': 'rm -rf /home/ultimate/.ssh',
        'Generating 4K SSH Key Agent': 'su ultimate -s /bin/bash -c "ssh-keygen -b 4096 -t rsa -N \\\"\\\" -f /home/ultimate/.ssh/id_rsa"',

        /* TLS */
        'Preparing Local TLS System': 'mkdir /etc/ultimate/ssl',
        'Generating 4K RSA TLS Private Key': 'cd /etc/ultimate/ssl; openssl genrsa -aes256 -passout pass:x -out server.pass.key 4096',
        'Cleaning Private Key Password': 'cd /etc/ultimate/ssl; openssl rsa -passin pass:x -in server.pass.key -out server.key; rm server.pass.key',
        'Generating Certificate Signing Request': csr,
        'Signing TLS Certificate': 'cd /etc/ultimate/ssl; openssl x509 -req -days 3650 -in server.csr -signkey server.key -out server.crt',
        'Fixing TLS Permissions': 'chmod 600 /etc/ultimate/ssl/server.key; chmod 600 /etc/ultimate/ssl/server.csr;',

        /* End of system */
        'Adding Ultimate System User': 'useradd -r -s /usr/sbin/nologin ultimate',
        'Fixing Data Permissions': 'chown -R ultimate: /application',
        'Fixing Configuration Permissions': 'chown -R ultimate: /etc/ultimate',
        'Preparing Ultimate User': 'mkdir /home/ultimate; chown -R ultimate: /home/ultimate',

        /* Place Ultimate in forever list */
        'Daemonizing Ultimate System': "su ultimate -s /bin/bash -c '"+forever('start')+"'",

        /* Place the daemonizer in boot */
        'Setting On-Boot Flag': 'echo "@reboot '+forever('start')+'" | su ultimate -s /bin/bash -c "crontab -"'
      };

      self.listExec(cmds);

      console.note('You can change your TLS Certificate in /etc/ultimate/ssl');
      console.note('Your Ultimate System is now Ready!');
      console.note('We also Recommand You To Reboot your installation bacause some updates has been installed');
      console.note('You can connect and finish the installation using your Web Browser @ https://<your-ip>');
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

new ultimate;
