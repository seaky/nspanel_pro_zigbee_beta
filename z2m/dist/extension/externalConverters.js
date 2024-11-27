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
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = require("../util/utils");
const extension_1 = __importDefault(require("./extension"));
class ExternalConverters extends extension_1.default {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        for (const file of settings.get().external_converters) {
            try {
                for (const definition of (0, utils_1.loadExternalConverter)(file)) {
                    const toAdd = { ...definition };
                    delete toAdd['homeassistant'];
                    zhc.addDefinition(toAdd);
                }
            }
            catch (error) {
                logger_1.default.error(`Failed to load external converter file '${file}' (${error.message})`);
                logger_1.default.error(`Probably there is a syntax error in the file or the external converter is not ` +
                    `compatible with the current Zigbee2MQTT version`);
                logger_1.default.error(`Note that external converters are not meant for long term usage, it's meant for local ` +
                    `testing after which a pull request should be created to add out-of-the-box support for the device`);
            }
        }
    }
}
exports.default = ExternalConverters;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxDb252ZXJ0ZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9leHRlcm5hbENvbnZlcnRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdFQUFrRDtBQUVsRCw0REFBb0M7QUFDcEMsMkRBQTZDO0FBQzdDLHlDQUFvRDtBQUNwRCw0REFBb0M7QUFFcEMsTUFBcUIsa0JBQW1CLFNBQVEsbUJBQVM7SUFDckQsWUFDSSxNQUFjLEVBQ2QsSUFBVSxFQUNWLEtBQVksRUFDWixrQkFBc0MsRUFDdEMsUUFBa0IsRUFDbEIsc0JBQXdFLEVBQ3hFLGVBQW9DLEVBQ3BDLFlBQXFEO1FBRXJELEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRWhILEtBQUssTUFBTSxJQUFJLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDO2dCQUNELEtBQUssTUFBTSxVQUFVLElBQUksSUFBQSw2QkFBcUIsRUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNuRCxNQUFNLEtBQUssR0FBRyxFQUFDLEdBQUcsVUFBVSxFQUFDLENBQUM7b0JBQzlCLE9BQU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUM5QixHQUFHLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLElBQUksTUFBTSxLQUFLLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztnQkFDcEYsZ0JBQU0sQ0FBQyxLQUFLLENBQ1IsZ0ZBQWdGO29CQUM1RSxpREFBaUQsQ0FDeEQsQ0FBQztnQkFDRixnQkFBTSxDQUFDLEtBQUssQ0FDUix3RkFBd0Y7b0JBQ3BGLG1HQUFtRyxDQUMxRyxDQUFDO1lBQ04sQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0NBQ0o7QUFqQ0QscUNBaUNDIn0=