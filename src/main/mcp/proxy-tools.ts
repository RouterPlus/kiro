/**
 * Kiro Proxy Control MCP Tools
 *
 * Provides MCP tools for controlling the Kiro proxy server:
 * - kiro_get_proxy_status: Get current proxy status, config, and statistics
 * - kiro_start_proxy: Start the proxy server with optional config
 * - kiro_stop_proxy: Stop the proxy server
 * - kiro_restart_proxy: Restart the proxy server
 * - kiro_update_proxy_config: Update proxy configuration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ProxyConfig, ProxyStats } from '../proxy/types.js'

/**
 * Proxy server instance accessor
 * Must be set externally after initialization
 */
let getProxyServerInstance: (() => {
  isRunning: () => boolean
  getConfig: () => ProxyConfig
  getStats: () => ProxyStats
  getSessionStats: () => {
    totalRequests: number
    successRequests: number
    failedRequests: number
    startTime: number
  }
  start: (config?: Partial<ProxyConfig>) => Promise<void>
  stop: () => Promise<void>
  restartServer: () => Promise<void>
  updateConfig: (config: Partial<ProxyConfig>) => void
}) | null = () => null

/**
 * Tray menu update callback
 * Must be set externally
 */
let updateTrayMenuCallback: (() => void) | null = null

/**
 * Store instance for persisting config
 * Must be set externally
 */
let storeInstance: {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
} | null = null

/**
 * Initialize proxy tools with dependencies
 */
export function initProxyTools(deps: {
  getProxyServer: () => ReturnType<typeof getProxyServerInstance>
  updateTrayMenu: () => void
  store: typeof storeInstance
}): void {
  getProxyServerInstance = deps.getProxyServer
  updateTrayMenuCallback = deps.updateTrayMenu
  storeInstance = deps.store
}

/**
 * Register proxy control tools with MCP server
 */
export function registerProxyTools(server: Server): void {
  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'kiro_get_proxy_status',
          description: 'Get the current status of the Kiro proxy server including running state, configuration, and statistics',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_start_proxy',
          description: 'Start the Kiro proxy server with optional configuration overrides',
          inputSchema: {
            type: 'object',
            properties: {
              port: {
                type: 'number',
                description: 'Port number to listen on (default: 5580)'
              },
              host: {
                type: 'string',
                description: 'Host address to bind to (default: 127.0.0.1)'
              },
              enableMultiAccount: {
                type: 'boolean',
                description: 'Enable multi-account load balancing'
              },
              logRequests: {
                type: 'boolean',
                description: 'Enable request logging'
              },
              maxConcurrent: {
                type: 'number',
                description: 'Maximum concurrent requests'
              }
            }
          }
        },
        {
          name: 'kiro_stop_proxy',
          description: 'Stop the running Kiro proxy server',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_restart_proxy',
          description: 'Restart the Kiro proxy server (stop and start with current config)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_update_proxy_config',
          description: 'Update the proxy server configuration. Server may need restart for some changes to take effect.',
          inputSchema: {
            type: 'object',
            properties: {
              port: {
                type: 'number',
                description: 'Port number to listen on'
              },
              host: {
                type: 'string',
                description: 'Host address to bind to'
              },
              enableMultiAccount: {
                type: 'boolean',
                description: 'Enable multi-account load balancing'
              },
              logRequests: {
                type: 'boolean',
                description: 'Enable request logging'
              },
              logStreamEvents: {
                type: 'boolean',
                description: 'Enable streaming event logging'
              },
              maxConcurrent: {
                type: 'number',
                description: 'Maximum concurrent requests'
              },
              maxRetries: {
                type: 'number',
                description: 'Maximum retry attempts'
              },
              retryDelayMs: {
                type: 'number',
                description: 'Delay between retries in milliseconds'
              },
              autoStart: {
                type: 'boolean',
                description: 'Auto-start proxy on application launch'
              },
              disableTools: {
                type: 'boolean',
                description: 'Disable tool calls in requests'
              },
              accountSelectionStrategy: {
                type: 'string',
                enum: ['round-robin', 'sticky'],
                description: 'Multi-account selection strategy'
              }
            }
          }
        }
      ]
    }
  })

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'kiro_get_proxy_status':
          return await handleGetProxyStatus()

        case 'kiro_start_proxy':
          return await handleStartProxy(args as Partial<ProxyConfig>)

        case 'kiro_stop_proxy':
          return await handleStopProxy()

        case 'kiro_restart_proxy':
          return await handleRestartProxy()

        case 'kiro_update_proxy_config':
          return await handleUpdateProxyConfig(args as Partial<ProxyConfig>)

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      }
    }
  })
}

