import { ModuleClient, SessionClient } from 'tlsclientwrapper';
import { fetch as undiciFetch } from 'undici';
import { randomIdentity } from './browser-identity';
import { newFPContext, resetPerfTiming, generateFingerprint } from './fingerprint';
import { encryptPassword } from './jwe';
import { refreshAppJSConfig } from './xxtea';
import { DEFAULT_UA, DEFAULT_SEC_UA, visitorId, awsccc, ubidGen, amznFbgId, newUUID, gmtDate, extractParam, splitAfter, saveCookies, getNestedMap, getNestedStringMap } from './http-utils';
import { MoEmailService, TempMailPlusService, DuckDuckGoEmailService, parseOutlookLines, getInboxCount, waitForOTP } from './email-service';
import { getSystemProxy, safeCreateProxyAgent } from '../proxy/systemProxy';
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export class Registrar {
    cfg;
    session = null;
    moduleClient = null;
    cookies = new Map();
    identity;
    fpCtx;
    vid;
    email = '';
    emailSvc = null;
    clientId = '';
    clientSecret = '';
    deviceCode = '';
    userCode = '';
    workflowHandle = '';
    workflowId = '';
    workflowState = '';
    ubid = '';
    regCode = '';
    signState = '';
    authCode = '';
    ssoState = '';
    wdcCSRFToken = '';
    ssoToken = '';
    outlookMailCount = 0;
    log;
    abortController = new AbortController();
    constructor(cfg, log) {
        this.cfg = cfg;
        this.identity = randomIdentity();
        this.fpCtx = newFPContext(this.identity);
        this.vid = visitorId();
        this.log = log || ((msg) => console.log(msg));
    }
    /** 中止当前注册流程 */
    abort() {
        this.abortController.abort();
    }
    checkAborted() {
        if (this.abortController.signal.aborted)
            throw new Error('注册已取消');
    }
    /** TLS SessionClient 选项 */
    get sessionOpts() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.HTTP_PROXY ||
            process.env.http_proxy ||
            getSystemProxy() ||
            undefined;
        // Match TLS fingerprint to Chrome 148 UA — rotate between recent Chrome identifiers
        const tlsIds = ['chrome_120', 'chrome_124', 'chrome_131', 'chrome_133'];
        const tlsClientIdentifier = tlsIds[Math.floor(Math.random() * tlsIds.length)];
        return {
            tlsClientIdentifier,
            timeoutSeconds: 60,
            followRedirects: true,
            insecureSkipVerify: true,
            proxyUrl
        };
    }
    /**
     * 初始化 TLS 客户端
     *
     * DLL 存储策略（按优先级，从高到低）：
     *   1. userData/tls-client/ — 应用用户数据目录（系统不会清理，**永久复用**）
     *   2. resources/ — 应用安装目录（打包资源，开发版可能不存在）
     *   3. tmpdir → 自动迁移到 userData（老版本兼容）
     *   4. GitHub 下载到 userData（最后兜底，仅首次）
     */
    async initTlsClient() {
        // 确保 tls-client 共享库可用（优先复用 userData，找不到则由 wrapper 下载）
        this.ensureTlsLib();
        this.moduleClient = new ModuleClient();
        await this.moduleClient.open();
        this.log('[TLS] open() completed, pool stats: ' + JSON.stringify(this.moduleClient.getPoolStats()));
        this.session = new SessionClient(this.moduleClient, this.sessionOpts);
    }
    /**
     * 确保 tls-client 共享库可用
     * @returns existingPath 已经存在的完整 DLL 文件路径（如有，传 customLibraryPath）
     *          downloadDir  需要下载到的目录（如未找到，传 customLibraryDownloadPath 让 tlsclientwrapper 自动下载）
     *
     * 优先放到 userData，避免被系统临时目录清理工具误删（之前用 tmpdir 会被清理）
     */
    ensureTlsLib() {
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const { app } = require('electron');
        const platform = os.platform();
        const arch = os.arch();
        let filename = 'tls-client-xgo-1.14.0-';
        if (platform === 'win32') {
            filename += (arch.includes('64') ? 'windows-amd64' : 'windows-386') + '.dll';
        }
        else if (platform === 'darwin') {
            filename += (arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64') + '.dylib';
        }
        else {
            filename += (arch === 'arm64' ? 'linux-arm64' : 'linux-amd64') + '.so';
        }
        // 1. userData 永久目录（首选）
        const userDataDir = app.getPath('userData');
        const tlsClientDir = path.join(userDataDir, 'tls-client');
        const finalPath = path.join(tlsClientDir, filename);
        // 确保目录存在
        try {
            fs.mkdirSync(tlsClientDir, { recursive: true });
        }
        catch {
            /* ignore */
        }
        // 已存在 → 直接复用
        if (fs.existsSync(finalPath)) {
            this.log('[TLS] Library reused from userData (persistent): ' + finalPath);
            return { existingPath: finalPath, downloadDir: tlsClientDir };
        }
        // 2. 从打包资源复制（安装包自带）
        const resourcePath = path.join(process.resourcesPath || '', filename);
        if (fs.existsSync(resourcePath)) {
            this.log('[TLS] Copying library from resources to userData (one-time): ' +
                resourcePath +
                ' -> ' +
                finalPath);
            try {
                fs.copyFileSync(resourcePath, finalPath);
                return { existingPath: finalPath, downloadDir: tlsClientDir };
            }
            catch (err) {
                this.log('[TLS] Failed to copy from resources: ' + err.message);
            }
        }
        this.log('[TLS] Library not found in resources, will download from GitHub. Searched: ' + resourcePath);
        return { downloadDir: tlsClientDir };
    }
    async rebuildTlsClient() {
        try {
            await this.session?.destroySession();
        }
        catch {
            /* ignore */
        }
        this.session = null;
        if (this.moduleClient) {
            try {
                await this.moduleClient.terminate();
            }
            catch {
                /* ignore */
            }
            this.moduleClient = null;
        }
        await this.initTlsClient();
    }
    /**
     * 用 undici 直接 fetch 静态资源（如 AWS signin app.js），绕过 tls-client。
     * 原因：tls-client 的 dll 是进程级单例，失败请求会污染其全局状态，
     * 导致后续重建 SessionClient 后仍报 "no tls client for modification check"。
     * 静态资源不需要 TLS 指纹伪装，直接用 Node/undici fetch 即可。
     */
    async fetchAppJS(url, init) {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.HTTP_PROXY ||
            process.env.http_proxy ||
            getSystemProxy() ||
            undefined;
        if (proxyUrl) {
            const agent = safeCreateProxyAgent(proxyUrl);
            const resp = await undiciFetch(url, { ...init, dispatcher: agent });
            return resp;
        }
        return await fetch(url, init);
    }
    isRecoverableTlsClientError(err) {
        if (!(err instanceof Error))
            return false;
        return (err.message.includes('EOF') ||
            err.message.includes('no tls client for modification check') ||
            err.message.includes('failed to modify existing client'));
    }
    /** 清理 TLS 客户端资源 */
    async cleanup() {
        if (this.session) {
            try {
                await this.session.destroySession();
            }
            catch {
                /* ignore */
            }
            this.session = null;
        }
        if (this.moduleClient) {
            try {
                await this.moduleClient.terminate();
            }
            catch (err) {
                // piscina 线程池终止时可能有排队任务被中止，属于预期行为
                const msg = err instanceof Error ? err.message : String(err);
                if (!msg.includes('aborted') && !msg.includes('terminated')) {
                    console.error('Error during ModuleClient termination:', err);
                }
            }
            this.moduleClient = null;
        }
    }
    /** 公共销毁方法，供外部调用释放资源 */
    async destroy() {
        await this.cleanup();
    }
    // ============ HTTP 工具方法 ============
    cookieString() {
        return Array.from(this.cookies.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }
    buildHeaders(referer, origin) {
        const h = {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/json',
            'User-Agent': DEFAULT_UA,
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
        if (referer)
            h['Referer'] = referer;
        if (origin)
            h['Origin'] = origin;
        if (this.cookies.size > 0)
            h['Cookie'] = this.cookieString();
        return h;
    }
    buildProfileHeaders(referer) {
        const h = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json;charset=UTF-8',
            'User-Agent': DEFAULT_UA,
            Origin: this.cfg.profileBase,
            Referer: referer,
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            priority: 'u=1, i'
        };
        const keys = ['awsccc', 'aws-user-profile-ubid', 'amznfbgid', 'i18next'];
        if (this.cookies.has('awsd2c-token'))
            keys.push('awsd2c-token', 'awsd2c-token-c');
        const parts = keys.filter((k) => this.cookies.has(k)).map((k) => `${k}=${this.cookies.get(k)}`);
        if (parts.length)
            h['Cookie'] = parts.join('; ');
        return h;
    }
    async doGet(url, headers) {
        if (!this.session)
            throw new Error('TLS 客户端未初始化');
        try {
            const resp = await this.session.get(url, { headers });
            return {
                body: resp.body || '',
                status: resp.status,
                headers: (resp.headers || {})
            };
        }
        catch (err) {
            if (this.isRecoverableTlsClientError(err)) {
                this.log('[TLS] Recoverable GET error, rebuilding TLS client: ' +
                    (err instanceof Error ? err.message : String(err)));
                await this.rebuildTlsClient();
                const resp = await this.session.get(url, { headers });
                return {
                    body: resp.body || '',
                    status: resp.status,
                    headers: (resp.headers || {})
                };
            }
            throw err;
        }
    }
    async doPost(url, payload, headers) {
        if (!this.session)
            throw new Error('TLS 客户端未初始化');
        const body = JSON.stringify(payload);
        try {
            const resp = await this.session.post(url, body, { headers });
            return {
                body: resp.body || '',
                status: resp.status,
                headers: (resp.headers || {})
            };
        }
        catch (err) {
            if (this.isRecoverableTlsClientError(err)) {
                this.log('[TLS] Recoverable POST error, rebuilding TLS client: ' +
                    (err instanceof Error ? err.message : String(err)));
                await this.rebuildTlsClient();
                const resp = await this.session.post(url, body, { headers });
                return {
                    body: resp.body || '',
                    status: resp.status,
                    headers: (resp.headers || {})
                };
            }
            throw err;
        }
    }
    /**
     * tls-client 返回的 body 是字节透传字符串（latin1）；
     * 如果响应实际是 UTF-8 编码（含中文等多字节），需要二次解码。
     * 实现：把 string 当作 latin1 字节读回，再用 UTF-8 解码；
     * 若解码后含 U+FFFD 替换字符比原文多很多，则回退原值（说明原本就是 latin1 / ASCII）。
     */
    decodeBody(body) {
        if (!body)
            return '';
        try {
            // 快速路径：纯 ASCII 直接返回
            // eslint-disable-next-line no-control-regex
            if (/^[\x00-\x7F]*$/.test(body))
                return body;
            const buf = Buffer.from(body, 'latin1');
            const utf8 = buf.toString('utf-8');
            // 检测 mojibake：原文如果在 latin1 解码 UTF-8 字节，会出现大量字符在 \u00a0-\u00ff 区间
            // 重解后如果替换字符数量明显多于原文，说明不是 UTF-8，回退原值
            const replaceInOriginal = (body.match(/\uFFFD/g) || []).length;
            const replaceInUtf8 = (utf8.match(/\uFFFD/g) || []).length;
            if (replaceInUtf8 > replaceInOriginal + 2)
                return body;
            return utf8;
        }
        catch {
            return body;
        }
    }
    parseBody(body) {
        try {
            return JSON.parse(this.decodeBody(body));
        }
        catch {
            return {};
        }
    }
    /**
     * 识别 AWS 风控触发的错误响应，返回人类可读的标签
     * @returns 风控类型标签（如 'AWS-RISK-CONTROL'），不是风控返回 null
     */
    detectRiskControl(body, status) {
        if (status !== 400)
            return null;
        const lower = body.toLowerCase();
        // 中文消息（已正确解码）
        if (body.includes('请稍后再试') && body.includes('管理员'))
            return 'AWS-RISK-CONTROL';
        if (body.includes('发生意外错误'))
            return 'AWS-RISK-CONTROL';
        // 英文消息
        if (lower.includes('try again later') && lower.includes('administrator'))
            return 'AWS-RISK-CONTROL';
        if (lower.includes('unexpected error') && lower.includes('contact'))
            return 'AWS-RISK-CONTROL';
        return null;
    }
    /** 把响应错误格式化为更友好的消息（含风控识别） */
    formatErrorBody(body, status) {
        const risk = this.detectRiskControl(body, status);
        if (risk) {
            return `${risk}（AWS 风控，建议：1) 启用代理池 N:1 分桶；2) 启用限速 + 风控自动暂停；3) 避免同邮箱域名大量注册）`;
        }
        return `status=${status} body=${body.substring(0, 200)}`;
    }
    async fetchD2CToken(origin, referer) {
        const headers = {
            Accept: '*/*',
            'Content-Type': 'application/json',
            'User-Agent': DEFAULT_UA,
            Origin: origin,
            Referer: referer,
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            priority: 'u=1, i'
        };
        const parts = [];
        if (this.cookies.has('awsccc'))
            parts.push('awsccc=' + this.cookies.get('awsccc'));
        if (this.cookies.has('awsd2c-token')) {
            const old = this.cookies.get('awsd2c-token');
            parts.push('awsd2c-token=' + old, 'awsd2c-token-c=' + old);
        }
        if (parts.length)
            headers['Cookie'] = parts.join('; ');
        const payload = {};
        if (this.cookies.has('awsd2c-token'))
            payload.token = this.cookies.get('awsd2c-token');
        const resp = await this.doPost('https://vs.aws.amazon.com/token', payload, headers);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        const tok = data.token;
        if (tok) {
            this.cookies.set('awsd2c-token', tok);
            this.cookies.set('awsd2c-token-c', tok);
            // 从 JWT 中提取 visitor ID
            const jwtParts = tok.split('.');
            if (jwtParts.length >= 2) {
                try {
                    const decoded = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString());
                    if (decoded.vid)
                        this.vid = decoded.vid;
                }
                catch {
                    /* ignore */
                }
            }
        }
    }
    // ============ 指纹生成 ============
    genFP(pageType, eventType, emailLen, emailAddr) {
        return this.genFPWithTime(pageType, eventType, 0, emailLen, emailAddr);
    }
    genFPWithTime(pageType, eventType, timeOnPage, emailLen, emailAddr) {
        const did = this.cfg.directoryId;
        let loc = '', ref = '';
        switch (pageType) {
            case 'signin':
                loc = `${this.cfg.signinBase}/platform/${did}/login?workflowStateHandle=${this.workflowHandle}`;
                break;
            case 'signup':
                loc = `${this.cfg.signinBase}/platform/${did}/signup?workflowStateHandle=${this.workflowHandle}`;
                break;
            default: // profile
                if (eventType === 'PageSubmit') {
                    loc = `${this.cfg.profileBase}/?workflowID=${this.workflowId}#/signup/enter-email`;
                }
                else {
                    loc = `${this.cfg.profileBase}/?workflowID=${this.workflowId}#/signup/start`;
                }
                if (!this.workflowId)
                    loc = this.cfg.profileBase + '/';
        }
        if (pageType === 'profile') {
            ref = `${this.cfg.signinBase}/platform/${did}/signup?workflowStateHandle=${this.workflowHandle}`;
        }
        else {
            ref = this.cfg.viewBase + '/';
        }
        return generateFingerprint(this.identity, loc, ref, this.fpCtx, pageType, eventType, timeOnPage, emailLen, emailAddr);
    }
    // ============ 注册步骤 ============
    async step1OIDC() {
        this.log('[1] OIDC 注册');
        const payload = {
            clientName: 'Amazon Q Developer for command line',
            clientType: 'public',
            scopes: [
                'codewhisperer:completions',
                'codewhisperer:analysis',
                'codewhisperer:conversations',
                'codewhisperer:transformations',
                'codewhisperer:taskassist'
            ]
        };
        const headers = { 'Content-Type': 'application/json' };
        let resp = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                resp = await this.doPost(this.cfg.oidcBase + '/client/register', payload, headers);
                if (resp.status === 200)
                    break;
            }
            catch (err) {
                if (attempt < 2) {
                    this.log(`[1] OIDC 重试 (${attempt + 1}/3)...`);
                    await sleep(2000 * (attempt + 1));
                    await this.rebuildTlsClient();
                    continue;
                }
                throw err;
            }
        }
        if (!resp)
            throw new Error('OIDC 注册失败: 所有重试均失败');
        const data = this.parseBody(resp.body);
        this.clientId = data.clientId || '';
        this.clientSecret = data.clientSecret || '';
        if (!this.clientId)
            throw new Error(`OIDC 注册失败: ${resp.body.slice(0, 200)}`);
    }
    async step2Device() {
        this.log('[2] 设备授权');
        const resp = await this.doPost(this.cfg.oidcBase + '/device_authorization', {
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            startUrl: this.cfg.startURL
        }, { 'Content-Type': 'application/json' });
        const data = this.parseBody(resp.body);
        this.deviceCode = data.deviceCode || '';
        this.userCode = data.userCode || '';
        this.log(`user_code=${this.userCode}`);
    }
    async step3Email() {
        if (this.cfg.manualMode)
            return; // 手动模式在外部设置
        if (this.cfg.useOutlook && this.cfg.outlookData) {
            this.log('[3] 使用 Outlook 邮箱');
            const accounts = parseOutlookLines(this.cfg.outlookData);
            if (accounts.length === 0)
                throw new Error('无可用的 Outlook 账号');
            // 单行 → 直接用（批量并发时前端已为每个 task 切一行，避免并发抢占）
            // 多行（单次注册）→ 随机挑一行
            const acc = accounts.length === 1 ? accounts[0] : accounts[Math.floor(Math.random() * accounts.length)];
            this.email = acc.email;
            this.log(`email=${this.email}`);
            return;
        }
        if (this.cfg.useTempMailPlus) {
            this.log('[3] 使用自建域名邮箱 (TempMail.Plus)');
            if (!this.cfg.tempMailPlusEmail ||
                !this.cfg.tempMailPlusEpin ||
                !this.cfg.tempMailPlusDomain) {
                throw new Error('TempMail.Plus 配置不完整');
            }
            this.emailSvc = new TempMailPlusService(this.cfg.tempMailPlusEmail, this.cfg.tempMailPlusEpin, this.cfg.tempMailPlusDomain);
            this.email = await this.emailSvc.create();
            if (!this.email)
                throw new Error('生成邮箱地址失败');
            this.log(`email=${this.email}`);
            return;
        }
        if (this.cfg.useDDG) {
            this.log('[3] 使用 DuckDuckGo Email Protection');
            if (!this.cfg.ddgAuthToken || !this.cfg.ddgGmailEmail) {
                throw new Error('DDG 配置不完整 (需要 authToken 和 Gmail 地址)');
            }
            const gmailAccount = {
                email: this.cfg.ddgGmailEmail,
                accessToken: this.cfg.ddgGmailAccessToken,
                appPassword: this.cfg.ddgGmailAppPassword || undefined
            };
            this.emailSvc = new DuckDuckGoEmailService(this.cfg.ddgAuthToken, gmailAccount);
            this.email = await this.emailSvc.create();
            if (!this.email)
                throw new Error('DDG 地址生成失败');
            this.log(`email=${this.email}`);
            return;
        }
        this.log('[3] 创建临时邮箱');
        if (!this.cfg.moEmailBaseURL)
            throw new Error('MoEmail 未配置');
        this.emailSvc = new MoEmailService(this.cfg.moEmailBaseURL, this.cfg.moEmailAPIKey);
        this.email = await this.emailSvc.create();
        if (!this.email)
            throw new Error('创建临时邮箱失败');
        this.log(`email=${this.email}`);
    }
    async step4Portal() {
        this.log('[4] Portal 初始化');
        this.cookies.set('awsccc', awsccc());
        this.cookies.set('amznfbgid', amznFbgId());
        const redirect = `${this.cfg.viewBase}/start/#/device?user_code=${this.userCode}`;
        const url = `${this.cfg.portalBase}/login?directory_id=view&redirect_url=${redirect}`;
        const h = {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            Origin: this.cfg.viewBase,
            Referer: this.cfg.viewBase + '/',
            'User-Agent': DEFAULT_UA,
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site'
        };
        const resp = await this.doGet(url, h);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        const rurl = data.redirectUrl || '';
        if (rurl.includes('workflowStateHandle=')) {
            this.workflowHandle = splitAfter(rurl, 'workflowStateHandle=');
        }
        if (data.csrfToken)
            this.cookies.set('loginCsrfToken', data.csrfToken);
        if (!this.workflowHandle)
            throw new Error('Portal 未返回 workflow handle');
        const loginURL = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
        await this.fetchD2CToken(this.cfg.signinBase, loginURL);
    }
    async step5WorkflowInit() {
        this.log('[5] 工作流初始化');
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
        let fp = this.genFP('signin', 'first_load', 0, '');
        let rid = newUUID();
        let h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        let resp = await this.doPost(api, {
            stepId: '',
            workflowStateHandle: this.workflowHandle,
            inputs: [{ input_type: 'FingerPrintRequestInput', fingerPrint: fp }],
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        let data = this.parseBody(resp.body);
        if (data.workflowStateHandle)
            this.workflowHandle = data.workflowStateHandle;
        if (data.stepId === 'start') {
            fp = this.genFP('signin', 'PageLoad', 0, '');
            rid = newUUID();
            h = this.buildHeaders(ref, this.cfg.signinBase);
            h['x-amzn-requestid'] = rid;
            h['x-amz-date'] = gmtDate();
            h['priority'] = 'u=1, i';
            resp = await this.doPost(api, {
                stepId: 'start',
                workflowStateHandle: this.workflowHandle,
                inputs: [{ input_type: 'FingerPrintRequestInput', fingerPrint: fp }],
                requestId: rid
            }, h);
            saveCookies(this.cookies, resp.headers);
            data = this.parseBody(resp.body);
            if (data.workflowStateHandle)
                this.workflowHandle = data.workflowStateHandle;
        }
    }
    async step6SubmitEmail() {
        this.log(`[6] 提交邮箱 ${this.email}`);
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
        const fp = this.genFP('signin', 'PageSubmit', this.email.length, this.email);
        const rid = newUUID();
        const h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        const resp = await this.doPost(api, {
            stepId: 'get-identity-user',
            workflowStateHandle: this.workflowHandle,
            actionId: 'SUBMIT',
            inputs: [
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'ApplicationTypeRequestInput', applicationType: 'SSO_INDIVIDUAL_ID' },
                {
                    input_type: 'UserEventRequestInput',
                    directoryId: this.cfg.directoryId,
                    userName: this.email,
                    userEvents: [
                        {
                            input_type: 'UserEvent',
                            eventType: 'PAGE_SUBMIT',
                            pageName: 'IDENTIFICATION',
                            timeSpentOnPage: 5000
                        }
                    ]
                },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        if (data.workflowStateHandle)
            this.workflowHandle = data.workflowStateHandle;
        if (resp.status === 400)
            return 'signup';
        if (resp.status === 200)
            return 'login';
        throw new Error(`提交邮箱失败: ${resp.status} - ${resp.body.slice(0, 200)}`);
    }
    async step7Signup() {
        this.log('[7] 注册 (SIGNUP)');
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
        const fp = this.genFP('signup', 'PageSubmit', 0, '');
        const rid = newUUID();
        const h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        const resp = await this.doPost(api, {
            stepId: 'get-identity-user',
            workflowStateHandle: this.workflowHandle,
            actionId: 'SIGNUP',
            inputs: [
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        const redir = data.redirect;
        const rurl = redir?.url;
        if (rurl?.includes('workflowStateHandle=')) {
            this.workflowHandle = splitAfter(rurl, 'workflowStateHandle=');
        }
    }
    async step7_5SignupInit() {
        this.log('[7.5] Signup API 初始化');
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup?workflowStateHandle=${this.workflowHandle}`;
        let fp = this.genFP('signup', 'first_load', 0, '');
        let rid = newUUID();
        let h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        let resp = await this.doPost(api, {
            stepId: '',
            workflowStateHandle: this.workflowHandle,
            inputs: [
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        let data = this.parseBody(resp.body);
        if (data.workflowStateHandle)
            this.workflowHandle = data.workflowStateHandle;
        if (data.stepId !== 'start')
            throw new Error(`Signup init 返回意外 stepId: ${data.stepId}, resp status: ${resp.status}, body: ${resp.body.substring(0, 200)}`);
        fp = this.genFP('signup', 'PageLoad', 0, '');
        rid = newUUID();
        h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        resp = await this.doPost(api, {
            stepId: 'start',
            workflowStateHandle: this.workflowHandle,
            inputs: [
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        data = this.parseBody(resp.body);
        if (data.workflowStateHandle)
            this.workflowHandle = data.workflowStateHandle;
        const redir = data.redirect;
        const rurl = redir?.url;
        if (rurl?.includes('workflowID=')) {
            let wid = splitAfter(rurl, 'workflowID=');
            const hashIdx = wid.indexOf('#');
            if (hashIdx >= 0)
                wid = wid.slice(0, hashIdx);
            this.workflowId = wid;
        }
        if (!this.workflowId)
            throw new Error('Signup init 未返回 workflowID');
    }
    async step7_8ProfileInit() {
        this.log('[7.8] Profile 页面初始化');
        this.ubid = ubidGen();
        this.cookies.set('aws-user-profile-ubid', this.ubid);
        // amznfbgid is Amazon's fraud detection localStorage ID — must be present
        if (!this.cookies.has('amznfbgid'))
            this.cookies.set('amznfbgid', amznFbgId());
        // Don't set i18next — let the server set it via Set-Cookie to avoid locale mismatch
        if (!this.cookies.has('awsccc'))
            this.cookies.set('awsccc', awsccc());
        const url = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
        const resp = await this.doGet(url, {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': DEFAULT_UA,
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate'
        });
        saveCookies(this.cookies, resp.headers);
        resetPerfTiming(this.fpCtx);
        await this.fetchD2CToken(this.cfg.profileBase, url);
    }
    async step8ProfileStart() {
        this.log('[8] Profile 启动');
        const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
        const fp = this.genFP('profile', 'PageLoad', 0, '');
        const resp = await this.doPost(this.cfg.profileBase + '/api/start', {
            workflowID: this.workflowId,
            browserData: {
                attributes: {
                    fingerprint: fp,
                    eventTimestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
                    timeSpentOnPage: String(800 + Math.floor(Math.random() * 2200)),
                    eventType: 'PageLoad',
                    ubid: this.ubid,
                    visitorId: this.vid
                },
                cookies: {}
            }
        }, this.buildProfileHeaders(ref));
        const data = this.parseBody(resp.body);
        this.workflowState = data.workflowState || '';
        if (!this.workflowState)
            throw new Error(`Profile start 未返回 workflowState: ${resp.body.slice(0, 200)}`);
    }
    async step9SendOTP() {
        this.log('[9] 发送验证码');
        if (this.cfg.useOutlook && this.cfg.outlookData) {
            const accounts = parseOutlookLines(this.cfg.outlookData);
            const acc = accounts.find((a) => a.email === this.email);
            if (acc) {
                try {
                    this.outlookMailCount = await getInboxCount(acc);
                    this.log(`发送前邮件数: ${this.outlookMailCount}`);
                }
                catch (err) {
                    this.log(`获取邮件数量失败: ${err}, 默认为0`);
                }
            }
        }
        const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
        const timeOnPage = 5000 + Math.floor(Math.random() * 3001);
        const fp = this.genFPWithTime('profile', 'PageSubmit', timeOnPage, this.email.length, this.email);
        const tsp = String(timeOnPage);
        const payload = {
            workflowState: this.workflowState,
            email: this.email,
            browserData: {
                attributes: {
                    fingerprint: fp,
                    eventTimestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
                    timeSpentOnPage: tsp,
                    pageName: 'EMAIL_COLLECTION',
                    eventType: 'PageSubmit',
                    ubid: this.ubid,
                    visitorId: this.vid
                },
                cookies: {}
            }
        };
        const resp = await this.doPost(this.cfg.profileBase + '/api/send-otp', payload, this.buildProfileHeaders(ref));
        if (resp.status !== 200)
            throw new Error(`send-otp 失败 (${resp.status}), body: ${resp.body.substring(0, 300)}`);
        this.log('验证码已发送');
    }
    async step10GetOTP() {
        if (this.cfg.manualMode)
            throw new Error('手动模式需外部提供验证码');
        this.log('[10] 等待验证码');
        if (this.cfg.useOutlook && this.cfg.outlookData) {
            const accounts = parseOutlookLines(this.cfg.outlookData);
            const acc = accounts.find((a) => a.email === this.email);
            if (!acc)
                throw new Error('未找到对应 Outlook 账号');
            return await waitForOTP(acc, this.outlookMailCount, 120, 5, () => this.abortController.signal.aborted);
        }
        if (!this.emailSvc)
            throw new Error('邮箱服务未初始化');
        return await this.emailSvc.waitForCode(120, 3, () => this.abortController.signal.aborted);
    }
    async step11CreateIdentity(otp) {
        this.log('[11] 创建身份');
        const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
        const fp = this.genFP('profile', 'EmailVerification', 0, '');
        const resp = await this.doPost(this.cfg.profileBase + '/api/create-identity', {
            workflowState: this.workflowState,
            userData: { email: this.email, fullName: this.cfg.fullName },
            otpCode: otp,
            browserData: {
                attributes: {
                    fingerprint: fp,
                    eventTimestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
                    timeSpentOnPage: String(30000 + Math.floor(Math.random() * 30000)),
                    pageName: 'EMAIL_VERIFICATION',
                    eventType: 'EmailVerification',
                    ubid: this.ubid,
                    visitorId: this.vid
                },
                cookies: {}
            }
        }, this.buildProfileHeaders(ref));
        const data = this.parseBody(resp.body);
        this.regCode = data.registrationCode || '';
        this.signState = data.signInState || '';
        if (!this.regCode)
            throw new Error(`create-identity 未返回 registrationCode: ${resp.body.slice(0, 200)}`);
    }
    async step12SetPassword() {
        this.log('[12] 设置密码');
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup?registrationCode=${this.regCode}&state=${this.signState}`;
        let fp = this.genFP('signup', 'PageSubmit', 0, '');
        // 12a: 获取加密公钥
        let rid = newUUID();
        let h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        let resp = await this.doPost(api, {
            stepId: '',
            state: this.signState,
            inputs: [
                {
                    input_type: 'UserRegistrationRequestInput',
                    registrationCode: this.regCode,
                    state: this.signState
                },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        let data = this.parseBody(resp.body);
        this.workflowHandle = data.workflowStateHandle || '';
        const encCtx = getNestedMap(data, 'workflowResponseData', 'encryptionContextResponse');
        const pubKeyMap = encCtx ? getNestedStringMap(encCtx, 'publicKey') : null;
        if (!pubKeyMap?.n)
            throw new Error(`未获取到加密公钥: ${this.formatErrorBody(resp.body, resp.status)}`);
        const issuer = encCtx?.issuer || 'signin';
        const audience = encCtx?.audience || 'AWSPasswordService';
        const region = encCtx?.region || 'us-east-1';
        const encrypted = encryptPassword(this.cfg.password, pubKeyMap, issuer, audience, region);
        // 12b: 提交密码
        fp = this.genFP('signup', 'PageSubmit', 0, '');
        rid = newUUID();
        h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        resp = await this.doPost(api, {
            stepId: 'get-new-password-for-password-creation',
            workflowStateHandle: this.workflowHandle,
            actionId: 'SUBMIT',
            inputs: [
                {
                    input_type: 'PasswordRequestInput',
                    password: encrypted,
                    successfullyEncrypted: 'SUCCESSFUL'
                },
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        data = this.parseBody(resp.body);
        const redir = data.redirect;
        const rurl = redir?.url;
        if (!rurl)
            throw new Error(`密码设置未返回 redirect: ${resp.body.slice(0, 200)}`);
        const wh = extractParam(rurl, 'workflowStateHandle');
        const st = extractParam(rurl, 'state');
        const rh = extractParam(rurl, 'workflowResultHandle');
        await this.completeSignup(wh, st, rh);
    }
    async completeSignup(wh, state, rh) {
        this.log('[12.5] 完成注册工作流');
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${wh}&state=${state}&workflowResultHandle=${rh}`;
        const fp = this.genFP('signin', 'PageLoad', 0, '');
        const rid = newUUID();
        const h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        const resp = await this.doPost(api, {
            stepId: '',
            workflowStateHandle: wh,
            workflowResultHandle: rh,
            state,
            inputs: [
                { input_type: 'UserRequestInput', username: this.email },
                { input_type: 'FingerPrintRequestInput', fingerPrint: fp }
            ],
            visitorId: this.vid,
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        if (data.stepId !== 'end-of-workflow-success')
            throw new Error(`完成工作流失败: ${data.stepId || 'undefined'} ${this.formatErrorBody(resp.body, resp.status)}`);
        const redir = data.redirect;
        const rurl = redir?.url;
        if (rurl) {
            this.authCode = extractParam(rurl, 'workflowResultHandle');
            this.ssoState = extractParam(rurl, 'state');
            this.wdcCSRFToken = extractParam(rurl, 'wdc_csrf_token');
        }
    }
    // ============ SSO 授权 (Step12.8-13) ============
    async step12_8SSOWorkflow() {
        this.log('[12.8] SSO 工作流');
        const redirectURL = encodeURIComponent(this.cfg.viewBase + '/start/#/');
        const loginURL = `${this.cfg.portalBase}/login?directory_id=view&redirect_url=${redirectURL}`;
        const h = {
            Accept: '*/*',
            'User-Agent': DEFAULT_UA,
            Origin: this.cfg.viewBase,
            Referer: this.cfg.viewBase + '/',
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            priority: 'u=1, i'
        };
        if (this.cookies.has('awsccc'))
            h['Cookie'] = 'awsccc=' + this.cookies.get('awsccc');
        const resp = await this.doGet(loginURL, h);
        saveCookies(this.cookies, resp.headers);
        const data = this.parseBody(resp.body);
        if (data.csrfToken)
            this.cookies.set('loginCsrfToken', data.csrfToken);
        const rurl = data.redirectUrl || '';
        let wh = '';
        if (rurl.includes('workflowStateHandle=')) {
            wh = splitAfter(rurl, 'workflowStateHandle=');
        }
        if (!wh)
            throw new Error('SSO 无法获取 workflowStateHandle');
        await this.completeSSOWorkflow(wh);
    }
    async completeSSOWorkflow(wh) {
        const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
        const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${wh}`;
        let fp = this.genFP('signin', 'PageLoad', 0, '');
        let rid = newUUID();
        let h = this.buildHeaders(ref, this.cfg.signinBase);
        h['x-amzn-requestid'] = rid;
        h['x-amz-date'] = gmtDate();
        h['priority'] = 'u=1, i';
        let resp = await this.doPost(api, {
            stepId: '',
            workflowStateHandle: wh,
            inputs: [{ input_type: 'FingerPrintRequestInput', fingerPrint: fp }],
            requestId: rid
        }, h);
        saveCookies(this.cookies, resp.headers);
        let data = this.parseBody(resp.body);
        let newWH = data.workflowStateHandle || wh;
        if (data.stepId === 'start') {
            fp = this.genFP('signin', 'PageLoad', 0, '');
            rid = newUUID();
            h = this.buildHeaders(ref, this.cfg.signinBase);
            h['x-amzn-requestid'] = rid;
            h['x-amz-date'] = gmtDate();
            h['priority'] = 'u=1, i';
            resp = await this.doPost(api, {
                stepId: 'start',
                workflowStateHandle: newWH,
                inputs: [{ input_type: 'FingerPrintRequestInput', fingerPrint: fp }],
                requestId: rid
            }, h);
            saveCookies(this.cookies, resp.headers);
            data = this.parseBody(resp.body);
        }
        if (data.stepId === 'end-of-workflow-success') {
            const redir = data.redirect;
            const rurl = redir?.url;
            if (rurl) {
                this.authCode = extractParam(rurl, 'workflowResultHandle');
                this.ssoState = extractParam(rurl, 'state');
                this.wdcCSRFToken = extractParam(rurl, 'wdc_csrf_token');
            }
        }
        // 访问 start 页面
        const params = new URLSearchParams();
        if (this.ssoState)
            params.set('state', this.ssoState);
        params.set('workflowResultHandle', this.authCode);
        if (this.wdcCSRFToken)
            params.set('wdc_csrf_token', this.wdcCSRFToken);
        const startURL = this.cfg.viewBase + '/start/?' + params.toString();
        const cookieParts = [];
        if (this.cookies.has('loginCsrfToken'))
            cookieParts.push('loginCsrfToken=' + this.cookies.get('loginCsrfToken'));
        if (this.cookies.has('awsccc'))
            cookieParts.push('awsccc=' + this.cookies.get('awsccc'));
        await this.doGet(startURL, {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': DEFAULT_UA,
            Referer: this.cfg.signinBase + '/',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            ...(cookieParts.length ? { Cookie: cookieParts.join('; ') } : {})
        });
    }
    async step13SSOToken() {
        this.log('[13] 获取 SSO Token');
        const csrf = this.cookies.get('loginCsrfToken');
        if (!csrf)
            throw new Error('缺少 loginCsrfToken');
        const h = {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': DEFAULT_UA,
            Origin: this.cfg.viewBase,
            Referer: this.cfg.viewBase + '/',
            'x-amz-sso-csrf-token': csrf,
            'sec-ch-ua': DEFAULT_SEC_UA,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            priority: 'u=1, i'
        };
        const formData = `authCode=${encodeURIComponent(this.authCode)}&state=${encodeURIComponent(this.ssoState)}&orgId=view`;
        // 使用新客户端轮询 SSO Token
        const ssoSession = new SessionClient(this.moduleClient, this.sessionOpts);
        try {
            for (let retry = 0; retry < 5; retry++) {
                const resp = await ssoSession.post(this.cfg.portalBase + '/auth/sso-token', formData, {
                    headers: h
                });
                const data = JSON.parse(resp.body || '{}');
                if (data.token) {
                    this.ssoToken = data.token;
                    break;
                }
                const errMsg = (data.errorMessage || '');
                if (errMsg.toLowerCase().includes('not authorized')) {
                    await sleep(3000);
                    continue;
                }
                throw new Error(`SSO Token 失败: ${resp.body?.slice(0, 200)}`);
            }
        }
        finally {
            try {
                await ssoSession.destroySession();
            }
            catch {
                /* ignore */
            }
        }
        if (!this.ssoToken)
            throw new Error('SSO Token 重试 5 次仍失败');
        // Accept device + Associate token
        let resp = await this.doPost(this.cfg.oidcBase + '/device_authorization/accept_user_code', {
            userCode: this.userCode,
            userSessionId: this.ssoToken
        }, { 'Content-Type': 'application/json' });
        const dcData = this.parseBody(resp.body);
        const dc = dcData.deviceContext;
        await this.doPost(this.cfg.oidcBase + '/device_authorization/associate_token', {
            deviceContext: dc,
            userSessionId: this.ssoToken
        }, { 'Content-Type': 'application/json' });
        // 轮询 token
        for (let i = 0; i < 30; i++) {
            resp = await this.doPost(this.cfg.oidcBase + '/token', {
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                deviceCode: this.deviceCode,
                grantType: 'urn:ietf:params:oauth:grant-type:device_code'
            }, { 'Content-Type': 'application/json' });
            if (resp.status === 200)
                return this.parseBody(resp.body);
            await sleep(2000);
        }
        throw new Error('Token 轮询超时');
    }
    // ============ 主流程 ============
    /** 执行完整注册流程（自动模式） */
    async run() {
        try {
            await this.initTlsClient();
            await refreshAppJSConfig((url, init) => this.fetchAppJS(url, init));
            await this.rebuildTlsClient();
            const initSteps = [
                { name: 'OIDC', fn: () => this.step1OIDC() },
                { name: 'Device', fn: () => this.step2Device() },
                { name: 'Email', fn: () => this.step3Email() },
                { name: 'Portal', fn: () => this.step4Portal() },
                { name: 'WorkflowInit', fn: () => this.step5WorkflowInit() }
            ];
            for (const s of initSteps) {
                this.checkAborted();
                try {
                    await s.fn();
                }
                catch (err) {
                    return {
                        status: 'failed',
                        email: this.email,
                        error: `[${s.name}] ${err.message}`
                    };
                }
            }
            this.checkAborted();
            const emailStatus = await this.step6SubmitEmail();
            if (emailStatus === 'signup') {
                const signupSteps = [
                    { name: 'Signup', fn: () => this.step7Signup() },
                    { name: 'SignupInit', fn: () => this.step7_5SignupInit() },
                    { name: 'ProfileInit', fn: () => this.step7_8ProfileInit() },
                    { name: 'ProfileStart', fn: () => this.step8ProfileStart() },
                    { name: 'SendOTP', fn: () => this.step9SendOTP() }
                ];
                for (const s of signupSteps) {
                    this.checkAborted();
                    try {
                        await s.fn();
                    }
                    catch (err) {
                        return {
                            status: 'failed',
                            email: this.email,
                            error: `[${s.name}] ${err.message}`
                        };
                    }
                }
                this.checkAborted();
                let otp;
                try {
                    otp = await this.step10GetOTP();
                }
                catch (err) {
                    return {
                        status: 'failed',
                        email: this.email,
                        error: `[GetOTP] ${err.message}`
                    };
                }
                for (const s of [
                    { name: 'CreateIdentity', fn: () => this.step11CreateIdentity(otp) },
                    { name: 'SetPassword', fn: () => this.step12SetPassword() }
                ]) {
                    this.checkAborted();
                    try {
                        await s.fn();
                    }
                    catch (err) {
                        return {
                            status: 'failed',
                            email: this.email,
                            error: `[${s.name}] ${err.message}`
                        };
                    }
                }
            }
            else {
                return { status: 'failed', email: this.email, error: '该邮箱已注册过' };
            }
            this.checkAborted();
            try {
                await this.step12_8SSOWorkflow();
            }
            catch (err) {
                return {
                    status: 'failed',
                    email: this.email,
                    error: `[SSOWorkflow] ${err.message}`
                };
            }
            await sleep(2000);
            this.checkAborted();
            let awsToken;
            try {
                awsToken = await this.step13SSOToken();
            }
            catch (err) {
                return {
                    status: 'failed',
                    email: this.email,
                    error: `[SSOToken] ${err.message}`
                };
            }
            // Do NOT call verifyAlive here — hitting getUsageLimits immediately after account
            // creation without a real browser WAF token is the primary suspension trigger.
            // The account refresh cycle will verify the account naturally when first used.
            return {
                status: 'success',
                email: this.email,
                password: this.cfg.password,
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                refreshToken: awsToken.refreshToken || '',
                accessToken: awsToken.accessToken || '',
                region: 'us-east-1',
                provider: 'BuilderId'
            };
        }
        finally {
            await this.cleanup();
        }
    }
    /**
     * 返回本次注册实际生效的代理 URL（按 sessionOpts 同样的优先级解析），
     * 用于在指纹摘要里准确显示是直连还是走代理。
     */
    resolvedProxyUrl() {
        return ((this.cfg.proxy && this.cfg.proxy.trim()) ||
            process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.HTTP_PROXY ||
            process.env.http_proxy ||
            getSystemProxy() ||
            undefined);
    }
    /** 输出本次注册使用的指纹摘要（用于审计与后续复用） */
    fingerprintSnapshot() {
        const resolved = this.resolvedProxyUrl();
        return {
            chromeVer: this.identity.chromeVer,
            ua: this.identity.ua,
            gpuVendor: this.identity.gpuVendor,
            gpuModel: this.identity.gpuModel,
            canvasHash: this.identity.canvasHash,
            screen: { width: this.identity.screen.width, height: this.identity.screen.height },
            // 脱敏后保存（隐藏密码部分），同时确保系统/环境变量代理也被捕获
            proxyUrl: resolved ? resolved.replace(/:([^:@/]+)@/, ':***@') : undefined
        };
    }
    /** 手动模式注册 - Step1-2 自动，Step3 等待外部设置邮箱，Step4-9 自动，Step10 等待外部 OTP */
    async runManualPhase1() {
        try {
            await this.initTlsClient();
            await refreshAppJSConfig((url, init) => this.fetchAppJS(url, init));
            await this.rebuildTlsClient();
            await this.step1OIDC();
            await this.step2Device();
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    /** 手动模式 - 设置邮箱后继续注册流程到发送 OTP */
    async runManualPhase2(email, fullName) {
        this.email = email;
        if (fullName)
            this.cfg.fullName = fullName;
        try {
            await this.step4Portal();
            await this.step5WorkflowInit();
            const status = await this.step6SubmitEmail();
            if (status !== 'signup')
                return { success: false, error: '该邮箱已注册过' };
            await this.step7Signup();
            await this.step7_5SignupInit();
            await this.step7_8ProfileInit();
            await this.step8ProfileStart();
            await this.step9SendOTP();
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    /** 手动模式 - 输入 OTP 后完成注册 */
    async runManualPhase3(otp) {
        try {
            await this.step11CreateIdentity(otp);
            await this.step12SetPassword();
            await this.step12_8SSOWorkflow();
            await sleep(2000);
            const awsToken = await this.step13SSOToken();
            // Do NOT call verifyAlive — same reason as auto mode
            return {
                status: 'success',
                email: this.email,
                password: this.cfg.password,
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                refreshToken: awsToken.refreshToken || '',
                accessToken: awsToken.accessToken || '',
                region: 'us-east-1',
                provider: 'BuilderId'
            };
        }
        catch (err) {
            return { status: 'failed', email: this.email, error: err.message };
        }
        finally {
            await this.cleanup();
        }
    }
}
//# sourceMappingURL=registrar.js.map