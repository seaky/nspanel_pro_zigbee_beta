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
const fs_1 = __importDefault(require("fs"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const data_1 = __importDefault(require("./util/data"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const saveInterval = 1000 * 60 * 5; // 5 minutes
const dontCacheProperties = [
    'action',
    'action_.*',
    'button',
    'button_left',
    'button_right',
    'click',
    'forgotten',
    'keyerror',
    'step_size',
    'transition_time',
    'group_list',
    'group_capacity',
    'no_occupancy_since',
    'step_mode',
    'transition_time',
    'duration',
    'elapsed',
    'from_side',
    'to_side',
];
class State {
    eventBus;
    zigbee;
    state = {};
    file = data_1.default.joinPath('state.json');
    timer = null;
    constructor(eventBus, zigbee) {
        this.eventBus = eventBus;
        this.zigbee = zigbee;
        this.eventBus = eventBus;
        this.zigbee = zigbee;
    }
    start() {
        this.load();
        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
    }
    stop() {
        // Remove any invalid states (ie when the device has left the network) when the system is stopped
        Object.keys(this.state)
            .filter((k) => typeof k === 'string' && !this.zigbee.resolveEntity(k)) // string key = ieeeAddr
            .forEach((k) => delete this.state[k]);
        clearTimeout(this.timer);
        this.save();
    }
    load() {
        if (fs_1.default.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs_1.default.readFileSync(this.file, 'utf8'));
                logger_1.default.debug(`Loaded state from file ${this.file}`);
            }
            catch (e) {
                logger_1.default.debug(`Failed to load state from file ${this.file} (corrupt file?)`);
            }
        }
        else {
            logger_1.default.debug(`Can't load state from file ${this.file} (doesn't exist)`);
        }
    }
    save() {
        if (settings.get().advanced.cache_state_persistent) {
            logger_1.default.debug(`Saving state to file ${this.file}`);
            const json = JSON.stringify(this.state, null, 4);
            try {
                fs_1.default.writeFileSync(this.file, json, 'utf8');
            }
            catch (e) {
                logger_1.default.error(`Failed to write state to '${this.file}' (${e.message})`);
            }
        }
        else {
            logger_1.default.debug(`Not saving state`);
        }
    }
    exists(entity) {
        return this.state.hasOwnProperty(entity.ID);
    }
    get(entity) {
        return this.state[entity.ID] || {};
    }
    set(entity, update, reason = null) {
        const fromState = this.state[entity.ID] || {};
        const toState = (0, object_assign_deep_1.default)({}, fromState, update);
        const newCache = { ...toState };
        const entityDontCacheProperties = entity.options.filtered_cache || [];
        utils_1.default.filterProperties(dontCacheProperties.concat(entityDontCacheProperties), newCache);
        this.state[entity.ID] = newCache;
        this.eventBus.emitStateChange({ entity, from: fromState, to: toState, reason, update });
        return toState;
    }
    remove(ID) {
        delete this.state[ID];
    }
}
exports.default = State;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvc3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDRDQUFvQjtBQUNwQiw0RUFBa0Q7QUFFbEQsdURBQStCO0FBQy9CLDJEQUFtQztBQUNuQywwREFBNEM7QUFDNUMseURBQWlDO0FBRWpDLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtBQUVoRCxNQUFNLG1CQUFtQixHQUFHO0lBQ3hCLFFBQVE7SUFDUixXQUFXO0lBQ1gsUUFBUTtJQUNSLGFBQWE7SUFDYixjQUFjO0lBQ2QsT0FBTztJQUNQLFdBQVc7SUFDWCxVQUFVO0lBQ1YsV0FBVztJQUNYLGlCQUFpQjtJQUNqQixZQUFZO0lBQ1osZ0JBQWdCO0lBQ2hCLG9CQUFvQjtJQUNwQixXQUFXO0lBQ1gsaUJBQWlCO0lBQ2pCLFVBQVU7SUFDVixTQUFTO0lBQ1QsV0FBVztJQUNYLFNBQVM7Q0FDWixDQUFDO0FBRUYsTUFBTSxLQUFLO0lBTWM7SUFDQTtJQU5iLEtBQUssR0FBcUMsRUFBRSxDQUFDO0lBQzdDLElBQUksR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ25DLEtBQUssR0FBbUIsSUFBSSxDQUFDO0lBRXJDLFlBQ3FCLFFBQWtCLEVBQ2xCLE1BQWM7UUFEZCxhQUFRLEdBQVIsUUFBUSxDQUFVO1FBQ2xCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFFL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDekIsQ0FBQztJQUVELEtBQUs7UUFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCxJQUFJO1FBQ0EsaUdBQWlHO1FBQ2pHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQzthQUNsQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQzlGLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFMUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVPLElBQUk7UUFDUixJQUFJLFlBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDO2dCQUNELElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDNUQsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELENBQUM7WUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNULGdCQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxJQUFJLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2hGLENBQUM7UUFDTCxDQUFDO2FBQU0sQ0FBQztZQUNKLGdCQUFNLENBQUMsS0FBSyxDQUFDLDhCQUE4QixJQUFJLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzVFLENBQUM7SUFDTCxDQUFDO0lBRU8sSUFBSTtRQUNSLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQ2pELGdCQUFNLENBQUMsS0FBSyxDQUFDLHdCQUF3QixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNsRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQztnQkFDRCxZQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLENBQUM7WUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNULGdCQUFNLENBQUMsS0FBSyxDQUFDLDZCQUE2QixJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO1lBQzNFLENBQUM7UUFDTCxDQUFDO2FBQU0sQ0FBQztZQUNKLGdCQUFNLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNMLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBc0I7UUFDekIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELEdBQUcsQ0FBQyxNQUFzQjtRQUN0QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN2QyxDQUFDO0lBRUQsR0FBRyxDQUFDLE1BQXNCLEVBQUUsTUFBZ0IsRUFBRSxTQUFpQixJQUFJO1FBQy9ELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxJQUFBLDRCQUFnQixFQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEQsTUFBTSxRQUFRLEdBQUcsRUFBQyxHQUFHLE9BQU8sRUFBQyxDQUFDO1FBQzlCLE1BQU0seUJBQXlCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBRXRFLGVBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUV4RixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUM7UUFDakMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUMsQ0FBQyxDQUFDO1FBQ3RGLE9BQU8sT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRCxNQUFNLENBQUMsRUFBbUI7UUFDdEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFCLENBQUM7Q0FDSjtBQUVELGtCQUFlLEtBQUssQ0FBQyJ9