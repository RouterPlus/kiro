export declare const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0";
export declare const DEFAULT_SEC_UA = "\"Chromium\";v=\"148\", \"Microsoft Edge\";v=\"148\", \"Not/A)Brand\";v=\"99\"";
/** 生成随机 visitor ID (UUID v4-like) */
export declare function visitorId(): string;
/** 生成 awsccc cookie 值 */
export declare function awsccc(): string;
/** 生成 ubid cookie 值 */
export declare function ubidGen(): string;
/** 生成 amznfbgid 值 (Amazon fraud/bot detection localStorage ID) */
export declare function amznFbgId(): string;
/** 生成 Kiro visitor ID */
export declare function kiroVisitorId(): string;
/** 生成 PKCE code_verifier 和 code_challenge */
export declare function pkce(): {
    verifier: string;
    challenge: string;
};
/** 生成 UUID */
export declare function newUUID(): string;
/** 生成 GMT 日期字符串 */
export declare function gmtDate(): string;
/** 从 URL 中提取查询参数 */
export declare function extractParam(rawURL: string, key: string): string;
/** 从字符串中提取分隔符后的内容 */
export declare function splitAfter(s: string, sep: string): string;
/** 获取嵌套 map 值 */
export declare function getNestedMap(data: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null;
/** 获取嵌套的 string map */
export declare function getNestedStringMap(data: Record<string, unknown>, key: string): Record<string, string> | null;
/** 从 Set-Cookie 头中提取并保存 cookies */
export declare function saveCookies(cookies: Map<string, string>, headers: Record<string, string | string[] | undefined>): void;
//# sourceMappingURL=http-utils.d.ts.map