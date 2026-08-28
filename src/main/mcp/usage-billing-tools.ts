/**
 * Kiro Usage & Billing MCP Tools
 *
 * Provides MCP tools for monitoring usage, billing, and audit information:
 * - kiro_get_usage_stats: Get usage statistics including tokens and credits
 * - kiro_get_proxy_logs: Get proxy request logs with optional count limit
 * - kiro_get_audit_log: Get audit log entries for security and compliance
 * - kiro_check_quota: Check quota usage and limits for all accounts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ProxyStats, ProxyAccount, RequestLog } from '../proxy/types.js'

/**
 * Proxy server instance accessor
 * Must be set externally after initialization
 */
let getProxyServerInstance: (() => {
  isRunning: () => boolean
  getStats: () => ProxyStats
  getAuditLog: () => ReadonlyArray<{ ts: number; type: string; data: Record<string, unknown> }>
  getAccountPool: () => {
    getAllAccounts: () => ProxyAccount[]
  }
} | null) | null = () => null

/**
 * Proxy log store accessor
 * Must be set externally after initialization
 */
let getProxyLogStore: (() => {
  getAll: () => RequestLog[]
  getLast: (count: number) => RequestLog[]
  getCount: () => number
} | null) | null = () => null

/**
 * Initialize usage & billing tools with dependencies
 */
export function initUsageBillingTools(deps: {
  getProxyServer: () => ReturnType<typeof getProxyServerInstance>
  getLogStore: () => ReturnType<typeof getProxyLogStore>
}): void {
  getProxyServerInstance = deps.getProxyServer
  getProxyLogStore = deps.getLogStore
}

/**
 * Register usage & billing tools with MCP server
 */
export function registerUsageBillingTools(server: Server): void {
  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'kiro_get_usage_stats',
          description:
            'Get comprehensive usage statistics including total requests, success/failure rates, token usage (input/output/cache/reasoning), credits consumed, estimated cost, per-account stats, per-endpoint stats, and per-model stats. Returns data from the current proxy session.',
          inputSchema: {
            type: 'object',
            properties: {
              includeAccountBreakdown: {
                type: 'boolean',
                description: 'Include per-account statistics breakdown (default: true)'
              },
              includeEndpointBreakdown: {
                type: 'boolean',
                description: 'Include per-endpoint statistics breakdown (default: true)'
              },
              includeModelBreakdown: {
                type: 'boolean',
                description: 'Include per-model statistics breakdown (default: true)'
              }
            }
          }
        },
        {
          name: 'kiro_get_proxy_logs',
          description:
            'Get proxy request logs showing detailed information for each API request: timestamp, path, model, account ID, token usage, credits, response time, success/failure status, and error messages. Logs are stored in memory and persist across proxy restarts until cleared.',
          inputSchema: {
            type: 'object',
            properties: {
              count: {
                type: 'number',
                description:
                  'Number of recent logs to retrieve. If omitted, returns all logs. Use smaller values (e.g., 50-100) for quick checks.',
                minimum: 1
              }
            }
          }
        },
        {
          name: 'kiro_get_audit_log',
          description:
            'Get audit log entries for security and compliance monitoring. Tracks important events such as account additions/removals, configuration changes, authentication events, quota exhaustion, and account suspensions. Returns the most recent 200 entries.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'kiro_check_quota',
          description:
            'Check quota usage and limits for all accounts in the proxy pool. Returns per-account quota information including used/limit amounts, exhaustion status, reset times, suspension status, and availability. Useful for monitoring account health and preventing service interruptions.',
          inputSchema: {
            type: 'object',
            properties: {
              showSuspendedOnly: {
                type: 'boolean',
                description:
                  'Only show accounts that are suspended or have quota issues (default: false)'
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
        case 'kiro_get_usage_stats':
          return await handleGetUsageStats(
            args as {
              includeAccountBreakdown?: boolean
              includeEndpointBreakdown?: boolean
              includeModelBreakdown?: boolean
            }
          )

        case 'kiro_get_proxy_logs':
          return await handleGetProxyLogs(args as { count?: number })

        case 'kiro_get_audit_log':
          return await handleGetAuditLog()

        case 'kiro_check_quota':
          return await handleCheckQuota(args as { showSuspendedOnly?: boolean })

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
 * Get usage statistics
 */
async function handleGetUsageStats(args: {
  includeAccountBreakdown?: boolean
  includeEndpointBreakdown?: boolean
  includeModelBreakdown?: boolean
}) {
  const proxyServer = getProxyServerInstance?.()

  if (!proxyServer) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'Proxy server not initialized'
            },
            null,
            2
          )
        }
      ]
    }
  }

  if (!proxyServer.isRunning()) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              running: false,
              message: 'Proxy server is not running. No usage data available.'
            },
            null,
            2
          )
        }
      ]
    }
  }

  const stats = proxyServer.getStats()

  // Default to including all breakdowns
  const includeAccount = args.includeAccountBreakdown !== false
  const includeEndpoint = args.includeEndpointBreakdown !== false
  const includeModel = args.includeModelBreakdown !== false

  const response: {
    success: boolean
    running: boolean
    stats: {
      totalRequests: number
      successRequests: number
      failedRequests: number
      successRate: string
      tokens: {
        total: number
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
        reasoning: number
      }
      credits: {
        total: number
        estimatedCost: number
      }
      uptime: {
        startTime: number
        uptimeMs: number
        uptimeFormatted: string
      }
      recentRequests: number
    }
    accountStats?: Record<string, unknown>
    endpointStats?: Record<string, unknown>
    modelStats?: Record<string, unknown>
  } = {
    success: true,
    running: true,
    stats: {
      totalRequests: stats.totalRequests,
      successRequests: stats.successRequests,
      failedRequests: stats.failedRequests,
      successRate:
        stats.totalRequests > 0
          ? `${((stats.successRequests / stats.totalRequests) * 100).toFixed(2)}%`
          : '0%',
      tokens: {
        total: stats.totalTokens,
        input: stats.inputTokens,
        output: stats.outputTokens,
        cacheRead: stats.cacheReadTokens,
        cacheWrite: stats.cacheWriteTokens,
        reasoning: stats.reasoningTokens
      },
      credits: {
        total: stats.totalCredits,
        estimatedCost: stats.totalCost
      },
      uptime: {
        startTime: stats.startTime,
        uptimeMs: Date.now() - stats.startTime,
        uptimeFormatted: formatUptime(Date.now() - stats.startTime)
      },
      recentRequests: stats.recentRequests?.length || 0
    }
  }

  // Include account breakdown
  if (includeAccount && stats.accountStats) {
    response.accountStats = Object.fromEntries(stats.accountStats)
  }

  // Include endpoint breakdown
  if (includeEndpoint && stats.endpointStats) {
    response.endpointStats = Object.fromEntries(stats.endpointStats)
  }

  // Include model breakdown
  if (includeModel && stats.modelStats) {
    response.modelStats = Object.fromEntries(stats.modelStats)
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }
    ]
  }
}

