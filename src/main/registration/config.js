import { randomFullName } from './browser-identity';
export function genPassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%^&*';
    let pw = '';
    for (let i = 0; i < 3; i++)
        pw += upper[Math.floor(Math.random() * upper.length)];
    for (let i = 0; i < 6; i++)
        pw += lower[Math.floor(Math.random() * lower.length)];
    for (let i = 0; i < 3; i++)
        pw += digits[Math.floor(Math.random() * digits.length)];
    for (let i = 0; i < 2; i++)
        pw += special[Math.floor(Math.random() * special.length)];
    const arr = pw.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}
export function newConfig(overrides) {
    return {
        oidcBase: 'https://oidc.us-east-1.amazonaws.com',
        signinBase: 'https://us-east-1.signin.aws',
        profileBase: 'https://profile.aws.amazon.com',
        viewBase: 'https://view.awsapps.com',
        portalBase: 'https://portal.sso.us-east-1.amazonaws.com',
        directoryId: 'd-9067642ac7',
        startURL: 'https://view.awsapps.com/start',
        password: genPassword(),
        fullName: randomFullName(),
        proxy: '',
        moEmailBaseURL: '',
        moEmailAPIKey: '',
        useOutlook: false,
        outlookData: '',
        useTempMailPlus: false,
        tempMailPlusEmail: '',
        tempMailPlusEpin: '',
        tempMailPlusDomain: '',
        useDDG: false,
        ddgAuthToken: '',
        ddgGmailEmail: '',
        ddgGmailAppPassword: '',
        ddgGmailAccessToken: '',
        manualMode: false,
        ...overrides
    };
}
//# sourceMappingURL=config.js.map