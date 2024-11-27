"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testing = exports.LOG_LEVELS = exports.schema = void 0;
exports.validate = validate;
exports.get = get;
exports.set = set;
exports.apply = apply;
exports.getGroup = getGroup;
exports.getGroups = getGroups;
exports.getDevice = getDevice;
exports.addDevice = addDevice;
exports.addDeviceToPasslist = addDeviceToPasslist;
exports.blockDevice = blockDevice;
exports.removeDevice = removeDevice;
exports.addGroup = addGroup;
exports.addDeviceToGroup = addDeviceToGroup;
exports.removeDeviceFromGroup = removeDeviceFromGroup;
exports.removeGroup = removeGroup;
exports.changeEntityOptions = changeEntityOptions;
exports.changeFriendlyName = changeFriendlyName;
exports.reRead = reRead;
const ajv_1 = __importDefault(require("ajv"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const path_1 = __importDefault(require("path"));
const data_1 = __importDefault(require("./data"));
const settings_schema_json_1 = __importDefault(require("./settings.schema.json"));
const utils_1 = __importDefault(require("./utils"));
const yaml_1 = __importDefault(require("./yaml"));
exports.schema = settings_schema_json_1.default;
// @ts-ignore
exports.schema = {};
(0, object_assign_deep_1.default)(exports.schema, settings_schema_json_1.default);
// Remove legacy settings from schema
{
    delete exports.schema.properties.advanced.properties.homeassistant_discovery_topic;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_entity_attributes;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_triggers;
    delete exports.schema.properties.advanced.properties.homeassistant_status_topic;
    delete exports.schema.properties.advanced.properties.soft_reset_timeout;
    delete exports.schema.properties.advanced.properties.report;
    delete exports.schema.properties.advanced.properties.baudrate;
    delete exports.schema.properties.advanced.properties.rtscts;
    delete exports.schema.properties.advanced.properties.ikea_ota_use_test_url;
    delete exports.schema.properties.experimental;
    delete settings_schema_json_1.default.properties.whitelist;
    delete settings_schema_json_1.default.properties.ban;
}
/** NOTE: by order of priority, lower index is lower level (more important) */
exports.LOG_LEVELS = ['error', 'warning', 'info', 'debug'];
// DEPRECATED ZIGBEE2MQTT_CONFIG: https://github.com/Koenkk/zigbee2mqtt/issues/4697
const file = process.env.ZIGBEE2MQTT_CONFIG ?? data_1.default.joinPath('configuration.yaml');
const NULLABLE_SETTINGS = ['homeassistant'];
const ajvSetting = new ajv_1.default({ allErrors: true }).addKeyword('requiresRestart').compile(settings_schema_json_1.default);
const ajvRestartRequired = new ajv_1.default({ allErrors: true }).addKeyword({ keyword: 'requiresRestart', validate: (s) => !s }).compile(settings_schema_json_1.default);
const ajvRestartRequiredDeviceOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s })
    .compile(settings_schema_json_1.default.definitions.device);
const ajvRestartRequiredGroupOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s })
    .compile(settings_schema_json_1.default.definitions.group);
