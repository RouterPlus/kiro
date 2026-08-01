// Web adapter for browser environment
// This file replaces window.api when running in browser

(function() {
  'use strict';

  class WebApiAdapter {
    constructor() {
      this.socket = null;
      this.connected = false;
      this.eventHandlers = new Map();
      this.init();
    }

    init() {
      // Connect to WebSocket server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity
      });

      this.socket.on('connect', () => {
        console.log('[WebAPI] Connected to server');
        this.connected = true;
        this.updateConnectionStatus(true);
      });

      this.socket.on('disconnect', () => {
        console.log('[WebAPI] Disconnected from server');
        this.connected = false;
        this.updateConnectionStatus(false);
      });

      // Listen for server events
      this.setupEventForwarding();
    }

    updateConnectionStatus(connected) {
      const indicator = document.getElementById('connection-status');
      if (indicator) {
        indicator.style.background = connected ? '#22c55e' : '#ef4444';
        indicator.style.boxShadow = connected
          ? '0 0 8px rgba(34, 197, 94, 0.5)'
          : '0 0 8px rgba(239, 68, 68, 0.5)';
      }
    }

    setupEventForwarding() {
      // Forward server events to registered handlers
      const events = [
        'proxy-status-change', 'proxy-request', 'proxy-response', 'proxy-error',
        'proxy-account-update', 'proxy-webhook-trigger',
        'kproxy-request', 'kproxy-response', 'kproxy-error', 'kproxy-status-change', 'kproxy-mitm',
        'background-refresh-progress', 'background-refresh-result',
        'background-check-progress', 'background-check-result',
        'registration-log', 'registration-complete',
        'update-checking', 'update-available', 'update-not-available',
        'update-download-progress', 'update-downloaded', 'update-error',
        'social-auth-callback', 'auth-callback',
        'tray-refresh-account', 'tray-switch-account', 'show-close-confirm-dialog'
      ];

      events.forEach(eventName => {
        this.socket.on(eventName, (...args) => {
          const handlers = this.eventHandlers.get(eventName) || [];
          handlers.forEach(handler => handler(...args));
        });
      });
    }

    // Generic invoke method
    invoke(channel, ...args) {
      return new Promise((resolve, reject) => {
        if (!this.connected) {
          reject(new Error('Not connected to server'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for ${channel}`));
        }, 30000);

        this.socket.emit(channel, ...args, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    }

    // Event listener registration
    on(eventName, callback) {
      if (!this.eventHandlers.has(eventName)) {
        this.eventHandlers.set(eventName, []);
      }
      this.eventHandlers.get(eventName).push(callback);

      return () => {
        const handlers = this.eventHandlers.get(eventName);
        const index = handlers.indexOf(callback);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      };
    }

    // Implement all window.api methods
    async getAppVersion() { return this.invoke('get-app-version'); }
    async loadAccounts() { return this.invoke('load-accounts'); }
    async saveAccounts(data) { return this.invoke('save-accounts', data); }
    async refreshAccountToken(account) { return this.invoke('refresh-account-token', account); }
    async checkAccountStatus(account) { return this.invoke('check-account-status', account); }
    async backgroundBatchRefresh(accounts, concurrency, syncInfo) {
      return this.invoke('background-batch-refresh', accounts, concurrency, syncInfo);
    }
    async backgroundBatchCheck(accounts, concurrency) {
      return this.invoke('background-batch-check', accounts, concurrency);
    }
    async switchAccount(credentials) { return this.invoke('switch-account', credentials); }
    async switchAccountCli(credentials) { return this.invoke('switch-account-cli', credentials); }
    async logoutAccount() { return this.invoke('logout-account'); }
    async verifyAccountCredentials(credentials) { return this.invoke('verify-account-credentials', credentials); }
    async getLocalActiveAccount() { return this.invoke('get-local-active-account'); }
    async loadKiroCredentials() { return this.invoke('load-kiro-credentials'); }
    async importFromSsoToken(bearerToken, region) { return this.invoke('import-from-sso-token', bearerToken, region); }

    // Proxy methods
    async proxyStart(config) { return this.invoke('proxy-start', config); }
    async proxyStop() { return this.invoke('proxy-stop'); }
    async proxyGetStatus() { return this.invoke('proxy-get-status'); }
    async proxyUpdateConfig(config) { return this.invoke('proxy-update-config', config); }
    async proxyAddAccount(account) { return this.invoke('proxy-add-account', account); }
    async proxyRemoveAccount(accountId) { return this.invoke('proxy-remove-account', accountId); }
    async proxySyncAccounts(accounts) { return this.invoke('proxy-sync-accounts', accounts); }
    async proxyGetAccounts() { return this.invoke('proxy-get-accounts'); }
    async proxyResetPool() { return this.invoke('proxy-reset-pool'); }
    async proxyResetCredits() { return this.invoke('proxy-reset-credits'); }
    async proxyResetTokens() { return this.invoke('proxy-reset-tokens'); }
    async proxyResetRequestStats() { return this.invoke('proxy-reset-request-stats'); }
    async proxyGetLogs(count) { return this.invoke('proxy-get-logs', count); }
    async proxyClearLogs() { return this.invoke('proxy-clear-logs'); }
    async proxyGetLogsCount() { return this.invoke('proxy-get-logs-count'); }
    async proxyRefreshModels() { return this.invoke('proxy-refresh-models'); }
    async proxyGetModels() { return this.invoke('proxy-get-models'); }
    async proxyConfigureClients(input) { return this.invoke('proxy-configure-clients', input); }
    async proxyGetApiKeys() { return this.invoke('proxy-get-api-keys'); }
    async proxyAddApiKey(apiKey) { return this.invoke('proxy-add-api-key', apiKey); }
    async proxyUpdateApiKey(id, updates) { return this.invoke('proxy-update-api-key', id, updates); }
    async proxyDeleteApiKey(id) { return this.invoke('proxy-delete-api-key', id); }
    async proxyResetApiKeyUsage(id) { return this.invoke('proxy-reset-api-key-usage', id); }

    // K-Proxy methods
    async kproxyInit() { return this.invoke('kproxy-init'); }
    async kproxyStart(config) { return this.invoke('kproxy-start', config); }
    async kproxyStop() { return this.invoke('kproxy-stop'); }
    async kproxyGetStatus() { return this.invoke('kproxy-get-status'); }
    async kproxyUpdateConfig(config) { return this.invoke('kproxy-update-config', config); }
    async kproxySetDeviceId(deviceId) { return this.invoke('kproxy-set-device-id', deviceId); }
    async kproxyGenerateDeviceId() { return this.invoke('kproxy-generate-device-id'); }
    async kproxyGetCaCert() { return this.invoke('kproxy-get-ca-cert'); }

    // Settings methods
    async getKiroSettings() { return this.invoke('get-kiro-settings'); }
    async saveKiroSettings(settings) { return this.invoke('save-kiro-settings', settings); }
    async getTraySettings() { return this.invoke('get-tray-settings'); }
    async saveTraySettings(settings) { return this.invoke('save-tray-settings', settings); }
    async getShowWindowShortcut() { return this.invoke('get-show-window-shortcut'); }
    async setShowWindowShortcut(shortcut) { return this.invoke('set-show-window-shortcut', shortcut); }
    async setProxy(enabled, url) { return this.invoke('set-proxy', enabled, url); }

    // File operations
    async exportToFile(data, filename) {
      // Browser download
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }

    async importFromFile() {
      // Browser file picker
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.cbor';
        input.onchange = (e) => {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              content: event.target.result,
              format: file.name.endsWith('.cbor') ? 'cbor' : 'json'
            });
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    // Utility methods
    openExternal(url, usePrivateMode) {
      window.open(url, '_blank');
    }

    // Event listeners with cleanup
    onProxyStatusChange(callback) { return this.on('proxy-status-change', callback); }
    onProxyRequest(callback) { return this.on('proxy-request', callback); }
    onProxyResponse(callback) { return this.on('proxy-response', callback); }
    onProxyError(callback) { return this.on('proxy-error', callback); }
    onProxyAccountUpdate(callback) { return this.on('proxy-account-update', callback); }
    onProxyWebhookTrigger(callback) { return this.on('proxy-webhook-trigger', callback); }
    onKproxyRequest(callback) { return this.on('kproxy-request', callback); }
    onKproxyResponse(callback) { return this.on('kproxy-response', callback); }
    onKproxyError(callback) { return this.on('kproxy-error', callback); }
    onKproxyStatusChange(callback) { return this.on('kproxy-status-change', callback); }
    onKproxyMitm(callback) { return this.on('kproxy-mitm', callback); }
    onBackgroundRefreshProgress(callback) { return this.on('background-refresh-progress', callback); }
    onBackgroundRefreshResult(callback) { return this.on('background-refresh-result', callback); }
    onBackgroundCheckProgress(callback) { return this.on('background-check-progress', callback); }
    onBackgroundCheckResult(callback) { return this.on('background-check-result', callback); }
    onRegistrationLog(callback) { return this.on('registration-log', callback); }
    onRegistrationComplete(callback) { return this.on('registration-complete', callback); }
    onUpdateChecking(callback) { return this.on('update-checking', callback); }
    onUpdateAvailable(callback) { return this.on('update-available', callback); }
    onUpdateNotAvailable(callback) { return this.on('update-not-available', callback); }
    onUpdateDownloadProgress(callback) { return this.on('update-download-progress', callback); }
    onUpdateDownloaded(callback) { return this.on('update-downloaded', callback); }
    onUpdateError(callback) { return this.on('update-error', callback); }
    onSocialAuthCallback(callback) { return this.on('social-auth-callback', callback); }
    onAuthCallback(callback) { return this.on('auth-callback', callback); }
    onTrayRefreshAccount(callback) { return this.on('tray-refresh-account', callback); }
    onTraySwitchAccount(callback) { return this.on('tray-switch-account', callback); }
    onShowCloseConfirmDialog(callback) { return this.on('show-close-confirm-dialog', callback); }

    // Tray methods (no-op in browser)
    updateTrayAccount(account) {}
    updateTrayAccountList(accounts) {}
    refreshTrayMenu() {}
    updateTrayLanguage(language) {}
    sendCloseConfirmResponse(action, rememberChoice) {}

    // Window controls (no-op in browser)
    window = {
      minimize: () => {},
      maximize: () => {},
      maximizeToggle: () => {},
      close: () => window.close(),
      isMaximized: async () => false,
      onMaximizeChange: (callback) => () => {},
      getPlatform: async () => 'web'
    };
  }

  // Initialize adapter if in browser
  if (typeof window !== 'undefined' && !window.api) {
    // Wait for Socket.IO to load
    if (typeof io === 'undefined') {
      console.error('[WebAPI] Socket.IO not loaded');
    } else {
      window.api = new WebApiAdapter();
      console.log('[WebAPI] Browser adapter initialized');
    }
  }
})();
