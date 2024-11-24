#!/bin/sh

# ZGateway package restorer by Seaky 2024

# Restor stock zgateway package to Sonoff NSPanel Pro device
# $2 path to zgateway


function stop_zgateway() {
    pkill -9 -f "sh /vendor/bin/siliconlabs_host/guard_process.sh"
    killall zgateway
    killall mosquitto
}

function start_zgateway() {
    sh /vendor/bin/siliconlabs_host/run.sh > /dev/null & 
}

DIR=$1
echo "ZGateway location is $DIR"

# check target dir
if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

# check already on stock
if [ ! -f "$DIR/zgateway_version" ]; then
    echo "zgateway_version is missing it is the stock verison"
    exit 1
else
    stop_zgateway
    echo "Remove $DIR"
    rm -rf "$DIR"

fi

# restore
echo "Restore original"
mv "${DIR}_original" "$DIR"

chmod -R 755 "$DIR"
chown -R root:shell "$DIR"

start_zgateway
