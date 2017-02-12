OS=$1
ARCH=$2
RELEASE=$3
BACKUP=$4

cd /application
mkdir bundle
cd bundle

echo "Downloading Satellite"
curl -sk https://l.ingensec.com/download/$OS/$ARCH/$RELEASE/satellite -o satellite.tar.gz
echo "Downloading Gate"
curl -sk https://l.ingensec.com/download/$OS/$ARCH/$RELEASE/gate -o gate.tar.gz
echo "Downloading Engine"
curl -sk https://l.ingensec.com/download/$OS/$ARCH/$RELEASE/gateWaf -o gateWaf.tar.gz
tar zxf satellite.tar.gz
tar zxf gate.tar.gz
tar zxf gateWaf.tar.gz


cd /application
mv gate gate.$BACKUP
mv gateWaf gateWaf.$BACKUP
mv satellite satellite.$BACKUP
cp -a /application/bundle/* .
chown -R satellite: /application/gate*
chown -R satellite: /application/satellite

apt-get -yq update
apt-get -yq upgrade
sh /etc/ingen.rc.local

file="/application/run/satellite/master.pid"
if [ -f "$file" ]
then
  kill `cat $file`
fi
