OS=$1
ARCH=$2
RELEASE=$3
BACKUP=$4

cd /application
mkdir bundle
cd bundle

echo "Downloading Ultimate"
curl -sk https://l.ingensec.com/download/$OS/$ARCH/$RELEASE/ultimate -o ultimate.tar.gz
tar zxf ultimate.tar.gz

echo "Preparing Ultimate"
cd ultimate
npm install

echo "Backup old Ultimate"
cd /application
mv ultimate ultimate.$BACKUP
cp -a /application/bundle/* .
chown -R ultimate: /application/ultimate

echo "Updating System"
apt-get -yq update
apt-get -yq upgrade
sh /etc/ingen.rc.local

echo "Restart databases"
/etc/init.d/influxdb restart
/etc/init.d/mongodb restart
