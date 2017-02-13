#!/bin/bash

echo "Waiting for Ubuntu's Updates..."
while [ $(lsof /var/lib/dpkg/lock 2> /dev/null | wc -l) -gt 0 ]; do sleep 1; done

echo "Starting..."
apt-get -yq install python-software-properties software-properties-common > /dev/null 2>&1

echo "Updating sources.list"
rm /etc/apt/sources.list.d/nodesource.list
cat > /etc/apt/sources.list << EOF
deb https://pkg.ingensec.com/ubuntu/ xenial main restricted
deb https://pkg.ingensec.com/ubuntu/ xenial-updates main restricted
deb https://pkg.ingensec.com/ubuntu/ xenial universe
deb https://pkg.ingensec.com/ubuntu/ xenial-updates universe
deb https://pkg.ingensec.com/ubuntu/ xenial multiverse
deb https://pkg.ingensec.com/ubuntu/ xenial-updates multiverse
deb https://pkg.ingensec.com/ubuntu/ xenial-backports main restricted universe multiverse
deb https://debsec.ingensec.com/ubuntu xenial-security main restricted
deb https://debsec.ingensec.com/ubuntu xenial-security universe
deb https://debsec.ingensec.com/ubuntu xenial-security multiverse
deb https://nodejs.ingensec.com/node_4.x xenial main
EOF

cat > /etc/cron.d/fixnodecap << EOF
*/5 * * * *  root sh /etc/ingen.rc.local
EOF

echo "Adding GPG public keys"
gpg --keyserver keyserver.ubuntu.com --recv FE1FFCE65CB95493 > /dev/null 2>&1
gpg --export --armor FE1FFCE65CB95493 | sudo apt-key add - > /dev/null 2>&1
gpg --keyserver keyserver.ubuntu.com --recv 1655A0AB68576280 > /dev/null 2>&1
gpg --export --armor 1655A0AB68576280 | sudo apt-key add - > /dev/null 2>&1

echo "Update apt cache"
apt-get -q update > /dev/null 2>&1

echo "Running system update"
apt-get -yq upgrade > /dev/null 2>&1

# update / install
echo "Preparing the System to receive WAF Ultimate"
apt-get -yq install build-essential python nodejs openssl > /dev/null 2>&1

# Some global NPM
npm install -g node-gyp > /dev/null
npm install -g forever > /dev/null
npm install -g node-jen > /dev/null

# Bootstraping
echo "Booting..."
rm -rf /tmp/ultimate > /dev/null 2>&1
mkdir -p /tmp/ultimate > /dev/null 2>&1
curl -sk https://l.ingensec.com/download/influxdb.conf -o /tmp/ultimate/influxdb.conf > /dev/null 2>&1
curl -sk https://l.ingensec.com/download/ultimate-config.js -o /tmp/ultimate/config.js > /dev/null 2>&1
curl -sk https://l.ingensec.com/download/ultimate.js -o /tmp/ultimate/boot.js > /dev/null 2>&1
curl -sk https://l.ingensec.com/download/logrotate -o /tmp/ultimate/logrotate > /dev/null 2>&1
cd /tmp/ultimate
test -d /etc/logrotate.d/ && cp ./logrotate /etc/logrotate.d/ultimate
