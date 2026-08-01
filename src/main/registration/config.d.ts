export interface RegistrationConfig {
    oidcBase: string;
    signinBase: string;
    profileBase: string;
    viewBase: string;
    portalBase: string;
    directoryId: string;
    startURL: string;
    password: string;
    fullName: string;
    proxy: string;
    moEmailBaseURL: string;
    moEmailAPIKey: string;
    useOutlook: boolean;
    outlookData: string;
    useTempMailPlus: boolean;
    tempMailPlusEmail: string;
    tempMailPlusEpin: string;
    tempMailPlusDomain: string;
    useDDG: boolean;
    ddgAuthToken: string;
    ddgGmailEmail: string;
    ddgGmailAppPassword: string;
    ddgGmailAccessToken: string;
    manualMode: boolean;
}
export declare function genPassword(): string;
export declare function newConfig(overrides?: Partial<RegistrationConfig>): RegistrationConfig;
//# sourceMappingURL=config.d.ts.map