import { BrowserIdentity } from './browser-identity';
export declare class OrderedMap {
    private keys;
    private values;
    set(key: string, value: unknown): void;
    toJSON(): string;
}
export interface FingerprintContext {
    identity: BrowserIdentity;
    canvasHash: number;
    histogramBins: number[];
    lsUbidSignin: string;
    lsUbidProfile: string;
    perfTiming: Record<string, number> | null;
    startTime: number | null;
}
export declare function newFPContext(identity: BrowserIdentity): FingerprintContext;
export declare function resetPerfTiming(ctx: FingerprintContext): void;
export declare function buildFingerprintData(identity: BrowserIdentity, locationURL: string, referrer: string, nowMs: number, ctx: FingerprintContext | null, pageType: string, eventType: string, timeOnPage: number, emailLen: number, email: string): OrderedMap;
/** 生成加密后的浏览器指纹字符串 */
export declare function generateFingerprint(identity: BrowserIdentity, locationURL: string, referrer: string, ctx: FingerprintContext | null, pageType: string, eventType: string, timeOnPage: number, emailLen: number, email: string): string;
//# sourceMappingURL=fingerprint.d.ts.map