"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  // 打开外部链接
  openExternal: (url, usePrivateMode) => {
    electron.ipcRenderer.send("open-external", url, usePrivateMode);
  },
  // 获取应用版本
  getAppVersion: () => {
    return electron.ipcRenderer.invoke("get-app-version");
  },
  // 监听 OAuth 回调
  onAuthCallback: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("auth-callback", handler);
    return () => {
      electron.ipcRenderer.removeListener("auth-callback", handler);
    };
  },
  // 账号管理 - 加载账号数据
  loadAccounts: () => {
    return electron.ipcRenderer.invoke("load-accounts");
  },
  // 账号管理 - 保存账号数据
  saveAccounts: (data) => {
    return electron.ipcRenderer.invoke("save-accounts", data);
  },
  // 账号管理 - 刷新 Token
  refreshAccountToken: (account) => {
    return electron.ipcRenderer.invoke("refresh-account-token", account);
  },
  // 账号管理 - 检查账号状态
  checkAccountStatus: (account) => {
    return electron.ipcRenderer.invoke("check-account-status", account);
  },
  // 后台批量刷新账号（在主进程执行，不阻塞 UI）
  backgroundBatchRefresh: (accounts, concurrency, syncInfo) => {
    return electron.ipcRenderer.invoke("background-batch-refresh", accounts, concurrency, syncInfo);
  },
  // 监听后台刷新进度
  onBackgroundRefreshProgress: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("background-refresh-progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("background-refresh-progress", handler);
    };
  },
  // 监听后台刷新结果（单个账号）
  onBackgroundRefreshResult: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("background-refresh-result", handler);
    return () => {
      electron.ipcRenderer.removeListener("background-refresh-result", handler);
    };
  },
  // 后台批量检查账号状态（不刷新 Token）
  backgroundBatchCheck: (accounts, concurrency) => {
    return electron.ipcRenderer.invoke("background-batch-check", accounts, concurrency);
  },
  // 监听后台检查进度
  onBackgroundCheckProgress: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("background-check-progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("background-check-progress", handler);
    };
  },
  // 监听后台检查结果（单个账号）
  onBackgroundCheckResult: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("background-check-result", handler);
    return () => {
      electron.ipcRenderer.removeListener("background-check-result", handler);
    };
  },
  // 切换账号 - 写入凭证到本地 SSO 缓存
  switchAccount: (credentials) => {
    return electron.ipcRenderer.invoke("switch-account", credentials);
  },
  // 切换账号到 Kiro CLI - 写入凭证到 SQLite 数据库
  switchAccountCli: (credentials) => {
    return electron.ipcRenderer.invoke("switch-account-cli", credentials);
  },
  // 退出登录 - 清除本地 SSO 缓存
  logoutAccount: () => {
    return electron.ipcRenderer.invoke("logout-account");
  },
  // 文件操作 - 导出到文件
  exportToFile: (data, filename) => {
    return electron.ipcRenderer.invoke("export-to-file", data, filename);
  },
  // 文件操作 - 从文件导入
  importFromFile: () => {
    return electron.ipcRenderer.invoke("import-from-file");
  },
  // 验证凭证并获取账号信息
  verifyAccountCredentials: (credentials) => {
    return electron.ipcRenderer.invoke("verify-account-credentials", credentials);
  },
  // 生成唯一的机器 ID（用于新账号）
  generateAccountMachineId: () => {
    return electron.ipcRenderer.invoke("generate-account-machine-id");
  },
  // 自动同步账号到代理池并刷新模型列表
  autoSyncAccount: (accountId) => {
    return electron.ipcRenderer.invoke("auto-sync-account", accountId);
  },
  // 获取本地 SSO 缓存中当前使用的账号信息
  getLocalActiveAccount: () => {
    return electron.ipcRenderer.invoke("get-local-active-account");
  },
  // 从 Kiro 本地配置导入凭证
  loadKiroCredentials: () => {
    return electron.ipcRenderer.invoke("load-kiro-credentials");
  },
  // 从 AWS SSO Token (x-amz-sso_authn) 导入账号
  importFromSsoToken: (bearerToken, region) => {
    return electron.ipcRenderer.invoke("import-from-sso-token", bearerToken, region || "us-east-1");
  },
  // ============ 手动登录 API ============
  // 启动 Builder ID 手动登录
  startBuilderIdLogin: (region) => {
    return electron.ipcRenderer.invoke("start-builder-id-login", region || "us-east-1");
  },
  // 轮询 Builder ID 授权状态
  pollBuilderIdAuth: (region) => {
    return electron.ipcRenderer.invoke("poll-builder-id-auth", region || "us-east-1");
  },
  // 取消 Builder ID 登录
  cancelBuilderIdLogin: () => {
    return electron.ipcRenderer.invoke("cancel-builder-id-login");
  },
  // 启动 IAM Identity Center SSO 登录 (Authorization Code flow)
  startIamSsoLogin: (startUrl, region) => {
    return electron.ipcRenderer.invoke("start-iam-sso-login", startUrl, region || "us-east-1");
  },
  // 轮询 IAM SSO 授权状态
  pollIamSsoAuth: (region) => {
    return electron.ipcRenderer.invoke("poll-iam-sso-auth", region || "us-east-1");
  },
  // 完成 IAM SSO 登录 (用授权码换取 token)
  completeIamSsoLogin: (code) => {
    return electron.ipcRenderer.invoke("complete-iam-sso-login", code);
  },
  // 取消 IAM SSO 登录
  cancelIamSsoLogin: () => {
    return electron.ipcRenderer.invoke("cancel-iam-sso-login");
  },
  // 启动 Social Auth 登录 (Google/GitHub)
  startSocialLogin: (provider, usePrivateMode) => {
    return electron.ipcRenderer.invoke("start-social-login", provider, usePrivateMode);
  },
  // 交换 Social Auth token
  exchangeSocialToken: (code, state) => {
    return electron.ipcRenderer.invoke("exchange-social-token", code, state);
  },
  // 取消 Social Auth 登录
  cancelSocialLogin: () => {
    return electron.ipcRenderer.invoke("cancel-social-login");
  },
  // 监听 Social Auth 回调
  onSocialAuthCallback: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    electron.ipcRenderer.on("social-auth-callback", handler);
    return () => {
      electron.ipcRenderer.removeListener("social-auth-callback", handler);
    };
  },
  // 代理设置
  setProxy: (enabled, url) => {
    return electron.ipcRenderer.invoke("set-proxy", enabled, url);
  },
  // ============ 机器码管理 API ============
  // 获取操作系统类型
  machineIdGetOSType: () => {
    return electron.ipcRenderer.invoke("machine-id:get-os-type");
  },
  // 获取当前机器码
  machineIdGetCurrent: () => {
    return electron.ipcRenderer.invoke("machine-id:get-current");
  },
  // 设置新机器码
  machineIdSet: (newMachineId) => {
    return electron.ipcRenderer.invoke("machine-id:set", newMachineId);
  },
  // 生成随机机器码
  machineIdGenerateRandom: () => {
    return electron.ipcRenderer.invoke("machine-id:generate-random");
  },
  // 检查管理员权限
  machineIdCheckAdmin: () => {
    return electron.ipcRenderer.invoke("machine-id:check-admin");
  },
  // 请求管理员权限重启
  machineIdRequestAdminRestart: () => {
    return electron.ipcRenderer.invoke("machine-id:request-admin-restart");
  },
  // 备份机器码到文件
  machineIdBackupToFile: (machineId) => {
    return electron.ipcRenderer.invoke("machine-id:backup-to-file", machineId);
  },
  // 从文件恢复机器码
  machineIdRestoreFromFile: () => {
    return electron.ipcRenderer.invoke("machine-id:restore-from-file");
  },
  // ============ 自动更新 ============
  // 检查更新 (electron-updater)
  checkForUpdates: () => {
    return electron.ipcRenderer.invoke("check-for-updates");
  },
  // 手动检查更新 (GitHub API, 用于 AboutPage)
  checkForUpdatesManual: () => {
    return electron.ipcRenderer.invoke("check-for-updates-manual");
  },
  // 下载更新
  downloadUpdate: () => {
    return electron.ipcRenderer.invoke("download-update");
  },
  // 安装更新并重启
  installUpdate: () => {
    return electron.ipcRenderer.invoke("install-update");
  },
  // 监听更新事件
  onUpdateChecking: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("update-checking", handler);
    return () => electron.ipcRenderer.removeListener("update-checking", handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    electron.ipcRenderer.on("update-available", handler);
    return () => electron.ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    electron.ipcRenderer.on("update-not-available", handler);
    return () => electron.ipcRenderer.removeListener("update-not-available", handler);
  },
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("update-download-progress", handler);
    return () => electron.ipcRenderer.removeListener("update-download-progress", handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    electron.ipcRenderer.on("update-downloaded", handler);
    return () => electron.ipcRenderer.removeListener("update-downloaded", handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, error) => callback(error);
    electron.ipcRenderer.on("update-error", handler);
    return () => electron.ipcRenderer.removeListener("update-error", handler);
  },
  // ============ Kiro 设置管理 ============
  // 获取 Kiro 设置
  getKiroSettings: () => {
    return electron.ipcRenderer.invoke("get-kiro-settings");
  },
  // 获取 Kiro 可用模型列表
  getKiroAvailableModels: () => {
    return electron.ipcRenderer.invoke("get-kiro-available-models");
  },
  // 保存 Kiro 设置
  saveKiroSettings: (settings) => {
    return electron.ipcRenderer.invoke("save-kiro-settings", settings);
  },
  // 打开 Kiro MCP 配置文件
  openKiroMcpConfig: (type) => {
    return electron.ipcRenderer.invoke("open-kiro-mcp-config", type);
  },
  // 打开 Kiro Steering 目录
  openKiroSteeringFolder: () => {
    return electron.ipcRenderer.invoke("open-kiro-steering-folder");
  },
  // 打开 Kiro settings.json 文件
  openKiroSettingsFile: () => {
    return electron.ipcRenderer.invoke("open-kiro-settings-file");
  },
  // 打开指定的 Steering 文件
  openKiroSteeringFile: (filename) => {
    return electron.ipcRenderer.invoke("open-kiro-steering-file", filename);
  },
  // 创建默认的 rules.md 文件
  createKiroDefaultRules: () => {
    return electron.ipcRenderer.invoke("create-kiro-default-rules");
  },
  // 读取 Steering 文件内容
  readKiroSteeringFile: (filename) => {
    return electron.ipcRenderer.invoke("read-kiro-steering-file", filename);
  },
  // 保存 Steering 文件内容
  saveKiroSteeringFile: (filename, content) => {
    return electron.ipcRenderer.invoke("save-kiro-steering-file", filename, content);
  },
  // 删除 Steering 文件
  deleteKiroSteeringFile: (filename) => {
    return electron.ipcRenderer.invoke("delete-kiro-steering-file", filename);
  },
  // ============ MCP 服务器管理 ============
  // 保存 MCP 服务器配置
  saveMcpServer: (name, config, oldName) => {
    return electron.ipcRenderer.invoke("save-mcp-server", name, config, oldName);
  },
  // 删除 MCP 服务器
  deleteMcpServer: (name) => {
    return electron.ipcRenderer.invoke("delete-mcp-server", name);
  },
  // ============ Kiro API 反代服务器 ============
  // 启动反代服务器
  proxyStart: (config) => {
    return electron.ipcRenderer.invoke("proxy-start", config);
  },
  // 停止反代服务器
  proxyStop: () => {
    return electron.ipcRenderer.invoke("proxy-stop");
  },
  // 获取反代服务器状态
  proxyGetStatus: () => {
    return electron.ipcRenderer.invoke("proxy-get-status");
  },
  // 重置累计 credits
  proxyResetCredits: () => {
    return electron.ipcRenderer.invoke("proxy-reset-credits");
  },
  // 重置累计 tokens
  proxyResetTokens: () => {
    return electron.ipcRenderer.invoke("proxy-reset-tokens");
  },
  // 重置请求统计
  proxyResetRequestStats: () => {
    return electron.ipcRenderer.invoke("proxy-reset-request-stats");
  },
  // 获取反代详细日志
  proxyGetLogs: (count) => {
    return electron.ipcRenderer.invoke("proxy-get-logs", count);
  },
  // 清除反代详细日志
  proxyClearLogs: () => {
    return electron.ipcRenderer.invoke("proxy-clear-logs");
  },
  // 获取反代日志数量
  proxyGetLogsCount: () => {
    return electron.ipcRenderer.invoke("proxy-get-logs-count");
  },
  // 更新反代服务器配置
  proxyUpdateConfig: (config) => {
    return electron.ipcRenderer.invoke("proxy-update-config", config);
  },
  // ============ v1.8 反代安全 / 可观测 IPC ============
  /** 获取反代自签证书信息（用于在 UI 显示指纹/有效期 + 让用户导出 .crt） */
  proxySelfSignedCertInfo: () => {
    return electron.ipcRenderer.invoke("proxy-self-signed-cert-info");
  },
  /** 强制重新生成反代自签证书（重启 server 后生效） */
  proxySelfSignedCertRegenerate: () => {
    return electron.ipcRenderer.invoke("proxy-self-signed-cert-regenerate");
  },
  /** 查询是否需要重启反代（port/host/tls 变更后 UI 提示） */
  proxyNeedsRestart: () => {
    return electron.ipcRenderer.invoke("proxy-needs-restart");
  },
  /** 立即重启反代 */
  proxyRestart: () => {
    return electron.ipcRenderer.invoke("proxy-restart");
  },
  /** 获取反代审计日志 */
  proxyAuditLog: () => {
    return electron.ipcRenderer.invoke("proxy-audit-log");
  },
  /** 监听 main 进程推送的 webhook 事件（关键告警） */
  onProxyWebhookTrigger: (callback) => {
    const handler = (_e, data) => {
      callback(data.event, data.payload);
    };
    electron.ipcRenderer.on("proxy-webhook-trigger", handler);
    return () => electron.ipcRenderer.off("proxy-webhook-trigger", handler);
  },
  // 添加账号到反代池
  proxyAddAccount: (account) => {
    return electron.ipcRenderer.invoke("proxy-add-account", account);
  },
  // 从反代池移除账号
  proxyRemoveAccount: (accountId) => {
    return electron.ipcRenderer.invoke("proxy-remove-account", accountId);
  },
  // 同步账号到反代池（批量更新）
  proxySyncAccounts: (accounts) => {
    return electron.ipcRenderer.invoke("proxy-sync-accounts", accounts);
  },
  // 获取反代池账号列表
  proxyGetAccounts: () => {
    return electron.ipcRenderer.invoke("proxy-get-accounts");
  },
  // 重置反代池状态
  proxyResetPool: () => {
    return electron.ipcRenderer.invoke("proxy-reset-pool");
  },
  // 刷新模型缓存
  proxyRefreshModels: () => {
    return electron.ipcRenderer.invoke("proxy-refresh-models");
  },
  // 获取可用模型列表
  proxyGetModels: () => {
    return electron.ipcRenderer.invoke("proxy-get-models");
  },
  proxyConfigureClients: (input) => {
    return electron.ipcRenderer.invoke("proxy-configure-clients", input);
  },
  // 获取账户可用模型列表
  accountGetModels: (accessToken, region, profileArn, machineId, provider, authMethod, accountId) => {
    return electron.ipcRenderer.invoke(
      "account-get-models",
      accessToken,
      region,
      profileArn,
      machineId,
      provider,
      authMethod,
      accountId
    );
  },
  // 获取可用订阅列表
  accountGetSubscriptions: (accessToken, region, profileArn, machineId, provider, authMethod, accountId) => {
    return electron.ipcRenderer.invoke(
      "account-get-subscriptions",
      accessToken,
      region,
      profileArn,
      machineId,
      provider,
      authMethod,
      accountId
    );
  },
  // 获取订阅管理/支付链接
  accountGetSubscriptionUrl: (accessToken, subscriptionType, region, profileArn, machineId, provider, authMethod, accountId) => {
    return electron.ipcRenderer.invoke(
      "account-get-subscription-url",
      accessToken,
      subscriptionType,
      region,
      profileArn,
      machineId,
      provider,
      authMethod,
      accountId
    );
  },
  // 设置用户超额偏好
  accountSetOverage: (accessToken, overageStatus, region, profileArn, machineId, provider, authMethod, accountId) => {
    return electron.ipcRenderer.invoke(
      "account-set-overage",
      accessToken,
      overageStatus,
      region,
      profileArn,
      machineId,
      provider,
      authMethod,
      accountId
    );
  },
  // 在新窗口打开订阅链接
  openSubscriptionWindow: (url) => {
    return electron.ipcRenderer.invoke("open-subscription-window", url);
  },
  // 保存代理日志
  proxySaveLogs: (logs) => {
    return electron.ipcRenderer.invoke("proxy-save-logs", logs);
  },
  // 加载代理日志
  proxyLoadLogs: () => {
    return electron.ipcRenderer.invoke("proxy-load-logs");
  },
  // 监听反代请求事件
  onProxyRequest: (callback) => {
    const handler = (_event, info) => {
      callback(info);
    };
    electron.ipcRenderer.on("proxy-request", handler);
    return () => {
      electron.ipcRenderer.removeListener("proxy-request", handler);
    };
  },
  // 监听反代响应事件
  onProxyResponse: (callback) => {
    const handler = (_event, info) => {
      callback(info);
    };
    electron.ipcRenderer.on("proxy-response", handler);
    return () => {
      electron.ipcRenderer.removeListener("proxy-response", handler);
    };
  },
  // 监听反代错误事件
  onProxyError: (callback) => {
    const handler = (_event, error) => {
      callback(error);
    };
    electron.ipcRenderer.on("proxy-error", handler);
    return () => {
      electron.ipcRenderer.removeListener("proxy-error", handler);
    };
  },
  // 监听反代状态变化事件
  onProxyStatusChange: (callback) => {
    const handler = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on("proxy-status-change", handler);
    return () => {
      electron.ipcRenderer.removeListener("proxy-status-change", handler);
    };
  },
  onProxyAccountUpdate: (callback) => {
    const handler = (_event, update) => {
      callback(update);
    };
    electron.ipcRenderer.on("proxy-account-update", handler);
    return () => {
      electron.ipcRenderer.removeListener("proxy-account-update", handler);
    };
  },
  // ============ Usage API 类型设置 ============
  // 获取 Usage API 类型
  getUsageApiType: () => {
    return electron.ipcRenderer.invoke("get-usage-api-type");
  },
  // 设置 Usage API 类型
  setUsageApiType: (type) => {
    return electron.ipcRenderer.invoke("set-usage-api-type", type);
  },
  // 获取是否使用 K-Proxy 代理
  getUseKProxyForApi: () => {
    return electron.ipcRenderer.invoke("get-use-kproxy-for-api");
  },
  // 设置是否使用 K-Proxy 代理
  setUseKProxyForApi: (enabled) => {
    return electron.ipcRenderer.invoke("set-use-kproxy-for-api", enabled);
  },
  // ============ K-Proxy MITM 代理 ============
  // 初始化 K-Proxy
  kproxyInit: () => {
    return electron.ipcRenderer.invoke("kproxy-init");
  },
  // 启动 K-Proxy
  kproxyStart: (config) => {
    return electron.ipcRenderer.invoke("kproxy-start", config);
  },
  // 停止 K-Proxy
  kproxyStop: () => {
    return electron.ipcRenderer.invoke("kproxy-stop");
  },
  // 获取 K-Proxy 状态
  kproxyGetStatus: () => {
    return electron.ipcRenderer.invoke("kproxy-get-status");
  },
  // 更新 K-Proxy 配置
  kproxyUpdateConfig: (config) => {
    return electron.ipcRenderer.invoke("kproxy-update-config", config);
  },
  // 设置当前设备 ID
  kproxySetDeviceId: (deviceId) => {
    return electron.ipcRenderer.invoke("kproxy-set-device-id", deviceId);
  },
  // 生成新的设备 ID
  kproxyGenerateDeviceId: () => {
    return electron.ipcRenderer.invoke("kproxy-generate-device-id");
  },
  // 添加设备 ID 映射
  kproxyAddDeviceMapping: (mapping) => {
    return electron.ipcRenderer.invoke("kproxy-add-device-mapping", mapping);
  },
  // 获取所有设备 ID 映射
  kproxyGetDeviceMappings: () => {
    return electron.ipcRenderer.invoke("kproxy-get-device-mappings");
  },
  // 切换到账号设备 ID
  kproxySwitchToAccount: (accountId) => {
    return electron.ipcRenderer.invoke("kproxy-switch-to-account", accountId);
  },
  // 获取 CA 证书
  kproxyGetCaCert: () => {
    return electron.ipcRenderer.invoke("kproxy-get-ca-cert");
  },
  // 导出 CA 证书
  kproxyExportCaCert: (exportPath) => {
    return electron.ipcRenderer.invoke("kproxy-export-ca-cert", exportPath);
  },
  // 检查 CA 证书是否已安装
  kproxyCheckCaCertInstalled: () => {
    return electron.ipcRenderer.invoke("kproxy-check-ca-cert-installed");
  },
  // ============ API Key 管理 ============
  // 获取所有 API Keys
  proxyGetApiKeys: () => {
    return electron.ipcRenderer.invoke("proxy-get-api-keys");
  },
  // 添加 API Key
  proxyAddApiKey: (apiKey) => {
    return electron.ipcRenderer.invoke("proxy-add-api-key", apiKey);
  },
  // 更新 API Key
  proxyUpdateApiKey: (id, updates) => {
    return electron.ipcRenderer.invoke("proxy-update-api-key", id, updates);
  },
  // 删除 API Key
  proxyDeleteApiKey: (id) => {
    return electron.ipcRenderer.invoke("proxy-delete-api-key", id);
  },
  // 重置 API Key 用量统计
  proxyResetApiKeyUsage: (id) => {
    return electron.ipcRenderer.invoke("proxy-reset-api-key-usage", id);
  },
  // 安装 CA 证书到系统信任存储
  kproxyInstallCaCert: () => {
    return electron.ipcRenderer.invoke("kproxy-install-ca-cert");
  },
  // 卸载 CA 证书从系统信任存储
  kproxyUninstallCaCert: () => {
    return electron.ipcRenderer.invoke("kproxy-uninstall-ca-cert");
  },
  // 重置 K-Proxy 统计
  kproxyResetStats: () => {
    return electron.ipcRenderer.invoke("kproxy-reset-stats");
  },
  // 监听 K-Proxy 请求事件
  onKproxyRequest: (callback) => {
    const handler = (_event, info) => {
      callback(info);
    };
    electron.ipcRenderer.on("kproxy-request", handler);
    return () => {
      electron.ipcRenderer.removeListener("kproxy-request", handler);
    };
  },
  // 监听 K-Proxy 响应事件
  onKproxyResponse: (callback) => {
    const handler = (_event, info) => {
      callback(info);
    };
    electron.ipcRenderer.on("kproxy-response", handler);
    return () => {
      electron.ipcRenderer.removeListener("kproxy-response", handler);
    };
  },
  // 监听 K-Proxy 错误事件
  onKproxyError: (callback) => {
    const handler = (_event, error) => {
      callback(error);
    };
    electron.ipcRenderer.on("kproxy-error", handler);
    return () => {
      electron.ipcRenderer.removeListener("kproxy-error", handler);
    };
  },
  // 监听 K-Proxy 状态变化事件
  onKproxyStatusChange: (callback) => {
    const handler = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on("kproxy-status-change", handler);
    return () => {
      electron.ipcRenderer.removeListener("kproxy-status-change", handler);
    };
  },
  // 监听 K-Proxy MITM 拦截事件
  onKproxyMitm: (callback) => {
    const handler = (_event, info) => {
      callback(info);
    };
    electron.ipcRenderer.on("kproxy-mitm", handler);
    return () => {
      electron.ipcRenderer.removeListener("kproxy-mitm", handler);
    };
  },
  // ============ 托盘相关 API ============
  // 获取显示主窗口快捷键
  getShowWindowShortcut: () => electron.ipcRenderer.invoke("get-show-window-shortcut"),
  // 设置显示主窗口快捷键
  setShowWindowShortcut: (shortcut) => electron.ipcRenderer.invoke("set-show-window-shortcut", shortcut),
  // 获取托盘设置
  getTraySettings: () => {
    return electron.ipcRenderer.invoke("get-tray-settings");
  },
  // 保存托盘设置
  saveTraySettings: (settings) => {
    return electron.ipcRenderer.invoke("save-tray-settings", settings);
  },
  // 更新托盘当前账户信息
  updateTrayAccount: (account) => {
    electron.ipcRenderer.send("update-tray-account", account);
  },
  // 更新托盘账户列表
  updateTrayAccountList: (accounts) => {
    electron.ipcRenderer.send("update-tray-account-list", accounts);
  },
  // 刷新托盘菜单
  refreshTrayMenu: () => {
    electron.ipcRenderer.send("refresh-tray-menu");
  },
  // 更新托盘语言
  updateTrayLanguage: (language) => {
    electron.ipcRenderer.send("update-tray-language", language);
  },
  // 监听托盘刷新账户事件
  onTrayRefreshAccount: (callback) => {
    const handler = () => {
      callback();
    };
    electron.ipcRenderer.on("tray-refresh-account", handler);
    return () => {
      electron.ipcRenderer.removeListener("tray-refresh-account", handler);
    };
  },
  // 监听托盘切换账户事件
  onTraySwitchAccount: (callback) => {
    const handler = () => {
      callback();
    };
    electron.ipcRenderer.on("tray-switch-account", handler);
    return () => {
      electron.ipcRenderer.removeListener("tray-switch-account", handler);
    };
  },
  // 监听显示关闭确认对话框事件
  onShowCloseConfirmDialog: (callback) => {
    const handler = () => {
      callback();
    };
    electron.ipcRenderer.on("show-close-confirm-dialog", handler);
    return () => {
      electron.ipcRenderer.removeListener("show-close-confirm-dialog", handler);
    };
  },
  // 发送关闭确认对话框响应
  sendCloseConfirmResponse: (action, rememberChoice) => {
    electron.ipcRenderer.send("close-confirm-response", action, rememberChoice);
  },
  // ============ 注册功能 API ============
  // 启动自动注册
  registrationStartAuto: (config) => {
    return electron.ipcRenderer.invoke("registration-start-auto", config);
  },
  // 启动浏览器模式注册（使用真实 Chromium，绕过 WAF 检测）
  registrationStartBrowser: (config) => {
    return electron.ipcRenderer.invoke("registration-start-browser", config);
  },
  registrationGenerateColabProxy: (config) => {
    return electron.ipcRenderer.invoke("registration-generate-colab-proxy", config);
  },
  registrationGetAutoReplacementConfig: () => {
    return electron.ipcRenderer.invoke("registration-get-auto-replacement-config");
  },
  registrationSaveAutoReplacementConfig: (config) => {
    return electron.ipcRenderer.invoke("registration-save-auto-replacement-config", config);
  },
  // 取消浏览器注册
  registrationCancelBrowser: (taskId) => {
    return electron.ipcRenderer.invoke("registration-cancel-browser", taskId);
  },
  // 获取所有浏览器注册窗口状态
  registrationGetBrowserWindows: () => {
    return electron.ipcRenderer.invoke("registration-get-browser-windows");
  },
  // 显示浏览器注册窗口
  registrationShowBrowserWindow: (taskId) => {
    return electron.ipcRenderer.invoke("registration-show-browser-window", taskId);
  },
  // 隐藏浏览器注册窗口
  registrationHideBrowserWindow: (taskId) => {
    return electron.ipcRenderer.invoke("registration-hide-browser-window", taskId);
  },
  // 重启浏览器注册任务
  registrationRestartBrowserTask: (taskId) => {
    return electron.ipcRenderer.invoke("registration-restart-browser-task", taskId);
  },
  // 手动模式 Phase1: 初始化 OIDC + 设备授权
  registrationManualPhase1: (config) => {
    return electron.ipcRenderer.invoke("registration-manual-phase1", config);
  },
  // 手动模式 Phase2: 设置邮箱 -> 发送 OTP
  registrationManualPhase2: (email, fullName) => {
    return electron.ipcRenderer.invoke("registration-manual-phase2", email, fullName);
  },
  // 手动模式 Phase3: 验证码 -> 完成
  registrationManualPhase3: (otp) => {
    return electron.ipcRenderer.invoke("registration-manual-phase3", otp);
  },
  // 取消注册
  registrationCancel: () => {
    return electron.ipcRenderer.invoke("registration-cancel");
  },
  // ============ 代理池 API ============
  /**
   * 验活单个代理：使用 undici ProxyAgent 通过指定代理 URL 请求测试 URL
   * @returns latencyMs / externalIp（如果测试 URL 返回 IP）
   */
  proxyPoolValidate: (params) => {
    return electron.ipcRenderer.invoke("proxy-pool:validate", params);
  },
  // ============ 诊断 API ============
  /** 测试一个 URL 的连通性（GET，5 秒超时，不带代理特殊处理由主进程默认逻辑） */
  diagnoseHttpProbe: (params) => {
    return electron.ipcRenderer.invoke("diagnose:http-probe", params);
  },
  /**
   * 设置账号 → 代理 URL 绑定（用于反代时"N 个账号一个 IP"分桶）
   * @param accountId 账号 ID
   * @param proxyUrl 代理 URL；undefined 表示解绑
   */
  accountSetProxyBinding: (accountId, proxyUrl) => {
    return electron.ipcRenderer.invoke("account-set-proxy-binding", accountId, proxyUrl);
  },
  // ============ 一键诊断 ============
  diagnoseRun: (params) => {
    return electron.ipcRenderer.invoke("diagnose:run", params);
  },
  // 获取注册状态
  registrationStatus: () => {
    return electron.ipcRenderer.invoke("registration-status");
  },
  // 监听注册日志
  onRegistrationLog: (callback) => {
    const handler = (_event, data) => {
      const msg = typeof data === "string" ? data : data.message;
      callback(msg);
    };
    electron.ipcRenderer.on("registration-log", handler);
    return () => {
      electron.ipcRenderer.removeListener("registration-log", handler);
    };
  },
  // 监听注册完成
  onRegistrationComplete: (callback) => {
    const handler = (_event, result) => {
      callback(result);
    };
    electron.ipcRenderer.on("registration-complete", handler);
    return () => {
      electron.ipcRenderer.removeListener("registration-complete", handler);
    };
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
