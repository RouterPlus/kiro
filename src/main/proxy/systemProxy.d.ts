import { type Dispatcher } from 'undici';
export declare function getSystemProxy(): string | null;
/**
 * 安全地创建 undici Dispatcher
 *
 * 支持协议：
 *   - http: / https: → undici 原生 ProxyAgent
 *   - socks5: / socks4: → 通过 socks 包 + undici Agent 的 connect 钩子实现 SOCKS 隧道
 *
 * URL 无效或协议无法支持时返回 undefined，让调用方回退直连，
 * 而不会让异常向上传播阻塞业务流程。
 */
export declare function safeCreateProxyAgent(proxyUrl: string | null | undefined): Dispatcher | undefined;
//# sourceMappingURL=systemProxy.d.ts.map