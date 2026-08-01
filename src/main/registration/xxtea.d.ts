export declare function refreshAppJSConfig(fetchFn: (url: string, init?: RequestInit) => Promise<Response>): Promise<void>;
export declare function getTESVersion(): string;
export declare function getIdentifier(): string;
export declare function getActiveKey(): [number, number, number, number];
/** 加密指纹 JSON: JSON -> CRC32前缀 -> XXTEA加密 -> base64 -> identifier:结果 */
export declare function encryptFingerprint(jsonStr: string): string;
//# sourceMappingURL=xxtea.d.ts.map