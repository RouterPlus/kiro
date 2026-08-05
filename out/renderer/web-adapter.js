// Web adapter: Bridge window.api calls to Socket.IO for web environment
(function() {
  console.log('[WebAdapter] Initializing...')

  if (typeof io === 'undefined') {
    console.error('[WebAdapter] Socket.IO not loaded! Include socket.io-client before web-adapter.js')
    return
  }

  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  })

  socket.on('connect', () => {
    console.log('[WebAdapter] Connected to server')
  })

  socket.on('disconnect', () => {
    console.log('[WebAdapter] Disconnected from server')
  })

  socket.on('connect_error', (err) => {
    console.error('[WebAdapter] Connection error:', err)
  })

  // Helper to promisify socket.emit with callback
  function invoke(channel, ...args) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${channel}`))
      }, 30000)

      socket.emit(channel, ...args, (response) => {
        clearTimeout(timeout)
        if (response && response.success === false) {
          resolve(response) // Don't reject, return error response
        } else {
          resolve(response)
        }
      })
    })
  }

  // Event listener helpers
  const eventListeners = new Map()

  function on(channel, callback) {
    socket.on(channel, callback)

    // Return unsubscribe function
    return () => {
      socket.off(channel, callback)
    }
  }

  // Create window.api object
  window.api = {
    // ========== Storage ==========
    loadAccounts: () => invoke('load-accounts'),
    saveAccounts: (data) => invoke('save-accounts', data),

    // ========== App Info ==========
    getAppVersion: () => invoke('get-app-version'),

    // ========== Tray ==========
    updateTrayAccountList: (accounts) => invoke('update-tray-account-list', accounts),
    updateTrayAccount: (account) => invoke('update-tray-account', account),
    onTrayRefreshAccount: (callback) => on('tray-refresh-account', callback),
    onTraySwitchAccount: (callback) => on('tray-switch-account', callback),

    // ========== Proxy ==========
    proxyGetStatus: () => invoke('proxy-get-status'),
    proxyStart: (config) => invoke('proxy-start', config),
    proxyStop: () => invoke('proxy-stop'),
    proxyGetConfig: () => invoke('proxy-get-config'),
    proxySaveConfig: (config) => invoke('proxy-save-config', config),
    syncAccountsToProxy: () => invoke('sync-accounts-to-proxy'),
    onProxyAccountUpdate: (callback) => on('proxy-account-update', callback),
    onProxyWebhookTrigger: (callback) => on('proxy-webhook-trigger', callback),

    // ========== Background Refresh ==========
    onBackgroundRefreshResult: (callback) => on('background-refresh-result', callback),
    onBackgroundCheckResult: (callback) => on('background-check-result', callback),

    // ========== Registration - Event Listeners ==========
    onRegistrationLog: (callback) => {
      return on('registration-log', (data) => {
        if (typeof data === 'string') {
          callback(data)
        } else if (data && data.message) {
          callback(data.message)
        }
      })
    },

    onRegistrationComplete: (callback) => {
      return on('registration-complete', callback)
    },

    // ========== Registration - Status & Control ==========
    registrationStatus: () => invoke('registration-status'),
    registrationCancel: (taskId) => invoke('registration-cancel', taskId),
    registrationCancelBrowser: (taskId) => invoke('registration-cancel-browser', taskId),

    // ========== Registration - Manual Mode (3 phases) ==========
    registrationManualPhase1: (config) => invoke('registration-manual-phase1', config),
    registrationManualPhase2: (email, fullName) => invoke('registration-manual-phase2', email, fullName),
    registrationManualPhase3: (otp) => invoke('registration-manual-phase3', otp),

    // ========== Registration - Auto Mode ==========
    registrationStartAuto: (config) => invoke('registration-start-auto', config),

    // ========== Registration - Browser Mode ==========
    registrationStartBrowser: (config) => invoke('registration-start-browser', config),

    // ========== Registration - Config & Utilities ==========
    registrationSaveAutoReplacementConfig: (config) => invoke('registration-save-auto-replacement-config', config),
    registrationGetAutoReplacementConfig: () => invoke('registration-get-auto-replacement-config'),
    registrationGenerateColabProxy: (config) => invoke('registration-generate-colab-proxy', config),

    // ========== Account Management ==========
    verifyAccountCredentials: (credentials) => invoke('verify-account-credentials', credentials),
    accountGetSubscriptionUrl: (accessToken, product, region, clientId, clientSecret, provider, authMethod, profileArn) =>
      invoke('account-get-subscription-url', accessToken, product, region, clientId, clientSecret, provider, authMethod, profileArn),

    // ========== Machine ID ==========
    getMachineId: () => invoke('get-machine-id'),
    generateMachineId: () => invoke('generate-machine-id'),
    machineIdGetOSType: () => invoke('machine-id-get-os-type'),
    machineIdGetBindings: () => invoke('machine-id-get-bindings'),
    machineIdSaveBindings: (bindings) => invoke('machine-id-save-bindings', bindings),
    machineIdGetAutoSwitch: () => invoke('machine-id-get-auto-switch'),
    machineIdSetAutoSwitch: (enabled) => invoke('machine-id-set-auto-switch', enabled),

    // ========== Settings ==========
    getTraySettings: () => invoke('get-tray-settings'),
    saveTraySettings: (settings) => invoke('save-tray-settings', settings),
    getShowWindowShortcut: () => invoke('get-show-window-shortcut'),
    setShowWindowShortcut: (shortcut) => invoke('set-show-window-shortcut', shortcut),

    // ========== Webhooks ==========
    getWebhooks: () => invoke('get-webhooks'),
    saveWebhooks: (webhooks) => invoke('save-webhooks', webhooks),
    testWebhook: (webhook) => invoke('test-webhook', webhook),

    // ========== Logs ==========
    getLogs: (limit) => invoke('get-logs', limit),
    clearLogs: () => invoke('clear-logs'),

    // ========== Diagnostics ==========
    runDiagnostics: () => invoke('run-diagnostics'),

    // ========== Updates ==========
    checkForUpdates: () => invoke('check-for-updates'),
    installUpdate: () => invoke('install-update'),
    onUpdateChecking: (callback) => on('update-checking', callback),
    onUpdateAvailable: (callback) => on('update-available', callback),
    onUpdateNotAvailable: (callback) => on('update-not-available', callback),
    onUpdateDownloadProgress: (callback) => on('update-download-progress', callback),
    onUpdateDownloaded: (callback) => on('update-downloaded', callback),
    onUpdateError: (callback) => on('update-error', callback),

    // ========== Window Control ==========
    minimizeWindow: () => Promise.resolve(),
    maximizeWindow: () => Promise.resolve(),
    closeWindow: () => Promise.resolve(),
    onShowCloseConfirmDialog: (callback) => on('show-close-confirm-dialog', callback),
    sendCloseConfirmResponse: (action, remember) => invoke('send-close-confirm-response', action, remember),

    // ========== Proxy Status ==========
    onProxyStatusChange: (callback) => on('proxy-status-change', callback),

    // ========== Config Sync ==========
    exportConfig: () => invoke('export-config'),
    importConfig: (config) => invoke('import-config', config),

    // ========== Email Service (for registration) ==========
    emailServiceCheck: (service, config) => invoke('email-service-check', service, config),
    emailServiceFetchOtp: (service, config) => invoke('email-service-fetch-otp', service, config),

    // ========== Local Active Account ==========
    getLocalActiveAccount: () => invoke('get-local-active-account'),
    setLocalActiveAccount: (accountId) => invoke('set-local-active-account', accountId),

    // ========== Account Management Extended ==========
    refreshAccountToken: (accountId) => invoke('refresh-account-token', accountId),
    checkAccountStatus: (accountId) => invoke('check-account-status', accountId),
    switchAccount: (accountId) => invoke('switch-account', accountId),
    switchAccountCli: (accountId) => invoke('switch-account-cli', accountId),
    accountGetModels: (accountId) => invoke('account-get-models', accountId),
    accountGetSubscriptions: (accountId) => invoke('account-get-subscriptions', accountId),
    accountSetOverage: (accountId, enabled) => invoke('account-set-overage', accountId, enabled),
    accountSetProxyBinding: (accountId, proxyId) => invoke('account-set-proxy-binding', accountId, proxyId),

    // ========== Kiro Proxy (K-Proxy) ==========
    kproxyInit: () => invoke('kproxy-init'),
    kproxyStart: (config) => invoke('kproxy-start', config),
    kproxyStop: () => invoke('kproxy-stop'),
    kproxyGetStatus: () => invoke('kproxy-get-status'),
    kproxyGenerateDeviceId: () => invoke('kproxy-generate-device-id'),
    kproxySetDeviceId: (deviceId) => invoke('kproxy-set-device-id', deviceId),
    kproxyCheckCaCertInstalled: () => invoke('kproxy-check-ca-cert-installed'),
    kproxyInstallCaCert: () => invoke('kproxy-install-ca-cert'),
    kproxyExportCaCert: () => invoke('kproxy-export-ca-cert'),
    onKproxyRequest: (callback) => on('kproxy-request', callback),
    onKproxyResponse: (callback) => on('kproxy-response', callback),
    onKproxyError: (callback) => on('kproxy-error', callback),
    onKproxyStatusChange: (callback) => on('kproxy-status-change', callback),

    // ========== Kiro Settings ==========
    getKiroSettings: () => invoke('get-kiro-settings'),
    saveKiroSettings: (settings) => invoke('save-kiro-settings', settings),
    getKiroAvailableModels: () => invoke('get-kiro-available-models'),
    getUsageApiType: () => invoke('get-usage-api-type'),
    setUsageApiType: (type) => invoke('set-usage-api-type', type),
    getUseKProxyForApi: () => invoke('get-use-kproxy-for-api'),
    setUseKProxyForApi: (enabled) => invoke('set-use-kproxy-for-api', enabled),

    // ========== Kiro Steering Files ==========
    readKiroSteeringFile: (filePath) => invoke('read-kiro-steering-file', filePath),
    saveKiroSteeringFile: (filePath, content) => invoke('save-kiro-steering-file', filePath, content),
    deleteKiroSteeringFile: (filePath) => invoke('delete-kiro-steering-file', filePath),
    createKiroDefaultRules: () => invoke('create-kiro-default-rules'),

    // ========== MCP Servers ==========
    saveMcpServer: (server) => invoke('save-mcp-server', server),
    deleteMcpServer: (serverId) => invoke('delete-mcp-server', serverId),

    // ========== SSO & Social Login ==========
    startIamSsoLogin: (config) => invoke('start-iam-sso-login', config),
    cancelIamSsoLogin: () => invoke('cancel-iam-sso-login'),
    startBuilderIdLogin: (config) => invoke('start-builder-id-login', config),
    cancelBuilderIdLogin: () => invoke('cancel-builder-id-login'),
    startSocialLogin: (provider, config) => invoke('start-social-login', provider, config),
    cancelSocialLogin: () => invoke('cancel-social-login'),
    exchangeSocialToken: (provider, token) => invoke('exchange-social-token', provider, token),
    importFromSsoToken: (ssoToken) => invoke('import-from-sso-token', ssoToken),

    // ========== Background Operations ==========
    backgroundBatchRefresh: (accountIds) => invoke('background-batch-refresh', accountIds),
    backgroundBatchCheck: (accountIds) => invoke('background-batch-check', accountIds),

    // ========== Proxy Extended ==========
    proxyUpdateConfig: (config) => invoke('proxy-update-config', config),
    proxyUpdateApiKey: (apiKey) => invoke('proxy-update-api-key', apiKey),
    proxySyncAccounts: () => invoke('proxy-sync-accounts'),
    proxySelfSignedCertInfo: () => invoke('proxy-self-signed-cert-info'),
    proxySelfSignedCertRegenerate: () => invoke('proxy-self-signed-cert-regenerate'),
    proxyLoadLogs: (limit) => invoke('proxy-load-logs', limit),
    proxyClearLogs: () => invoke('proxy-clear-logs'),
    proxyGetAccounts: () => invoke('proxy-get-accounts'),
    onProxyRequest: (callback) => on('proxy-request', callback),
    onProxyResponse: (callback) => on('proxy-response', callback),
    onProxyError: (callback) => on('proxy-error', callback),

    // ========== Diagnostics ==========
    diagnoseRun: () => invoke('diagnose-run'),
    diagnoseHttpProbe: (url) => invoke('diagnose-http-probe', url),

    // ========== Import/Export ==========
    importFromFile: (filePath) => invoke('import-from-file', filePath),
    exportToFile: (filePath, data) => invoke('export-to-file', filePath, data),

    // ========== Tray Extended ==========
    updateTrayLanguage: (lang) => invoke('update-tray-language', lang),

    // ========== Updates Extended ==========
    checkForUpdatesManual: () => invoke('check-for-updates-manual'),
    downloadUpdate: () => invoke('download-update'),

    // ========== Proxy Global ==========
    setProxy: (config) => invoke('set-proxy', config)
  }

  console.log('[WebAdapter] window.api initialized with Socket.IO bridge')

  // Expose socket for debugging
  window.__socket = socket
})()