/**
 * Get proxy server status
 */
async function handleGetProxyStatus() {
  const proxyServer = getProxyServerInstance?.()

  if (!proxyServer) {
    // Server not initialized, try to load saved config
    const savedConfig = storeInstance?.get('proxyConfig') as ProxyConfig | undefined
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            running: false,
            config: savedConfig || null,
            stats: null,
            sessionStats: null
          }, null, 2)
        }
      ]
    }
  }

  const running = proxyServer.isRunning()
  const config = proxyServer.getConfig()
  const stats = running ? proxyServer.getStats() : null
  const sessionStats = running ? proxyServer.getSessionStats() : null

  // Serialize stats (convert Map to object)
  const serializedStats = stats ? {
    ...stats,
    accountStats: stats.accountStats ? Object.fromEntries(stats.accountStats) : {},
    endpointStats: stats.endpointStats ? Object.fromEntries(stats.endpointStats) : {},
    modelStats: stats.modelStats ? Object.fromEntries(stats.modelStats) : {}
  } : null

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          running,
          config,
          stats: serializedStats,
          sessionStats
        }, null, 2)
      }
    ]
  }
}

/**
 * Start proxy server
 */
async function handleStartProxy(config?: Partial<ProxyConfig>) {
  try {
    const proxyServer = getProxyServerInstance?.()
    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    if (config) {
      proxyServer.updateConfig(config)
    }

    await proxyServer.start()

    // Update tray menu status
    updateTrayMenuCallback?.()

    const finalConfig = proxyServer.getConfig()

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            port: finalConfig.port,
            host: finalConfig.host,
            message: `Proxy server started on ${finalConfig.host}:${finalConfig.port}`
          }, null, 2)
        }
      ]
    }
  } catch (error) {
    console.error('[ProxyTools] Start failed:', error)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start proxy server'
          }, null, 2)
        }
      ]
    }
  }
}

/**
 * Stop proxy server
 */
async function handleStopProxy() {
  try {
    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Proxy server is not running'
            }, null, 2)
          }
        ]
      }
    }

    await proxyServer.stop()

    // Update tray menu status
    updateTrayMenuCallback?.()

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Proxy server stopped'
          }, null, 2)
        }
      ]
    }
  } catch (error) {
    console.error('[ProxyTools] Stop failed:', error)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop proxy server'
          }, null, 2)
        }
      ]
    }
  }
}

/**
 * Restart proxy server
 */
async function handleRestartProxy() {
  try {
    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    if (!proxyServer.isRunning()) {
      throw new Error('Proxy server is not running')
    }

    await proxyServer.restartServer()

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Proxy server restarted successfully'
          }, null, 2)
        }
      ]
    }
  } catch (error) {
    console.error('[ProxyTools] Restart failed:', error)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to restart proxy server'
          }, null, 2)
        }
      ]
    }
  }
}

/**
 * Update proxy configuration
 */
async function handleUpdateProxyConfig(config: Partial<ProxyConfig>) {
  try {
    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    proxyServer.updateConfig(config)
    const newConfig = proxyServer.getConfig()

    // Save configuration to store
    if (storeInstance) {
      storeInstance.set('proxyConfig', newConfig)
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            config: newConfig,
            message: 'Proxy configuration updated successfully'
          }, null, 2)
        }
      ]
    }
  } catch (error) {
    console.error('[ProxyTools] Update config failed:', error)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update config'
          }, null, 2)
        }
      ]
    }
  }
}
