import Device from './model/device';
import Group from './model/group';
export default class Zigbee {
    private herdsman;
    private eventBus;
    private groupLookup;
    private deviceLookup;
    constructor(eventBus: EventBus);
    start(): Promise<'reset' | 'resumed' | 'restored'>;
    private logDeviceInterview;
    private generateNetworkKey;
    private generateExtPanID;
    private generatePanID;
    getCoordinatorVersion(): Promise<zh.CoordinatorVersion>;
    isStopping(): boolean;
    backup(): Promise<void>;
    coordinatorCheck(): Promise<{
        missingRouters: Device[];
    }>;
    getNetworkParameters(): Promise<zh.NetworkParameters>;
    reset(type: 'soft' | 'hard'): Promise<void>;
    stop(): Promise<void>;
    getPermitJoin(): boolean;
    getPermitJoinTimeout(): number;
    permitJoin(permit: boolean, device?: Device, time?: number): Promise<void>;
    private resolveDevice;
    private resolveGroup;
    resolveEntity(key: string | number | zh.Device): Device | Group;
    resolveEntityAndEndpoint(ID: string): {
        ID: string;
        entity: Device | Group;
        endpointID: string;
        endpoint: zh.Endpoint;
    };
    firstCoordinatorEndpoint(): zh.Endpoint;
    groups(): Group[];
    devices(includeCoordinator?: boolean): Device[];
    private acceptJoiningDeviceHandler;
    touchlinkFactoryResetFirst(): Promise<boolean>;
    touchlinkFactoryReset(ieeeAddr: string, channel: number): Promise<boolean>;
    addInstallCode(installCode: string): Promise<void>;
    touchlinkIdentify(ieeeAddr: string, channel: number): Promise<void>;
    touchlinkScan(): Promise<{
        ieeeAddr: string;
        channel: number;
    }[]>;
    createGroup(ID: number): Group;
    deviceByNetworkAddress(networkAddress: number): Device;
    groupByID(ID: number): Group;
}
//# sourceMappingURL=zigbee.d.ts.map