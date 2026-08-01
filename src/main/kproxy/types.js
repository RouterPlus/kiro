// K-Proxy 类型定义
/**
 * 默认 MITM 域名白名单
 */
export const DEFAULT_MITM_DOMAINS = [
    'amazonaws.com',
    'amazon.com',
    'kiro.dev'
];
/**
 * 默认 K-Proxy 配置
 */
export const DEFAULT_KPROXY_CONFIG = {
    enabled: false,
    port: 8899,
    host: '127.0.0.1',
    mitmDomains: DEFAULT_MITM_DOMAINS,
    autoStart: false,
    logRequests: true
};
//# sourceMappingURL=types.js.map