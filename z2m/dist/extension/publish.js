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
exports.loadTopicGetSetRegex = void 0;
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zhc = __importStar(require("zigbee-herdsman-converters"));
const philips = __importStar(require("zigbee-herdsman-converters/lib/philips"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
let topicGetSetRegex;
// Used by `publish.test.js` to reload regex when changing `mqtt.base_topic`.
const loadTopicGetSetRegex = () => {
    topicGetSetRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(?!bridge)(.+?)/(get|set)(?:/(.+))?$`);
};
exports.loadTopicGetSetRegex = loadTopicGetSetRegex;
(0, exports.loadTopicGetSetRegex)();
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];
const sceneConverterKeys = ['scene_store', 'scene_add', 'scene_remove', 'scene_remove_all', 'scene_rename'];
// Legacy: don't provide default converters anymore, this is required by older z2m installs not saving group members
const defaultGroupConverters = [
    zhc.toZigbee.light_onoff_brightness,
    zhc.toZigbee.light_color_colortemp,
    philips.tz.effect, // Support Hue effects for groups
    zhc.toZigbee.ignore_transition,
    zhc.toZigbee.cover_position_tilt,
    zhc.toZigbee.thermostat_occupied_heating_setpoint,
    zhc.toZigbee.tint_scene,
    zhc.toZigbee.light_brightness_move,
    zhc.toZigbee.light_brightness_step,
    zhc.toZigbee.light_colortemp_step,
    zhc.toZigbee.light_colortemp_move,
    zhc.toZigbee.light_hue_saturation_move,
    zhc.toZigbee.light_hue_saturation_step,
];
class Publish extends extension_1.default {
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }
    parseTopic(topic) {
        // The function supports the following topic formats (below are for 'set'. 'get' will look the same):
        // - <base_topic>/device_name/set (endpoint and attribute is defined in the payload)
        // - <base_topic>/device_name/set/attribute (default endpoint used)
        // - <base_topic>/device_name/endpoint/set (attribute is defined in the payload)
        // - <base_topic>/device_name/endpoint/set/attribute (payload is the value)
        // Make the rough split on get/set keyword.
        // Before the get/set is the device name and optional endpoint name.
        // After it there will be an optional attribute name.
        const match = topic.match(topicGetSetRegex);
        if (!match)
            return null;
        const deviceNameAndEndpoint = match[1];
        const attribute = match[3];
        // Now parse the device/group name, and endpoint name
        const entity = this.zigbee.resolveEntityAndEndpoint(deviceNameAndEndpoint);
        return { ID: entity.ID, endpoint: entity.endpointID, type: match[2], attribute: attribute };
    }
    parseMessage(parsedTopic, data) {
        if (parsedTopic.attribute) {
            try {
                return { [parsedTopic.attribute]: JSON.parse(data.message) };
            }
            catch (e) {
                return { [parsedTopic.attribute]: data.message };
            }
        }
        else {
            try {
                return JSON.parse(data.message);
            }
            catch (e) {
                if (stateValues.includes(data.message.toLowerCase())) {
                    return { state: data.message };
                }
                else {
                    return null;
                }
            }
        }
    }
    async legacyLog(payload) {
        /* istanbul ignore else */
        if (settings.get().advanced.legacy_api) {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)(payload));
        }
    }
    legacyRetrieveState(re, converter, result, target, key, meta) {
        // It's possible for devices to get out of sync when writing an attribute that's not reportable.
        // So here we re-read the value after a specified timeout, this timeout could for example be the
        // transition time of a color change or for forcing a state read for devices that don't
        // automatically report a new state when set.
        // When reporting is requested for a device (report: true in device-specific settings) we won't
        // ever issue a read here, as we assume the device will properly report changes.
        // Only do this when the retrieve_state option is enabled for this device.
        // retrieve_state == deprecated
        if (re instanceof device_1.default && result && result.hasOwnProperty('readAfterWriteTime') && re.options.retrieve_state) {
            setTimeout(() => converter.convertGet(target, key, meta), result.readAfterWriteTime);
        }
    }
    updateMessageHomeAssistant(message, entityState) {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unnecessary.
         */
        if (settings.get().homeassistant) {
            const hasColorTemp = message.hasOwnProperty('color_temp');
            const hasColor = message.hasOwnProperty('color');
            const hasBrightness = message.hasOwnProperty('brightness');
            const isOn = entityState.state === 'ON' ? true : false;
            if (isOn && (hasColorTemp || hasColor) && !hasBrightness) {
                delete message.state;
                logger_1.default.debug('Skipping state because of Home Assistant');
            }
        }
    }
    async onMQTTMessage(data) {
        const parsedTopic = this.parseTopic(data.topic);
        if (!parsedTopic)
            return;
        const re = this.zigbee.resolveEntity(parsedTopic.ID);
        if (re == null) {
            await this.legacyLog({ type: `entity_not_found`, message: { friendly_name: parsedTopic.ID } });
            logger_1.default.error(`Entity '${parsedTopic.ID}' is unknown`);
            return;
        }
        // Get entity details
        const definition = re instanceof device_1.default ? re.definition : re.membersDefinitions();
        const target = re instanceof group_1.default ? re.zh : re.endpoint(parsedTopic.endpoint);
        if (target == null) {
            logger_1.default.error(`Device '${re.name}' has no endpoint '${parsedTopic.endpoint}'`);
            return;
        }
        const device = re instanceof device_1.default ? re.zh : null;
        const entitySettings = re.options;
        const entityState = this.state.get(re);
        const membersState = re instanceof group_1.default
            ? Object.fromEntries(re.zh.members.map((e) => [e.getDevice().ieeeAddr, this.state.get(this.zigbee.resolveEntity(e.getDevice().ieeeAddr))]))
            : null;
        let converters;
        {
            if (Array.isArray(definition)) {
                const c = new Set(definition.map((d) => d.toZigbee).flat());
                if (c.size == 0)
                    converters = defaultGroupConverters;
                else
                    converters = Array.from(c);
            }
            else {
                converters = definition.toZigbee;
            }
        }
        // Convert the MQTT message to a Zigbee message.
        const message = this.parseMessage(parsedTopic, data);
        if (message == null) {
            logger_1.default.error(`Invalid message '${message}', skipping...`);
            return;
        }
        this.updateMessageHomeAssistant(message, entityState);
        /**
         * Order state & brightness based on current bulb state
         *
         * Not all bulbs support setting the color/color_temp while it is off
         * this results in inconsistent behavior between different vendors.
         *
         * bulb on => move state & brightness to the back
         * bulb off => move state & brightness to the front
         */
        const entries = Object.entries(message);
        const sorter = typeof message.state === 'string' && message.state.toLowerCase() === 'off' ? 1 : -1;
        entries.sort((a) => (['state', 'brightness', 'brightness_percent'].includes(a[0]) ? sorter : sorter * -1));
        // For each attribute call the corresponding converter
        const usedConverters = {};
        const toPublish = {};
        const toPublishEntity = {};
        const addToToPublish = (entity, payload) => {
            const ID = entity.ID;
            if (!(ID in toPublish)) {
                toPublish[ID] = {};
                toPublishEntity[ID] = entity;
            }
            toPublish[ID] = { ...toPublish[ID], ...payload };
        };
        const endpointNames = re instanceof device_1.default ? re.getEndpointNames() : [];
        const propertyEndpointRegex = new RegExp(`^(.*?)_(${endpointNames.join('|')})$`);
        for (const entry of entries) {
            let key = entry[0];
            const value = entry[1];
            let endpointName = parsedTopic.endpoint;
            let localTarget = target;
            let endpointOrGroupID = utils_1.default.isEndpoint(target) ? target.ID : target.groupID;
            // When the key has a endpointName included (e.g. state_right), this will override the target.
            const propertyEndpointMatch = key.match(propertyEndpointRegex);
            if (re instanceof device_1.default && propertyEndpointMatch) {
                endpointName = propertyEndpointMatch[2];
                key = propertyEndpointMatch[1];
                localTarget = re.endpoint(endpointName);
                endpointOrGroupID = localTarget.ID;
            }
            if (!usedConverters.hasOwnProperty(endpointOrGroupID))
                usedConverters[endpointOrGroupID] = [];
            /* istanbul ignore next */
            const converter = converters.find((c) => c.key.includes(key) && (!c.endpoint || c.endpoint == endpointName));
            if (parsedTopic.type === 'set' && usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter for set only once
                // (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }
            if (!converter) {
                logger_1.default.error(`No converter available for '${key}' (${(0, json_stable_stringify_without_jsonify_1.default)(message[key])})`);
                continue;
            }
            // If the endpoint_name name is a number, try to map it to a friendlyName
            if (!isNaN(Number(endpointName)) && re.isDevice() && utils_1.default.isEndpoint(localTarget) && re.endpointName(localTarget)) {
                endpointName = re.endpointName(localTarget);
            }
            // Converter didn't return a result, skip
            const entitySettingsKeyValue = entitySettings;
            const meta = {
                endpoint_name: endpointName,
                options: entitySettingsKeyValue,
                message: { ...message },
                logger: logger_1.default,
                device,
                state: entityState,
                membersState,
                mapped: definition,
            };
            // Strip endpoint name from meta.message properties.
            if (endpointName) {
                for (const [key, value] of Object.entries(meta.message)) {
                    if (key.endsWith(endpointName)) {
                        delete meta.message[key];
                        const keyWithoutEndpoint = key.substring(0, key.length - endpointName.length - 1);
                        meta.message[keyWithoutEndpoint] = value;
                    }
                }
            }
            try {
                if (parsedTopic.type === 'set' && converter.convertSet) {
                    logger_1.default.debug(`Publishing '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    const result = await converter.convertSet(localTarget, key, value, meta);
                    const optimistic = !entitySettings.hasOwnProperty('optimistic') || entitySettings.optimistic;
                    if (result && result.state && optimistic) {
                        const msg = result.state;
                        if (endpointName) {
                            for (const key of Object.keys(msg)) {
                                msg[`${key}_${endpointName}`] = msg[key];
                                delete msg[key];
                            }
                        }
                        // filter out attribute listed in filtered_optimistic
                        utils_1.default.filterProperties(entitySettings.filtered_optimistic, msg);
                        addToToPublish(re, msg);
                    }
                    if (result && result.membersState && optimistic) {
                        for (const [ieeeAddr, state] of Object.entries(result.membersState)) {
                            addToToPublish(this.zigbee.resolveEntity(ieeeAddr), state);
                        }
                    }
                    this.legacyRetrieveState(re, converter, result, localTarget, key, meta);
                }
                else if (parsedTopic.type === 'get' && converter.convertGet) {
                    logger_1.default.debug(`Publishing get '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    await converter.convertGet(localTarget, key, meta);
                }
                else {
                    logger_1.default.error(`No converter available for '${parsedTopic.type}' '${key}' (${message[key]})`);
                    continue;
                }
            }
            catch (error) {
                const message = `Publish '${parsedTopic.type}' '${key}' to '${re.name}' failed: '${error}'`;
                logger_1.default.error(message);
                logger_1.default.debug(error.stack);
                await this.legacyLog({ type: `zigbee_publish_error`, message, meta: { friendly_name: re.name } });
            }
            usedConverters[endpointOrGroupID].push(converter);
        }
        for (const [ID, payload] of Object.entries(toPublish)) {
            if (Object.keys(payload).length != 0) {
                await this.publishEntityState(toPublishEntity[ID], payload);
            }
        }
        const scenesChanged = Object.values(usedConverters).some((cl) => cl.some((c) => c.key.some((k) => sceneConverterKeys.includes(k))));
        if (scenesChanged) {
            this.eventBus.emitScenesChanged({ entity: re });
        }
    }
}
exports.default = Publish;
__decorate([
    bind_decorator_1.default
], Publish.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcHVibGlzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsZ0VBQWtEO0FBQ2xELGdGQUFrRTtBQUVsRSw2REFBcUM7QUFDckMsMkRBQW1DO0FBQ25DLDREQUFvQztBQUNwQywyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLDREQUFvQztBQUVwQyxJQUFJLGdCQUF3QixDQUFDO0FBQzdCLDZFQUE2RTtBQUN0RSxNQUFNLG9CQUFvQixHQUFHLEdBQVMsRUFBRTtJQUMzQyxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSx1Q0FBdUMsQ0FBQyxDQUFDO0FBQzdHLENBQUMsQ0FBQztBQUZXLFFBQUEsb0JBQW9CLHdCQUUvQjtBQUNGLElBQUEsNEJBQW9CLEdBQUUsQ0FBQztBQUV2QixNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN2RixNQUFNLGtCQUFrQixHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFFNUcsb0hBQW9IO0FBQ3BILE1BQU0sc0JBQXNCLEdBQUc7SUFDM0IsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7SUFDbkMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUI7SUFDbEMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsaUNBQWlDO0lBQ3BELEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCO0lBQzlCLEdBQUcsQ0FB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