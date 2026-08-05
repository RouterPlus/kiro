import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const PORT = process.env.PORT || 9998

// Global proxy server instance (will be initialized if needed)
let proxyServer = null

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Serve static files from out/renderer
const rendererPath = path.join(__dirname, '../out/renderer')
app.use(express.static(rendererPath))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('[Server] Client connected:', socket.id)

  // Import and setup IPC handlers
  setupIpcHandlers(socket)

  socket.on('disconnect', () => {
    console.log('[Server] Client disconnected:', socket.id)
  })
})

// Helper function to convert stored accounts to proxy format
function getStoredAccountsForProxy(accountData) {
  if (!accountData?.accounts) return []

  const seen = new Set()
  return Object.values(accountData.accounts)
    .filter(
      (acc) =>
        acc.status === 'active' &&
        acc.credentials?.accessToken &&
        !String(acc.lastError || '')
          .toLowerCase()
          .includes('suspended') &&
        !String(acc.lastError || '')
          .toLowerCase()
          .includes('locked')
    )
    .filter((acc) => {
      const key = acc.credentials?.refreshToken || acc.email || acc.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((acc) => ({
      id: acc.id,
      email: acc.email,
      accessToken: acc.credentials.accessToken,
      refreshToken: acc.credentials?.refreshToken,
      profileArn: acc.credentials?.profileArn,
      expiresAt: acc.credentials?.expiresAt,
      machineId: acc.machineId,
      clientId: acc.credentials?.clientId,
      clientSecret: acc.credentials?.clientSecret,
      region: acc.credentials?.region || 'us-east-1',
      authMethod: acc.credentials?.authMethod,
      provider: acc.credentials?.provider || acc.idp
    }))
}

// Sync accounts to proxy server pool
function syncAccountsToProxy(accountData) {
  if (!proxyServer || !proxyServer.isRunning()) {
    return 0
  }

  try {
    const proxyAccounts = getStoredAccountsForProxy(accountData)
    const pool = proxyServer.getAccountPool()

    // Clear existing accounts
    pool.clear()

    // Add all active accounts
    proxyAccounts.forEach((acc) => pool.addAccount(acc))

    console.log(`[Server] Synced ${proxyAccounts.length} accounts to proxy pool`)
    return proxyAccounts.length
  } catch (error) {
    console.error('[Server] Failed to sync accounts to proxy:', error)
    return 0
  }
}

// Setup IPC handlers
function setupIpcHandlers(socket) {
  // Load accounts
  socket.on('load-accounts', async (callback) => {
    try {
      const { loadAccounts } = await import('../src/main/storage.js')
      const data = await loadAccounts()
      callback({ success: true, data })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Save accounts
  socket.on('save-accounts', async (data, callback) => {
    try {
      const { saveAccounts } = await import('../src/main/storage.js')
      await saveAccounts(data)

      // Auto-sync accounts to proxy server pool
      const syncedCount = syncAccountsToProxy(data)

      callback({ success: true, syncedAccounts: syncedCount })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Get app version
  socket.on('get-app-version', (callback) => {
    callback('1.7.0-web')
  })

  // Proxy status
  socket.on('proxy-get-status', (callback) => {
    if (!proxyServer) {
      callback({
        running: false,
        config: {},
        stats: {}
      })
      return
    }

    callback({
      running: proxyServer.isRunning(),
      config: proxyServer.getConfig(),
      stats: proxyServer.getStats()
    })
  })

  // Sync accounts to proxy
  socket.on('sync-accounts-to-proxy', async (callback) => {
    try {
      const { loadAccounts } = await import('../src/main/storage.js')
      const accountData = await loadAccounts()
      const syncedCount = syncAccountsToProxy(accountData)
      callback({ success: true, syncedAccounts: syncedCount })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Proxy start
  socket.on('proxy-start', async (config, callback) => {
    try {
      if (!proxyServer) {
        const { ProxyServer } = await import('../src/main/proxy/proxyServer.js')
        const { loadAccounts } = await import('../src/main/storage.js')

        proxyServer = new ProxyServer(config, {
          onPoolEmpty: async () => {
            const accountData = await loadAccounts()
            const proxyAccounts = getStoredAccountsForProxy(accountData)
            if (proxyAccounts.length > 0 && proxyServer) {
              const pool = proxyServer.getAccountPool()
              proxyAccounts.forEach((acc) => pool.addAccount(acc))
            }
          }
        })

        const accountData = await loadAccounts()
        syncAccountsToProxy(accountData)
      }

      await proxyServer.start()

      // Emit status change to all clients
      io.emit('proxy-status-change', {
        running: true,
        config: proxyServer.getConfig(),
        stats: proxyServer.getStats()
      })

      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Proxy stop
  socket.on('proxy-stop', async (callback) => {
    try {
      if (proxyServer && proxyServer.isRunning()) {
        await proxyServer.stop()

        // Emit status change to all clients
        io.emit('proxy-status-change', {
          running: false,
          config: {},
          stats: {}
        })
      }
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Proxy get config
  socket.on('proxy-get-config', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      const config = store.get('proxyConfig') || {}
      callback(config)
    } catch (error) {
      callback({})
    }
  })

  // Proxy save config
  socket.on('proxy-save-config', async (config, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('proxyConfig', config)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Update handlers (no-op for web version, but need to exist)
  socket.on('check-for-updates', (callback) => {
    // Emit checking event
    socket.emit('update-checking')
    // Then emit not available (web version doesn't support auto-updates)
    setTimeout(() => {
      socket.emit('update-not-available')
      callback({ available: false, message: 'Auto-updates not supported in web version' })
    }, 500)
  })

  socket.on('install-update', (callback) => {
    callback({ success: false, message: 'Auto-updates not supported in web version' })
  })

  // Close confirm dialog (no-op for web, window management doesn't apply)
  socket.on('send-close-confirm-response', (action, remember, callback) => {
    if (callback) callback({ success: true })
  })

  // Machine ID
  socket.on('get-machine-id', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('machineId') || '')
    } catch (error) {
      callback('')
    }
  })

  socket.on('generate-machine-id', async (callback) => {
    try {
      const { randomBytes } = await import('crypto')
      const machineId = randomBytes(16).toString('hex')
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('machineId', machineId)
      callback(machineId)
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('machine-id-get-os-type', async (callback) => {
    callback('web') // Return 'web' as OS type for web version
  })

  socket.on('machine-id-get-bindings', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('machineIdBindings') || {})
    } catch (error) {
      callback({})
    }
  })

  socket.on('machine-id-save-bindings', async (bindings, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('machineIdBindings', bindings)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('machine-id-get-auto-switch', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('machineIdAutoSwitch') || false)
    } catch (error) {
      callback(false)
    }
  })

  socket.on('machine-id-set-auto-switch', async (enabled, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('machineIdAutoSwitch', enabled)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Local Active Account
  socket.on('get-local-active-account', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      const data = store.get('localActiveAccount')
      callback({ success: true, data: data || null })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('set-local-active-account', async (accountId, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('localActiveAccount', accountId)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Kiro Settings
  socket.on('get-kiro-settings', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('kiroSettings') || {})
    } catch (error) {
      callback({})
    }
  })

  socket.on('save-kiro-settings', async (settings, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('kiroSettings', settings)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('get-kiro-available-models', async (callback) => {
    try {
      // Return a default list of models
      callback([
        { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
        { id: 'claude-opus-4', name: 'Claude Opus 4' },
        { id: 'claude-haiku-4', name: 'Claude Haiku 4' }
      ])
    } catch (error) {
      callback([])
    }
  })

  socket.on('get-usage-api-type', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('usageApiType') || 'anthropic')
    } catch (error) {
      callback('anthropic')
    }
  })

  socket.on('set-usage-api-type', async (type, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('usageApiType', type)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('get-use-kproxy-for-api', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('useKProxyForApi') || false)
    } catch (error) {
      callback(false)
    }
  })

  socket.on('set-use-kproxy-for-api', async (enabled, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('useKProxyForApi', enabled)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Tray Settings
  socket.on('get-tray-settings', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('traySettings') || {})
    } catch (error) {
      callback({})
    }
  })

  socket.on('save-tray-settings', async (settings, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('traySettings', settings)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Shortcuts (no-op for web)
  socket.on('get-show-window-shortcut', async (callback) => {
    callback(null)
  })

  socket.on('set-show-window-shortcut', async (shortcut, callback) => {
    callback({ success: true })
  })

  // Webhooks
  socket.on('get-webhooks', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      callback(store.get('webhooks') || [])
    } catch (error) {
      callback([])
    }
  })

  socket.on('save-webhooks', async (webhooks, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('webhooks', webhooks)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('test-webhook', async (webhook, callback) => {
    try {
      // Simple webhook test implementation
      const fetch = (await import('node-fetch')).default
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true })
      })
      callback({ success: response.ok, status: response.status })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Logs (no-op for web)
  socket.on('get-logs', async (limit, callback) => {
    callback([])
  })

  socket.on('clear-logs', async (callback) => {
    callback({ success: true })
  })

  // Diagnostics (no-op for web)
  socket.on('run-diagnostics', async (callback) => {
    callback({ success: true, results: [] })
  })

  socket.on('diagnose-run', async (callback) => {
    callback({ success: true, results: [] })
  })

  socket.on('diagnose-http-probe', async (url, callback) => {
    callback({ success: true, reachable: true })
  })

  // Tray updates (no-op for web, no system tray)
  socket.on('update-tray-account-list', async (accounts, callback) => {
    if (callback) callback({ success: true })
  })

  socket.on('update-tray-account', async (account, callback) => {
    if (callback) callback({ success: true })
  })

  socket.on('update-tray-language', async (lang, callback) => {
    if (callback) callback({ success: true })
  })

  // Account operations (stub implementations - add real logic as needed)
  socket.on('verify-account-credentials', async (credentials, callback) => {
    try {
      // Placeholder - implement real verification
      callback({ success: true, valid: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('refresh-account-token', async (accountId, callback) => {
    try {
      // Placeholder - implement real token refresh
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('check-account-status', async (accountId, callback) => {
    try {
      // Placeholder - implement real status check
      callback({ success: true, status: 'active' })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('switch-account', async (accountId, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('localActiveAccount', accountId)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('switch-account-cli', async (accountId, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('localActiveAccount', accountId)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Import/Export (no-op for web - security constraint)
  socket.on('import-from-file', async (filePath, callback) => {
    callback({ success: false, error: 'File system access not supported in web version' })
  })

  socket.on('export-to-file', async (filePath, data, callback) => {
    callback({ success: false, error: 'File system access not supported in web version' })
  })

  socket.on('export-config', async (callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      const config = store.store // Get all config
      callback({ success: true, config })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('import-config', async (config, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      Object.keys(config).forEach(key => store.set(key, config[key]))
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Proxy logs
  socket.on('proxy-load-logs', async (limit, callback) => {
    try {
      if (!proxyServer) {
        callback([])
        return
      }
      // Get logs from proxy server if it has a getLogs method
      const logs = proxyServer.getLogs ? proxyServer.getLogs(limit) : []
      callback(logs)
    } catch (error) {
      callback([])
    }
  })

  socket.on('proxy-clear-logs', async (callback) => {
    try {
      if (proxyServer && proxyServer.clearLogs) {
        proxyServer.clearLogs()
      }
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('proxy-get-accounts', async (callback) => {
    try {
      if (!proxyServer) {
        callback([])
        return
      }
      const pool = proxyServer.getAccountPool()
      const accounts = pool ? pool.getAllAccounts() : []
      callback(accounts)
    } catch (error) {
      callback([])
    }
  })

  // K-Proxy handlers (stub implementations - K-Proxy is a separate feature)
  socket.on('kproxy-init', async (callback) => {
    // Return success=true but with a placeholder config indicating it's not available
    callback({
      success: true,
      message: 'K-Proxy not available in web version',
      caInfo: null
    })
  })

  socket.on('kproxy-start', async (config, callback) => {
    callback({ success: false, error: 'K-Proxy not available in web version' })
  })

  socket.on('kproxy-stop', async (callback) => {
    callback({ success: false, error: 'K-Proxy not available in web version' })
  })

  socket.on('kproxy-get-status', async (callback) => {
    callback({
      running: false,
      config: {
        enabled: false,
        port: 8899,
        host: '127.0.0.1',
        mitmDomains: ['amazonaws.com', 'amazon.com'],
        autoStart: false,
        logRequests: true
      },
      stats: null
    })
  })

  socket.on('kproxy-generate-device-id', async (callback) => {
    try {
      const { randomBytes } = await import('crypto')
      const deviceId = randomBytes(16).toString('hex')
      callback(deviceId)
    } catch (error) {
      callback(null)
    }
  })

  socket.on('kproxy-set-device-id', async (deviceId, callback) => {
    try {
      const { getStore } = await import('../src/main/storage.js')
      const store = getStore()
      store.set('kproxyDeviceId', deviceId)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  socket.on('kproxy-check-ca-cert-installed', async (callback) => {
    callback({ installed: false })
  })

  socket.on('kproxy-install-ca-cert', async (callback) => {
    callback({ success: false, message: 'Certificate installation not supported in web version' })
  })

  socket.on('kproxy-export-ca-cert', async (callback) => {
    callback({ success: false, message: 'Certificate export not supported in web version' })
  })

  // Add more handlers as needed...
  console.log('[Server] IPC handlers registered for socket:', socket.id)
}

// SPA fallback - serve index.html for all routes
app.get('*', (req, res) => {
  // For API routes, return 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' })
  }

  // For all other routes, serve the SPA
  res.sendFile(path.join(rendererPath, 'index.html'))
})

// Start server
httpServer.listen(PORT, async () => {
  console.log('╔════════════════════════════════════════╗')
  console.log('║   Kiro Account Manager - Web Server   ║')
  console.log('╠════════════════════════════════════════╣')
  console.log(`║  URL: http://localhost:${PORT}           ║`)
  console.log(`║  WebSocket: ws://localhost:${PORT}       ║`)
  console.log('╠════════════════════════════════════════╣')
  console.log('║  Press Ctrl+C to stop                  ║')
  console.log('╚════════════════════════════════════════╝')

  // Initialize proxy server if configured
  try {
    const { loadAccounts, getStore } = await import('../src/main/storage.js')
    const store = getStore()
    const proxyConfig = store.get('proxyConfig')

    if (proxyConfig?.enabled) {
      console.log('[Server] Initializing Kiro API Proxy...')
      const { ProxyServer } = await import('../src/main/proxy/proxyServer.js')

      proxyServer = new ProxyServer(proxyConfig, {
        onPoolEmpty: async () => {
          // Load accounts when pool is empty (lazy loading)
          const accountData = await loadAccounts()
          const proxyAccounts = getStoredAccountsForProxy(accountData)
          if (proxyAccounts.length > 0 && proxyServer) {
            const pool = proxyServer.getAccountPool()
            proxyAccounts.forEach((acc) => pool.addAccount(acc))
            console.log(`[Server] Lazy-synced ${proxyAccounts.length} accounts to proxy pool`)
          }
        }
      })

      // Load and sync initial accounts
      const accountData = await loadAccounts()
      syncAccountsToProxy(accountData)

      // Start the proxy server
      await proxyServer.start()
      console.log(`[Server] Kiro API Proxy started on ${proxyConfig.host}:${proxyConfig.port}`)
    }
  } catch (error) {
    console.error('[Server] Failed to initialize proxy:', error)
  }
})

process.on('SIGTERM', async () => {
  console.log('[Server] Shutting down...')

  // Stop proxy server if running
  if (proxyServer && proxyServer.isRunning()) {
    console.log('[Server] Stopping proxy server...')
    await proxyServer.stop()
  }

  httpServer.close(() => {
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  console.log('[Server] Received SIGINT, shutting down...')

  // Stop proxy server if running
  if (proxyServer && proxyServer.isRunning()) {
    console.log('[Server] Stopping proxy server...')
    await proxyServer.stop()
  }

  httpServer.close(() => {
    process.exit(0)
  })
})
