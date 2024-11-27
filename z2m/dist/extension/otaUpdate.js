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
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const path_1 = __importDefault(require("path"));
const URI = __importStar(require("uri-js"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const zhc = __importStar(require("zigbee-herdsman-converters"));
const device_1 = __importDefault(require("../model/device"));
const data_1 = __importDefault(require("../util/data"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
function isValidUrl(url) {
    let parsed;
    try {
        parsed = URI.parse(url);
    }
    catch (_) {
        // istanbul ignore next
        return false;
    }
    return parsed.scheme === 'http' || parsed.scheme === 'https';
}
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');
class OTAUpdate extends extension_1.default {
    inProgress = new Set();
    lastChecked = {};
    legacyApi = settings.get().advanced.legacy_api;
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        if (settings.get().ota.ikea_ota_use_test_url) {
            zhc.ota.tradfri.useTestURL();
        }
        // Let zigbeeOTA module know if the override index file is provided
        let overrideOTAIndex = settings.get().ota.zigbee_ota_override_index_location;
        if (overrideOTAIndex) {
            // If the file name is not a full path, then treat it as a relative to the data directory
            if (!isValidUrl(overrideOTAIndex) && !path_1.default.isAbsolute(overrideOTAIndex)) {
                overrideOTAIndex = data_1.default.joinPath(overrideOTAIndex);
            }
            zhc.ota.zigbeeOTA.useIndexOverride(overrideOTAIndex);
        }
        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        zhc.ota.setDataDir(data_1.default.getPath());
        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state.
        // remove them.
        for (const device of this.zigbee.devices(false)) {
            this.removeProgressAndRemainingFromState(device);
            // Reset update state, e.g. when Z2M restarted during update.
            if (this.state.get(device).update?.state === 'updating') {
                this.state.get(device).update.state = 'available';
            }
        }
    }
    removeProgressAndRemainingFromState(device) {
        delete this.state.get(device).update?.progress;
        delete this.state.get(device).update?.remaining;
    }
    async onZigbeeEvent(data) {
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition || this.inProgress.has(data.device.ieeeAddr))
            return;
        logger_1.default.debug(`Device '${data.device.name}' requested OTA`);
        const automaticOTACheckDisabled = settings.get().ota.disable_automatic_update_check;
        let supportsOTA = !!data.device.definition.ota;
        if (supportsOTA && !automaticOTACheckDisabled) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr)
                ? Date.now() - this.lastChecked[data.device.ieeeAddr] > updateCheckInterval
                : true;
            if (!check)
                return;
            this.lastChecked[data.device.ieeeAddr] = Date.now();
            let availableResult = null;
            try {
                availableResult = await data.device.definition.ota.isUpdateAvailable(data.device.zh, data.data);
            }
            catch (e) {
                supportsOTA = false;
                logger_1.default.debug(`Failed to check if update available for '${data.device.name}' (${e.message})`);
            }
            const payload = this.getEntityPublishPayload(data.device, availableResult ?? 'idle');
            await this.publishEntityState(data.device, payload);
            if (availableResult?.available) {
                const message = `Update available for '${data.device.name}'`;
                logger_1.default.info(message);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: 'available', device: data.device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                }
            }
        }
        // Respond to stop the client from requesting OTAs
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta')) || data.endpoint;
        await endpoint.commandResponse('genOta', 'queryNextImageResponse', { status: zigbee_herdsman_1.Zcl.Status.NO_IMAGE_AVAILABLE }, undefined, data.meta.zclTransactionSequenceNumber);
        logger_1.default.debug(`Responded to OTA request of '${data.device.name}' with 'NO_IMAGE_AVAILABLE'`);
    }
    async readSoftwareBuildIDAndDateCode(device, sendPolicy) {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId'], { sendPolicy });
            return { softwareBuildID: result.swBuildId, dateCode: result.dateCode };
        }
        catch (e) {
            return null;
        }
    }
    getEntityPublishPayload(device, state, progress = null, remaining = null) {
        const deviceUpdateState = this.state.get(device).update;
        const payload = {
            update: {
                state: typeof state === 'string' ? state : state.available ? 'available' : 'idle',
                installed_version: typeof state === 'string' ? deviceUpdateState?.installed_version : state.currentFileVersion,
                latest_version: typeof state === 'string' ? deviceUpdateState?.latest_version : state.otaFileVersion,
            },
        };
        if (progress !== null)
            payload.update.progress = progress;
        if (remaining !== null)
            payload.update.remaining = Math.round(remaining);
        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = typeof state === 'string' ? state === 'available' : state.available;
        }
        return payload;
    }
    async onMQTTMessage(data) {
        if ((!this.legacyApi || !data.topic.match(legacyTopicRegex)) && !data.topic.match(topicRegex)) {
            return null;
        }
        const message = utils_1.default.parseJSON(data.message, data.message);
        const ID = (typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message);
        const device = this.zigbee.resolveEntity(ID);
        const type = data.topic.substring(data.topic.lastIndexOf('/') + 1);
        const responseData = { id: ID };
        let error = null;
        let errorStack = null;
        if (!(device instanceof device_1.default)) {
            error = `Device '${ID}' does not exist`;
        }
        else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;
            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = { status: `not_supported`, device: device.name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
            }
        }
        else if (this.inProgress.has(device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${device.name}'`;
        }
        else {
            this.inProgress.add(device.ieeeAddr);
            if (type === 'check') {
                const msg = `Checking if update available for '${device.name}'`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `checking_if_available`, device: device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const availableResult = await device.definition.ota.isUpdateAvailable(device.zh, null);
                    const msg = `${availableResult.available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger_1.default.info(msg);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {
                            status: availableResult.available ? 'available' : 'not_available',
                            device: device.name,
                        };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                    }
                    const payload = this.getEntityPublishPayload(device, availableResult);
                    await this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = availableResult.available;
                }
                catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${e.message})`;
                    errorStack = e.stack;
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `check_failed`, device: device.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            else {
                // type === 'update'
                const msg = `Updating '${device.name}' to latest firmware`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `update_in_progress`, device: device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const onProgress = async (progress, remaining) => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }
                        logger_1.default.info(msg);
                        const payload = this.getEntityPublishPayload(device, 'updating', progress, remaining);
                        await this.publishEntityState(device, payload);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = { status: `update_progress`, device: device.name, progress };
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                        }
                    };
                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    const fileVersion = await device.definition.ota.updateToLatest(device.zh, onProgress);
                    logger_1.default.info(`Finished update of '${device.name}'`);
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, {
                        available: false,
                        currentFileVersion: fileVersion,
                        otaFileVersion: fileVersion,
                    });
                    await this.publishEntityState(device, payload);
                    const to = await this.readSoftwareBuildIDAndDateCode(device);
                    const [fromS, toS] = [(0, json_stable_stringify_without_jsonify_1.default)(from_), (0, json_stable_stringify_without_jsonify_1.default)(to)];
                    logger_1.default.info(`Device '${device.name}' was updated from '${fromS}' to '${toS}'`);
                    responseData.from = from_ ? utils_1.default.toSnakeCase(from_) : null;
                    responseData.to = to ? utils_1.default.toSnakeCase(to) : null;
                    /**
                     * Re-configure after reading software build ID and date code, some devices use a
                     * custom attribute for this (e.g. Develco SMSZB-120)
                     */
                    this.eventBus.emitReconfigure({ device });
                    this.eventBus.emitDevicesChanged();
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_succeeded`, device: device.name, from: from_, to };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                    }
                }
                catch (e) {
                    logger_1.default.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${e.message})`;
                    errorStack = e.stack;
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, 'available');
                    await this.publishEntityState(device, payload);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_failed`, device: device.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            this.inProgress.delete(device.ieeeAddr);
        }
        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
            errorStack && logger_1.default.debug(errorStack);
        }
    }
}
exports.default = OTAUpdate;
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onZigbeeEvent", null);
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3RhVXBkYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9vdGFVcGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsZ0RBQXdCO0FBQ3hCLDRDQUE4QjtBQUM5QixxREFBb0M7QUFDcEMsZ0VBQWtEO0FBRWxELDZEQUFxQztBQUNyQyx3REFBbUM7QUFDbkMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLFNBQVMsVUFBVSxDQUFDLEdBQVc7SUFDM0IsSUFBSSxNQUFNLENBQUM7SUFDWCxJQUFJLENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNULHVCQUF1QjtRQUN2QixPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQztBQUNqRSxDQUFDO0FBZUQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSx3QkFBd0IsQ0FBQyxDQUFDO0FBQ2hHLE1BQU0sVUFBVSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGtEQUFrRCxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBRXpILE1BQXFCLFNBQVUsU0FBUSxtQkFBUztJQUNwQyxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUN2QixXQUFXLEdBQTBCLEVBQUUsQ0FBQztJQUN4QyxTQUFTLEdBQUcsUUFB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