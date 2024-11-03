#!/bin/sh

DIR=$2
echo "Firmware location is $DIR"

if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

if [ ! -f "$DIR/firmware_version" ]; then
	if [ ! -d "${DIR}_original" ]; then
		mv "$DIR" "${DIR}_original"
		echo "Backup completed in the ${DIR}_original directory"
	else
		echo "Upps... firmware_version is missing but the backup already exists in the ${DIR}_original directory"
		exit 1
	fi
else 
	echo "Purge $DIR"
    rm -f "$DIR/*"
fi

echo "Copy $1 to $DIR"
cp -r "$1/." "$DIR"

chmod -R 755 "$DIR"
chown -R root:shell "$DIR"

