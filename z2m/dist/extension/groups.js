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
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
const LEGACY_TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const LEGACY_TOPIC_REGEX_REMOVE_ALL = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);
const STATE_PROPERTIES = {
    state: () => true,
    brightness: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'brightness')),
    color_temp: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'color_temp')),
    color: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    color_mode: (value, exposes) => exposes.some((e) => e.type === 'light' &&
        (e.features.some((f) => f.name === `color_${value}`) || (value === 'color_temp' && e.features.some((f) => f.name === 'color_temp')))),
};
class Groups extends extension_1.default {
    legacyApi = settings.get().advanced.legacy_api;
    lastOptimisticState = {};
    async start() {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.syncGroupsWithSettings();
    }
    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = this.zigbee.groups();
        const addRemoveFromGroup = async (action, deviceName, groupName, endpoint, group) => {
            try {
                logger_1.default.info(`${action === 'add' ? 'Adding' : 'Removing'} '${deviceName}' to group '${groupName}'`);
                if (action === 'remove') {
                    await endpoint.removeFromGroup(group.zh);
                }
                else {
                    await endpoint.addToGroup(group.zh);
                }
            }
            catch (error) {
                logger_1.default.error(`Failed to ${action} '${deviceName}' from '${groupName}'`);
                logger_1.default.debug(error.stack);
            }
        };
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.ID === groupID) || this.zigbee.createGroup(groupID);
            const settingsEndpoints = [];
            for (const d of settingGroup.devices) {
                const parsed = this.zigbee.resolveEntityAndEndpoint(d);
                const device = parsed.entity;
                if (!device) {
                    logger_1.default.error(`Cannot find '${d}' of group '${settingGroup.friendly_name}'`);
                }
                if (!parsed.endpoint) {
                    if (parsed.endpointID) {
                        logger_1.default.error(`Cannot find endpoint '${parsed.endpointID}' of device '${parsed.ID}'`);
                    }
                    continue;
                }
                // In settings but not in zigbee
                if (!zigbeeGroup.zh.hasMember(parsed.endpoint)) {
                    await addRemoveFromGroup('add', device?.name, settingGroup.friendly_name, parsed.endpoint, zigbeeGroup);
                }
                settingsEndpoints.push(parsed.endpoint);
            }
            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.zh.members) {
                if (!settingsEndpoints.includes(endpoint)) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                    await addRemoveFromGroup('remove', deviceName, settingGroup.friendly_name, endpoint, zigbeeGroup);
                }
            }
        }
        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.some((g) => g.ID === zigbeeGroup.ID)) {
                for (const endpoint of zigbeeGroup.zh.members) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                    await addRemoveFromGroup('remove', deviceName, zigbeeGroup.ID, endpoint, zigbeeGroup);
                }
            }
        }
    }
    async onStateChange(data) {
        const reason = 'groupOptimistic';
        if (data.reason === reason || data.reason === 'publishCached') {
            return;
        }
        const payload = {};
        let endpointName = null;
        const endpointNames = data.entity instanceof device_1.default ? data.entity.getEndpointNames() : [];
        for (let prop of Object.keys(data.update)) {
            const value = data.update[prop];
            const endpointNameMatch = endpointNames.find((n) => prop.endsWith(`_${n}`));
            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }
            if (prop in STATE_PROPERTIES) {
                payload[prop] = value;
            }
        }
        const payloadKeys = Object.keys(payload);
        if (payloadKeys.length) {
            const entity = data.entity;
            const groups = this.zigbee.groups().filter((g) => g.options && (g.options.optimistic == undefined || g.options.optimistic));
            if (entity instanceof device_1.default) {
                for (const group of groups) {
                    if (group.zh.hasMember(entity.endpoint(endpointName)) &&
                        !(0, es6_1.default)(this.lastOptimisticState[group.ID], payload) &&
                        this.shouldPublishPayloadForGroup(group, payload)) {
                        this.lastOptimisticState[group.ID] = payload;
                        await this.publishEntityState(group, payload, reason);
                    }
                }
            }
            else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];
                const groupsToPublish = new Set();
                for (const member of entity.zh.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice());
                    if (device.options.disabled) {
                        continue;
                    }
                    const exposes = device.exposes();
                    const memberPayload = {};
                    for (const key of payloadKeys) {
                        if (STATE_PROPERTIES[key](payload[key], exposes)) {
                            memberPayload[key] = payload[key];
                        }
                    }
                    const endpointName = device.endpointName(member);
                    if (endpointName) {
                        for (const key of Object.keys(memberPayload)) {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        }
                    }
                    await this.publishEntityState(device, memberPayload, reason);
                    for (const zigbeeGroup of groups) {
                        if (zigbeeGroup.zh.hasMember(member) && this.shouldPublishPayloadForGroup(zigbeeGroup, payload)) {
                            groupsToPublish.add(zigbeeGroup);
                        }
                    }
                }
                groupsToPublish.delete(entity);
                for (const group of groupsToPublish) {
                    await this.publishEntityState(group, payload, reason);
                }
            }
        }
    }
    shouldPublishPayloadForGroup(group, payload) {
        return group.options.off_state === 'last_member_state' || !payload || payload.state !== 'OFF' || this.areAllMembersOff(group);
    }
    areAllMembersOff(group) {
        for (const member of group.zh.members) {
            const device = this.zigbee.resolveEntity(member.getDevice());
            if (this.state.exists(device)) {
                const state = this.state.get(device);
                if (state.state === 'ON') {
                    return false;
                }
            }
        }
        return true;
    }
    async parseMQTTMessage(data) {
        let type = null;
        let resolvedEntityGroup = null;
        let resolvedEntityDevice = null;
        let resolvedEntityEndpoint = null;
        let error = null;
        let groupKey = null;
        let deviceKey = null;
        let triggeredViaLegacyApi = false;
        let skipDisableReporting = false;
        /* istanbul ignore else */
        const topicRegexMatch = data.topic.match(TOPIC_REGEX);
        const legacyTopicRegexRemoveAllMatch = data.topic.match(LEGACY_TOPIC_REGEX_REMOVE_ALL);
        const legacyTopicRegexMatch = data.topic.match(LEGACY_TOPIC_REGEX);
        if (this.legacyApi && (legacyTopicRegexMatch || legacyTopicRegexRemoveAllMatch)) {
            triggeredViaLegacyApi = true;
            if (legacyTopicRegexMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(legacyTopicRegexMatch[1]);
                type = legacyTopicRegexMatch[2];
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    logger_1.default.error(`Group '${legacyTopicRegexMatch[1]}' does not exist`);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: data.message, group: legacyTopicRegexMatch[1], error: `group doesn't exists` };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message }));
                    }
                    return null;
                }
            }
            else {
                type = 'remove_all';
            }
            const parsedEntity = this.zigbee.resolveEntityAndEndpoint(data.message);
            resolvedEntityDevice = parsedEntity.entity;
            if (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default)) {
                logger_1.default.error(`Device '${data.message}' does not exist`);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const message = { friendly_name: data.message, group: legacyTopicRegexMatch[1], error: "entity doesn't exists" };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message }));
                }
                return null;
            }
            resolvedEntityEndpoint = parsedEntity.endpoint;
            if (parsedEntity.endpointID && !resolvedEntityEndpoint) {
                logger_1.default.error(`Device '${parsedEntity.ID}' does not have endpoint '${parsedEntity.endpointID}'`);
                return null;
            }
        }
        else if (topicRegexMatch) {
            type = topicRegexMatch[1];
            const message = JSON.parse(data.message);
            deviceKey = message.device;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
            if (type !== 'remove_all') {
                groupKey = message.group;
                resolvedEntityGroup = this.zigbee.resolveEntity(message.group);
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    error = `Group '${message.group}' does not exist`;
                }
            }
            const parsed = this.zigbee.resolveEntityAndEndpoint(message.device);
            resolvedEntityDevice = parsed?.entity;
            if (!error && (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default))) {
                error = `Device '${message.device}' does not exist`;
            }
            if (!error) {
                resolvedEntityEndpoint = parsed.endpoint;
                if (parsed.endpointID && !resolvedEntityEndpoint) {
                    error = `Device '${parsed.ID}' does not have endpoint '${parsed.endpointID}'`;
                }
            }
        }
        return {
            resolvedEntityGroup,
            resolvedEntityDevice,
            type,
            error,
            groupKey,
            deviceKey,
            triggeredViaLegacyApi,
            skipDisableReporting,
            resolvedEntityEndpoint,
        };
    }
    async onMQTTMessage(data) {
        const parsed = await this.parseMQTTMessage(data);
        if (!parsed || !parsed.type) {
            return;
        }
        const { resolvedEntityGroup, resolvedEntityDevice, type, triggeredViaLegacyApi, groupKey, deviceKey, skipDisableReporting, resolvedEntityEndpoint, } = parsed;
        let error = parsed.error;
        let changedGroups = [];
        if (!error) {
            try {
                const keys = [
                    `${resolvedEntityDevice.ieeeAddr}/${resolvedEntityEndpoint.ID}`,
                    `${resolvedEntityDevice.name}/${resolvedEntityEndpoint.ID}`,
                ];
                const endpointNameLocal = resolvedEntityDevice.endpointName(resolvedEntityEndpoint);
                if (endpointNameLocal) {
                    keys.push(`${resolvedEntityDevice.ieeeAddr}/${endpointNameLocal}`);
                    keys.push(`${resolvedEntityDevice.name}/${endpointNameLocal}`);
                }
                if (!endpointNameLocal) {
                    keys.push(resolvedEntityDevice.name);
                    keys.push(resolvedEntityDevice.ieeeAddr);
                }
                if (type === 'add') {
                    logger_1.default.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.addToGroup(resolvedEntityGroup.zh);
                    settings.addDeviceToGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_add`, message }));
                    }
                }
                else if (type === 'remove') {
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.removeFromGroup(resolvedEntityGroup.zh);
                    settings.removeDeviceFromGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove`, message }));
                    }
                }
                else {
                    // remove_all
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from all groups`);
                    changedGroups = this.zigbee.groups().filter((g) => g.zh.members.includes(resolvedEntityEndpoint));
                    await resolvedEntityEndpoint.removeFromAllGroups();
                    for (const settingsGroup of settings.getGroups()) {
                        settings.removeDeviceFromGroup(settingsGroup.ID.toString(), keys);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const message = { friendly_name: resolvedEntityDevice.name };
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove_all`, message }));
                        }
                    }
                }
            }
            catch (e) {
                error = `Failed to ${type} from group (${e.message})`;
                logger_1.default.debug(e.stack);
            }
        }
        if (!triggeredViaLegacyApi) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            const responseData = { device: deviceKey };
            if (groupKey) {
                responseData.group = groupKey;
            }
            await this.mqtt.publish(`bridge/response/group/members/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, responseData, error)));
        }
        if (error) {
            logger_1.default.error(error);
        }
        else {
            for (const group of changedGroups) {
                this.eventBus.emitGroupMembersChanged({ group, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting });
            }
        }
    }
}
exports.default = Groups;
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onStateChange", null);
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXBzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9ncm91cHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyw4REFBeUM7QUFDekMsa0hBQThEO0FBRzlELDZEQUFxQztBQUNyQywyREFBbUM7QUFDbkMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0sV0FBVyxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHdEQUF3RCxDQUFDLENBQUM7QUFDM0gsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSw2Q0FBNkMsQ0FBQyxDQUFDO0FBQ3ZILE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUMsQ0FBQztBQUVoSCxNQUFNLGdCQUFnQixHQUFnRjtJQUNsRyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTtJQUNqQixVQUFVLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsQ0FBQztJQUMxSCxVQUFVLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMs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