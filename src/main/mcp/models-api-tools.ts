/**
 * Kiro Models & API Management MCP Tools
 *
 * Provides MCP tools for managing API keys and available models:
 * - kiro_list_available_models: List available Kiro models from active account
 * - kiro_get_api_keys: Get all API keys with usage statistics
 * - kiro_add_api_key: Create a new API key with optional format and credit limit
 * - kiro_delete_api_key: Delete an API key by ID
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ApiKey, ApiKeyFormat } from '../proxy/types.js'

/**
 * Proxy server instance accessor
 * Must be set externally after initialization
 */
let getProxyServerInstance: (() => {
  getConfig: () => {
    apiKeys?: ApiKey[]
  }
  updateConfig: (config: { apiKeys: ApiKey[] }) => void
} | null) | null = () => null

/**
 * Store instance for persisting config
 * Must be set externally
 */
let storeInstance: {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
} | null = null

/**
 * Model fetcher for getting available Kiro models
 * Must be set externally
 */
let fetchKiroModelsFunc: ((account: {
  id: string
  email?: string
  accessToken: string
  refreshToken?: string
  profileArn?: string
  expiresAt?: number
  clientId?: string
  clientSecret?: string
  region?: string
  authMethod?: string
}) => Promise<Array<{ modelId: string; modelName: string; description?: string }>>) | null =
  null

/**
 * Store getter for account data
 * Must be set externally
 */
let getAccountDataFunc: (() => {
  accounts?: Record<string, any>
} | null) | null = () => null

/**
 * Initialize models & API tools with dependencies
 */
export function initModelsApiTools(deps: {
  getProxyServer: () => ReturnType<typeof getProxyServerInstance>
  store: typeof storeInstance
  fetchKiroModels: typeof fetchKiroModelsFunc
  getAccountData: typeof getAccountDataFunc
}): void {
  getProxyServerInstance = deps.getProxyServer
  storeInstance = deps.store
  fetchKiroModelsFunc = deps.fetchKiroModels
  getAccountDataFunc = deps.getAccountData
}

/**
 * Register models & API management tools with MCP server
 */
export function registerModelsApiTools(server: Server): void {
  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'kiro_list_available_models',
          description:
            'List available Kiro models from the currently active account. Returns model ID, name, and description for each available model. Requires an active account with valid credentials.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_get_api_keys',
          description:
            'Get all API keys with their configuration and usage statistics. Returns key ID, name, format, enabled status, creation date, credit limits, and detailed usage information including total requests, credits consumed, tokens used (input/output), daily statistics, and per-model breakdown.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_add_api_key',
          description:
            'Create a new API key for accessing the Kiro proxy server. You can specify a custom name, choose the key format (sk/simple/token), set credit limits, or let the system generate defaults. Returns the newly created key with all details.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Human-readable name for the API key (e.g., "Development Key", "Production API")'
              },
              format: {
                type: 'string',
                enum: ['sk', 'simple', 'token'],
                description:
                  'Key format: "sk" (sk-xxx format), "simple" (PROXY_KEY_XXX format), or "token" (KEY:xxx:TOKEN:xxx format). Default: sk'
              },
              key: {
                type: 'string',
                description:
                  'Custom key value (optional). If not provided, a random key will be generated in the specified format.'
              },
              creditsLimit: {
                type: 'number',
                description:
                  'Maximum credits this key can consume (optional). If not set, the key has unlimited credits.'
              }
            }
          }
        },
        {
          name: 'kiro_delete_api_key',
          description:
            'Delete an API key by its ID. This action is permanent and cannot be undone. Any requests using this key will be rejected after deletion.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The unique ID of the API key to delete (UUID format)'
              }
            },
            required: ['id']
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
        case 'kiro_list_available_models':
          return await handleListAvailableModels()

        case 'kiro_get_api_keys':
          return await handleGetApiKeys()

        case 'kiro_add_api_key':
          return await handleAddApiKey(
            args as {
              name?: string
              key?: string
              format?: ApiKeyFormat
              creditsLimit?: number
            }
          )

        case 'kiro_delete_api_key':
          return await handleDeleteApiKey(args as { id: string })

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error)
              },
              null,
              2
            )
          }
        ]
      }
    }
  })
}

/**
 * List available Kiro models from active account
 */
