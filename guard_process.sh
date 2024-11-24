#!/bin/bash

echo "-------------Zigbee guard_process run-------------------------"

export LD_LIBRARY_PATH=/vendor/bin/siliconlabs_host/:${LD_LIBRARY_PATH}
echo ${LD_LIBRARY_PATH}

Z3GatewayHost_sonoff_go() {
	echo "do Z3GatewayHost_sonoff_go"
	
	killall zgateway
	sleep 1

	# killall mosquitto
	# sleep 1

	echo $(pwd)
	cd /vendor/bin/siliconlabs_host/
	echo $(pwd)

	# sleep 1
	# /vendor/bin/siliconlabs_host/mosquitto -c /vendor/bin/siliconlabs_host/mosquitto.conf &

	sleep 3

	#在终端打印整个运行日志
	/vendor/bin/siliconlabs_host/zgateway &
}

check() {
    echo "do check"

    local Z3GatewayHost_sonoffNum=`ps -A | grep -w 'zgateway' | grep -v "grep" | wc -l`
	# local mosquittoNum=`ps -A | grep -w 'mosquitto' | grep -v "grep" | wc -l`


    echo "Z3GatewayHost_sonoffNum:"${Z3GatewayHost_sonoffNum}


    if [ ${Z3GatewayHost_sonoffNum} -ne 1 ]; then
        echo "Z3GatewayHost_sonoffNum restart `date +"%Y-%m-%d %H:%M:%S"`" >> /data/vendor/siliconlabs_host/zgatewayStatus


        Z3GatewayHost_sonoff_go
    fi

}

while true
do
    sleep 60
    check
done
