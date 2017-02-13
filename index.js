#!/usr/bin/node

const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const https = require('https');
const child_process = require("child_process");
const execSync = child_process.execSync;

const program = require('commander');
const execSuper = require('child_process').execSync;
const prettyjson = require('prettyjson');
const jen = new (require("node-jen"))();

console.pretty = function(data) {
	console.log(prettyjson.render(data));
}

/* read package */
try {
  var pack = JSON.parse(fs.readFileSync(__dirname+'/package.json'))
} catch(e) {
	console.log('Can not read package.json: '+e.message)
	process.exit(-1);
}

program.version('ingensec v'+pack.version)

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getVersion(module) {
    var file = '/application/'+module+'/package.json';
    try {
      var d = JSON.parse(fs.readFileSync(file).toString('utf8'));
    } catch(e) {
      return(null);
    }
    return(d.version)
}

function getManifest(info, result) {
  var path = '/Download/'+info.system+'/'+info.arch+'/'+info.release+'/manifest.json';

  var options = {
    host: 'l.ingensec.com',
    port: 443,
    path: path,
    method: 'GET',
    rejectUnauthorized: false
  };

  var req = https.request(options, (res) => {
    var data = '';
    res.on('data', (d) => {
      data += d;
    });
    res.on('end', () => {
      try {
          var r = JSON.parse(data);
      } catch(e) {
        console.pretty(e);
        process.exit(-1);
      }
      result(r)
    })
  });

  req.on('error', (e) => {
    console.pretty(e);
    process.exit(-1);
  });

  req.end();
}

function system() {
  var r = {
    system: capitalizeFirstLetter(os.platform()),
    release: os.release(),
    arch: os.arch(),
    versions: process.versions,
    ultimate: getVersion('ultimate'),
    satellite: getVersion('satellite'),
    gateWaf: getVersion('gateWaf'),
    ultimate: getVersion('ultimate'),
  }

  /* hack for gate */
  try {
    var st = fs.statSync('/application/gate/src/service.js');
    var lVersion = execSync("grep \"this.version\" /application/gate/src/service.js").toString().split("\n")[0].trim();
    var pR = /\"([\.0-9\-a-z]+)\"/;
    r.gate = pR.exec(lVersion)[1];
  } catch(e) {}

  try {
    var issue = fs.readFileSync('/etc/issue').toString('utf8').trim().replace(' \\n \\l', '');
  } catch(e) {
    prettyjson(e);
    process.exit(-1);
  }

  r.distro = issue.split(' ');

  if(r.versions.node[0] != '4') {
    console.pretty({error: 'inGen WAF does not support your NodeJS Version: '+r.versions.node});
    console.pretty({error: 'Work only for NodeJS version 4.x.x'});
    process.exit(-1);
  }

  if(r.distro[0] != 'Ubuntu') {
    console.pretty({error: 'inGen WAF does not support your distribution'});
    console.pretty({error: 'Work only for Ubuntu 16.04 based Linux distribution'});
    process.exit(-1);
  }

  if(r.distro[1].substr(0, 5) != '16.04') {
    console.pretty({error: 'inGen WAF does not support your distribution (only for 16.04.x)'});
    console.pretty({error: 'Work only for Ubuntu 16.04 based Linux distribution'});
    process.exit(-1);
  }

  return(r);
}

function getBackupName() {
  var n = new Date();
  var backupFile = n.getFullYear()+'-'+
    (n.getMonth()+1)+
    '-'+n.getDate()+
    '-'+n.getHours()+
    '.'+n.getMinutes()+
    '-'+jen.password(3);
  return(backupFile);
}



function forever(cmd, module, runner) {
  if(cmd == 'start') {
    var f = 'forever -a -l /application/data/logs/forever.log '+
      '-o /application/data/logs/'+module+'.log '+
      '-e /application/data/logs/'+module+'-error.log '+
      '--uid '+module+' '+
      cmd+' '+
      runner;
  }
  else {
    var f = 'forever '+
      cmd+' '+
      'satellite';
  }
  return(f);
}

var foreverSatelliteStart = forever(
  'start',
  'satellite',
  '--max_old_space_size=2000 /application/satellite/bin/ews.js --config=/etc/satellite/config.js'
);

