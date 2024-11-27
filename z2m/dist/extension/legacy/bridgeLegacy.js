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
const assert_1 = __importDefault(require("assert"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const logger_1 = __importDefault(require("../../util/logger"));
const settings = __importStar(require("../../util/settings"));
const utils_1 = __importDefault(require("../../util/utils"));
const extension_1 = __importDefault(require("../extension"));
const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/((?:\\w+/get)|(?:\\w+/factory_reset)|(?:\\w+))`);
class BridgeLegacy extends extension_1.default {
    lastJoinedDeviceName = null;
    supportedOptions;
    async start() {
        this.supportedOptions = {
            permit_join: this.permitJoin,
            last_seen: this.lastSeen,
            elapsed: this.elapsed,
            reset: this.reset,
            log_level: this.logLevel,
            devices: this.devices,
            groups: this.groups,
            'devices/get': this.devices,
            rename: this.rename,
            rename_last: this.renameLast,
            remove: this.remove,
            force_remove: this.forceRemove,
            ban: this.ban,
            device_options: this.deviceOptions,
            add_group: this.addGroup,
            remove_group: this.removeGroup,
            force_remove_group: this.removeGroup,
            whitelist: this.whitelist,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
        };
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('deviceJoined', data, data.device));
        this.eventBus.onDeviceInterview(this, (data) => this.onZigbeeEvent_('deviceInterview', data, data.device));
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data, data.device));
        this.eventBus.onDeviceLeave(this, (data) => this.onZigbeeEvent_('deviceLeave', data, null));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.publish();
    }
    async whitelist(topic, message) {
        try {
            const entity = settings.getDevice(message);
            (0, assert_1.default)(entity, `Entity '${message}' does not exist`);
            settings.addDeviceToPasslist(entity.ID.toString());
            logger_1.default.info(`Whitelisted '${entity.friendly_name}'`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'device_whitelisted', message: { friendly_name: entity.friendly_name } }));
        }
        catch (error) {
            logger_1.default.error(`Failed to whitelist '${message}' '${error}'`);
        }
    }
    deviceOptions(topic, message) {
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch (e) {
            logger_1.default.error('Failed to parse message as JSON');
            return;
        }
        if (!json.hasOwnProperty('friendly_name') || !json.hasOwnProperty('options')) {
            logger_1.default.error('Invalid JSON message, should contain "friendly_name" and "options"');
            return;
        }
        const entity = settings.getDevice(json.friendly_name);
        (0, assert_1.default)(entity, `Entity '${json.friendly_name}' does not exist`);
        settings.changeEntityOptions(entity.ID.toString(), json.options);
        logger_1.default.info(`Changed device specific options of '${json.friendly_name}' (${(0, json_stable_stringify_without_jsonify_1.default)(json.options)})`);
    }
    async permitJoin(topic, message) {
        await this.zigbee.permitJoin(message.toLowerCase() === 'true');
        await this.publish();
    }
    async reset() {
        try {
            await this.zigbee.reset('soft');
            logger_1.default.info('Soft reset ZNP');
        }
        catch (error) {
            logger_1.default.error('Soft reset failed');
        }
    }
    lastSeen(topic, message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'last_seen'], message);
        logger_1.default.info(`Set last_seen to ${message}`);
    }
    elapsed(topic, message) {
        const allowed = ['true', 'false'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'elapsed'], message === 'true');
        logger_1.default.info(`Set elapsed to ${message}`);
    }
    async logLevel(topic, message) {
        const level = message.toLowerCase();
        if (settings.LOG_LEVELS.includes(level)) {
            logger_1.default.info(`Switching log level to '${level}'`);
            logger_1.default.setLevel(level);
        }
        else {
            logger_1.default.error(`Could not set log level to '${level}'. Allowed level: '${settings.LOG_LEVELS.join(',')}'`);
        }
        await this.publish();
    }
    async devices(topic) {
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const devices = this.zigbee.devices().map((device) => {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.zh.type,
                networkAddress: device.zh.networkAddress,
            };
            if (device.zh.type !== 'Coordinator') {
                const definition = device.definition;
                payload.model = definition ? definition.model : device.zh.modelID;
                payload.vendor = definition ? definition.vendor : '-';
                payload.description = definition ? definition.description : '-';
                payload.friendly_name = device.name;
                payload.manufacturerID = device.zh.manufacturerID;
                payload.manufacturerName = device.zh.manufacturerName;
                payload.powerSource = device.zh.powerSource;
                payload.modelID = device.zh.modelID;
                payload.hardwareVersion = device.zh.hardwareVersion;
                payload.softwareBuildID = device.zh.softwareBuildID;
                payload.dateCode = device.zh.dateCode;
                payload.lastSeen = device.zh.lastSeen;
            }
            else {
                payload.friendly_name = 'Coordinator';
                payload.softwareBuildID = coordinator.type;
                payload.dateCode = coordinator.meta.revision.toString();
                payload.lastSeen = Date.now();
            }
            return payload;
        });
        if (topic.split('/').pop() == 'get') {
            await this.mqtt.publish(`bridge/config/devices`, (0, json_stable_stringify_without_jsonify_1.default)(devices), {}, settings.get().mqtt.base_topic, false, false);
        }
        else {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'devices', message: devices }));
        }
    }
    async groups() {
        const payload = settings.getGroups().map((g) => {
            return { ...g, ID: Number(g.ID) };
        });
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'groups', message: payload }));
    }
    async rename(topic, message) {
        const invalid = `Invalid rename message format expected {"old": "friendly_name", "new": "new_name"} got ${message}`;
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch (e) {
            logger_1.default.error(invalid);
            return;
        }
        // Validate message
        if (!json.new || !json.old) {
            logger_1.default.error(invalid);
            return;
        }
        await this._renameInternal(json.old, json.new);
    }
    async renameLast(topic, message) {
        if (!this.lastJoinedDeviceName) {
            logger_1.default.error(`Cannot rename last joined device, no device has joined during this session`);
            return;
        }
        await this._renameInternal(this.lastJoinedDeviceName, message);
    }
    async _renameInternal(from, to) {
        try {
            const isGroup = settings.getGroup(from) !== null;
            settings.changeFriendlyName(from, to);
            logger_1.default.info(`Successfully renamed - ${from} to ${to} `);
            const entity = this.zigbee.resolveEntity(to);
            if (entity.isDevice()) {
                this.eventBus.emitEntityRenamed({ homeAssisantRename: false, from, to, entity });
            }
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `${isGroup ? 'group' : 'device'}_renamed`, message: { from, to } }));
        }
        catch (error) {
            logger_1.default.error(`Failed to rename - ${from} to ${to}`);
        }
    }
    async addGroup(topic, message) {
        let id = null;
        let name = null;
        try {
            // json payload with id and friendly_name
            const json = JSON.parse(message);
            if (json.hasOwnProperty('id')) {
                id = json.id;
                name = `group_${id}`;
            }
            if (json.hasOwnProperty('friendly_name')) {
                name = json.friendly_name;
            }
        }
        catch (e) {
            // just friendly_name
            name = message;
        }
        if (name == null) {
            logger_1.default.error('Failed to add group, missing friendly_name!');
            return;
        }
        const group = settings.addGroup(name, id);
        this.zigbee.createGroup(group.ID);
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_added`, message: name }));
        logger_1.default.info(`Added group '${name}'`);
    }
    async removeGroup(topic, message) {
        const name = message;
        const entity = this.zigbee.resolveEntity(message);
        (0, assert_1.default)(entity && entity.isGroup(), `Group '${message}' does not exist`);
        if (topic.includes('force')) {
            entity.zh.removeFromDatabase();
        }
        else {
            await entity.zh.removeFromNetwork();
        }
        settings.removeGroup(message);
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_removed`, message }));
        logger_1.default.info(`Removed group '${name}'`);
    }
    async forceRemove(topic, message) {
        await this.removeForceRemoveOrBan('force_remove', message);
    }
    async remove(topic, message) {
        await this.removeForceRemoveOrBan('remove', message);
    }
    async ban(topic, message) {
        await this.removeForceRemoveOrBan('ban', message);
    }
    async removeForceRemoveOrBan(action, message) {
        const entity = this.zigbee.resolveEntity(message.trim());
        const lookup = {
            ban: ['banned', 'Banning', 'ban'],
            force_remove: ['force_removed', 'Force removing', 'force remove'],
            remove: ['removed', 'Removing', 'remove'],
        };
        if (!entity) {
            logger_1.default.error(`Cannot ${lookup[action][2]}, device '${message}' does not exist`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
            return;
        }
        const ieeeAddr = entity.ieeeAddr;
        const name = entity.name;
        const cleanup = async () => {
            // Fire event
            this.eventBus.emitDeviceRemoved({ ieeeAddr, name });
            // Remove from configuration.yaml
            settings.removeDevice(entity.ieeeAddr);
            // Remove from state
            this.state.remove(ieeeAddr);
            logger_1.default.info(`Successfully ${lookup[action][0]} ${entity.name}`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}`, message }));
        };
        try {
            logger_1.default.info(`${lookup[action][1]} '${entity.name}'`);
            if (action === 'force_remove') {
                entity.zh.removeFromDatabase();
            }
            else {
                await entity.zh.removeFromNetwork();
            }
            await cleanup();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${lookup[action][2]} ${entity.name} (${error})`);
            // eslint-disable-next-line
            logger_1.default.error(`See https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html#zigbee2mqtt-bridge-request for more info`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
        }
        if (action === 'ban') {
            settings.blockDevice(ieeeAddr);
        }
    }
    async onMQTTMessage(data) {
        const { topic, message } = data;
        if (!topic.match(configRegex)) {
            return;
        }
        const option = topic.match(configRegex)[1];
        if (!this.supportedOptions.hasOwnProperty(option)) {
            return;
        }
        await this.supportedOptions[option](topic, message);
        return;
    }
    async publish() {
        const info = await utils_1.default.getZigbee2MQTTVersion();
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const topic = `bridge/config`;
        const payload = {
            version: info.version,
            commit: info.commitHash,
            coordinator,
            network: await this.zigbee.getNetworkParameters(),
            log_level: logger_1.default.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
        };
        await this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 });
    }
    async onZigbeeEvent_(type, data, resolvedEntity) {
        if (type === 'deviceJoined' && resolvedEntity) {
            this.lastJoinedDeviceName = resolvedEntity.name;
        }
        if (type === 'deviceJoined') {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_connected`, message: { friendly_name: resolvedEntity.name } }));
        }
        else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                if (resolvedEntity.isSupported) {
                    const { vendor, description, model } = resolvedEntity.definition;
                    const log = { friendly_name: resolvedEntity.name, model, vendor, description, supported: true };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta: log }));
                }
                else {
                    const meta = { friendly_name: resolvedEntity.name, supported: false };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta }));
                }
            }
            else if (data.status === 'failed') {
                const meta = { friendly_name: resolvedEntity.name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_failed', meta }));
            }
            else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    const meta = { friendly_name: resolvedEntity.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_started', meta }));
                }
            }
        }
        else if (type === 'deviceAnnounce') {
            const meta = { friendly_name: resolvedEntity.name };
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_announced`, message: 'announce', meta }));
        }
        else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                const name = data.ieeeAddr;
                const meta = { friendly_name: name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_removed`, message: 'left_network', meta }));
            }
        }
    }
    async touchlinkFactoryReset() {
        logger_1.default.info('Starting touchlink factory reset...');
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_started', meta: { status: 'started' } }));
        const result = await this.zigbee.touchlinkFactoryResetFirst();
        if (result) {
            logger_1.default.info('Successfully factory reset device through Touchlink');
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_success', meta: { status: 'success' } }));
        }
        else {
            logger_1.default.warning('Failed to factory reset device through Touchlink');
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_failed', meta: { status: 'failed' } }));
        }
    }
}
exports.default = BridgeLegacy;
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "whitelist", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "deviceOptions", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "permitJoin", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "reset", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "lastSeen", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "elapsed", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "logLevel", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "devices", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "groups", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "rename", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "renameLast", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "addGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "forceRemove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "remove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "ban", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeForceRemoveOrBan", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "touchlinkFactoryReset", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlTGVnYWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvYnJpZGdlTGVnYWN5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsb0VBQWtDO0FBQ2xDLGtIQUE4RDtBQUU5RCwrREFBdUM7QUFDdkMsOERBQWdEO0FBQ2hELDZEQUFxQztBQUNyQyw2REFBcUM7QUFFckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsK0RBQStELENBQUMsQ0FBQztBQUVqSSxNQUFxQixZQUFhLFNBQVEsbUJBQVM7SUFDdkMsb0JBQW9CLEdBQVcsSUFBSSxDQUFDO0lBQ3BDLGdCQUFnQixDQUEwRTtJQUV6RixLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsZ0JBQWdCLEdBQUc7WUFDcEIsV0FBVyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzVCLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN4QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN4QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ25CLGFBQWEsRUFBRSxJQUFJLENBQUMsT0FBTztZQUMzQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsV0FBVyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzVCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixZQUFZLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDOUIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsY0FBYyxFQUFF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