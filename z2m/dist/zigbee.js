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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const crypto_1 = require("crypto");
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const device_1 = __importDefault(require("./model/device"));
const group_1 = __importDefault(require("./model/group"));
const data_1 = __importDefault(require("./util/data"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const entityIDRegex = new RegExp(`^(.+?)(?:/([^/]+))?$`);
class Zigbee {
    herdsman;
    eventBus;
    groupLookup = {};
    deviceLookup = {};
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    async start() {
        const infoHerdsman = await utils_1.default.getDependencyVersion('zigbee-herdsman');
        logger_1.default.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const herdsmanSettings = {
            network: {
                panID: settings.get().advanced.pan_id === 'GENERATE' ? this.generatePanID() : settings.get().advanced.pan_id,
                extendedPanID: settings.get().advanced.ext_pan_id === 'GENERATE' ? this.generateExtPanID() : settings.get().advanced.ext_pan_id,
                channelList: [settings.get().advanced.channel],
                networkKey: settings.get().advanced.network_key === 'GENERATE'
                    ? this.generateNetworkKey()
                    : settings.get().advanced.network_key,
            },
            databasePath: data_1.default.joinPath('database.db'),
            databaseBackupPath: data_1.default.joinPath('database.db.backup'),
            backupPath: data_1.default.joinPath('coordinator_backup.json'),
            serialPort: {
                baudRate: settings.get().serial.baudrate,
                rtscts: settings.get().serial.rtscts,
                path: settings.get().serial.port,
                adapter: settings.get().serial.adapter,
            },
            adapter: {
                concurrent: settings.get().advanced.adapter_concurrent,
                delay: settings.get().advanced.adapter_delay,
                disableLED: settings.get().serial.disable_led,
            },
            acceptJoiningDeviceHandler: this.acceptJoiningDeviceHandler,
        };
        const herdsmanSettingsLog = JSON.stringify(herdsmanSettings).replaceAll(JSON.stringify(herdsmanSettings.network.networkKey), '"HIDDEN"');
        logger_1.default.debug(`Using zigbee-herdsman with settings: '${(0, json_stable_stringify_without_jsonify_1.default)(herdsmanSettingsLog)}'`);
        let startResult;
        try {
            this.herdsman = new zigbee_herdsman_1.Controller(herdsmanSettings);
            startResult = await this.herdsman.start();
        }
        catch (error) {
            logger_1.default.error(`Error while starting zigbee-herdsman`);
            throw error;
        }
        for (const device of this.devices(false)) {
            await device.resolveDefinition();
        }
        this.herdsman.on('adapterDisconnected', () => this.eventBus.emitAdapterDisconnected());
        this.herdsman.on('lastSeenChanged', (data) => {
            this.eventBus.emitLastSeenChanged({ device: this.resolveDevice(data.device.ieeeAddr), reason: data.reason });
        });
        this.herdsman.on('permitJoinChanged', (data) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on('deviceNetworkAddressChanged', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' changed network address`);
            this.eventBus.emitDeviceNetworkAddressChanged({ device });
        });
        this.herdsman.on('deviceAnnounce', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' announced itself`);
            this.eventBus.emitDeviceAnnounce({ device });
        });
        this.herdsman.on('deviceInterview', async (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device)
                return; // Prevent potential race
            await device.resolveDefinition();
            const d = { device, status: data.status };
            this.logDeviceInterview(d);
            this.eventBus.emitDeviceInterview(d);
        });
        this.herdsman.on('deviceJoined', async (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device)
                return; // Prevent potential race
            await device.resolveDefinition();
            logger_1.default.info(`Device '${device.name}' joined`);
            this.eventBus.emitDeviceJoined({ device });
        });
        this.herdsman.on('deviceLeave', (data) => {
            const name = settings.getDevice(data.ieeeAddr)?.friendly_name || data.ieeeAddr;
            logger_1.default.warning(`Device '${name}' left the network`);
            this.eventBus.emitDeviceLeave({ ieeeAddr: data.ieeeAddr, name });
        });
        this.herdsman.on('message', async (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            await device.resolveDefinition();
            logger_1.default.debug(`Received Zigbee message from '${device.name}', type '${data.type}', ` +
                `cluster '${data.cluster}', data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``) +
                (device.zh.type === 'Coordinator' ? `, ignoring since it is from coordinator` : ``));
            if (device.zh.type === 'Coordinator')
                return;
            this.eventBus.emitDeviceMessage({ ...data, device });
        });
        logger_1.default.info(`zigbee-herdsman started (${startResult})`);
        logger_1.default.info(`Coordinator firmware version: '${(0, json_stable_stringify_without_jsonify_1.default)(await this.getCoordinatorVersion())}'`);
        logger_1.default.debug(`Zigbee network parameters: ${(0, json_stable_stringify_without_jsonify_1.default)(await this.herdsman.getNetworkParameters())}`);
        for (const device of this.devices(false)) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist;
            const blocklist = settings.get().blocklist;
            const remove = async (device) => {
                try {
                    await device.zh.removeFromNetwork();
                }
                catch (error) {
                    logger_1.default.error(`Failed to remove '${device.ieeeAddr}' (${error.message})`);
                }
            };
            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger_1.default.warning(`Device which is not on passlist connected (${device.ieeeAddr}), removing...`);
                    await remove(device);
                }
            }
            else if (blocklist.includes(device.ieeeAddr)) {
                logger_1.default.warning(`Device on blocklist is connected (${device.ieeeAddr}), removing...`);
                await remove(device);
            }
        }
        // Check if we have to set a transmit power
        if (settings.get().advanced.hasOwnProperty('transmit_power')) {
            const transmitPower = settings.get().advanced.transmit_power;
            await this.herdsman.setTransmitPower(transmitPower);
            logger_1.default.info(`Set transmit power to '${transmitPower}'`);
        }
        return startResult;
    }
    logDeviceInterview(data) {
        const name = data.device.name;
        if (data.status === 'successful') {
            logger_1.default.info(`Successfully interviewed '${name}', device has successfully been paired`);
            if (data.device.isSupported) {
                const { vendor, description, model } = data.device.definition;
                logger_1.default.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
            }
            else {
                logger_1.default.warning(`Device '${name}' with Zigbee model '${data.device.zh.modelID}' and manufacturer name ` +
                    `'${data.device.zh.manufacturerName}' is NOT supported, ` +
                    `please follow https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`);
            }
        }
        else if (data.status === 'failed') {
            logger_1.default.error(`Failed to interview '${name}', device has not successfully been paired`);
        }
        else {
            // data.status === 'started'
            logger_1.default.info(`Starting interview of '${name}'`);
        }
    }
    generateNetworkKey() {
        const key = Array.from({ length: 16 }, () => (0, crypto_1.randomInt)(256));
        settings.set(['advanced', 'network_key'], key);
        return key;
    }
    generateExtPanID() {
        const key = Array.from({ length: 8 }, () => (0, crypto_1.randomInt)(256));
        settings.set(['advanced', 'ext_pan_id'], key);
        return key;
    }
    generatePanID() {
        const panID = (0, crypto_1.randomInt)(1, 0xffff - 1);
        settings.set(['advanced', 'pan_id'], panID);
        return panID;
    }
    async getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }
    isStopping() {
        return this.herdsman.isStopping();
    }
    async backup() {
        return this.herdsman.backup();
    }
    async coordinatorCheck() {
        const check = await this.herdsman.coordinatorCheck();
        return { missingRouters: check.missingRouters.map((d) => this.resolveDevice(d.ieeeAddr)) };
    }
    async getNetworkParameters() {
        return this.herdsman.getNetworkParameters();
    }
    async reset(type) {
        await this.herdsman.reset(type);
    }
    async stop() {
        logger_1.default.info('Stopping zigbee-herdsman...');
        await this.herdsman.stop();
        logger_1.default.info('Stopped zigbee-herdsman');
    }
    getPermitJoin() {
        return this.herdsman.getPermitJoin();
    }
    getPermitJoinTimeout() {
        return this.herdsman.getPermitJoinTimeout();
    }
    async permitJoin(permit, device, time = undefined) {
        if (permit) {
            logger_1.default.info(`Zigbee: allowing new devices to join${device ? ` via ${device.name}` : ''}.`);
        }
        else {
            logger_1.default.info('Zigbee: disabling joining new devices.');
        }
        if (device && permit) {
            await this.herdsman.permitJoin(permit, device.zh, time);
        }
        else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }
    resolveDevice(ieeeAddr) {
        if (!this.deviceLookup[ieeeAddr]) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            device && (this.deviceLookup[ieeeAddr] = new device_1.default(device));
        }
        const device = this.deviceLookup[ieeeAddr];
        if (device && !device.zh.isDeleted) {
            device.ensureInSettings();
            return device;
        }
    }
    resolveGroup(groupID) {
        const group = this.herdsman.getGroupByID(Number(groupID));
        if (group && !this.groupLookup[groupID]) {
            this.groupLookup[groupID] = new group_1.default(group, this.resolveDevice);
        }
        return this.groupLookup[groupID];
    }
    resolveEntity(key) {
        if (typeof key === 'object') {
            return this.resolveDevice(key.ieeeAddr);
        }
        else if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
            return this.resolveDevice(this.herdsman.getDevicesByType('Coordinator')[0].ieeeAddr);
        }
        else {
            const settingsDevice = settings.getDevice(key.toString());
            if (settingsDevice)
                return this.resolveDevice(settingsDevice.ID);
            const groupSettings = settings.getGroup(key);
            if (groupSettings) {
                const group = this.resolveGroup(groupSettings.ID);
                // If group does not exist, create it (since it's already in configuration.yaml)
                return group ? group : this.createGroup(groupSettings.ID);
            }
        }
    }
    resolveEntityAndEndpoint(ID) {
        // This function matches the following entity formats:
        // device_name          (just device name)
        // device_name/ep_name  (device name and endpoint numeric ID or name)
        // device/name          (device name with slashes)
        // device/name/ep_name  (device name with slashes, and endpoint numeric ID or name)
        // The function tries to find an exact match first
        let entityName = ID;
        let deviceOrGroup = this.resolveEntity(ID);
        let endpointNameOrID = undefined;
        // If exact match did not happenc, try matching a device_name/endpoint pattern
        if (!deviceOrGroup) {
            // First split the input token by the latest slash
            const match = ID.match(entityIDRegex);
            // Get the resulting IDs from the match
            entityName = match[1];
            deviceOrGroup = this.resolveEntity(match[1]);
            endpointNameOrID = match[2];
        }
        // If the function returns non-null endpoint name, but the endpoint field is null, then
        // it means that endpoint was not matched because there is no such endpoint on the device
        // (or the entity is a group)
        const endpoint = deviceOrGroup?.isDevice() ? deviceOrGroup.endpoint(endpointNameOrID) : null;
        return { ID: entityName, entity: deviceOrGroup, endpointID: endpointNameOrID, endpoint: endpoint };
    }
    firstCoordinatorEndpoint() {
        return this.herdsman.getDevicesByType('Coordinator')[0].endpoints[0];
    }
    groups() {
        return this.herdsman.getGroups().map((g) => this.resolveGroup(g.groupID));
    }
    devices(includeCoordinator = true) {
        const devices = [];
        for (const device of this.herdsman.getDevices()) {
            if (includeCoordinator || device.type !== 'Coordinator') {
                devices.push(this.resolveDevice(device.ieeeAddr));
            }
        }
        return devices;
    }
    async acceptJoiningDeviceHandler(ieeeAddr) {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist;
        const blocklist = settings.get().blocklist;
        if (passlist.length > 0) {
            if (passlist.includes(ieeeAddr)) {
                logger_1.default.info(`Accepting joining device which is on passlist '${ieeeAddr}'`);
                return true;
            }
            else {
                logger_1.default.info(`Rejecting joining not in passlist device '${ieeeAddr}'`);
                return false;
            }
        }
        else if (blocklist.length > 0) {
            if (blocklist.includes(ieeeAddr)) {
                logger_1.default.info(`Rejecting joining device which is on blocklist '${ieeeAddr}'`);
                return false;
            }
            else {
                logger_1.default.info(`Accepting joining not in blocklist device '${ieeeAddr}'`);
                return true;
            }
        }
        else {
            return true;
        }
    }
    async touchlinkFactoryResetFirst() {
        return this.herdsman.touchlinkFactoryResetFirst();
    }
    async touchlinkFactoryReset(ieeeAddr, channel) {
        return this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
    }
    async addInstallCode(installCode) {
        await this.herdsman.addInstallCode(installCode);
    }
    async touchlinkIdentify(ieeeAddr, channel) {
        await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
    }
    async touchlinkScan() {
        return this.herdsman.touchlinkScan();
    }
    createGroup(ID) {
        this.herdsman.createGroup(ID);
        return this.resolveGroup(ID);
    }
    deviceByNetworkAddress(networkAddress) {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.resolveDevice(device.ieeeAddr);
    }
    groupByID(ID) {
        return this.resolveGroup(ID);
    }
}
exports.default = Zigbee;
__decorate([
    bind_decorator_1.default
], Zigbee.prototype, "resolveDevice", null);
__decorate([
    bind_decorator_1.default
], Zigbee.prototype, "acceptJoiningDeviceHandler", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiemlnYmVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vbGliL3ppZ2JlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0VBQWtDO0FBQ2xDLG1DQUFpQztBQUNqQyxrSEFBOEQ7QUFDOUQscURBQTJDO0FBRzNDLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsdURBQStCO0FBQy9CLDJEQUFtQztBQUNuQywwREFBNEM7QUFDNUMseURBQWlDO0FBRWpDLE1BQU0sYUFBYSxHQUFHLElBQUksTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFFekQsTUFBcUIsTUFBTTtJQUNmLFFBQVEsQ0FBYTtJQUNyQixRQUFRLENBQVc7SUFDbkIsV0FBVyxHQUF5QixFQUFFLENBQUM7SUFDdkMsWUFBWSxHQUEwQixFQUFFLENBQUM7SUFFakQsWUFBWSxRQUFrQjtRQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUs7UUFDUCxNQUFNLFlBQVksR0FBRyxNQUFNLGVBQUssQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3pFLGdCQUFNLENBQUMsSUFBSSxDQUFDLDZCQUE2QixZQUFZLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNsRSxNQUFNLGdCQUFnQixHQUFHO1lBQ3JCLE9BQU8sRUFBRTtnQkFDTCxLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBaUI7Z0JBQ3hILGFBQWEsRUFDVCxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsS0FBSyxVQUFVLENBQUMs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