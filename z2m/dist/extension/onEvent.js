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
const extension_1 = __importDefault(require("./extension"));
/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
class OnEvent extends extension_1.default {
    async start() {
        for (const device of this.zigbee.devices(false)) {
            await this.callOnEvent(device, 'start', {});
        }
        this.eventBus.onDeviceMessage(this, (data) => this.callOnEvent(data.device, 'message', this.convertData(data)));
        this.eventBus.onDeviceJoined(this, (data) => this.callOnEvent(data.device, 'deviceJoined', this.convertData(data)));
        this.eventBus.onDeviceInterview(this, (data) => this.callOnEvent(data.device, 'deviceInterview', this.convertData(data)));
        this.eventBus.onDeviceAnnounce(this, (data) => this.callOnEvent(data.device, 'deviceAnnounce', this.convertData(data)));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.callOnEvent(data.device, 'deviceNetworkAddressChanged', this.convertData(data)));
        this.eventBus.onEntityOptionsChanged(this, async (data) => {
            if (data.entity.isDevice()) {
                await this.callOnEvent(data.entity, 'deviceOptionsChanged', data).then(() => this.eventBus.emitDevicesChanged());
            }
        });
    }
    convertData(data) {
        return { ...data, device: data.device.zh };
    }
    async stop() {
        await super.stop();
        for (const device of this.zigbee.devices(false)) {
            await this.callOnEvent(device, 'stop', {});
        }
    }
    async callOnEvent(device, type, data) {
        if (device.options.disabled)
            return;
        const state = this.state.get(device);
        await zhc.onEvent(type, data, device.zh);
        if (device.definition?.onEvent) {
            const options = device.options;
            await device.definition.onEvent(type, data, device.zh, options, state);
        }
    }
}
exports.default = OnEvent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25FdmVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vb25FdmVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsZ0VBQWtEO0FBRWxELDREQUFvQztBQUVwQzs7R0FFRztBQUNILE1BQXFCLE9BQVEsU0FBUSxtQkFBUztJQUNqQyxLQUFLLENBQUMsS0FBSztRQUNoQixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoSCxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxSCxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hILElBQUksQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDdkQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLDZCQUE2QixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FDdkYsQ0FBQztRQUNGLElBQUksQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUN0RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztnQkFDekIsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBQ3JILENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxXQUFXLENBQUMsSUFBYztRQUM5QixPQUFPLEVBQUMsR0FBRyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVRLEtBQUssQ0FBQyxJQUFJO1FBQ2YsTUFBTSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbkIsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9DLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFjLEVBQUUsSUFBcUIsRUFBRSxJQUFjO1FBQzNFLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRO1lBQUUsT0FBTztRQUNwQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFekMsSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQzdCLE1BQU0sT0FBTyxHQUFhLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDekMsTUFBTSxNQUFNLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLENBQUM7SUFDTCxDQUFDO0NBQ0o7QUF6Q0QsMEJBeUNDIn0=