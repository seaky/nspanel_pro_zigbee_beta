#!/bin/sh

mount -o rw,remount /vendor

DIR=/vendor/bin/siliconlabs_host_test

if [ ! -d "$DIR" ]; then
    echo "$DIR directory not found"
    exit 1
fi

if [ ! -f "$DIR/firmware_version" ]; then
    mv "$DIR" "${DIR}_original"
    echo "Original version detected moved to ${DIR}_original"
fi

rm "$DIR"
cp /tmp/nspanel_pro_zigbee "$DIR"

mount -o ro,remount /vendor
