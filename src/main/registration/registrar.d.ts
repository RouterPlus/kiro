import { RegistrationConfig } from './config';
export type LogFn = (message: string) => void;
export interface FingerprintSnapshot {
    chromeVer: string;
    ua: string;
    gpuVendor: string;
    gpuModel: string;
    canvasHash: number;
    screen: {
        width: number;
        height: number;
    };
    /** 注册时使用的出口代理 URL（脱敏前缀） */
    proxyUrl?: string;
}
export interface RegistrationResult {
    status: 'success' | 'failed';
    email: string;
    password?: string;
    error?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    region?: string;
    provider?: string;
    verify?: Record<string, unknown>;
    consumedProvidedEmailLine?: string;
}
export declare class Registrar {
    private cfg;
    private session;
    private moduleClient;
    private cookies;
    private identity;
    private fpCtx;
    private vid;
    private email;
    private emailSvc;
    private clientId;
    private clientSecret;
    private deviceCode;
    private userCode;
    private workflowHandle;
    private workflowId;
    private workflowState;
    private ubid;
    private regCode;
    private signState;
    private authCode;
    private ssoState;
    private wdcCSRFToken;
    private ssoToken;
    private outlookMailCount;
    private log;
    private abortController;
    constructor(cfg: RegistrationConfig, log?: LogFn);
    /** 中止当前注册流程 */
    abort(): void;
    private checkAborted;
    /** TLS SessionClient 选项 */
    private get sessionOpts();
    /**
     * 初始化 TLS 客户端
     *
     * DLL 存储策略（按优先级，从高到低）：
     *   1. userData/tls-client/ — 应用用户数据目录（系统不会清理，**永久复用**）
     *   2. resources/ — 应用安装目录（打包资源，开发版可能不存在）
     *   3. tmpdir → 自动迁移到 userData（老版本兼容）
     *   4. GitHub 下载到 userData（最后兜底，仅首次）
     */
    private initTlsClient;
    /**
     * 确保 tls-client 共享库可用
     * @returns existingPath 已经存在的完整 DLL 文件路径（如有，传 customLibraryPath）
     *          downloadDir  需要下载到的目录（如未找到，传 customLibraryDownloadPath 让 tlsclientwrapper 自动下载）
     *
     * 优先放到 userData，避免被系统临时目录清理工具误删（之前用 tmpdir 会被清理）
     */
    private ensureTlsLib;
    private rebuildTlsClient;
    /**
     * 用 undici 直接 fetch 静态资源（如 AWS signin app.js），绕过 tls-client。
     * 原因：tls-client 的 dll 是进程级单例，失败请求会污染其全局状态，
     * 导致后续重建 SessionClient 后仍报 "no tls client for modification check"。
     * 静态资源不需要 TLS 指纹伪装，直接用 Node/undici fetch 即可。
     */
    private fetchAppJS;
    private isRecoverableTlsClientError;
    /** 清理 TLS 客户端资源 */
    private cleanup;
    /** 公共销毁方法，供外部调用释放资源 */
    destroy(): Promise<void>;
    private cookieString;
    private buildHeaders;
    private buildProfileHeaders;
    private doGet;
    private doPost;
    /**
     * tls-client 返回的 body 是字节透传字符串（latin1）；
     * 如果响应实际是 UTF-8 编码（含中文等多字节），需要二次解码。
     * 实现：把 string 当作 latin1 字节读回，再用 UTF-8 解码；
     * 若解码后含 U+FFFD 替换字符比原文多很多，则回退原值（说明原本就是 latin1 / ASCII）。
     */
    private decodeBody;
    private parseBody;
    /**
     * 识别 AWS 风控触发的错误响应，返回人类可读的标签
     * @returns 风控类型标签（如 'AWS-RISK-CONTROL'），不是风控返回 null
     */
    private detectRiskControl;
    /** 把响应错误格式化为更友好的消息（含风控识别） */
    private formatErrorBody;
    private fetchD2CToken;
    private genFP;
    private genFPWithTime;
    private step1OIDC;
    private step2Device;
    private step3Email;
    private step4Portal;
    private step5WorkflowInit;
    private step6SubmitEmail;
    private step7Signup;
    private step7_5SignupInit;
    private step7_8ProfileInit;
    private step8ProfileStart;
    private step9SendOTP;
    private step10GetOTP;
    private step11CreateIdentity;
    private step12SetPassword;
    private completeSignup;
    private step12_8SSOWorkflow;
    private completeSSOWorkflow;
    private step13SSOToken;
    /** 执行完整注册流程（自动模式） */
    run(): Promise<RegistrationResult>;
    /**
     * 返回本次注册实际生效的代理 URL（按 sessionOpts 同样的优先级解析），
     * 用于在指纹摘要里准确显示是直连还是走代理。
     */
    private resolvedProxyUrl;
    /** 输出本次注册使用的指纹摘要（用于审计与后续复用） */
    fingerprintSnapshot(): FingerprintSnapshot;
    /** 手动模式注册 - Step1-2 自动，Step3 等待外部设置邮箱，Step4-9 自动，Step10 等待外部 OTP */
    runManualPhase1(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /** 手动模式 - 设置邮箱后继续注册流程到发送 OTP */
    runManualPhase2(email: string, fullName?: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /** 手动模式 - 输入 OTP 后完成注册 */
    runManualPhase3(otp: string): Promise<RegistrationResult>;
}
//# sourceMappingURL=registrar.d.ts.map