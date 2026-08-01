import type { KProxyConfig, KProxyStats, KProxyEvents } from './types';
import { CertManager } from './certManager';
/**
 * K-Proxy MITM 代理服务器
 */
export declare class MitmProxy {
    private server;
    private certManager;
    private config;
    private stats;
    private events;
    private tlsServers;
    constructor(certManager: CertManager, config: KProxyConfig, events?: KProxyEvents);
    /**
     * 启动代理服务器
     */
    start(): Promise<void>;
    /**
     * 停止代理服务器
     */
    stop(): Promise<void>;
    /**
     * 处理 HTTP 请求
     */
    private handleHttpRequest;
    /**
     * 处理 CONNECT 请求（HTTPS 隧道）
     */
    private handleConnect;
    /**
     * 检查域名是否需要 MITM
     */
    private shouldMitm;
    /**
     * 直接转发连接（不解密）
     */
    private handleDirectConnect;
    /**
     * MITM 拦截连接
     */
    private handleMitmConnect;
    /**
     * 处理解密后的 HTTPS 连接
     */
    private handleDecryptedConnection;
    /**
     * 替换请求体中的 Machine ID
     */
    private modifyBody;
    private extractDeviceIdFromHeaders;
    /**
     * 修改请求头（替换 Machine ID）
     */
    private modifyHeaders;
    /**
     * 转发请求到目标服务器
     */
    private forwardRequest;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<KProxyConfig>): void;
    /**
     * 获取配置
     */
    getConfig(): KProxyConfig;
    /**
     * 获取统计信息
     */
    getStats(): KProxyStats;
    /**
     * 重置统计
     */
    resetStats(): void;
    /**
     * 检查是否运行中
     */
    isRunning(): boolean;
}
//# sourceMappingURL=mitmProxy.d.ts.map