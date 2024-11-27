#!/bin/bash

echo "-------------Zigbee Host run-------------------------"
LOCAL_TIME=$(date +"%Y-%m-%d %H:%M:%S")
echo $LOCAL_TIME 'Zigbee Host, start' > /vendor/run.log 

export LD_LIBRARY_PATH=/vendor/bin/siliconlabs_host/:${LD_LIBRARY_PATH}
echo ${LD_LIBRARY_PATH}

killall mosquitto
sleep 1


/vendor/bin/siliconlabs_host/mosquitto -c /vendor/bin/siliconlabs_host/mosquitto.conf &

