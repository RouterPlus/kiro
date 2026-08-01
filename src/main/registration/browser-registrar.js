import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import { BrowserWindow, session } from 'electron';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { getSystemProxy } from '../proxy/systemProxy';
import { DuckDuckGoEmailService, MoEmailService, TempMailPlusService, ProvidedEmailService, parseProvidedEmailLines } from './email-service';
import { randomFullName } from './browser-identity';
import { genPassword } from './config';
const OIDC_BASE = 'https://oidc.us-east-1.amazonaws.com';
//const VIEW_BASE = 'https://view.awsapps.com'
//const START_URL = 'https://view.awsapps.com/start'
const KIRO_SCOPES = 'codewhisperer:completions,codewhisperer:analysis,codewhisperer:conversations,codewhisperer:transformations,codewhisperer:taskassist';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function randomDelay(min, max) {
    return sleep(min + Math.random() * (max - min));
}
function isWindowUsable(win) {
    try {
        return !win.isDestroyed() && !win.webContents.isDestroyed();
    }
    catch {
        return false;
    }
}
function getProxyUrl(cfgProxy) {
    return (cfgProxy ||
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        getSystemProxy() ||
        undefined);
}
async function apiFetch(url, options = {}) {
    const h = { 'User-Agent': BROWSER_UA, ...(options.headers || {}) };
    const fetchOpts = {
        method: options.method || 'GET',
        headers: h,
        body: options.body
    };
    const proxyUrl = getProxyUrl(options.proxyUrl);
    if (proxyUrl) {
        const agent = new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } });
        fetchOpts.dispatcher = agent;
    }
    const resp = await undiciFetch(url, fetchOpts);
    const body = await resp.text();
    return { status: resp.status, body };
}
/** Poll for a CSS selector to appear. Returns true if found, false if timed out. */
async function waitForSelector(win, selector, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isWindowUsable(win))
            return false;
        try {
            const found = await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`);
            if (found)
                return true;
        }
        catch {
            /* navigating */
        }
        await sleep(500);
    }
    return false;
}
/** Wait for page load + extra settle time. */
async function waitForPageLoad(win, extraMs = 1500) {
    if (!isWindowUsable(win))
        return;
    await new Promise((resolve) => {
        if (!isWindowUsable(win))
            return resolve();
        const done = () => {
            if (win.webContents.isDestroyed())
                return resolve();
            win.webContents.removeListener('did-finish-load', done);
            win.webContents.removeListener('did-fail-load', done);
            resolve();
        };
        try {
            if (!win.webContents.isLoading()) {
                resolve();
            }
            else {
                win.webContents.once('did-finish-load', done);
                win.webContents.once('did-fail-load', done);
            }
        }
        catch {
            resolve();
        }
    });
    await randomDelay(extraMs, extraMs + 1000);
}
async function getFatalRegistrationPageError(win) {
    if (!isWindowUsable(win))
        return null;
    return win.webContents
        .executeJavaScript(`
      (function() {
        const text = (document.body && document.body.innerText) || '';
        const heading = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
          .map((el) => (el.textContent || '').trim())
          .join('\\n');
        if (/sign\\s*in\\s*with\\s*your\\s*aws\\s*builder\\s*id/i.test(heading) ||
            /sign\\s*in\\s*with\\s*your\\s*aws\\s*builder\\s*id/i.test(text)) {
          return 'AWS Builder ID sign-in page detected instead of signup';
        }
        if (/\\berror\\b[\\s\\S]*sorry,\\s*there\\s*was\\s*an\\s*error\\s*processing\\s*your\\s*request\\.\\s*please\\s*try\\s*again\\./i.test(text)) {
          return 'AWS request processing error page detected';
        }
        if (/it(?:'|’)?s\\s*not\\s*you,?\\s*it(?:'|’)?s\\s*us[\\s\\S]*we\\s*couldn(?:'|’)?t\\s*complete\\s*your\\s*request\\s*right\\s*now\\.\\s*please\\s*try\\s*again\\s*later\\./i.test(text)) {
          return 'AWS could not complete request page detected';
        }
        return null;
      })()
    `)
        .catch(() => null);
}
async function failOnFatalRegistrationPageError(win, context) {
    const error = await getFatalRegistrationPageError(win);
    if (!error)
        return;
    throw new Error(`${error}${context ? ` (${context})` : ''}`);
}
/** Dismiss cookie banner then click selector. Retries 3x. */
async function clickWithCookieDismiss(win, selector, timeoutMs = 10000) {
    const dismissCookies = async () => {
        if (!isWindowUsable(win))
            return;
        await win.webContents
            .executeJavaScript(`
      (function() {
        const btn = document.querySelector('button[data-id="awsccc-cb-btn-accept"]');
        if (btn) btn.click();
      })()
    `)
            .catch(() => { });
        await sleep(300);
    };
    await dismissCookies();
    const deadline = Date.now() + timeoutMs;
    let found = false;
    while (Date.now() < deadline && isWindowUsable(win)) {
        await failOnFatalRegistrationPageError(win, `waiting for ${selector}`);
        found = await win.webContents
            .executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)
            .catch(() => false);
        if (found)
            break;
        await sleep(500);
    }
    if (!found) {
        await failOnFatalRegistrationPageError(win, `selector not found: ${selector}`);
        return false;
    }
    for (let i = 0; i < 3; i++) {
        await failOnFatalRegistrationPageError(win, `before clicking ${selector}`);
        if (!isWindowUsable(win))
            return false;
        await dismissCookies();
        await win.webContents
            .executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.click();
      })()
    `)
            .catch(() => { });
        await sleep(400);
        if (!isWindowUsable(win))
            return true;
        await failOnFatalRegistrationPageError(win, `after clicking ${selector}`);
        // If element disappeared, click worked
        const stillThere = await win.webContents
            .executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)
            .catch(() => false);
        if (!stillThere)
            return true;
        if (i < 2)
            await sleep(600);
    }
    return true;
}
/** Type text into a field character by character. */
async function typeInto(win, selector, text, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let found = false;
    while (Date.now() < deadline && isWindowUsable(win)) {
        await failOnFatalRegistrationPageError(win, `waiting to type into ${selector}`);
        found = await win.webContents
            .executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)
            .catch(() => false);
        if (found)
            break;
        await sleep(500);
    }
    if (!found || !isWindowUsable(win)) {
        await failOnFatalRegistrationPageError(win, `input not found: ${selector}`);
        return false;
    }
    await win.webContents
        .executeJavaScript(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, '');
      else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `)
        .catch(() => { });
    for (const char of text) {
        if (!isWindowUsable(win))
            return false;
        await win.webContents
            .executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, el.value + ${JSON.stringify(char)});
        else el.value += ${JSON.stringify(char)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `)
            .catch(() => { });
        await sleep(60 + Math.random() * 80);
    }
    await win.webContents
        .executeJavaScript(`
    document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new Event('change', { bubbles: true }))
  `)
        .catch(() => { });
    return true;
}
export class BrowserRegistrar {
    cfg;
    log;
    win = null;
    sessionPartition;
    aborted = false;
    emailSvc = null;
    consumedProvidedEmailLine = null;
    constructor(cfg, log) {
        this.cfg = cfg;
        this.log = log || ((msg) => console.log(msg));
        this.sessionPartition = `persist:reg-${cfg.taskId || Date.now()}`;
        this.log(`[Browser] New registration session created: ${this.sessionPartition}`);
        this.log(`[Browser] Method: ${cfg.useDDG ? 'DuckDuckGo/Gmail' : cfg.useTempMailPlus ? 'TempMail.Plus' : cfg.providedEmailData ? 'Provided Email' : 'MoEmail'}`);
        this.log(`[Browser] Proxy configured: ${cfg.proxyUrl ? cfg.proxyUrl : 'none'}`);
    }
    abort() {
        this.aborted = true;
        this.destroyWindow();
    }
    checkAborted() {
        if (this.aborted)
            throw new Error('Registration cancelled');
    }
    destroyWindow() {
        if (this.win && !this.win.isDestroyed()) {
            try {
                this.win.close();
            }
            catch {
                /* ignore */
            }
        }
        this.win = null;
    }
    async destroy() {
        this.log(`[Browser] Destroying registration session: ${this.sessionPartition}`);
        this.destroyWindow();
        try {
            const ses = session.fromPartition(this.sessionPartition);
            await ses.clearStorageData();
            await ses.clearCache();
            this.log('[Browser] Registration session storage/cache cleared');
        }
        catch (error) {
            this.log(`[Browser] Warning: failed to clear session storage/cache: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createWindow() {
        this.log(`[Browser] Creating Electron session/window for partition: ${this.sessionPartition}`);
        const ses = session.fromPartition(this.sessionPartition);
        if (this.cfg.proxyUrl) {
            this.log(`[Browser] Applying proxy rules: ${this.cfg.proxyUrl}`);
            await ses.setProxy({ proxyRules: this.cfg.proxyUrl });
            this.log(`[Browser] Proxy applied: ${this.cfg.proxyUrl}`);
        }
        else {
            this.log('[Browser] No proxy configured; using direct/system network');
        }
        const cleanUA = ses
            .getUserAgent()
            .replace(/Electron\/[\d.]+\s*/g, '')
            .replace(/kiro-account-manager\/[\d.]+\s*/g, '')
            .trim();
        ses.setUserAgent(cleanUA);
        const win = new BrowserWindow({
            width: 1024,
            height: 768,
            show: true,
            title: 'Kiro Registration',
            webPreferences: {
                session: ses,
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        win.on('closed', () => {
            this.log('[Browser] Registration window closed');
        });
        win.webContents.on('destroyed', () => {
            this.log('[Browser] Registration webContents destroyed');
        });
        win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            this.log(`[Browser] Load failed: ${errorCode} ${errorDescription} ${validatedURL.slice(0, 120)}`);
        });
        this.win = win;
        this.log('[Browser] Registration window created successfully');
        return win;
    }
    async createEmailAddress() {
        if (this.cfg.useDDG) {
            if (!this.cfg.ddgAuthToken || !this.cfg.ddgGmailEmail)
                throw new Error('DDG config incomplete');
            const gmailAccount = {
                email: this.cfg.ddgGmailEmail,
                accessToken: this.cfg.ddgGmailAccessToken || '',
                appPassword: this.cfg.ddgGmailAppPassword || undefined
            };
            const svc = new DuckDuckGoEmailService(this.cfg.ddgAuthToken, gmailAccount);
            const addr = await svc.create();
            if (!addr)
                throw new Error('DDG address creation failed');
            this.emailSvc = svc;
            return addr;
        }
        if (this.cfg.useTempMailPlus) {
            if (!this.cfg.tempMailPlusEmail ||
                !this.cfg.tempMailPlusEpin ||
                !this.cfg.tempMailPlusDomain) {
                throw new Error('TempMailPlus config incomplete');
            }
            const svc = new TempMailPlusService(this.cfg.tempMailPlusEmail, this.cfg.tempMailPlusEpin, this.cfg.tempMailPlusDomain);
            const addr = await svc.create();
            if (!addr)
                throw new Error('TempMailPlus address creation failed');
            this.emailSvc = svc;
            return addr;
        }
        if (this.cfg.providedEmailData) {
            const accounts = parseProvidedEmailLines(this.cfg.providedEmailData);
            if (accounts.length === 0)
                throw new Error('No valid provided email accounts');
            const account = accounts[0];
            const svc = new ProvidedEmailService(account, this.cfg.providedEmailApiKey || '', this.cfg.providedEmailApiBaseURL || 'https://firstmail.ltd/api/v1');
            const addr = await svc.create();
            if (!addr)
                throw new Error('Provided email address creation failed');
            this.emailSvc = svc;
            this.cfg.password = account.password;
            this.consumedProvidedEmailLine = `${account.email}:${account.password}`;
            return addr;
        }
        if (this.cfg.moEmailBaseURL) {
            const svc = new MoEmailService(this.cfg.moEmailBaseURL, this.cfg.moEmailAPIKey || '');
            const addr = await svc.create();
            if (!addr)
                throw new Error('MoEmail address creation failed');
            this.emailSvc = svc;
            return addr;
        }
        throw new Error('No email provider configured');
    }
    // ============ Authorization Code + PKCE flow (same as Kiro IDE) ============
    /** Generate PKCE code_verifier and code_challenge */
    generatePKCE() {
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        return { verifier, challenge };
    }
    /**
     * Build the authorization URL that Kiro IDE uses.
     * The browser navigates here, user signs up/in, then redirects to callback.
     */
    async registerOidcClient(redirectUri) {
        const resp = await apiFetch(`${OIDC_BASE}/client/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientName: 'Kiro IDE',
                clientType: 'public',
                scopes: KIRO_SCOPES.split(','),
                grantTypes: ['authorization_code', 'refresh_token'],
                redirectUris: [redirectUri],
                issuerUrl: 'https://view.awsapps.com/start'
            })
        });
        if (resp.status !== 200) {
            throw new Error(`OIDC client registration failed (${resp.status}): ${resp.body.slice(0, 200)}`);
        }
        const data = JSON.parse(resp.body);
        if (!data.clientId || !data.clientSecret) {
            throw new Error(`OIDC client registration missing credentials: ${resp.body.slice(0, 200)}`);
        }
        return { clientId: data.clientId, clientSecret: data.clientSecret };
    }
    buildAuthURL(clientId, codeChallenge, state, redirectUri) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scopes: KIRO_SCOPES,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        return `${OIDC_BASE}/authorize?${params.toString()}`;
    }
    /**
     * Exchange authorization code for tokens.
     */
    async exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUri) {
        const resp = await apiFetch(`${OIDC_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                clientSecret,
                grantType: 'authorization_code',
                code,
                redirectUri,
                codeVerifier: verifier
            })
        });
        if (resp.status !== 200) {
            throw new Error(`Token exchange failed (${resp.status}): ${resp.body.slice(0, 200)}`);
        }
        const data = JSON.parse(resp.body);
        if (!data.access_token && !data.accessToken) {
            throw new Error(`No access token in response: ${resp.body.slice(0, 200)}`);
        }
        // Normalize field names (OIDC uses snake_case, AWS SDK uses camelCase)
        return {
            accessToken: (data.access_token || data.accessToken),
            refreshToken: (data.refresh_token || data.refreshToken),
            expiresIn: (data.expires_in || data.expiresIn)
        };
    }
    /**
     * Wait for the browser to navigate to the callback URL and extract the auth code.
     * Uses a local redirect URI that we intercept via webRequest.
     */
    waitForAuthCode(win, redirectUri, state, timeoutMs = 300000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Authorization code wait timed out'));
            }, timeoutMs);
            const cleanup = () => {
                clearTimeout(timer);
                try {
                    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                        win.webContents.removeListener('did-navigate', onNav);
                        win.webContents.removeListener('did-navigate-in-page', onNav);
                        win.webContents.removeListener('did-fail-load', onFail);
                    }
                }
                catch {
                    // Window/webContents may already be destroyed by user closing the registration window.
                }
            };
            const onNav = (_, url) => {
                if (!url.startsWith(redirectUri))
                    return;
                try {
                    const parsed = new URL(url);
                    const code = parsed.searchParams.get('code');
                    const returnedState = parsed.searchParams.get('state');
                    if (code && returnedState === state) {
                        cleanup();
                        resolve(code);
                    }
                    else if (parsed.searchParams.get('error')) {
                        cleanup();
                        reject(new Error(`Auth error: ${parsed.searchParams.get('error_description') || parsed.searchParams.get('error')}`));
                    }
                }
                catch {
                    /* ignore parse errors */
                }
            };
            // Also handle ERR_ABORTED on the callback URL — the redirect to localhost will fail
            // to load (no server there) but we can still extract the code from the URL
            const onFail = (_, _errorCode, _errorDesc, validatedURL) => {
                if (!validatedURL.startsWith(redirectUri))
                    return;
                try {
                    const parsed = new URL(validatedURL);
                    const code = parsed.searchParams.get('code');
                    const returnedState = parsed.searchParams.get('state');
                    if (code && returnedState === state) {
                        cleanup();
                        resolve(code);
                    }
                }
                catch {
                    /* ignore */
                }
            };
            win.webContents.on('did-navigate', onNav);
            win.webContents.on('did-navigate-in-page', onNav);
            win.webContents.on('did-fail-load', onFail);
        });
    }
    // ============ Browser automation steps ============
    /** Step 1: Accept cookie banner, then wait for email input. */
    async stepAcceptCookiesAndWaitForEmail(win) {
        this.log('[Browser] Waiting for page to load...');
        await waitForPageLoad(win, 0);
        if (!isWindowUsable(win))
            throw new Error('Registration browser window closed during page load');
        this.log(`[Browser] Page: ${win.webContents.getURL()}`);
        // Accept the cookie banner opportunistically, but do not delay email-pool entry waiting for it.
        // The email should be entered as soon as a fresh registration page is ready.
        const hasBanner = await win.webContents
            .executeJavaScript(`!!document.querySelector('button[data-id="awsccc-cb-btn-accept"]')`)
            .catch(() => false);
        if (hasBanner) {
            await win.webContents
                .executeJavaScript(`
        const btn = document.querySelector('button[data-id="awsccc-cb-btn-accept"]');
        if (btn) btn.click();
      `)
                .catch(() => { });
            this.log('[Browser] Cookie banner accepted');
        }
        await failOnFatalRegistrationPageError(win, 'before email input');
        // Wait for email input (React SPA may take time to hydrate)
        this.log('[Browser] Waiting for email input...');
        const emailDeadline = Date.now() + 30000;
        let emailAppeared = false;
        while (Date.now() < emailDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for email input');
            emailAppeared = await win.webContents
                .executeJavaScript(`!!document.querySelector('input[placeholder*="@"]')`)
                .catch(() => false);
            if (emailAppeared)
                break;
            await sleep(500);
        }
        if (!emailAppeared) {
            await failOnFatalRegistrationPageError(win, 'email input not found');
            const body = await win.webContents
                .executeJavaScript(`document.body.innerText.slice(0, 300)`)
                .catch(() => '');
            throw new Error(`Email input not found after 30s. Page: ${body}`);
        }
        this.log('[Browser] Email input found');
    }
    /** Step 2: Fill email and click Continue. */
    async stepFillEmail(win, email) {
        await failOnFatalRegistrationPageError(win, 'before email entry');
        this.log(`[Browser] Filling email: ${email}`);
        await typeInto(win, 'input[placeholder*="@"]', email);
        await randomDelay(500, 1000);
        // Email page Continue button: data-testid="test-primary-button"
        await clickWithCookieDismiss(win, 'button[data-testid="test-primary-button"]');
        this.log('[Browser] Clicked Continue after email');
        await waitForPageLoad(win, 0);
        const postEmailDeadline = Date.now() + 2500;
        while (Date.now() < postEmailDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'immediately after email continue');
            await sleep(250);
        }
        this.log(`[Browser] After email: ${win.webContents.getURL()}`);
        await failOnFatalRegistrationPageError(win, 'after email continue');
    }
    /** Step 3: Handle signup — click "Create account" if present, fill name, click Continue. */
    async stepSignup(win, fullName) {
        const signupSettleDeadline = Date.now() + 1500 + Math.random() * 1500;
        while (Date.now() < signupSettleDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for signup page after email');
            await sleep(250);
        }
        // Click "Create account" / "Sign up" if present
        const createClicked = await win.webContents
            .executeJavaScript(`
      (function() {
        const els = Array.from(document.querySelectorAll('a, button'));
        const btn = els.find(el => {
          const t = (el.textContent || '').trim();
          return /create.*(account|builder)/i.test(t) || /sign.?up/i.test(t);
        });
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `)
            .catch(() => false);
        if (createClicked) {
            this.log('[Browser] Clicked create account');
            await waitForPageLoad(win, 1500);
        }
        await failOnFatalRegistrationPageError(win, 'after create-account click');
        // Wait for name input (placeholder is a person name: has space, no @, no digits)
        this.log('[Browser] Waiting for name input...');
        const nameDeadline = Date.now() + 15000;
        let nameAppeared = false;
        while (Date.now() < nameDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for name input');
            nameAppeared = await win.webContents
                .executeJavaScript(`!!document.querySelector('input[placeholder*=" "]')`)
                .catch(() => false);
            if (nameAppeared)
                break;
            await sleep(500);
        }
        if (nameAppeared) {
            const isNameField = await win.webContents
                .executeJavaScript(`
        (function() {
          const el = document.querySelector('input[placeholder*=" "]');
          if (!el) return false;
          const ph = el.placeholder || '';
          return !ph.includes('@') && !/\\d/.test(ph);
        })()
      `)
                .catch(() => false);
            if (isNameField) {
                await typeInto(win, 'input[placeholder*=" "]', fullName);
                this.log(`[Browser] Name filled: ${fullName}`);
                await randomDelay(500, 1000);
            }
        }
        await failOnFatalRegistrationPageError(win, 'before sending OTP');
        // Capture email-provider baseline before this click triggers the OTP email.
        if (this.emailSvc?.beforeSendCode) {
            this.log('[Browser] Capturing email baseline before sending OTP');
            await this.emailSvc.beforeSendCode();
        }
        // Name page Continue: data-testid="signup-next-button"
        await clickWithCookieDismiss(win, 'button[data-testid="signup-next-button"]');
        this.log('[Browser] Clicked Continue to send OTP');
        await waitForPageLoad(win, 1500);
        await failOnFatalRegistrationPageError(win, 'after signup continue');
    }
    /** Step 4: Wait for OTP input, fill it, click Continue. */
    async stepFillOTP(win, otp) {
        await failOnFatalRegistrationPageError(win, 'before OTP entry');
        this.log('[Browser] Waiting for OTP input...');
        const otpDeadline = Date.now() + 30000;
        let otpAppeared = false;
        while (Date.now() < otpDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for OTP input');
            otpAppeared = await win.webContents
                .executeJavaScript(`!!document.querySelector('input[placeholder*="digit"]')`)
                .catch(() => false);
            if (otpAppeared)
                break;
            await sleep(500);
        }
        if (!otpAppeared) {
            await failOnFatalRegistrationPageError(win, 'OTP input not found');
            throw new Error('OTP input not found after 30s');
        }
        // Clear any existing value first, then fill
        await win.webContents
            .executeJavaScript(`
      (function() {
        const el = document.querySelector('input[placeholder*="digit"]');
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `)
            .catch(() => { });
        this.log(`[Browser] Filling OTP: ${otp}`);
        await typeInto(win, 'input[placeholder*="digit"]', otp);
        await randomDelay(500, 1000);
        // OTP Continue: data-testid="email-verification-verify-button"
        await clickWithCookieDismiss(win, 'button[data-testid="email-verification-verify-button"]');
        this.log('[Browser] OTP submitted');
        // Short wait — don't do full page load wait since we need to check for error on same page
        await sleep(2000);
        await failOnFatalRegistrationPageError(win, 'after OTP submit');
    }
    /** Step 5: Fill password if required. */
    async stepFillPassword(win, password) {
        const pwdDeadline = Date.now() + 5000;
        let hasPwd = false;
        while (Date.now() < pwdDeadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for password input');
            hasPwd = await win.webContents
                .executeJavaScript(`!!document.querySelector('input[type="password"]')`)
                .catch(() => false);
            if (hasPwd)
                break;
            await sleep(500);
        }
        if (!hasPwd) {
            await failOnFatalRegistrationPageError(win, 'password input not found');
            return;
        }
        await failOnFatalRegistrationPageError(win, 'before password entry');
        this.log('[Browser] Filling password');
        // Get count of password fields
        const pwdCount = await win.webContents
            .executeJavaScript(`
      (function() {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        return inputs.filter(el => !!el.offsetParent).length;
      })()
    `)
            .catch(() => 0);
        this.log(`[Browser] Found ${pwdCount} password field(s)`);
        // Fill each password field sequentially with delays
        for (let i = 0; i < pwdCount; i++) {
            const fillOk = await win.webContents
                .executeJavaScript(`
        (function() {
          const inputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(el => !!el.offsetParent);
          if (${i} >= inputs.length) return false;
          const el = inputs[${i}];
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, ${JSON.stringify(password)});
          else el.value = ${JSON.stringify(password)};
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(password)} }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
          el.blur();
          return true;
        })()
      `)
                .catch(() => false);
            if (!fillOk) {
                // Fallback: use typeInto for the first field only
                if (i === 0)
                    await typeInto(win, 'input[type="password"]', password);
            }
            // Add delay between fields to allow React state updates
            if (i < pwdCount - 1) {
                await randomDelay(300, 600);
            }
        }
        await randomDelay(800, 1500);
        const clicked = await this.clickPasswordContinue(win);
        if (!clicked) {
            const pageInfo = await win.webContents
                .executeJavaScript(`
        (function() {
          const url = window.location.href;
          const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
            type: el.type,
            placeholder: el.placeholder || '',
            valueLength: el.value ? el.value.length : 0,
            visible: !!el.offsetParent
          }));
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]')).map(el => ({
            tag: el.tagName,
            type: el.type || '',
            text: (el.textContent || el.value || '').trim().slice(0, 80),
            id: el.id,
            classes: String(el.className).slice(0, 80),
            dataTestid: el.getAttribute('data-testid') || '',
            disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
            visible: !!el.offsetParent
          }));
          return { url: url.slice(0, 180), inputs, buttons: buttons.slice(0, 20), body: document.body.innerText.slice(0, 500) };
        })()
      `)
                .catch(() => ({ url: 'unknown', buttons: [], inputs: [], body: '' }));
            this.log(`[Browser] Password continue not clicked; page state: ${JSON.stringify(pageInfo)}`);
            throw new Error('Password Continue button not found or disabled');
        }
        this.log('[Browser] Password submitted');
        await waitForPageLoad(win, 2000);
        await failOnFatalRegistrationPageError(win, 'after password submit');
    }
    async clickPasswordContinue(win) {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline && isWindowUsable(win)) {
            await failOnFatalRegistrationPageError(win, 'waiting for password continue button');
            const clicked = await win.webContents
                .executeJavaScript(`
        (function() {
          const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
          const visible = candidates.filter(el => !!el.offsetParent);
          const enabled = visible.filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
          const bySelector = enabled.find(el =>
            el.getAttribute('data-testid') === 'test-primary-button' ||
            el.getAttribute('data-testid') === 'signup-next-button' ||
            el.getAttribute('data-testid') === 'password-continue-button'
          );
          const byText = enabled.find(el => {
            const text = (el.textContent || el.value || '').trim().toLowerCase();
            return text === 'continue' || text === 'next' || text.includes('continue') || text.includes('create account') || text.includes('继续') || text.includes('下一步');
          });
          const btn = bySelector || byText || enabled[enabled.length - 1];
          if (!btn) return false;
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
          return true;
        })()
      `)
                .catch(() => false);
            if (clicked) {
                await sleep(400);
                await failOnFatalRegistrationPageError(win, 'after password continue click');
                return true;
            }
            await sleep(1000);
        }
        await failOnFatalRegistrationPageError(win, 'password continue button not found');
        return false;
    }
    /** Try multiple selectors to find and click the Allow access button */
    async tryClickAllowAccess(win) {
        const SELECTORS = [
            'button[data-testid="allow-access-button"]',
            'button[data-testid="allow-access"]',
            'button[data-id="allow-access-button"]',
            'input[type="submit"][value*="Allow"]',
            'form button[type="submit"]',
            '[data-testid="submit-button"]'
        ];
        for (const selector of SELECTORS) {
            const found = await win.webContents
                .executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          return el ? true : false;
        })()
      `)
                .catch(() => false);
            if (!found)
                continue;
            this.log(`[Browser] Found button with selector: ${selector}`);
            await win.webContents
                .executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) el.click();
          return true;
        })()
      `)
                .catch(() => { });
            this.log('[Browser] Clicked Allow access');
            return true;
        }
        return false;
    }
    /** Try to find any button with Allow-related text */
    async tryClickAllowByText(win) {
        const found = await win.webContents
            .executeJavaScript(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
        const allowBtn = buttons.find(el => {
          const t = (el.textContent || el.value || '').toLowerCase().trim();
          return t === 'allow access' || t === 'allow' || t.includes('allow access') || t === '同意' || t.includes('同意');
        });
        if (allowBtn) { allowBtn.click(); return true; }
        return false;
      })()
    `)
            .catch(() => false);
        if (found) {
            this.log('[Browser] Clicked Allow access button by text match');
            return true;
        }
        return false;
    }
    /** Step 6: Handle any remaining consent/allow-access pages before callback redirect. */
    async stepConfirmDevice(win) {
        try {
            this.log('[Browser] [9] Confirm device and allow access');
            // After password submission, the page may redirect to OIDC authorize endpoint.
            // Wait for URL to stabilize on the consent page.
            const currentUrl = win.webContents.getURL();
            this.log(`[Browser] Current URL before waiting: ${currentUrl ? currentUrl.slice(0, 100) : 'unknown'}`);
            // Wait for the consent SPA to transition from workflowResultHandle to the real consent page.
            let clicked = false;
            const deadline = Date.now() + 45000;
            while (!clicked && Date.now() < deadline && isWindowUsable(win)) {
                clicked = await this.tryClickAllowAccess(win);
                if (!clicked)
                    clicked = await this.tryClickAllowByText(win);
                if (!clicked)
                    await sleep(1000);
            }
            if (!clicked) {
                // Dump page info for debugging
                this.log('[Browser] Allow access button not found, dumping page state');
                const pageInfo = await win.webContents
                    .executeJavaScript(`
          (function() {
            const url = window.location.href;
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'))
              .map(el => ({
                tag: el.tagName,
                type: el.type || '',
                text: (el.textContent || el.value || '').trim().slice(0, 40),
                id: el.id,
                classes: el.className.slice(0, 60),
                'data-testid': el.getAttribute('data-testid') || '',
                visible: !!el.offsetParent
              }));
            return { url: url.slice(0, 150), buttons: buttons.slice(0, 15) };
          })()
        `)
                    .catch(() => ({ url: 'unknown', buttons: [] }));
                this.log(`[Browser] Page state: ${JSON.stringify(pageInfo)}`);
                // Wait longer for possible auto-redirect
                this.log('[Browser] Waiting 15s for auto-redirect...');
                await sleep(15000);
            }
        }
        catch (err) {
            this.log(`[Browser] Error in stepConfirmDevice: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // ============ Main flow ============
    async run() {
        console.log('[BrowserRegistrar] run() started');
        this.log('[Browser] Starting registration flow');
        let email;
        try {
            email = await this.createEmailAddress();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log(`[Browser] Email creation failed: ${msg}`);
            return { status: 'failed', email: '', error: msg };
        }
        const fullName = this.cfg.fullName || randomFullName();
        const password = this.cfg.password || genPassword();
        this.log(`[Browser] Identity prepared: name=${fullName}, password=${this.cfg.password ? 'provided' : 'generated'}`);
        console.log(`[BrowserRegistrar] Email: ${email}`);
        this.log(`[Browser] Email: ${email}`);
        // Generate PKCE — same as Kiro IDE does
        const { verifier, challenge } = this.generatePKCE();
        const state = randomBytes(16).toString('hex');
        // Start a local HTTP server to receive the OAuth callback
        // This matches how Kiro IDE handles the redirect
        let localPort = 59817;
        // Create a promise that resolves when the callback is received
        let resolveCode;
        let rejectCode;
        const codePromise = new Promise((res, rej) => {
            resolveCode = res;
            rejectCode = rej;
        });
        const server = createServer((req, res) => {
            try {
                const url = new URL(req.url || '', `http://127.0.0.1:${localPort}`);
                const code = url.searchParams.get('code');
                const returnedState = url.searchParams.get('state');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h2>Authorization complete. This window will close automatically.</h2><script>window.close()</script></body></html>');
                if (code && returnedState === state) {
                    resolveCode(code);
                }
                else {
                    rejectCode(new Error(`Auth callback missing code or state mismatch`));
                }
            }
            catch (e) {
                res.writeHead(500);
                res.end();
                rejectCode(e instanceof Error ? e : new Error(String(e)));
            }
        });
        // Try to bind to the port, fall back if busy
        await new Promise((res, rej) => {
            server.listen(localPort, '127.0.0.1', () => res());
            server.on('error', () => {
                // Try a different port
                localPort = 59818 + Math.floor(Math.random() * 100);
                server.listen(localPort, '127.0.0.1', () => res());
                server.on('error', rej);
            });
        });
        // Now construct the redirectUri with the final port
        const redirectUri = `http://127.0.0.1:${localPort}/oauth/callback`;
        this.log('[Browser] [1] Registering OIDC client');
        const oidcClient = await this.registerOidcClient(redirectUri);
        const authURL = this.buildAuthURL(oidcClient.clientId, challenge, state, redirectUri);
        this.log(`[Browser] [1] Auth URL built (PKCE, client_id: ${oidcClient.clientId.slice(0, 8)}...)`);
        // Create browser window
        let win;
        try {
            win = await this.createWindow();
            console.log('[BrowserRegistrar] Window created');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { status: 'failed', email, error: `Window creation failed: ${msg}` };
        }
        try {
            // Start listening for the auth code BEFORE navigating
            let resolvedAuthCode;
            const authCodePromise = Promise.race([
                codePromise,
                this.waitForAuthCode(win, redirectUri, state, 300000)
            ]).then((code) => {
                resolvedAuthCode = code;
                return code;
            });
            // Navigate to the OIDC authorize URL
            this.log(`[Browser] [2] Loading auth URL (redirect: ${redirectUri})`);
            await win.loadURL(authURL).catch(() => {
                /* ERR_ABORTED on redirects is normal */
            });
            this.checkAborted();
            await sleep(500);
            if (resolvedAuthCode) {
                this.log('[Browser] Authorization code received during initial navigation');
            }
            else {
                // Step 1: Accept cookies, wait for email input
                await this.stepAcceptCookiesAndWaitForEmail(win);
                this.checkAborted();
                // Step 2: Fill email + Continue
                await this.stepFillEmail(win, email);
                this.checkAborted();
                await failOnFatalRegistrationPageError(win, 'after email');
                // Step 3: Signup flow (create account + name + Continue)
                await this.stepSignup(win, fullName);
                this.checkAborted();
                // Record inbox count AFTER OTP was sent (signup form submitted)
                // This ensures we only look at emails that arrived after this point
                this.log('[Browser] [6] Waiting for OTP email');
                if (!this.emailSvc)
                    throw new Error('Email service not initialized');
                // Try OTP up to 3 times (resend if wrong)
                let otpSuccess = false;
                for (let attempt = 1; attempt <= 3 && !otpSuccess; attempt++) {
                    if (attempt > 1) {
                        // Wait for resend button to become enabled (60s cooldown)
                        this.log(`[Browser] Waiting for resend button...`);
                        const resendEnabled = await waitForSelector(win, 'button[data-testid="email-verification-resend-code-button"]:not([disabled])', 90000);
                        if (resendEnabled) {
                            await clickWithCookieDismiss(win, 'button[data-testid="email-verification-resend-code-button"]:not([disabled])');
                            this.log('[Browser] Clicked resend code');
                            await sleep(2000);
                        }
                    }
                    this.log(`[Browser] Waiting up to 30s for OTP (attempt ${attempt})`);
                    const otp = await this.emailSvc.waitForCode(30, 3, () => this.aborted);
                    this.log(`[Browser] Got OTP (attempt ${attempt}): ${otp}`);
                    this.checkAborted();
                    await this.stepFillOTP(win, otp);
                    this.checkAborted();
                    await failOnFatalRegistrationPageError(win, `after OTP attempt ${attempt}`);
                    // Check if OTP was rejected
                    const hasError = await win.webContents
                        .executeJavaScript(`
            !!document.querySelector('[data-testid="email-verification-invalid-code-error"]')
          `)
                        .catch(() => false);
                    if (hasError) {
                        this.log(`[Browser] OTP rejected (attempt ${attempt}), will retry`);
                    }
                    else {
                        otpSuccess = true;
                    }
                }
                if (!otpSuccess)
                    throw new Error('OTP verification failed after 3 attempts');
                // Step 5: Password if required
                await this.stepFillPassword(win, password);
                this.checkAborted();
                await failOnFatalRegistrationPageError(win, 'after password step');
                // Step 6: Confirm device and allow access
                this.log('[Browser] [9] Confirm device and allow access');
                await this.stepConfirmDevice(win);
                this.checkAborted();
                await failOnFatalRegistrationPageError(win, 'after confirm device');
            }
            // Step 7: Wait for auth code from callback redirect
            this.log('[Browser] [10] Waiting for authorization code...');
            const authCode = resolvedAuthCode || (await authCodePromise);
            this.log(`[Browser] Got auth code: ${authCode.slice(0, 8)}...`);
            // Close browser window immediately after authorization complete
            this.destroyWindow();
            // Step 8: Exchange code for tokens
            this.log('[Browser] [11] Exchanging code for tokens');
            const tokenData = await this.exchangeCodeForTokens(oidcClient.clientId, oidcClient.clientSecret, authCode, verifier, redirectUri);
            this.log(`[Browser] Done! Email: ${email}`);
            return {
                status: 'success',
                email,
                password,
                clientId: oidcClient.clientId,
                clientSecret: oidcClient.clientSecret,
                refreshToken: tokenData.refreshToken || '',
                accessToken: tokenData.accessToken || '',
                region: 'us-east-1',
                provider: 'BuilderId',
                consumedProvidedEmailLine: this.consumedProvidedEmailLine || undefined
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`[BrowserRegistrar] Error: ${msg}`);
            this.log(`[Browser] Error: ${msg}`);
            if (this.win && !this.win.isDestroyed()) {
                const url = this.win.webContents.getURL();
                console.log(`[BrowserRegistrar] Failed at: ${url}`);
                this.log(`[Browser] Failed at: ${url}`);
            }
            return { status: 'failed', email, error: msg };
        }
        finally {
            this.destroyWindow();
            try {
                server.close();
            }
            catch {
                /* ignore */
            }
        }
    }
}
//# sourceMappingURL=browser-registrar.js.map