var foreverUltimateStart = forever(
  'start',
  'ultimate',
  '--max_old_space_size=2000 /application/ultimate/index.js /etc/ultimate'
);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 *
 * Software installation
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function install(software) {
  var backupFile = getBackupName();
  var info = system();

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * Satellite
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  if(software == 'satellite') {

    getManifest(info, (result) => {
      var needUpdate = false;
      if(
        info.gate != null ||
        info.gateWaf != null ||
        info.satellite != null
      ) {
        console.pretty({error: ['inGen WAF Satellite found on this machine', 'Installation aborted']});
        process.exit(0)
      }

      var args = [
        __dirname+'/lib/satellite_install.sh',
        info.system,
        info.arch,
        info.release
      ];

      console.pretty({message: 'Running Stage One Satellite system'});
      const spawn = child_process.spawn;
      const install = spawn('bash', args, { stdio: [0,1,2] });
      install.on('close', (code) => {;
        if(code == 0) {
            console.pretty({message: 'Stage One done'});

            var args = [
              __dirname+'/lib/satellite_install.js',
              info.system,
              info.arch,
              info.release
            ];

            console.pretty({message: 'Running Stage Two Satellite system'});

            const stageTwo = spawn('node', args, { stdio: [0,1,2] });
            stageTwo.on('close', (code) => {;
              if(code == 0) {
                  console.pretty({message: 'Stage Two done'});
                  process.exit(0);
              }

              console.log(`Installation terminated with error code ${code}`);
            });
            return;
        }
        console.log(`Installation terminated with error code ${code}`);
      });
    });

    return;
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * Ultimate
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
   else if(software == 'ultimate') {
     getManifest(info, (result) => {

       if(info.ultimate != null) {
         console.pretty({error: ['inGen WAF Ultimate found on this machine', 'Installation aborted']});
         process.exit(0)
       }

       var args = [
         __dirname+'/lib/ultimate_install.sh',
         info.system,
         info.arch,
         info.release
       ];

       console.pretty({message: 'Running Stage One Ultimate system'});
       const spawn = child_process.spawn;
       const install = spawn('bash', args, { stdio: [0,1,2] });
       install.on('close', (code) => {;
         if(code == 0) {
             console.pretty({message: 'Stage One done'});

             var args = [
               __dirname+'/lib/ultimate_install.js',
               info.system,
               info.arch,
               info.release
             ];

             console.pretty({message: 'Running Stage Two Ultimate system'});

             const stageTwo = spawn('node', args, { stdio: [0,1,2] });
             stageTwo.on('close', (code) => {;
               if(code == 0) {
                   console.pretty({message: 'Stage Two done'});
                   process.exit(0);
               }

               console.log(`Installation terminated with error code ${code}`);
             });
             return;
         }
         console.log(`Installation terminated with error code ${code}`);
       });
     });

     return;
   }

  console.pretty({error: 'Please specify ultimate or satellite'});
}

function remove() {

}

function show() {

}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 *
 * Update software
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function update(software) {
  var backupFile = getBackupName();
  var info = system();

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * Satellite
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  if(software == 'satellite') {

    getManifest(info, (result) => {
      var needUpdate = false;
      if(
        info.gate == null ||
        info.gateWaf == null ||
        info.satellite == null
      ) {
        console.pretty({error: 'No inGen WAF Satellite found on this machine'});
        process.exit(0)
      }

      if(
        result.gate.version != info.gate ||
        result.gateWaf.version != info.gateWaf ||
        result.satellite.version != info.satellite
      ) {
        needUpdate = true;
      }

      if(needUpdate == false) {
        console.pretty({message: 'Your system is up to date'});
        process.exit(0)
      }

      var args = [
        __dirname+'/lib/satellite_update.sh',
        info.system,
        info.arch,
        info.release,
        backupFile
      ];

      console.pretty({message: 'Updating your Satellite system'});
      const spawn = child_process.spawn;
      const ls = spawn('sh', args, { stdio: [0,1,2] });
      ls.on('close', (code) => {

        /* fix reboot starter */
        var cron = 'echo "@reboot '+foreverSatelliteStart+'" | su satellite -s /bin/bash -c "crontab -"';
        execSync(cron);

        if(code == 0) {
            console.pretty({message: 'Stopping Satellite'});
            try {
              var cron = 'su satellite -s /bin/bash -c "forever stop satellite"';
              execSync(cron);
            } catch(e) {}

            console.pretty({message: 'Starting Satellite'});
            try {
              var cron = 'su satellite -s /bin/bash -c "'+foreverSatelliteStart+'"';
              execSync(cron);
            } catch(e) {}

            /* fix satellite/config.js */
            console.pretty({message: 'Fixing Satellite'});
            try {
              var config = require('/etc/satellite/config.js');
              config.gateStart = 'node --max_old_space_size=500 /application/gate/src/service.js --config=/etc/gatejs/config.js';
              config.ssl = {
                key: '%KEY%',
                cert: '%CERT%',
              };
              var buffer =
                'const fs = require("fs");\n'+
                'var config = '+JSON.stringify(config, null, '\t')+';\n'+
                'module.exports = config;\n';

              buffer = buffer.replace(/\"%KEY%\"/, 'fs.readFileSync(__dirname+"/ssl/server.key")');
              buffer = buffer.replace(/\"%CERT%\"/, 'fs.readFileSync(__dirname+"/ssl/server.crt")');
              fs.writeFileSync('/etc/satellite/config.js', buffer);
            } catch(e) { }

            console.pretty({message: 'Your system is now up to date'});
            process.exit(0);
        }

        console.log(`Update terminated with error code ${code}`);
      });
    });

    return;
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * Ultimate
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
   else if(software == 'ultimate') {

     getManifest(info, (result) => {
       if(info.ultimate == null) {
         console.pretty({error: 'No inGen WAF Ultimate found on this machine'});
         process.exit(0)
       }

       var needUpdate = false;

       if(result.ultimate.version != info.ultimate) {
         needUpdate = true;
       }

       if(needUpdate == false) {
         console.pretty({message: 'Your system is up to date'});
         process.exit(0)
       }

       var args = [
         __dirname+'/lib/ultimate_update.sh',
         info.system,
         info.arch,
         info.release,
         backupFile
       ];

       console.pretty({message: 'Updating your Ultimate system'});
       const spawn = child_process.spawn;
       const ls = spawn('sh', args, { stdio: [0,1,2] });
       ls.on('close', (code) => {

         /* fix reboot starter */
         var cron = 'echo "@reboot '+foreverUltimateStart+'" | su ultimate -s /bin/bash -c "crontab -"';
         execSync(cron);

         if(code == 0) {
             console.pretty({message: 'Stopping Ultimate'});
             try {
               var cron = 'su ultimate -s /bin/bash -c "forever stop ultimate"';
               execSync(cron);
             } catch(e) {}

             console.pretty({message: 'Starting Ultimate'});
             try {
               var cron = 'su ultimate -s /bin/bash -c "'+foreverUltimateStart+'"';
               execSync(cron);
             } catch(e) {}

             console.pretty({message: 'Your system is now up to date'});
             process.exit(0);
         }

         console.log(`Update terminated with error code ${code}`);
       });
     });

     return;
   }

  console.pretty({error: 'Please specify ultimate or satellite'});
}

function manifest() {
  var info = system();
  getManifest(info, (result) => {
    console.pretty({
      message: 'List of current Online manifest',
      software: result
    })
  });
}

program
  .command('install <software>')
  .description('Install the WAF')
  .action(install);

/*
program
  .command('remove <software>')
  .description('Remove the WAF')
  .action(remove);
*/

program
  .command('show')
  .description('Show configuration and updates')
  .action(show);

program
  .command('manifest')
  .description('Show remote manifest')
  .action(manifest);

program
  .command('update <software>')
  .description('Update software')
  .action(update);

program.on('--help', function(){
  console.log('  Softwares:');
  console.log('    * satellite:   inGen WAF Satellite');
  console.log('    * ultimate:    inGen WAF Ultimate');
  console.log('');
  console.log('  Examples:');
  console.log('');
  console.log('    $ haswitch install satellite        Install new WAF Satellite');
  //console.log('    $ haswitch remove satellite         Remove new WAF Satellite');
  console.log('    $ haswitch install ultimate         Install new WAF Ulitmate');
  console.log('    $ haswitch update satellite         Update new WAF Satellite');
  console.log('');
	console.log('  haswitch.js v'+pack.version+' (c) 2016 - Michael Vergoz');
	console.log('');
});

program.parse(process.argv);
