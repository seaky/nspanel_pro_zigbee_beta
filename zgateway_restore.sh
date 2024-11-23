#!/bin/sh

function stop_zgateway() {
    pkill -9 -f "sh /vendor/bin/siliconlabs_host/guard_process.sh"
    killall zgateway
    killall mosquitto
}

function start_zgateway() {
	sh /vendor/bin/siliconlabs_host/run.sh &
}


DIR=$2
echo "ZGateway location is $DIR"

if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

if [ ! -f "$DIR/zgateway_version" ]; then
	echo "zgateway_version is missing it is the stock verison"
	exit 1
else
    stop_zgateway
	echo "Remove $DIR"
    rm -f "$DIR"

fi

echo "Restore original"
mv "${DIR}_original" "$DIR"

chmod -R 755 "$DIR"
chown -R root:shell "$DIR"

start_zgateway
