#!/bin/sh

mount -o rw,remount /vendor

DIR=/vendor/bin/siliconlabs_host_test

if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

if [ ! -f "$DIR/firmware_version" ]; then
	if [ ! -d "${DIR}_original" ]; then
		mv "$DIR" "${DIR}_original"
		echo "Original version detected moved to ${DIR}_original"
	else
		echo "Original version already saved"
	fi
else 
    rm -f "$DIR/*"
fi

cp -r "$1/." "$DIR"

mount -o ro,remount /vendor

