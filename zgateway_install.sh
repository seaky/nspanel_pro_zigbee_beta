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

echo "Copy $1 to $DIR"
cp -r "$1/." "$DIR"

chmod -R 755 "$DIR"
chown -R root:shell "$DIR"

start_zgateway
