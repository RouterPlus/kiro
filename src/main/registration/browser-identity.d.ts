export interface ScreenInfo {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
}
export interface BrowserIdentity {
    chromeVer: string;
    ua: string;
    gpuVendor: string;
    gpuModel: string;
    webGLExts: string[];
    canvasHash: number;
    histogramBase: number[];
    mathTan: string;
    mathSin: string;
    mathCos: string;
    plugins: Array<{
        name: string;
        filename: string;
        description: string;
    }>;
    screen: ScreenInfo;
    lsubidPrefixSignin: string;
    lsubidPrefixProfile: string;
    webpackHash: string;
}
export declare function randomIdentity(): BrowserIdentity;
export declare function randomFullName(): string;
//# sourceMappingURL=browser-identity.d.ts.map