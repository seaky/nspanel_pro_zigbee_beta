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
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
/**
 * This extension creates a network map
 */
class NetworkMap extends extension_1.default {
    legacyApi = settings.get().advanced.legacy_api;
    legacyTopic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
    legacyTopicRoutes = `${settings.get().mqtt.base_topic}/bridge/networkmap/routes`;
    topic = `${settings.get().mqtt.base_topic}/bridge/request/networkmap`;
    supportedFormats;
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.supportedFormats = {
            raw: this.raw,
            graphviz: this.graphviz,
            plantuml: this.plantuml,
        };
    }
    async onMQTTMessage(data) {
        /* istanbul ignore else */
        if (this.legacyApi) {
            if ((data.topic === this.legacyTopic || data.topic === this.legacyTopicRoutes) && this.supportedFormats.hasOwnProperty(data.message)) {
                const includeRoutes = data.topic === this.legacyTopicRoutes;
                const topology = await this.networkScan(includeRoutes);
                let converted = this.supportedFormats[data.message](topology);
                converted = data.message === 'raw' ? (0, json_stable_stringify_without_jsonify_1.default)(converted) : converted;
                await this.mqtt.publish(`bridge/networkmap/${data.message}`, converted, {});
            }
        }
        if (data.topic === this.topic) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const type = typeof message === 'object' ? message.type : message;
                if (!this.supportedFormats.hasOwnProperty(type)) {
                    throw new Error(`Type '${type}' not supported, allowed are: ${Object.keys(this.supportedFormats)}`);
                }
                const routes = typeof message === 'object' && message.routes;
                const topology = await this.networkScan(routes);
                const value = this.supportedFormats[type](topology);
                await this.mqtt.publish('bridge/response/networkmap', (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, { routes, type, value }, null)));
            }
            catch (error) {
                await this.mqtt.publish('bridge/response/networkmap', (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, {}, error.message)));
            }
        }
    }
    raw(topology) {
        return topology;
    }
    graphviz(topology) {
        const colors = settings.get().map_options.graphviz.colors;
        let text = 'digraph G {\nnode[shape=record];\n';
        let style = '';
        topology.nodes.forEach((node) => {
            const labels = [];
            // Add friendly name
            labels.push(`${node.friendlyName}`);
            // Add the device short network address, ieeaddr and scan note (if any)
            labels.push(`${node.ieeeAddr} (${utils_1.default.toNetworkAddressHex(node.networkAddress)})` +
                (node.failed && node.failed.length ? `failed: ${node.failed.join(',')}` : ''));
            // Add the device model
            if (node.type !== 'Coordinator') {
                labels.push(`${node.definition?.vendor} ${node.definition?.description} (${node.definition?.model})`);
            }
            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils_1.default.formatDate(date, 'relative');
            }
            labels.push(lastSeen);
            // Shape the record according to device type
            if (node.type == 'Coordinator') {
                style = `style="bold, filled", fillcolor="${colors.fill.coordinator}", fontcolor="${colors.font.coordinator}"`;
            }
            else if (node.type == 'Router') {
                style = `style="rounded, filled", fillcolor="${colors.fill.router}", fontcolor="${colors.font.router}"`;
            }
            else {
                style = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", fontcolor="${colors.font.enddevice}"`;
            }
            // Add the device with its labels to the graph as a node.
            text += `  "${node.ieeeAddr}" [${style}, label="{${labels.join('|')}}"];\n`;
            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links
                .filter((e) => e.source.ieeeAddr === node.ieeeAddr)
                .forEach((e) => {
                const lineStyle = node.type == 'EndDevice' ? 'penwidth=1, ' : !e.routes.length ? 'penwidth=0.5, ' : 'penwidth=2, ';
                const lineWeight = !e.routes.length ? `weight=0, color="${colors.line.inactive}", ` : `weight=1, color="${colors.line.active}", `;
                const textRoutes = e.routes.map((r) => utils_1.default.toNetworkAddressHex(r.destinationAddress));
                const lineLabels = !e.routes.length ? `label="${e.linkquality}"` : `label="${e.linkquality} (routes: ${textRoutes.join(',')})"`;
                text += `  "${node.ieeeAddr}" -> "${e.target.ieeeAddr}"`;
                text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
            });
        });
        text += '}';
        return text.replace(/\0/g, '');
    }
    plantuml(topology) {
        const text = [];
        text.push(`' paste into: https://www.planttext.com/`);
        text.push(``);
        text.push('@startuml');
        topology.nodes
            .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
            .forEach((node) => {
            // Add friendly name
            text.push(`card ${node.ieeeAddr} [`);
            text.push(`${node.friendlyName}`);
            text.push(`---`);
            // Add the device short network address, ieeaddr and scan note (if any)
            text.push(`${node.ieeeAddr} (${utils_1.default.toNetworkAddressHex(node.networkAddress)})` +
                (node.failed && node.failed.length ? ` failed: ${node.failed.join(',')}` : ''));
            // Add the device model
            if (node.type !== 'Coordinator') {
                text.push(`---`);
                const definition = this.zigbee.resolveEntity(node.ieeeAddr).definition;
                text.push(`${definition?.vendor} ${definition?.description} (${definition?.model})`);
            }
            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils_1.default.formatDate(date, 'relative');
            }
            text.push(`---`);
            text.push(lastSeen);
            text.push(`]`);
            text.push(``);
        });
        /**
         * Add edges between the devices
         * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
         * due to not responded to the lqi scan. In that case we do not add an edge for this device.
         */
        topology.links.forEach((link) => {
            text.push(`${link.sourceIeeeAddr} --> ${link.targetIeeeAddr}: ${link.lqi}`);
        });
        text.push('');
        text.push(`@enduml`);
        return text.join(`\n`);
    }
    async networkScan(includeRoutes) {
        logger_1.default.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const devices = this.zigbee.devices().filter((d) => d.zh.type !== 'GreenPower' && !d.options.disabled);
        const lqis = new Map();
        const routingTables = new Map();
        const failed = new Map();
        for (const device of devices.filter((d) => d.zh.type != 'EndDevice')) {
            failed.set(device, []);
            await utils_1.default.sleep(1); // sleep 1 second between each scan to reduce stress on network.
            const doRequest = async (request, firstAttempt = true) => {
                try {
                    return await request();
                }
                catch (error) {
                    if (!firstAttempt) {
                        throw error;
                    }
                    else {
                        // Network is possibly congested, sleep 5 seconds to let the network settle.
                        await utils_1.default.sleep(5);
                        return doRequest(request, false);
                    }
                }
            };
            try {
                const result = await doRequest(async () => device.zh.lqi());
                lqis.set(device, result);
                logger_1.default.debug(`LQI succeeded for '${device.name}'`);
            }
            catch (error) {
                failed.get(device).push('lqi');
                logger_1.default.error(`Failed to execute LQI for '${device.name}'`);
                logger_1.default.debug(error.stack);
            }
            if (includeRoutes) {
                try {
                    const result = await doRequest(async () => device.zh.routingTable());
                    routingTables.set(device, result);
                    logger_1.default.debug(`Routing table succeeded for '${device.name}'`);
                }
                catch (error) {
                    failed.get(device).push('routingTable');
                    logger_1.default.error(`Failed to execute routing table for '${device.name}'`);
                }
            }
        }
        logger_1.default.info(`Network scan finished`);
        const topology = { nodes: [], links: [] };
        // Add nodes
        for (const device of devices) {
            const definition = device.definition
                ? {
                    model: device.definition.model,
                    vendor: device.definition.vendor,
                    description: device.definition.description,
                    supports: Array.from(new Set(device.exposes().map((e) => {
                        return e.name ?? `${e.type} (${e.features.map((f) => f.name).join(', ')})`;
                    }))).join(', '),
                }
                : null;
            topology.nodes.push({
                ieeeAddr: device.ieeeAddr,
                friendlyName: device.name,
                type: device.zh.type,
                networkAddress: device.zh.networkAddress,
                manufacturerName: device.zh.manufacturerName,
                modelID: device.zh.modelID,
                failed: failed.get(device),
                lastSeen: device.zh.lastSeen,
                definition,
            });
        }
        // Add links
        lqis.forEach((lqi, device) => {
            for (const neighbor of lqi.neighbors) {
                if (neighbor.relationship > 3) {
                    // Relationship is not active, skip it
                    continue;
                }
                // Some Xiaomi devices return 0x00 as the neighbor ieeeAddr (obviously not correct).
                // Determine the correct ieeeAddr based on the networkAddress.
                const neighborDevice = this.zigbee.deviceByNetworkAddress(neighbor.networkAddress);
                if (neighbor.ieeeAddr === '0x0000000000000000' && neighborDevice) {
                    neighbor.ieeeAddr = neighborDevice.ieeeAddr;
                }
                const link = {
                    source: { ieeeAddr: neighbor.ieeeAddr, networkAddress: neighbor.networkAddress },
                    target: { ieeeAddr: device.ieeeAddr, networkAddress: device.zh.networkAddress },
                    linkquality: neighbor.linkquality,
                    depth: neighbor.depth,
                    routes: [],
                    // DEPRECATED:
                    sourceIeeeAddr: neighbor.ieeeAddr,
                    targetIeeeAddr: device.ieeeAddr,
                    sourceNwkAddr: neighbor.networkAddress,
                    lqi: neighbor.linkquality,
                    relationship: neighbor.relationship,
                };
                const routingTable = routingTables.get(device);
                if (routingTable) {
                    link.routes = routingTable.table.filter((t) => t.status === 'ACTIVE' && t.nextHop === neighbor.networkAddress);
                }
                topology.links.push(link);
            }
        });
        return topology;
    }
}
exports.default = NetworkMap;
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "raw", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "graphviz", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "plantuml", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29ya01hcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vbmV0d29ya01hcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0VBQWtDO0FBQ2xDLGtIQUE4RDtBQUU5RCw0REFBb0M7QUFDcEMsMkRBQTZDO0FBQzdDLDBEQUFrQztBQUNsQyw0REFBb0M7QUE4QnBDOztHQUVHO0FBQ0gsTUFBcUIsVUFBVyxTQUFRLG1CQUFTO0lBQ3JDLFNBQVMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUMvQyxXQUFXLEdBQUcsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsb0JBQW9CLENBQUM7SUFDcEUsaUJBQWlCLEdBQUcsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUM7SUFDakYsS0FBSyxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLDRCQUE0QixDQUFDO0lBQ3RFLGdCQUFnQixDQUEyRDtJQUUxRSxLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxnQkFBZ0IsR0FBRztZQUNwQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQzFCLENBQUM7SUFDTixDQUFDO0lBRVcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTJCO1FBQ2pELDBCQUEwQjtRQUMxQixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNqQixJ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