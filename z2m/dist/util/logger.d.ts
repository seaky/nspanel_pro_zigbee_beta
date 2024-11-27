import winston from 'winston';
import * as settings from './settings';
declare class Logger {
    private level;
    private output;
    private directory;
    private logger;
    private fileTransport;
    private debugNamespaceIgnoreRegex?;
    private namespacedLevels;
    private cachedNamespacedLevels;
    init(): void;
    get winston(): winston.Logger;
    addTransport(transport: winston.transport): void;
    removeTransport(transport: winston.transport): void;
    getDebugNamespaceIgnore(): string;
    setDebugNamespaceIgnore(value: string): void;
    getLevel(): settings.LogLevel;
    setLevel(level: settings.LogLevel): void;
    getNamespacedLevels(): Record<string, settings.LogLevel>;
    setNamespacedLevels(nsLevels: Record<string, settings.LogLevel>): void;
    private resetCachedNamespacedLevels;
    private cacheNamespacedLevel;
    private log;
    error(message: string, namespace?: string): void;
    warning(message: string, namespace?: string): void;
    info(message: string, namespace?: string): void;
    debug(message: string, namespace?: string): void;
    cleanup(): void;
    end(): Promise<void>;
}
declare const _default: Logger;
export default _default;
//# sourceMappingURL=logger.d.ts.map