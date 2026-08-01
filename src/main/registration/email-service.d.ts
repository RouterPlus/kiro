export declare function extractCode(body: string): string;
export interface TempEmailService {
    create(): Promise<string>;
    /** Optional hook called immediately before the registration page requests an OTP. */
    beforeSendCode?(): Promise<void>;
    waitForCode(timeoutSec: number, intervalSec: number, abortCheck?: () => boolean): Promise<string>;
    getAddress(): string;
}
export interface ProvidedEmailAccount {
    email: string;
    password: string;
}
export declare function parseProvidedEmailLines(data: string): ProvidedEmailAccount[];
export declare class ProvidedEmailService implements TempEmailService {
    private readonly account;
    private readonly hosts;
    private address;
    private host;
    private baselineAwsUid;
    private baselineTime;
    private readonly apiKey;
    private readonly apiBaseURL;
    constructor(account: ProvidedEmailAccount, apiKey?: string, apiBaseURL?: string);
    create(): Promise<string>;
    getAddress(): string;
    beforeSendCode(): Promise<void>;
    waitForCode(timeoutSec: number, intervalSec: number, abortCheck?: () => boolean): Promise<string>;
    private waitForCodeViaFirstMailAPI;
    private fetchFirstMailMessages;
    private getLatestAwsUid;
    private connectClient;
}
export declare class MoEmailService implements TempEmailService {
    private baseURL;
    private apiKey;
    private address;
    constructor(baseURL: string, apiKey: string);
    /**
     * 归一化用户输入的 baseURL：
     *   - 去除首尾空白与末尾斜杠
     *   - 缺少 protocol 时补 `https://`
     *   - 校验协议仅允许 http / https，否则抛清晰错误
     * 用于规避 fetch 因协议不合法抛出
     * "Invalid URL protocol: the URL must start with `http:` or `https:`."
     */
    private static normalizeBaseURL;
    create(): Promise<string>;
    waitForCode(timeoutSec: number, intervalSec: number, abortCheck?: () => boolean): Promise<string>;
    getAddress(): string;
    private fetchCode;
}
export declare class TempMailPlusService implements TempEmailService {
    private static readonly BASE_URL;
    private readonly tmEmail;
    private readonly epin;
    private readonly domain;
    private address;
    constructor(tmEmail: string, epin: string, domain: string);
    private get headers();
    create(): Promise<string>;
    getAddress(): string;
    waitForCode(timeoutSec: number, intervalSec: number, abortCheck?: () => boolean): Promise<string>;
    private get fullEmail();
    private fetchMailList;
    private fetchMailDetail;
    private deleteMail;
    private extractOTP;
}
export interface OutlookAccount {
    email: string;
    password: string;
    clientId: string;
    refreshToken: string;
}
export declare function parseOutlookLines(data: string): OutlookAccount[];
export declare function refreshOutlookToken(acc: OutlookAccount): Promise<string>;
export declare function getInboxCount(acc: OutlookAccount): Promise<number>;
export declare function waitForOTP(acc: OutlookAccount, beforeCount: number, timeout: number, interval: number, abortCheck?: () => boolean): Promise<string>;
export interface GmailIMAPAccount {
    email: string;
    accessToken: string;
    appPassword?: string;
}
export declare class DuckDuckGoEmailService implements TempEmailService {
    private static readonly QUACK_URL;
    private readonly authToken;
    private readonly gmailAccount;
    private address;
    private baselineAwsUid;
    constructor(authToken: string, gmailAccount: GmailIMAPAccount);
    create(): Promise<string>;
    getAddress(): string;
    beforeSendCode(): Promise<void>;
    waitForCode(timeoutSec: number, intervalSec: number, abortCheck?: () => boolean): Promise<string>;
}
//# sourceMappingURL=email-service.d.ts.map