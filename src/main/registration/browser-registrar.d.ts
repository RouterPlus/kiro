import type { RegistrationResult, LogFn } from './registrar';
export interface BrowserRegistrationConfig {
    useDDG?: boolean;
    ddgAuthToken?: string;
    ddgGmailEmail?: string;
    ddgGmailAppPassword?: string;
    ddgGmailAccessToken?: string;
    useTempMailPlus?: boolean;
    tempMailPlusEmail?: string;
    tempMailPlusEpin?: string;
    tempMailPlusDomain?: string;
    moEmailBaseURL?: string;
    moEmailAPIKey?: string;
    providedEmailData?: string;
    providedEmailApiKey?: string;
    providedEmailApiBaseURL?: string;
    fullName?: string;
    password?: string;
    proxyUrl?: string;
    taskId?: string;
    consumedProvidedEmailLine?: string;
}
export declare class BrowserRegistrar {
    private cfg;
    private log;
    private win;
    private sessionPartition;
    private aborted;
    private emailSvc;
    private consumedProvidedEmailLine;
    constructor(cfg: BrowserRegistrationConfig, log?: LogFn);
    abort(): void;
    private checkAborted;
    private destroyWindow;
    destroy(): Promise<void>;
    private createWindow;
    private createEmailAddress;
    /** Generate PKCE code_verifier and code_challenge */
    private generatePKCE;
    /**
     * Build the authorization URL that Kiro IDE uses.
     * The browser navigates here, user signs up/in, then redirects to callback.
     */
    private registerOidcClient;
    private buildAuthURL;
    /**
     * Exchange authorization code for tokens.
     */
    private exchangeCodeForTokens;
    /**
     * Wait for the browser to navigate to the callback URL and extract the auth code.
     * Uses a local redirect URI that we intercept via webRequest.
     */
    private waitForAuthCode;
    /** Step 1: Accept cookie banner, then wait for email input. */
    private stepAcceptCookiesAndWaitForEmail;
    /** Step 2: Fill email and click Continue. */
    private stepFillEmail;
    /** Step 3: Handle signup — click "Create account" if present, fill name, click Continue. */
    private stepSignup;
    /** Step 4: Wait for OTP input, fill it, click Continue. */
    private stepFillOTP;
    /** Step 5: Fill password if required. */
    private stepFillPassword;
    private clickPasswordContinue;
    /** Try multiple selectors to find and click the Allow access button */
    private tryClickAllowAccess;
    /** Try to find any button with Allow-related text */
    private tryClickAllowByText;
    /** Step 6: Handle any remaining consent/allow-access pages before callback redirect. */
    private stepConfirmDevice;
    run(): Promise<RegistrationResult>;
}
//# sourceMappingURL=browser-registrar.d.ts.map