/**
 * Get proxy request logs
 */
async function handleGetProxyLogs(args: { count?: number }) {
  const logStore = getProxyLogStore?.()

  if (!logStore) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'Proxy log store not initialized'
            },
            null,
            2
          )
        }
      ]
    }
  }

  try {
    const logs = args.count ? logStore.getLast(args.count) : logStore.getAll()
    const totalCount = logStore.getCount()

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              logs,
              count: logs.length,
              totalCount,
              truncated: args.count ? logs.length < totalCount : false
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
              error: error instanceof Error ? error.message : 'Failed to retrieve logs'
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
 * Get audit log
 */
async function handleGetAuditLog() {
  const proxyServer = getProxyServerInstance?.()

  if (!proxyServer) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              entries: [],
              message: 'Proxy server not initialized. No audit data available.'
            },
            null,
            2
          )
        }
      ]
    }
  }

  try {
    const auditLog = proxyServer.getAuditLog()

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              entries: Array.from(auditLog),
              count: auditLog.length
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
              error: error instanceof Error ? error.message : 'Failed to retrieve audit log'
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
 * Check quota for all accounts
 */
async function handleCheckQuota(args: { showSuspendedOnly?: boolean }) {
  const proxyServer = getProxyServerInstance?.()

  if (!proxyServer) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'Proxy server not initialized'
            },
            null,
            2
          )
        }
      ]
    }
  }

  try {
    const accountPool = proxyServer.getAccountPool()
    const allAccounts = accountPool.getAllAccounts()

    // Filter accounts if requested
    let accounts = allAccounts
    if (args.showSuspendedOnly) {
      accounts = allAccounts.filter(
        (acc) =>
          acc.suspended ||
          acc.quotaExhaustedAt ||
          (acc.quotaLimit && acc.quotaUsed && acc.quotaUsed >= acc.quotaLimit)
      )
    }

    const accountQuotas = accounts.map((acc) => {
      const now = Date.now()
      const isQuotaExhausted =
        acc.quotaLimit && acc.quotaUsed ? acc.quotaUsed >= acc.quotaLimit : false
      const quotaResetIn =
        acc.quotaResetAt && acc.quotaResetAt > now
          ? formatDuration(acc.quotaResetAt - now)
          : undefined

      return {
        id: acc.id,
        email: acc.email || 'N/A',
        isAvailable: acc.isAvailable !== false,
        suspended: acc.suspended || false,
        suspendedAt: acc.suspendedAt,
        suspendReason: acc.suspendReason,
        suspendMessage: acc.suspendMessage,
        quota: {
          used: acc.quotaUsed || 0,
          limit: acc.quotaLimit || null,
          unlimited: !acc.quotaLimit,
          exhausted: isQuotaExhausted,
          exhaustedAt: acc.quotaExhaustedAt,
          resetAt: acc.quotaResetAt,
          resetIn: quotaResetIn,
          usagePercent:
            acc.quotaLimit && acc.quotaUsed
              ? `${((acc.quotaUsed / acc.quotaLimit) * 100).toFixed(2)}%`
              : 'N/A'
        },
        usage: {
          requestCount: acc.requestCount || 0,
          errorCount: acc.errorCount || 0,
          lastUsed: acc.lastUsed,
          cooldownUntil: acc.cooldownUntil
        }
      }
    })

    const summary = {
      totalAccounts: allAccounts.length,
      availableAccounts: allAccounts.filter((a) => a.isAvailable !== false).length,
      suspendedAccounts: allAccounts.filter((a) => a.suspended).length,
      quotaExhaustedAccounts: allAccounts.filter(
        (a) => a.quotaLimit && a.quotaUsed && a.quotaUsed >= a.quotaLimit
      ).length
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              summary,
              accounts: accountQuotas,
              filteredBySuspended: args.showSuspendedOnly || false
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
              error: error instanceof Error ? error.message : 'Failed to check quota'
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
 * Format uptime duration
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m`
  } else {
    return `${seconds}s`
  }
}
