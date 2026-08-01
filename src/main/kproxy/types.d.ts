/**
 * K-Proxy 配置
 */
export interface KProxyConfig {
    enabled: boolean;
    port: number;
    host: string;
    mitmDomains: string[];
    deviceId?: string;
    autoStart: boolean;
    logRequests: boolean;
    caPath?: string;
    caKeyPath?: string;
}
/**
 * K-Proxy 统计信息
 */
export interface KProxyStats {
    totalRequests: number;
    mitmRequests: number;
    bypassRequests: number;
    modifiedRequests: number;
    startTime: number;
    lastRequestTime: number;
}
/**
 * K-Proxy 事件回调
 */
export interface KProxyEvents {
    onRequest?: (info: KProxyRequestInfo) => void;
    onResponse?: (info: KProxyResponseInfo) => void;
    onError?: (error: Error) => void;
    onStatusChange?: (running: boolean, port: number) => void;
    onMitmIntercept?: (host: string, modified: boolean) => void;
}
/**
 * 请求信息
 */
export interface KProxyRequestInfo {
    timestamp: number;
    method: string;
    host: string;
    path: string;
    isMitm: boolean;
    deviceIdReplaced: boolean;
    originalDeviceId?: string;
    newDeviceId?: string;
}
/**
 * 响应信息
 */
export interface KProxyResponseInfo {
    timestamp: number;
    host: string;
    statusCode: number;
    duration: number;
}
/**
 * CA 证书信息
 */
export interface CACertInfo {
    certPath: string;
    keyPath: string;
    certPem: string;
    keyPem: string;
    fingerprint: string;
    validFrom: Date;
    validTo: Date;
}
/**
 * 设备 ID 配置（用于账号关联）
 */
export interface DeviceIdMapping {
    accountId: string;
    deviceId: string;
    description?: string;
    createdAt: number;
    lastUsed?: number;
}
/**
 * MITM 拦截规则
 */
export interface MitmRule {
    domainPattern: string;
    headerModifications?: {
        name: string;
        pattern: string;
        replacement: string;
    }[];
    enabled: boolean;
}
/**
 * 默认 MITM 域名白名单
 */
export declare const DEFAULT_MITM_DOMAINS: string[];
/**
 * 默认 K-Proxy 配置
 */
export declare const DEFAULT_KPROXY_CONFIG: KProxyConfig;
//# sourceMappingURL=types.d.ts.map