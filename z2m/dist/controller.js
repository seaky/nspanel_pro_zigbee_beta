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
exports.Controller = void 0;
const assert_1 = __importDefault(require("assert"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const zigbee_herdsman_converters_1 = require("zigbee-herdsman-converters");
const eventBus_1 = __importDefault(require("./eventBus"));
const availability_1 = __importDefault(require("./extension/availability"));
const bind_1 = __importDefault(require("./extension/bind"));
const bridge_1 = __importDefault(require("./extension/bridge"));
const configure_1 = __importDefault(require("./extension/configure"));
const externalConverters_1 = __importDefault(require("./extension/externalConverters"));
const externalExtension_1 = __importDefault(require("./extension/externalExtension"));
// Extensions
const frontend_1 = __importDefault(require("./extension/frontend"));
const groups_1 = __importDefault(require("./extension/groups"));
const homeassistant_1 = __importDefault(require("./extension/homeassistant"));
const bridgeLegacy_1 = __importDefault(require("./extension/legacy/bridgeLegacy"));
const deviceGroupMembership_1 = __importDefault(require("./extension/legacy/deviceGroupMembership"));
const report_1 = __importDefault(require("./extension/legacy/report"));
const softReset_1 = __importDefault(require("./extension/legacy/softReset"));
const networkMap_1 = __importDefault(require("./extension/networkMap"));
const onEvent_1 = __importDefault(require("./extension/onEvent"));
const otaUpdate_1 = __importDefault(require("./extension/otaUpdate"));
const publish_1 = __importDefault(require("./extension/publish"));
const receive_1 = __importDefault(require("./extension/receive"));
const mqtt_1 = __importDefault(require("./mqtt"));
const state_1 = __importDefault(require("./state"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const zigbee_1 = __importDefault(require("./zigbee"));
const AllExtensions = [
    publish_1.default,
    receive_1.default,
    networkMap_1.default,
    softReset_1.default,
    homeassistant_1.default,
    configure_1.default,
    deviceGroupMembership_1.default,
    bridgeLegacy_1.default,
    bridge_1.default,
    groups_1.default,
    bind_1.default,
    report_1.default,
    onEvent_1.default,
    otaUpdate_1.default,
    externalConverters_1.default,
    frontend_1.default,
    externalExtension_1.default,
    availability_1.default,
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdNotify = null;
try {
    sdNotify = process.env.NOTIFY_SOCKET ? require('sd-notify') : null;
}
catch {
    // sd-notify is optional
}
class Controller {
    eventBus;
    zigbee;
    state;
    mqtt;
    restartCallback;
    exitCallback;
    extensions;
    extensionArgs;
    constructor(restartCallback, exitCallback) {
        logger_1.default.init();
        (0, zigbee_herdsman_1.setLogger)(logger_1.default);
        (0, zigbee_herdsman_converters_1.setLogger)(logger_1.default);
        this.eventBus = new eventBus_1.default();
        this.zigbee = new zigbee_1.default(this.eventBus);
        this.mqtt = new mqtt_1.default(this.eventBus);
        this.state = new state_1.default(this.eventBus, this.zigbee);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;
        // Initialize extensions.
        this.extensionArgs = [
            this.zigbee,
            this.mqtt,
            this.state,
            this.publishEntityState,
            this.eventBus,
            this.enableDisableExtension,
            this.restartCallback,
            this.addExtension,
        ];
        this.extensions = [
            new onEvent_1.default(...this.extensionArgs),
            new bridge_1.default(...this.extensionArgs),
            new publish_1.default(...this.extensionArgs),
            new receive_1.default(...this.extensionArgs),
            new deviceGroupMembership_1.default(...this.extensionArgs),
            new configure_1.default(...this.extensionArgs),
            new networkMap_1.default(...this.extensionArgs),
            new groups_1.default(...this.extensionArgs),
            new bind_1.default(...this.extensionArgs),
            new otaUpdate_1.default(...this.extensionArgs),
            new report_1.default(...this.extensionArgs),
            new externalExtension_1.default(...this.extensionArgs),
            new availability_1.default(...this.extensionArgs),
            settings.get().frontend && new frontend_1.default(...this.extensionArgs),
            settings.get().advanced.legacy_api && new bridgeLegacy_1.default(...this.extensionArgs),
            settings.get().external_converters.length && new externalConverters_1.default(...this.extensionArgs),
            settings.get().homeassistant && new homeassistant_1.default(...this.extensionArgs),
            /* istanbul ignore next */
            settings.get().advanced.soft_reset_timeout !== 0 && new softReset_1.default(...this.extensionArgs),
        ].filter((n) => n);
    }
    async start() {
        this.state.start();
        const info = await utils_1.default.getZigbee2MQTTVersion();
        logger_1.default.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);
        // Start zigbee
        let startResult;
        try {
            startResult = await this.zigbee.start();
            this.eventBus.onAdapterDisconnected(this, this.onZigbeeAdapterDisconnected);
        }
        catch (error) {
            logger_1.default.error('Failed to start zigbee');
            logger_1.default.error('Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start.html for possible solutions');
            logger_1.default.error('Exiting...');
            logger_1.default.error(error.stack);
            return this.exit(1);
        }
        // Disable some legacy options on new network creation
        if (startResult === 'reset') {
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
            settings.set(['advanced', 'legacy_api'], false);
            settings.set(['advanced', 'legacy_availability_payload'], false);
            settings.set(['device_options', 'legacy'], false);
            await this.enableDisableExtension(false, 'BridgeLegacy');
        }
        // Log zigbee clients on startup
        const devices = this.zigbee.devices(false);
        logger_1.default.info(`Currently ${devices.length} devices are joined:`);
        for (const device of devices) {
            const model = device.isSupported
                ? `${device.definition.model} - ${device.definition.vendor} ${device.definition.description}`
                : 'Not supported';
            logger_1.default.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);
        }
        // Enable zigbee join
        try {
            if (settings.get().permit_join) {
                logger_1.default.warning('`permit_join` set to  `true` in configuration.yaml.');
                logger_1.default.warning('Allowing new devices to join.');
                logger_1.default.warning('Set `permit_join` to `false` once you joined all devices.');
            }
            await this.zigbee.permitJoin(settings.get().permit_join);
        }
        catch (error) {
            logger_1.default.error(`Failed to set permit join to ${settings.get().permit_join}`);
        }
        // MQTT
        try {
            await this.mqtt.connect();
        }
        catch (error) {
            logger_1.default.error(`MQTT failed to connect, exiting...`);
            await this.zigbee.stop();
            return this.exit(1);
        }
        // Call extensions
        await this.callExtensions('start', [...this.extensions]);
        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const entity of [...devices, ...this.zigbee.groups()]) {
                if (this.state.exists(entity)) {
                    await this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                }
            }
        }
        this.eventBus.onLastSeenChanged(this, (data) => utils_1.default.publishLastSeen(data, settings.get(), false, this.publishEntityState));
        logger_1.default.info(`Zigbee2MQTT started!`);
        const watchdogInterval = sdNotify?.watchdogInterval() || 0;
        if (watchdogInterval > 0) {
            sdNotify.startWatchdogMode(Math.floor(watchdogInterval / 2));
        }
        sdNotify?.ready();
    }
    async enableDisableExtension(enable, name) {
        if (!enable) {
            const extension = this.extensions.find((e) => e.constructor.name === name);
            if (extension) {
                await this.callExtensions('stop', [extension]);
                this.extensions.splice(this.extensions.indexOf(extension), 1);
            }
        }
        else {
            const Extension = AllExtensions.find((e) => e.name === name);
            (0, assert_1.default)(Extension, `Extension '${name}' does not exist`);
            const extension = new Extension(...this.extensionArgs);
            this.extensions.push(extension);
            await this.callExtensions('start', [extension]);
        }
    }
    async addExtension(extension) {
        this.extensions.push(extension);
        await this.callExtensions('start', [extension]);
    }
    async stop(restart = false) {
        sdNotify?.stopping();
        // Call extensions
        await this.callExtensions('stop', this.extensions);
        this.eventBus.removeListeners(this);
        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();
        let code = 0;
        try {
            await this.zigbee.stop();
            logger_1.default.info('Stopped Zigbee2MQTT');
        }
        catch (error) {
            logger_1.default.error('Failed to stop Zigbee2MQTT');
            code = 1;
        }
        sdNotify?.stopWatchdogMode();
        return this.exit(code, restart);
    }
    async exit(code, restart = false) {
        await logger_1.default.end();
        return this.exitCallback(code, restart);
    }
    async onZigbeeAdapterDisconnected() {
        logger_1.default.error('Adapter disconnected, stopping');
        await this.stop();
    }
    async publishEntityState(entity, payload, stateChangeReason) {
        let message = { ...payload };
        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);
        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }
        const options = {
            retain: utils_1.default.getObjectProperty(entity.options, 'retain', false),
            qos: utils_1.default.getObjectProperty(entity.options, 'qos', 0),
        };
        const retention = utils_1.default.getObjectProperty(entity.options, 'retention', false);
        if (retention !== false) {
            options.properties = { messageExpiryInterval: retention };
        }
        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name,
                model: entity.definition?.model,
                ieeeAddr: entity.ieeeAddr,
                networkAddress: entity.zh.networkAddress,
                type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID,
                powerSource: entity.zh.powerSource,
                applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion,
                zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion,
                dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
                // Manufacturer name can contain \u0000, remove this.
                // https://github.com/home-assistant/core/issues/85691
                manufacturerName: entity.zh.manufacturerName?.split('\u0000')[0],
            };
        }
        // Add lastseen
        const lastSeen = settings.get().advanced.last_seen;
        if (entity.isDevice() && lastSeen !== 'disable' && entity.zh.lastSeen) {
            message.last_seen = utils_1.default.formatDate(entity.zh.lastSeen, lastSeen);
        }
        // Add device linkquality.
        if (entity.isDevice() && entity.zh.linkquality !== undefined) {
            message.linkquality = entity.zh.linkquality;
        }
        for (const extension of this.extensions) {
            extension.adjustMessageBeforePublish?.(entity, message);
        }
        // Filter mqtt message attributes
        utils_1.default.filterProperties(entity.options.filtered_attributes, message);
        if (Object.entries(message).length) {
            const output = settings.get().advanced.output;
            if (output === 'attribute_and_json' || output === 'json') {
                await this.mqtt.publish(entity.name, (0, json_stable_stringify_without_jsonify_1.default)(message), options);
            }
            if (output === 'attribute_and_json' || output === 'attribute') {
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, message, options);
            }
        }
        this.eventBus.emitPublishEntityState({ entity, message, stateChangeReason, payload });
    }
    async iteratePayloadAttributeOutput(topicRoot, payload, options) {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message = null;
            // Special cases
            if (key === 'color' && utils_1.default.objectHasProperties(subPayload, ['r', 'g', 'b'])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }
            // Check Array first, since it is also an Object
            if (subPayload === null || subPayload === undefined) {
                message = '';
            }
            else if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(',');
            }
            else if (typeof subPayload === 'object') {
                await this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            }
            else {
                message = typeof subPayload === 'string' ? subPayload : (0, json_stable_stringify_without_jsonify_1.default)(subPayload);
            }
            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }
    async callExtensions(method, extensions) {
        for (const extension of extensions) {
            try {
                await extension[method]?.();
            }
            catch (error) {
                /* istanbul ignore next */
                logger_1.default.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
            }
        }
    }
}
exports.Controller = Controller;
__decorate([
    bind_decorator_1.default
], Controller.prototype, "enableDisableExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "addExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "onZigbeeAdapterDisconnected", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "publishEntityState", null);
module.exports = Controller;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9jb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0RBQTRCO0FBQzVCLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQscURBQXlEO0FBQ3pELDJFQUFxRTtBQUVyRSwwREFBa0M7QUFDbEMsNEVBQTZEO0FBQzdELDREQUE2QztBQUM3QyxnRUFBaUQ7QUFDakQsc0VBQXVEO0FBQ3ZELHdGQUF5RTtBQUN6RSxzRkFBdUU7QUFDdkUsYUFBYTtBQUNiLG9FQUFxRDtBQUNyRCxnRUFBaUQ7QUFDakQsOEVBQStEO0FBQy9ELG1GQUFvRTtBQUNwRSxxR0FBc0Y7QUFDdEYsdUVBQXdEO0FBQ3hELDZFQUE4RDtBQUM5RCx3RUFBeUQ7QUFDekQsa0VBQW1EO0FBQ25ELHNFQUF1RDtBQUN2RCxrRUFBbUQ7QUFDbkQsa0VBQW1EO0FBQ25ELGtEQUEwQjtBQUMxQixvREFBNEI7QUFDNUIsMkRBQW1DO0FBQ25DLDBEQUE0QztBQUM1Qyx5REFBaUM7QUFDakMsc0RBQThCO0FBRTlCLE1BQU0sYUFBYSxHQUFHO0lBQ2xCLGlCQUFnQjtJQUNoQixpQkFBZ0I7SUFDaEIsb0JBQW1CO0lBQ25CLG1CQUFrQjtJQUNsQix1QkFBc0I7SUFDdEIsbUJBQWtCO0lBQ2xCLCtCQUE4QjtJQUM5QixzQkFBcUI7SUFDckIsZ0JBQWU7SUFDZixnQkFBZTtJQUNmLGNBQWE7SUFDYixnQkFBZTtJQUNmLGlCQUFnQjtJQUNoQixtQkFBa0I7SUFDbEIsNEJBQTJCO0lBQzNCLGtCQUFpQjtJQUNqQiwyQkFBMEI7SUFDMUIsc0JBQXFCO0NBQ3hCLENBQUM7QUFhRiw4REFBOEQ7QUFDOUQsSUFBSSxRQUFRLEdBQVEsSUFBSSxDQUFDO0FBQ3pCLElBQUksQ0FBQztJQUNELFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEs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