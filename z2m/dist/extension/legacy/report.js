"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const zhc = __importStar(require("zigbee-herdsman-converters"));
const logger_1 = __importDefault(require("../../util/logger"));
const settings = __importStar(require("../../util/settings"));
const extension_1 = __importDefault(require("../extension"));
const defaultConfiguration = {
    minimumReportInterval: 3,
    maximumReportInterval: 300,
    reportableChange: 1,
};
const ZNLDP12LM = zhc.definitions.find((d) => d.model === 'ZNLDP12LM');
const devicesNotSupportingReporting = [
    zhc.definitions.find((d) => d.model === 'CC2530.ROUTER'),
    zhc.definitions.find((d) => d.model === 'BASICZBR3'),
    zhc.definitions.find((d) => d.model === 'ZM-CSW032-D'),
    zhc.definitions.find((d) => d.model === 'TS0001'),
    zhc.definitions.find((d) => d.model === 'TS0115'),
];
const reportKey = 1;
const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }
    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};
const clusters = {
    genOnOff: [{ attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0 }],
    genLevelCtrl: [{ attribute: 'currentLevel', ...defaultConfiguration }],
    lightingColorCtrl: [
        {
            attribute: 'colorTemperature',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        { attribute: 'currentPositionLiftPercentage', ...defaultConfiguration },
        { attribute: 'currentPositionTiltPercentage', ...defaultConfiguration },
    ],
};
class Report extends extension_1.default {
    queue = new Set();
    failed = new Set();
    enabled = settings.get().advanced.report;
    shouldIgnoreClusterForDevice(cluster, definition) {
        if (definition === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }
        return false;
    }
    async setupReporting(device) {
        if (this.queue.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr))
            return;
        this.queue.add(device.ieeeAddr);
        const term1 = this.enabled ? 'Setup' : 'Disable';
        const term2 = this.enabled ? 'setup' : 'disabled';
        try {
            for (const ep of device.zh.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) && !this.shouldIgnoreClusterForDevice(cluster, device.definition)) {
                        logger_1.default.debug(`${term1} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                        const items = [];
                        for (const entry of configuration) {
                            if (!entry.hasOwnProperty('condition') || (await entry.condition(ep))) {
                                const toAdd = { ...entry };
                                if (!this.enabled)
                                    toAdd.maximumReportInterval = 0xffff;
                                items.push(toAdd);
                                delete items[items.length - 1].condition;
                            }
                        }
                        this.enabled
                            ? await ep.bind(cluster, this.zigbee.firstCoordinatorEndpoint())
                            : await ep.unbind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        await ep.configureReporting(cluster, items);
                        logger_1.default.info(`Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                    }
                }
            }
            if (this.enabled) {
                device.zh.meta.reporting = reportKey;
            }
            else {
                delete device.zh.meta.reporting;
                this.eventBus.emitReconfigure({ device });
            }
            this.eventBus.emitDevicesChanged();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${error.stack}`);
            this.failed.add(device.ieeeAddr);
        }
        device.zh.save();
        this.queue.delete(device.ieeeAddr);
    }
    shouldSetupReporting(device, messageType) {
        if (!device || !device.zh || !device.definition)
            return false;
        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // Only resetup reporting if configuredReportings was not populated yet,
        // else reconfigure is done in zigbee-herdsman-converters ikea.js/bulbOnEvent
        // configuredReportings are saved since Zigbee2MQTT 1.17.0
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (this.enabled &&
            messageType === 'deviceAnnounce' &&
            device.isIkeaTradfri() &&
            device.zh.endpoints.filter((e) => e.configuredReportings.length === 0).length === device.zh.endpoints.length) {
            return true;
        }
        // These do not support reproting.
        // https://github.com/Koenkk/zigbee-herdsman/issues/110
        const philipsIgnoreSw = ['5.127.1.26581', '5.130.1.30000'];
        if (device.zh.manufacturerName === 'Philips' && philipsIgnoreSw.includes(device.zh.softwareBuildID))
            return false;
        if (device.zh.interviewing === true)
            return false;
        if (device.zh.type !== 'Router' || device.zh.powerSource === 'Battery')
            return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(device.definition) || device.definition.vendor === 'Gledopto')
            return false;
        if (this.enabled && device.zh.meta.hasOwnProperty('reporting') && device.zh.meta.reporting === reportKey) {
            return false;
        }
        if (!this.enabled && !device.zh.meta.hasOwnProperty('reporting')) {
            return false;
        }
        return true;
    }
    async start() {
        for (const device of this.zigbee.devices(false)) {
            if (this.shouldSetupReporting(device, null)) {
                await this.setupReporting(device);
            }
        }
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data.device));
        this.eventBus.onDeviceMessage(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.onZigbeeEvent_('dummy', data.device));
    }
    async onZigbeeEvent_(type, device) {
        if (this.shouldSetupReporting(device, type)) {
            await this.setupReporting(device);
        }
    }
}
exports.default = Report;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvcmVwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxnRUFBa0Q7QUFFbEQsK0RBQXVDO0FBQ3ZDLDhEQUFnRDtBQUNoRCw2REFBcUM7QUFFckMsTUFBTSxvQkFBb0IsR0FBRztJQUN6QixxQkFBcUIsRUFBRSxDQUFDO0lBQ3hCLHFCQUFxQixFQUFFLEdBQUc7SUFDMUIsZ0JBQWdCLEVBQUUsQ0FBQztDQUN0QixDQUFDO0FBRUYsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssV0FBVyxDQUFDLENBQUM7QUFFdkUsTUFBTSw2QkFBNkIsR0FBRztJQUNsQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxlQUFlLENBQUM7SUFDeEQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssV0FBVyxDQUFDO0lBQ3BELEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLGFBQWEsQ0FBQztJQUN0RCxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUM7SUFDakQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDO0NBQ3BELENBQUM7QUFFRixNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFcEIsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLEVBQUUsUUFBcUIsRUFBMEQsRUFBRTtJQUNqSCxJQUFJLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzVGLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLHdCQUF3QixDQUFDLG1CQUFtQixFQUFFLG1CQUFtQixDQUFXLENBQUM7SUFDcEcsT0FBTztRQUNILGdCQUFnQixFQUFFLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUN4QyxPQUFPLEVBQUUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0tBQ2xDLENBQUM7QUFDTixDQUFDLENBQUM7QUFFRixNQUFNLFFBQVEsR0FRVjtJQUNBLFFBQVEsRUFBRSxDQUFDLEVBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxHQUFHLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLEVBQUMsQ0FBQztJQUN4RyxZQUFZLEVBQUUsQ0FBQyxFQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUUsR0FBRyxvQkFBb0IsRUFBQyxDQUFDO0lBQ3BFLGlCQUFpQixFQUFFO1FBQ2Y7WUFDSSxTQUFTLEVBQUUsa0JBQWtCO1lBQzdCLEdBQUcsb0JBQW9CO1lBQ3ZCLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFvQixFQUFFLENBQUMsQ0FBQyxNQUFNLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCO1NBQzNHO1FBQ0Q7WUFDSSxTQUFTLEVBQUUsVUFBVTtZQUNyQixHQUFHLG9CQUFvQjtZQUN2QixTQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBb0IsRUFBRSxDQUFDLENBQUMsTUFBTSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU87U0FDbEc7UUFDRDtZQUNJLFNBQVMsRUFBRSxVQUFVO1lBQ3JCLEdBQUcsb0JBQW9CO1lBQ3ZCLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFvQixFQUFFLENBQUMsQ0FBQyxNQUFNLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTztTQUNsRztLQUNKO0lBQ0Qsc0JBQXNCLEVBQUU7UUFDcEIsRUFBQyxTQUFTLEVBQUUsK0JBQStCLEVBQUUsR0FBRyxvQkFBb0IsRUFBQztRQUNyRSxFQUFDLFNBQVMsRUFBRSwrQkFBK0IsRUFBRSxHQUFHLG9CQUFvQixFQUFDO0tBQ3hFO0NBQ0osQ0FBQztBQUVGLE1BQXFCLE1BQU8sU0FBUSxtQkFBUztJQUNqQyxLQUFLLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7SUFDL0IsTUFBTSxHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2hDLE9BQU8sR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztJQUVqRCw0QkFBNEIsQ0FBQyxPQUFlLEVBQUUsVUFBMEI7UUFDcEUsSUFBSSxVQUFVLEtBQUssU0FBUyxJQUFJLE9BQU8sS0FBSyx3QkFBd0IsRUFBRSxDQUFDO1lBQ25FLDZDQUE2QztZQUM3QyxvREFBb0Q7WUFDcEQsT0FBTyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQWM7UUFDL0IsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUFFLE9BQU87UUFDaEYsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRWhDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1FBRWxELElBQUksQ0FBQztZQUNELEtBQUssTUFBTSxFQUFFLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDbkMsS0FBSyxNQUFNLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDOUQsSUFBSSxFQUFFLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO3dCQUNyRyxnQkFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssbUJBQW1CLE1BQU0sQ0FBQyxRQUFRLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxPQUFPLEVBQUUsQ0FBQyxDQUFDO3dCQUVwRixNQUFNLEtBQUssR0FBRyxFQUFFLENBQUM7d0JBQ2pCLEtBQUssTUFBTSxLQUFLLElBQUksYUFBYSxFQUFFLENBQUM7NEJBQ2hDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQ0FDcEUsTUFBTSxLQUFLLEdBQUcsRUFBQyxHQUFHLEtBQUssRUFBQyxDQUFDO2dDQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU87b0NBQUUsS0FBSyxDQUFDLHFCQUFxQixHQUFHLE1BQU0sQ0FBQztnQ0FDeEQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQ0FDbEIsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7NEJBQzdDLENBQUM7d0JBQ0wsQ0FBQzt3QkFFRCxJQUFJLENBQUMsT0FBTzs0QkFDUixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixFQUFFLENBQUM7NEJBQ2hFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO3dCQUV2RSxNQUFNLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQzVDLGdCQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixLQUFLLG1CQUFtQixNQUFNLENBQUMsUUFBUSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztvQkFDcEcsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNmLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7WUFDekMsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLE9BQU8sTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNoQyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxFQUFDLE1BQU0sRUFBQyxDQUFDLENBQUM7WUFDNUMsQ0FBQztZQUVELElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN2QyxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLGdCQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsS0FBSyxDQUFDLFdBQVcsRUFBRSxtQkFBbUIsTUFBTSxDQUFDLFFBQVEsT0FBTyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUVyRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxNQUFjLEVBQUUsV0FBbUI7UUFDcEQsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVTtZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRTlELDBEQUEwRDtRQUMxRCxvRkFBb0Y7UUFDcEYsaUVBQWlFO1FBQ2pFLHNCQUFzQjtRQUN0Qix3RUFBd0U7UUFDeEUsNkVBQTZFO1FBQzdFLDBEQUEwRDtRQUMxRCxtREFBbUQ7UUFDbkQsSUFDSSxJQUFJLENBQUMsT0FBTztZQUNaLFdBQVcsS0FBSyxnQkFBZ0I7WUFDaEMsTUFBTSxDQUFDLGFBQWEsRUFBRTtZQUN0QixNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFDOUcsQ0FBQztZQUNDLE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsdURBQXVEO1FBQ3ZELE1BQU0sZUFBZSxHQUFHLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzNELElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLElBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQztZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRWxILElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEtBQUssSUFBSTtZQUFFLE9BQU8sS0FBSyxDQUFDO1FBQ2xELElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVyxLQUFLLFNBQVM7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUNyRiw0Q0FBNEM7UUFDNUMsSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxLQUFLLFVBQVU7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUV2SCxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN2RyxPQUFPLEtBQUssQ0FBQztRQUNqQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUMvRCxPQUFPLEtBQUssQ0FBQztRQUNqQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVRLEtBQUssQ0FBQyxLQUFLO1FBQ2hCLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM5QyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDMUMsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLENBQUM7UUFDTCxDQUFDO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDbkcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUN6RixJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFZLEVBQUUsTUFBYztRQUM3QyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUMxQyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQTdIRCx5QkE2SEMifQ==