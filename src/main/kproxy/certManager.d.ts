import type { CACertInfo } from './types';
/**
 * CA 证书管理器
 */
export declare class CertManager {
    private dataPath;
    private caCert;
    private caKey;
    private caInfo;
    constructor(dataPath: string);
    /**
     * 初始化 CA 证书（加载或生成）
     */
    initialize(): Promise<CACertInfo>;
    /**
     * 生成 CA 证书
     */
    private generateCACert;
    /**
     * 为指定域名生成证书
     */
    generateCertForHost(hostname: string): {
        cert: string;
        key: string;
    };
    /**
     * 获取 CA 证书信息
     */
    getCACertInfo(): CACertInfo | null;
    /**
     * 获取 CA 证书 PEM
     */
    getCACertPem(): string | null;
    /**
     * 清除证书缓存
     */
    clearCache(): void;
    /**
     * 生成序列号
     */
    private generateSerialNumber;
    /**
     * 提取证书信息
     */
    private extractCertInfo;
}
/**
 * 创建证书管理器实例
 */
export declare function createCertManager(dataPath: string): CertManager;
//# sourceMappingURL=certManager.d.ts.map