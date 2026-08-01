export type IdpType = 'Google' | 'Github' | 'BuilderId' | 'Enterprise' | 'AWSIdC' | 'Internal' | 'IAM_SSO';
export type SubscriptionType = 'Free' | 'Pro' | 'Pro_Plus' | 'Enterprise' | 'Teams';
export type AccountStatus = 'active' | 'expired' | 'error' | 'refreshing' | 'unknown';
/**
 * 账号凭证信息
 */
export interface AccountCredentials {
    accessToken: string;
    csrfToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    region?: string;
    startUrl?: string;
    expiresAt: number;
    authMethod?: 'IdC' | 'social';
    provider?: 'BuilderId' | 'Enterprise' | 'Github' | 'Google' | 'IAM_SSO';
}
/**
 * 奖励额度信息
 */
export interface BonusUsage {
    code: string;
    name: string;
    current: number;
    limit: number;
    expiresAt?: string;
}
/**
 * 账号使用量信息
 */
export interface AccountUsage {
    current: number;
    limit: number;
    percentUsed: number;
    lastUpdated: number;
    baseLimit?: number;
    baseCurrent?: number;
    freeTrialLimit?: number;
    freeTrialCurrent?: number;
    freeTrialExpiry?: string;
    bonuses?: BonusUsage[];
    nextResetDate?: string;
    resourceDetail?: ResourceDetail;
}
/**
 * 账号订阅信息
 */
export interface AccountSubscription {
    type: SubscriptionType;
    title?: string;
    rawType?: string;
    expiresAt?: number;
    daysRemaining?: number;
    upgradeCapability?: string;
    overageCapability?: string;
    managementTarget?: string;
}
/**
 * 资源使用详情
 */
export interface ResourceDetail {
    resourceType?: string;
    displayName?: string;
    displayNamePlural?: string;
    currency?: string;
    unit?: string;
    overageRate?: number;
    overageCap?: number;
    overageEnabled?: boolean;
}
/**
 * 账号标签
 */
export interface AccountTag {
    id: string;
    name: string;
    color: string;
}
/**
 * 账号实体
 */
export interface Account {
    id: string;
    email: string;
    password?: string;
    nickname?: string;
    idp: IdpType;
    userId?: string;
    visitorId?: string;
    machineId?: string;
    profileArn?: string;
    credentials: AccountCredentials;
    subscription: AccountSubscription;
    usage: AccountUsage;
    groupId?: string;
    tags: string[];
    status: AccountStatus;
    lastError?: string;
    isActive: boolean;
    createdAt: number;
    lastUsedAt: number;
    lastCheckedAt?: number;
}
/**
 * 账号分组
 */
export interface AccountGroup {
    id: string;
    name: string;
    description?: string;
    color?: string;
    order: number;
    createdAt: number;
}
/**
 * 筛选条件
 */
export interface AccountFilter {
    search?: string;
    subscriptionTypes?: SubscriptionType[];
    statuses?: AccountStatus[];
    idps?: IdpType[];
    groupIds?: string[];
    tagIds?: string[];
    usageMin?: number;
    usageMax?: number;
    daysRemainingMin?: number;
    daysRemainingMax?: number;
    bannedOnly?: boolean;
}
/**
 * 排序选项
 */
export type SortField = 'email' | 'nickname' | 'subscription' | 'usage' | 'daysRemaining' | 'lastUsedAt' | 'createdAt' | 'status';
export type SortOrder = 'asc' | 'desc';
export interface AccountSort {
    field: SortField;
    order: SortOrder;
}
/**
 * 导入/导出格式
 */
export interface AccountExportData {
    version: string;
    exportedAt: number;
    accounts: Omit<Account, 'isActive'>[];
    groups: AccountGroup[];
    tags: AccountTag[];
}
/**
 * 账号导入项（简化格式）
 */
export interface AccountImportItem {
    email: string;
    password?: string;
    refreshToken: string;
    accessToken?: string;
    csrfToken?: string;
    clientId?: string;
    clientSecret?: string;
    region?: string;
    idp?: IdpType | string;
    nickname?: string;
    groupId?: string;
    tags?: string[];
}
/**
 * 批量操作结果
 */
export interface BatchOperationResult {
    success: number;
    failed: number;
    errors: {
        id: string;
        error: string;
    }[];
}
/**
 * 账号统计
 */
export interface AccountStats {
    total: number;
    byStatus: Record<AccountStatus, number>;
    bySubscription: Record<SubscriptionType, number>;
    byIdp: Record<IdpType, number>;
    activeCount: number;
    expiringSoonCount: number;
    bannedCount: number;
}
//# sourceMappingURL=account.d.ts.map