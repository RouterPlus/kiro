// K-Proxy 模块入口
import { app } from 'electron';
import * as path from 'path';
import { createCertManager } from './certManager';
import { MitmProxy } from './mitmProxy';
import { DEFAULT_KPROXY_CONFIG } from './types';
// 导出类型
export * from './types';
export { CertManager } from './certManager';
export { MitmProxy } from './mitmProxy';
/**
 * K-Proxy 服务管理器
 */
export class KProxyService {
    certManager = null;
    mitmProxy = null;
    config;
    events;
    deviceIdMappings = new Map();
    dataPath;
    initialized = false;
    cachedCaInfo = null;
    constructor(config = {}, events = {}) {
        this.config = { ...DEFAULT_KPROXY_CONFIG, ...config };
        this.events = events;
        this.dataPath = path.join(app.getPath('userData'), 'kproxy');
    }
    /**
     * 初始化服务（只初始化一次）
     */
    async initialize() {
        // 如果已初始化，直接返回缓存的 CA 信息
        if (this.initialized && this.cachedCaInfo) {
            console.log('[KProxyService] Already initialized, returning cached CA info');
            return this.cachedCaInfo;
        }
        // 初始化证书管理器
        this.certManager = createCertManager(this.dataPath);
        const caInfo = await this.certManager.initialize();
        // 初始化 MITM 代理
        this.mitmProxy = new MitmProxy(this.certManager, this.config, this.events);
        this.initialized = true;
        this.cachedCaInfo = caInfo;
        console.log('[KProxyService] Initialized');
        return caInfo;
    }
    /**
     * 启动代理服务
     */
    async start() {
        if (!this.mitmProxy) {
            await this.initialize();
        }
        await this.mitmProxy.start();
        this.config.enabled = true;
    }
    /**
     * 停止代理服务
     */
    async stop() {
        if (this.mitmProxy) {
            await this.mitmProxy.stop();
        }
        this.config.enabled = false;
    }
    /**
     * 重启代理服务
     */
    async restart() {
        await this.stop();
        await this.start();
    }
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (this.mitmProxy) {
            this.mitmProxy.updateConfig(this.config);
        }
    }
    /**
     * 获取配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return this.mitmProxy?.getStats() || null;
    }
    /**
     * 获取 CA 证书信息
     */
    getCACertInfo() {
        return this.certManager?.getCACertInfo() || null;
    }
    /**
     * 获取 CA 证书 PEM（用于导出/安装）
     */
    getCACertPem() {
        return this.certManager?.getCACertPem() || null;
    }
    /**
     * 设置当前设备 ID
     */
    setDeviceId(deviceId) {
        this.config.deviceId = deviceId;
        if (this.mitmProxy) {
            this.mitmProxy.updateConfig({ deviceId });
        }
    }
    /**
     * 获取当前设备 ID
     */
    getDeviceId() {
        return this.config.deviceId;
    }
    /**
     * 添加设备 ID 映射
     */
    addDeviceIdMapping(mapping) {
        this.deviceIdMappings.set(mapping.accountId, mapping);
    }
    /**
     * 移除设备 ID 映射
     */
    removeDeviceIdMapping(accountId) {
        this.deviceIdMappings.delete(accountId);
    }
    /**
     * 获取账号的设备 ID
     */
    getDeviceIdForAccount(accountId) {
        return this.deviceIdMappings.get(accountId)?.deviceId;
    }
    /**
     * 获取所有设备 ID 映射
     */
    getAllDeviceIdMappings() {
        return Array.from(this.deviceIdMappings.values());
    }
    /**
     * 切换到账号的设备 ID
     */
    switchToAccount(accountId) {
        const mapping = this.deviceIdMappings.get(accountId);
        if (mapping) {
            this.setDeviceId(mapping.deviceId);
            mapping.lastUsed = Date.now();
            return true;
        }
        return false;
    }
    /**
     * 检查是否运行中
     */
    isRunning() {
        return this.mitmProxy?.isRunning() || false;
    }
    /**
     * 重置统计
     */
    resetStats() {
        this.mitmProxy?.resetStats();
    }
    /**
     * 清除证书缓存
     */
    clearCertCache() {
        this.certManager?.clearCache();
    }
}
// 单例实例
let kproxyService = null;
/**
 * 获取 K-Proxy 服务实例
 */
export function getKProxyService() {
    return kproxyService;
}
/**
 * 初始化 K-Proxy 服务
 */
export function initKProxyService(config = {}, events = {}) {
    if (!kproxyService) {
        kproxyService = new KProxyService(config, events);
    }
    return kproxyService;
}
/**
 * 生成随机设备 ID（64位十六进制）
 */
export function generateDeviceId() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
/**
 * 验证设备 ID 格式
 */
export function isValidDeviceId(deviceId) {
    return /^[a-f0-9]{64}$/i.test(deviceId);
}
//# sourceMappingURL=index.js.map