const defaults = {
    permit_join: false,
    external_converters: [],
    mqtt: {
        base_topic: 'zigbee2mqtt',
        include_device_information: false,
        force_disable_retain: false,
    },
    serial: {
        disable_led: false,
    },
    passlist: [],
    blocklist: [],
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: '#fff8ce',
                    coordinator: '#e04e5d',
                    router: '#4ea3e0',
                },
                font: {
                    coordinator: '#ffffff',
                    router: '#ffffff',
                    enddevice: '#000000',
                },
                line: {
                    active: '#009900',
                    inactive: '#994444',
                },
            },
        },
    },
    ota: {
        update_check_interval: 24 * 60,
        disable_automatic_update_check: false,
    },
    device_options: {},
    advanced: {
        legacy_api: true,
        legacy_availability_payload: true,
        log_rotation: true,
        log_symlink_current: false,
        log_output: ['console', 'file'],
        log_directory: path_1.default.join(data_1.default.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.log',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        log_namespaced_levels: {},
        log_syslog: {},
        log_debug_to_mqtt_frontend: false,
        log_debug_namespace_ignore: '',
        pan_id: 0x1a62,
        ext_pan_id: [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd],
        channel: 11,
        adapter_concurrent: null,
        adapter_delay: null,
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,
        last_seen: 'disable',
        elapsed: false,
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
        output: 'json',
        // Everything below is deprecated
        availability_blocklist: [],
        availability_passlist: [],
        availability_blacklist: [],
        availability_whitelist: [],
        soft_reset_timeout: 0,
        report: false,
    },
};
let _settings;
let _settingsWithDefaults;
function loadSettingsWithDefaults() {
    _settingsWithDefaults = (0, object_assign_deep_1.default)({}, defaults, getInternalSettings());
    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }
    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
    }
    if (_settingsWithDefaults.homeassistant) {
        const defaults = { discovery_topic: 'homeassistant', status_topic: 'hass/status', legacy_entity_attributes: true, legacy_triggers: true };
        const sLegacy = {};
        if (_settingsWithDefaults.advanced) {
            for (const key of [
                'homeassistant_legacy_triggers',
                'homeassistant_discovery_topic',
                'homeassistant_legacy_entity_attributes',
                'homeassistant_status_topic',
            ]) {
                // @ts-ignore
                if (_settingsWithDefaults.advanced[key] !== undefined) {
                    // @ts-ignore
                    sLegacy[key.replace('homeassistant_', '')] = _settingsWithDefaults.advanced[key];
                }
            }
        }
        const s = typeof _settingsWithDefaults.homeassistant === 'object' ? _settingsWithDefaults.homeassistant : {};
        // @ts-ignore
        _settingsWithDefaults.homeassistant = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.homeassistant, defaults, sLegacy, s);
    }
    if (_settingsWithDefaults.availability || _settingsWithDefaults.advanced?.availability_timeout) {
        const defaults = {};
        const s = typeof _settingsWithDefaults.availability === 'object' ? _settingsWithDefaults.availability : {};
        // @ts-ignore
        _settingsWithDefaults.availability = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.availability, defaults, s);
    }
    if (_settingsWithDefaults.frontend) {
        const defaults = { port: 8080, auth_token: false };
        const s = typeof _settingsWithDefaults.frontend === 'object' ? _settingsWithDefaults.frontend : {};
        // @ts-ignore
        _settingsWithDefaults.frontend = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.frontend, defaults, s);
    }
    if (_settings.advanced?.hasOwnProperty('baudrate') && _settings.serial?.baudrate == null) {
        // @ts-ignore
        _settingsWithDefaults.serial.baudrate = _settings.advanced.baudrate;
    }
    if (_settings.advanced?.hasOwnProperty('rtscts') && _settings.serial?.rtscts == null) {
        // @ts-ignore
        _settingsWithDefaults.serial.rtscts = _settings.advanced.rtscts;
    }
    if (_settings.advanced?.hasOwnProperty('ikea_ota_use_test_url') && _settings.ota?.ikea_ota_use_test_url == null) {
        // @ts-ignore
        _settingsWithDefaults.ota.ikea_ota_use_test_url = _settings.advanced.ikea_ota_use_test_url;
    }
    // @ts-ignore
    if (_settings.experimental?.hasOwnProperty('transmit_power') && _settings.advanced?.transmit_power == null) {
        // @ts-ignore
        _settingsWithDefaults.advanced.transmit_power = _settings.experimental.transmit_power;
    }
    // @ts-ignore
    if (_settings.experimental?.hasOwnProperty('output') && _settings.advanced?.output == null) {
        // @ts-ignore
        _settingsWithDefaults.advanced.output = _settings.experimental.output;
    }
    if (_settings.advanced?.log_level === 'warn') {
        _settingsWithDefaults.advanced.log_level = 'warning';
    }
    // @ts-ignore
    _settingsWithDefaults.ban && _settingsWithDefaults.blocklist.push(..._settingsWithDefaults.ban);
    // @ts-ignore
    _settingsWithDefaults.whitelist && _settingsWithDefaults.passlist.push(..._settingsWithDefaults.whitelist);
}
function parseValueRef(text) {
    const match = /!(.*) (.*)/g.exec(text);
    if (match) {
        let filename = match[1];
        // This is mainly for backward compatibility.
        if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
            filename += '.yaml';
        }
        return { filename, key: match[2] };
    }
    else {
        return null;
    }
}
function write() {
    const settings = getInternalSettings();
    const toWrite = (0, object_assign_deep_1.default)({}, settings);
    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml_1.default.read(file);
    // In case the setting is defined in a separate file (e.g. !secret network_key) update it there.
    for (const path of [
        ['mqtt', 'server'],
        ['mqtt', 'user'],
        ['mqtt', 'password'],
        ['advanced', 'network_key'],
        ['frontend', 'auth_token'],
    ]) {
        if (actual[path[0]] && actual[path[0]][path[1]]) {
            const ref = parseValueRef(actual[path[0]][path[1]]);
            if (ref) {
                yaml_1.default.updateIfChanged(data_1.default.joinPath(ref.filename), ref.key, toWrite[path[0]][path[1]]);
                toWrite[path[0]][path[1]] = actual[path[0]][path[1]];
            }
        }
    }
    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type) => {
        if (typeof actual[type] === 'string' || (Array.isArray(actual[type]) && actual[type].length > 0)) {
            const fileToWrite = Array.isArray(actual[type]) ? actual[type][0] : actual[type];
            const content = (0, object_assign_deep_1.default)({}, settings[type]);
            // If an array, only write to first file and only devices which are not in the other files.
            if (Array.isArray(actual[type])) {
                actual[type]
                    .filter((f, i) => i !== 0)
                    .map((f) => yaml_1.default.readIfExists(data_1.default.joinPath(f), {}))
                    .map((c) => Object.keys(c))
                    // @ts-ignore
                    .forEach((k) => delete content[k]);
            }
            yaml_1.default.writeIfChanged(data_1.default.joinPath(fileToWrite), content);
            toWrite[type] = actual[type];
        }
    };
    writeDevicesOrGroups('devices');
    writeDevicesOrGroups('groups');
    yaml_1.default.writeIfChanged(file, toWrite);
    _settings = read();
    loadSettingsWithDefaults();
}
function validate() {
    try {
        getInternalSettings();
    }
    catch (error) {
        if (error.name === 'YAMLException') {
            return [`Your YAML file: '${error.file}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`];
        }
        return [error.message];
    }
    if (!ajvSetting(_settings)) {
        return ajvSetting.errors.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }
    const errors = [];
    if (_settings.advanced &&
        _settings.advanced.network_key &&
        typeof _settings.advanced.network_key === 'string' &&
        _settings.advanced.network_key !== 'GENERATE') {
        errors.push(`advanced.network_key: should be array or 'GENERATE' (is '${_settings.advanced.network_key}')`);
    }
    if (_settings.advanced &&
        _settings.advanced.pan_id &&
        typeof _settings.advanced.pan_id === 'string' &&
        _settings.advanced.pan_id !== 'GENERATE') {
        errors.push(`advanced.pan_id: should be number or 'GENERATE' (is '${_settings.advanced.pan_id}')`);
    }
    if (_settings.advanced &&
        _settings.advanced.ext_pan_id &&
        typeof _settings.advanced.ext_pan_id === 'string' &&
        _settings.advanced.ext_pan_id !== 'GENERATE') {
        errors.push(`advanced.ext_pan_id: should be array or 'GENERATE' (is '${_settings.advanced.ext_pan_id}')`);
    }
    // Verify that all friendly names are unique
    const names = [];
    const check = (e) => {
        if (names.includes(e.friendly_name))
            errors.push(`Duplicate friendly_name '${e.friendly_name}' found`);
        errors.push(...utils_1.default.validateFriendlyName(e.friendly_name));
        names.push(e.friendly_name);
        if (e.qos != null && ![0, 1, 2].includes(e.qos)) {
            errors.push(`QOS for '${e.friendly_name}' not valid, should be 0, 1 or 2 got ${e.qos}`);
        }
    };
    const settingsWithDefaults = get();
    Object.values(settingsWithDefaults.devices).forEach((d) => check(d));
    Object.values(settingsWithDefaults.groups).forEach((g) => check(g));
    if (settingsWithDefaults.mqtt.version !== 5) {
        for (const device of Object.values(settingsWithDefaults.devices)) {
            if (device.retention) {
                errors.push('MQTT retention requires protocol version 5');
            }
        }
    }
    const checkAvailabilityList = (list, type) => {
        list.forEach((e) => {
            if (!getDevice(e)) {
                errors.push(`Non-existing entity '${e}' specified in '${type}'`);
            }
        });
    };
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blacklist, 'availability_blacklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_whitelist, 'availability_whitelist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blocklist, 'availability_blocklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_passlist, 'availability_passlist');
    return errors;
}
function read() {
    const s = yaml_1.default.read(file);
    applyEnvironmentVariables(s);
    // Read !secret MQTT username and password if set
    // eslint-disable-next-line
    const interpretValue = (value) => {
        const ref = parseValueRef(value);
        if (ref) {
            return yaml_1.default.read(data_1.default.joinPath(ref.filename))[ref.key];
        }
        else {
            return value;
        }
    };
    if (s.mqtt?.user) {
        s.mqtt.user = interpretValue(s.mqtt.user);
    }
    if (s.mqtt?.password) {
        s.mqtt.password = interpretValue(s.mqtt.password);
    }
    if (s.mqtt?.server) {
        s.mqtt.server = interpretValue(s.mqtt.server);
    }
    if (s.advanced?.network_key) {
        s.advanced.network_key = interpretValue(s.advanced.network_key);
    }
    if (s.frontend?.auth_token) {
        s.frontend.auth_token = interpretValue(s.frontend.auth_token);
    }
    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type) => {
        if (typeof s[type] === 'string' || (Array.isArray(s[type]) && Array(s[type]).length > 0)) {
            /* eslint-disable-line */ // @ts-ignore
            const files = Array.isArray(s[type]) ? s[type] : [s[type]];
            s[type] = {};
            for (const file of files) {
                const content = yaml_1.default.readIfExists(data_1.default.joinPath(file), {});
                /* eslint-disable-line */ // @ts-ignore
                s[type] = object_assign_deep_1.default.noMutate(s[type], content);
            }
        }
    };
    readDevicesOrGroups('devices');
    readDevicesOrGroups('groups');
    return s;
}
function applyEnvironmentVariables(settings) {
    const iterate = (obj, path) => {
        Object.keys(obj).forEach((key) => {
            if (key !== 'type') {
                if (key !== 'properties' && obj[key]) {
                    const type = (obj[key].type || 'object').toString();
                    const envPart = path.reduce((acc, val) => `${acc}${val}_`, '');
                    const envVariableName = `ZIGBEE2MQTT_CONFIG_${envPart}${key}`.toUpperCase();
                    if (process.env[envVariableName]) {
                        const setting = path.reduce((acc, val) => {
                            /* eslint-disable-line */ // @ts-ignore
                            acc[val] = acc[val] || {};
                            /* eslint-disable-line */ // @ts-ignore
                            return acc[val];
                        }, settings);
                        if (type.indexOf('object') >= 0 || type.indexOf('array') >= 0) {
                            try {
                                setting[key] = JSON.parse(process.env[envVariableName]);
                            }
                            catch (error) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                        else if (type.indexOf('number') >= 0) {
                            /* eslint-disable-line */ // @ts-ignore
                            setting[key] = process.env[envVariableName] * 1;
                        }
                        else if (type.indexOf('boolean') >= 0) {
                            setting[key] = process.env[envVariableName].toLowerCase() === 'true';
                        }
                        else {
                            /* istanbul ignore else */
                            if (type.indexOf('string') >= 0) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                    }
                }
                if (typeof obj[key] === 'object' && obj[key]) {
                    const newPath = [...path];
                    if (key !== 'properties' && key !== 'oneOf' && !Number.isInteger(Number(key))) {
                        newPath.push(key);
                    }
                    iterate(obj[key], newPath);
                }
            }
        });
    };
    iterate(settings_schema_json_1.default.properties, []);
}
function getInternalSettings() {
    if (!_settings) {
        _settings = read();
    }
    return _settings;
}
function get() {
    if (!_settingsWithDefaults) {
        loadSettingsWithDefaults();
    }
    return _settingsWithDefaults;
}
function set(path, value) {
    /* eslint-disable-next-line */
    let settings = getInternalSettings();
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            settings[key] = value;
        }
        else {
            if (!settings[key]) {
                settings[key] = {};
            }
            settings = settings[key];
        }
    }
    write();
}
function apply(settings) {
    getInternalSettings(); // Ensure _settings is initialized.
    /* eslint-disable-line */ // @ts-ignore
    const newSettings = object_assign_deep_1.default.noMutate(_settings, settings);
    utils_1.default.removeNullPropertiesFromObject(newSettings, NULLABLE_SETTINGS);
    ajvSetting(newSettings);
    const errors = ajvSetting.errors && ajvSetting.errors.filter((e) => e.keyword !== 'required');
    if (errors?.length) {
        const error = errors[0];
        throw new Error(`${error.instancePath.substring(1)} ${error.message}`);
    }
    _settings = newSettings;
    write();
    ajvRestartRequired(settings);
    const restartRequired = ajvRestartRequired.errors && !!ajvRestartRequired.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
function getGroup(IDorName) {
    const settings = get();
    const byID = settings.groups[IDorName];
    if (byID) {
        return { devices: [], ...byID, ID: Number(IDorName) };
    }
    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return { devices: [], ...group, ID: Number(ID) };
        }
    }
    return null;
}
function getGroups() {
    const settings = get();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return { devices: [], ...group, ID: Number(ID) };
    });
}
function getGroupThrowIfNotExists(IDorName) {
    const group = getGroup(IDorName);
    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }
    return group;
}
function getDevice(IDorName) {
    const settings = get();
    const byID = settings.devices[IDorName];
    if (byID) {
        return { ...byID, ID: IDorName };
    }
    for (const [ID, device] of Object.entries(settings.devices)) {
        if (device.friendly_name === IDorName) {
            return { ...device, ID };
        }
    }
    return null;
}
function getDeviceThrowIfNotExists(IDorName) {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }
    return device;
}
function addDevice(ID) {
    if (getDevice(ID)) {
        throw new Error(`Device '${ID}' already exists`);
    }
    const settings = getInternalSettings();
    if (!settings.devices) {
        settings.devices = {};
    }
    settings.devices[ID] = { friendly_name: ID };
    write();
    return getDevice(ID);
}
function addDeviceToPasslist(ID) {
    const settings = getInternalSettings();
    if (!settings.passlist) {
        settings.passlist = [];
    }
    if (settings.passlist.includes(ID)) {
        throw new Error(`Device '${ID}' already in passlist`);
    }
    settings.passlist.push(ID);
    write();
}
function blockDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }
    settings.blocklist.push(ID);
    write();
}
function removeDevice(IDorName) {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = getInternalSettings();
    delete settings.devices[device.ID];
    // Remove device from groups
    if (settings.groups) {
        const regex = new RegExp(`^(${device.friendly_name}|${device.ID})(/[^/]+)?$`);
        for (const group of Object.values(settings.groups).filter((g) => g.devices)) {
            group.devices = group.devices.filter((device) => !device.match(regex));
        }
    }
    write();
}
function addGroup(name, ID) {
    utils_1.default.validateFriendlyName(name, true);
    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }
    const settings = getInternalSettings();
    if (!settings.groups) {
        settings.groups = {};
    }
    if (ID == null) {
        // look for free ID
        ID = '1';
        while (settings.groups.hasOwnProperty(ID)) {
            ID = (Number.parseInt(ID) + 1).toString();
        }
    }
    else {
        // ensure provided ID is not in use
        ID = ID.toString();
        if (settings.groups.hasOwnProperty(ID)) {
            throw new Error(`Group ID '${ID}' is already in use`);
        }
    }
    settings.groups[ID] = { friendly_name: name };
    write();
    return getGroup(ID);
}
function groupGetDevice(group, keys) {
    for (const device of group.devices ?? []) {
        if (keys.includes(device))
            return device;
    }
    return null;
}
function addDeviceToGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!groupGetDevice(group, keys)) {
        if (!group.devices)
            group.devices = [];
        group.devices.push(keys[0]);
        write();
    }
}
function removeDeviceFromGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!group.devices) {
        return;
    }
    const key = groupGetDevice(group, keys);
    if (key) {
        group.devices = group.devices.filter((d) => d != key);
        write();
    }
}
function removeGroup(IDorName) {
    const groupID = getGroupThrowIfNotExists(IDorName.toString()).ID;
    const settings = getInternalSettings();
    delete settings.groups[groupID];
    write();
}
function changeEntityOptions(IDorName, newOptions) {
    const settings = getInternalSettings();
    delete newOptions.friendly_name;
    delete newOptions.devices;
    let validator;
    if (getDevice(IDorName)) {
        (0, object_assign_deep_1.default)(settings.devices[getDevice(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.devices[getDevice(IDorName).ID], NULLABLE_SETTINGS);
        validator = ajvRestartRequiredDeviceOptions;
    }
    else if (getGroup(IDorName)) {
        (0, object_assign_deep_1.default)(settings.groups[getGroup(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.groups[getGroup(IDorName).ID], NULLABLE_SETTINGS);
        validator = ajvRestartRequiredGroupOptions;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
    validator(newOptions);
    const restartRequired = validator.errors && !!validator.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
function changeFriendlyName(IDorName, newName) {
    utils_1.default.validateFriendlyName(newName, true);
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }
    const settings = getInternalSettings();
    if (getDevice(IDorName)) {
        settings.devices[getDevice(IDorName).ID].friendly_name = newName;
    }
    else if (getGroup(IDorName)) {
        settings.groups[getGroup(IDorName).ID].friendly_name = newName;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
}
function reRead() {
    _settings = null;
    getInternalSettings();
    _settingsWithDefaults = null;
    get();
}
exports.testing = {
    write,
    clear: () => {
        _settings = null;
        _settingsWithDefaults = null;
    },
    defaults,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFxUkEsNEJBZ0ZDO0FBa0hELGtCQU1DO0FBRUQsa0JBa0JDO0FBRUQsc0JBa0JDO0FBRUQsNEJBY0M7QUFFRCw4QkFLQztBQVdELDhCQWNDO0FBV0QsOEJBY0M7QUFFRCxrREFZQztBQUVELGtDQVFDO0FBRUQsb0NBY0M7QUFFRCw0QkE2QkM7QUFVRCw0Q0FVQztBQUVELHNEQWFDO0FBRUQsa0NBS0M7QUFFRCxrREFxQkM7QUFFRCxnREFnQkM7QUFFRCx3QkFLQztBQS91QkQsOENBQTBDO0FBQzFDLDRFQUFrRDtBQUNsRCxnREFBd0I7QUFFeEIsa0RBQTBCO0FBQzFCLGtGQUFnRDtBQUNoRCxvREFBNEI7QUFDNUIsa0RBQTBCO0FBQ2YsUUFBQSxNQUFNLEdBQUcsOEJBQVUsQ0FBQztBQUMvQixhQUFhO0FBQ2IsY0FBTSxHQUFHLEVBQUUsQ0FBQztBQUNaLElBQUEsNEJBQWdCLEVBQUMsY0FBTSxFQUFFLDhCQUFVLENBQUMsQ0FBQztBQUVyQyxxQ0FBcUM7QUFDckMsQ0FBQztJQUNHLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDO0lBQzNFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLHNDQUFzQyxDQUFDO0lBQ3BGLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDO0lBQzNFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDO0lBQ3hFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDO0lBQ2hFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FB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