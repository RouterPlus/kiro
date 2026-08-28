/**
 * Kiro MCP Server Integration
 *
 * Provides MCP (Model Context Protocol) server functionality for Kiro Account Manager.
 * Supports both stdio (local) and HTTP (remote) transports.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { Request, Response } from 'express'
import { registerProxyTools, initProxyTools } from './proxy-tools'
import { registerModelsApiTools, initModelsApiTools } from './models-api-tools'
import { registerUsageBillingTools, initUsageBillingTools } from './usage-billing-tools'
import { app } from 'electron'
import { join } from 'path'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

/**
 * MCP Server instance
 */
let mcpServer: Server | null = null
let mcpTransport: StdioServerTransport | SSEServerTransport | null = null
let isRunning = false

/**
 * Default MCP configuration
 */
interface McpConfig {
  enabled: boolean
  stdio: {
    enabled: boolean
  }
  http: {
    enabled: boolean
    endpoint: string
  }
  tools: {
    proxy: boolean
    models: boolean
    usage: boolean
  }
}

const defaultConfig: McpConfig = {
  enabled: true,
  stdio: {
    enabled: true
  },
  http: {
    enabled: true,
    endpoint: '/mcp'
  },
  tools: {
    proxy: true,
    models: true,
    usage: true
  }
}

/**
 * Get MCP config file path
 */
function getMcpConfigPath(): string {
  const settingsDir = join(app.getPath('userData'), 'settings')
  return join(settingsDir, 'mcp.json')
}

/**
 * Load MCP configuration
 */
async function loadMcpConfig(): Promise<McpConfig> {
  try {
    const configPath = getMcpConfigPath()

    if (!existsSync(configPath)) {
      // Create default config
      await saveMcpConfig(defaultConfig)
      return defaultConfig
    }

    const content = await readFile(configPath, 'utf-8')
    const config = JSON.parse(content)

    // Merge with defaults to ensure all fields exist
    return { ...defaultConfig, ...config }
  } catch (error) {
    console.error('[MCP] Failed to load config:', error)
    return defaultConfig
  }
}

/**
 * Save MCP configuration
 */
async function saveMcpConfig(config: McpConfig): Promise<void> {
  try {
    const configPath = getMcpConfigPath()
    const settingsDir = join(app.getPath('userData'), 'settings')

    // Ensure settings directory exists
    if (!existsSync(settingsDir)) {
      await mkdir(settingsDir, { recursive: true })
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[MCP] Config saved to:', configPath)
  } catch (error) {
    console.error('[MCP] Failed to save config:', error)
  }
}

/**
 * Initialize MCP server with dependencies
 */
export async function initMcpServer(deps: {
  getProxyServer: () => any
  updateTrayMenu: () => void
  store: any
  getCurrentAccount: () => any
  getAccountData: () => any
  fetchKiroModels: (account: any) => Promise<any[]>
  getProxyLogStore: () => any
}): Promise<void> {
  try {
    console.log('[MCP] Initializing MCP server...')

    const config = await loadMcpConfig()

    if (!config.enabled) {
      console.log('[MCP] MCP server is disabled in config')
      return
    }

    // Create MCP server instance
    mcpServer = new Server(
      {
        name: 'kiro-account-manager',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    // Initialize tool modules with dependencies
    if (config.tools.proxy) {
      initProxyTools({
        getProxyServer: deps.getProxyServer,
        updateTrayMenu: deps.updateTrayMenu,
        store: deps.store
      })
      registerProxyTools(mcpServer)
      console.log('[MCP] Registered proxy tools')
    }

    if (config.tools.models) {
      initModelsApiTools({
        getProxyServer: deps.getProxyServer,
        store: deps.store,
        getAccountData: deps.getAccountData,
        fetchKiroModels: deps.fetchKiroModels
      })
      registerModelsApiTools(mcpServer)
      console.log('[MCP] Registered models & API tools')
    }

    if (config.tools.usage) {
      initUsageBillingTools({
        getProxyServer: deps.getProxyServer,
        getLogStore: deps.getProxyLogStore
      })
      registerUsageBillingTools(mcpServer)
      console.log('[MCP] Registered usage & billing tools')
    }

    console.log('[MCP] MCP server initialized successfully')
  } catch (error) {
    console.error('[MCP] Failed to initialize MCP server:', error)
    throw error
  }
}

/**
 * Start MCP server with stdio transport (for local connections)
 */
export async function startMcpServerStdio(): Promise<void> {
  if (!mcpServer) {
    throw new Error('MCP server not initialized. Call initMcpServer first.')
  }

  if (isRunning) {
    console.log('[MCP] Server already running')
    return
  }

  try {
    const config = await loadMcpConfig()

    if (!config.stdio.enabled) {
      console.log('[MCP] Stdio transport is disabled')
      return
    }

    mcpTransport = new StdioServerTransport()
    await mcpServer.connect(mcpTransport)
    isRunning = true

    console.log('[MCP] Server started with stdio transport')
  } catch (error) {
    console.error('[MCP] Failed to start MCP server with stdio:', error)
    throw error
  }
}

/**
 * Create HTTP transport handler for MCP
 * This can be used with Express to handle HTTP/SSE connections
 */
export function createMcpHttpHandler() {
  return async (req: Request, res: Response) => {
    if (!mcpServer) {
      res.status(503).json({ error: 'MCP server not initialized' })
      return
    }

    try {
      const config = await loadMcpConfig()

      if (!config.http.enabled) {
        res.status(403).json({ error: 'HTTP transport is disabled' })
        return
      }

      // Create SSE transport for this connection
      const transport = new SSEServerTransport(req.url || '/', res)
      await mcpServer.connect(transport)

      console.log('[MCP] HTTP client connected')

      // The transport handles the connection lifecycle
    } catch (error) {
      console.error('[MCP] HTTP handler error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

/**
 * Stop MCP server
 */
export async function stopMcpServer(): Promise<void> {
  try {
    if (mcpTransport) {
      await mcpTransport.close()
      mcpTransport = null
    }

    if (mcpServer) {
      await mcpServer.close()
      mcpServer = null
    }

    isRunning = false
    console.log('[MCP] Server stopped')
  } catch (error) {
    console.error('[MCP] Error stopping MCP server:', error)
  }
}

/**
 * Get MCP server status
 */
export function getMcpServerStatus(): {
  running: boolean
  initialized: boolean
  config: McpConfig | null
} {
  return {
    running: isRunning,
    initialized: mcpServer !== null,
    config: null // Config is loaded async, could add a cache here if needed
  }
}

/**
 * Get MCP configuration
 */
export async function getMcpConfig(): Promise<McpConfig> {
  return await loadMcpConfig()
}

/**
 * Update MCP configuration
 */
export async function updateMcpConfig(updates: Partial<McpConfig>): Promise<void> {
  const config = await loadMcpConfig()
  const newConfig = { ...config, ...updates }
  await saveMcpConfig(newConfig)
}