async function handleListAvailableModels() {
  try {
    if (!storeInstance || !fetchKiroModelsFunc || !getAccountDataFunc) {
      throw new Error('Dependencies not initialized')
    }

    const accountData = getAccountDataFunc()
    if (!accountData?.accounts) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                models: [],
                message: 'No accounts configured'
              },
              null,
              2
            )
          }
        ]
      }
    }

    // Find active account with credentials
    const allAccounts = Object.values(accountData.accounts) as any[]
    const account =
      allAccounts.find((acc: any) => acc.isActive && acc.credentials?.accessToken) ||
      allAccounts.find((acc: any) => acc.status === 'active' && acc.credentials?.accessToken)

    if (!account) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                models: [],
                message: 'No active account with valid credentials found'
              },
              null,
              2
            )
          }
        ]
      }
    }

    // Prepare account for model fetching
    const proxyAccount = {
      id: account.id,
      email: account.email,
      accessToken: account.credentials.accessToken,
      refreshToken: account.credentials?.refreshToken,
      profileArn: account.profileArn,
      expiresAt: account.credentials?.expiresAt,
      clientId: account.credentials?.clientId,
      clientSecret: account.credentials?.clientSecret,
      region: account.credentials?.region || 'us-east-1',
      authMethod: account.credentials?.authMethod
    }

    // Fetch models
    const models = await fetchKiroModelsFunc(proxyAccount)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              account: {
                id: account.id,
                email: account.email
              },
              models: models.map((m) => ({
                id: m.modelId,
                name: m.modelName,
                description: m.description
              })),
              count: models.length
            },
            null,
            2
          )
        }
      ]
    }
  } catch (error) {
    console.error('[ModelsApiTools] Failed to fetch models:', error)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              models: [],
              error: error instanceof Error ? error.message : 'Failed to fetch models'
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * Get all API keys with usage statistics
 */
async function handleGetApiKeys() {
  try {
    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    const config = proxyServer.getConfig()
    const apiKeys = config.apiKeys || []

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              apiKeys,
              count: apiKeys.length
            },
            null,
            2
          )
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get API keys',
              apiKeys: []
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * Add a new API key
 */
async function handleAddApiKey(args: {
  name?: string
  key?: string
  format?: ApiKeyFormat
  creditsLimit?: number
}) {
  try {
    const crypto = await import('crypto')
    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    const config = proxyServer.getConfig()
    const apiKeys = config.apiKeys || []

    // Generate key based on format
    const format = args.format || 'sk'
    let newKey = args.key
    if (!newKey) {
      const randomHex = crypto.randomBytes(24).toString('hex')
      switch (format) {
        case 'sk':
          newKey = `sk-${randomHex}`
          break
        case 'simple':
          newKey = `PROXY_KEY_${randomHex.toUpperCase().substring(0, 32)}`
          break
        case 'token':
          newKey = `KEY:${randomHex.substring(0, 16)}:TOKEN:${randomHex.substring(16, 32)}`
          break
        default:
          newKey = `sk-${randomHex}`
      }
    }

    const newApiKey: ApiKey = {
      id: crypto.randomUUID(),
      name: args.name || `API Key ${apiKeys.length + 1}`,
      key: newKey,
      format: format,
      enabled: true,
      createdAt: Date.now(),
      creditsLimit: args.creditsLimit,
      usage: {
        totalRequests: 0,
        totalCredits: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        daily: {}
      }
    }

    apiKeys.push(newApiKey)
    proxyServer.updateConfig({ apiKeys })

    // Persist to store
    if (storeInstance) {
      storeInstance.set('proxyConfig', proxyServer.getConfig())
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              apiKey: newApiKey,
              message: `API key "${newApiKey.name}" created successfully`
            },
            null,
            2
          )
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to add API key'
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * Delete an API key
 */
async function handleDeleteApiKey(args: { id: string }) {
  try {
    if (!args.id) {
      throw new Error('API key ID is required')
    }

    const proxyServer = getProxyServerInstance?.()

    if (!proxyServer) {
      throw new Error('Proxy server not initialized')
    }

    const config = proxyServer.getConfig()
    const apiKeys = config.apiKeys || []

    const index = apiKeys.findIndex((k) => k.id === args.id)
    if (index === -1) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'API key not found'
              },
              null,
              2
            )
          }
        ]
      }
    }

    const deletedKey = apiKeys[index]
    apiKeys.splice(index, 1)
    proxyServer.updateConfig({ apiKeys })

    // Persist to store
    if (storeInstance) {
      storeInstance.set('proxyConfig', proxyServer.getConfig())
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `API key "${deletedKey.name}" deleted successfully`,
              deletedKey: {
                id: deletedKey.id,
                name: deletedKey.name,
                format: deletedKey.format
              }
            },
            null,
            2
          )
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to delete API key'
            },
            null,
            2
          )
        }
      ]
    }
  }
}
