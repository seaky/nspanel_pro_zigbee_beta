#!/bin/sh

# ZGateway package installer by Seaky 2024

# Installs custom zgateway package to Sonoff NSPanel Pro device
# $1 package path
# $2 path to install

function stop_zgateway() {
    pkill -9 -f "sh /vendor/bin/siliconlabs_host/guard_process.sh"
    killall zgateway
    killall mosquitto
}

function start_zgateway() {
#    sh /vendor/bin/siliconlabs_host/run.sh > /dev/null & 
}

DIR=$2
echo "ZGateway location is $DIR"

# check target path
if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

# check custom alread or not
if [ ! -f "$DIR/zgateway_version" ]; then
    if [ ! -d "${DIR}_original" ]; then
        stop_zgateway
        mv "$DIR" "${DIR}_original"
        echo "Backup completed in the ${DIR}_original directory"
    else
        echo "Upps... zgateway_version is missing but the backup already exists in the ${DIR}_original directory"
        exit 1
    fi
else 
    stop_zgateway
    echo "Purge $DIR"
    rm -f "$DIR/*"
fi

# install new package
echo "Copy $1 to $DIR"
cp -r "$1/." "$DIR"

chmod -R 755 "$DIR"
chown -R root:shell "$DIR"

start_zgateway
