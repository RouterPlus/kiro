import { useState, useEffect } from 'react'
import {
  Eye,
  EyeOff,
  RefreshCw,
  XCircle,
  Monitor,
  Chrome,
  Mail,
  Globe,
  Clock,
  CheckCircle2
} from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge
} from '../ui'
import { cn } from '@/lib/utils'

interface BrowserWindow {
  taskId: string
  email: string
  visible: boolean
  title: string
  url: string
  config: {
    useDDG?: boolean
    ddgAuthToken?: string
    ddgGmailEmail?: string
    useTempMailPlus?: boolean
    tempMailPlusEmail?: string
    tempMailPlusDomain?: string
    providedEmailData?: string
    providedEmailApiKey?: string
    fullName?: string
    password?: string
    proxyUrl?: string
    taskId?: string
  }
}

export function BrowserWindowsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const isEn = t('common.unknown') === 'Unknown'
  const [windows, setWindows] = useState<BrowserWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadWindows = async (): Promise<void> => {
    try {
      const result = await window.api.registrationGetBrowserWindows()
      if (result.success) {
        setWindows(result.windows as BrowserWindow[])
      }
    } catch (error) {
      console.error('[BrowserWindows] Load failed:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadWindows()
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadWindows, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleShow = async (taskId: string): Promise<void> => {
    try {
      const result = await window.api.registrationShowBrowserWindow(taskId)
      if (result.success) {
        await loadWindows()
      }
    } catch (error) {
      console.error('[BrowserWindows] Show failed:', error)
    }
  }

  const handleHide = async (taskId: string): Promise<void> => {
    try {
      const result = await window.api.registrationHideBrowserWindow(taskId)
      if (result.success) {
        await loadWindows()
      }
    } catch (error) {
      console.error('[BrowserWindows] Hide failed:', error)
    }
  }

  const handleRestart = async (taskId: string): Promise<void> => {
    try {
      const result = await window.api.registrationRestartBrowserTask(taskId)
      if (result.success) {
        await loadWindows()
      }
    } catch (error) {
      console.error('[BrowserWindows] Restart failed:', error)
    }
  }

  const handleStop = async (taskId: string): Promise<void> => {
    try {
      await window.api.registrationCancelBrowser(taskId)
      await loadWindows()
    } catch (error) {
      console.error('[BrowserWindows] Stop failed:', error)
    }
  }

  const handleRefresh = (): void => {
    setRefreshing(true)
    loadWindows()
  }

  const getEmailProvider = (config: BrowserWindow['config']): string => {
    if (config.useDDG) return 'DuckDuckGo'
    if (config.useTempMailPlus) return 'TempMail.Plus'
    if (config.providedEmailData) return 'Email Provider'
    return 'Unknown'
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto max-w-7xl mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-blue-500/10 p-6 border border-blue-500/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10">
              <Monitor className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-blue-600">
                {isEn ? 'Browser Windows Manager' : '浏览器窗口管理'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEn
                  ? 'Manage all browser registration windows in batch mode'
                  : '管理批量注册模式下的所有浏览器窗口'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            {isEn ? 'Refresh' : '刷新'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isEn ? 'Total Windows' : '总窗口数'}
                </p>
                <p className="text-2xl font-bold">{windows.length}</p>
              </div>
              <Chrome className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isEn ? 'Visible' : '可见窗口'}
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {windows.filter((w) => w.visible).length}
                </p>
              </div>
              <Eye className="h-8 w-8 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isEn ? 'Hidden' : '隐藏窗口'}
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {windows.filter((w) => !w.visible).length}
                </p>
              </div>
              <EyeOff className="h-8 w-8 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Windows List */}
      {windows.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Monitor className="h-16 w-16 mx-auto text-muted-foreground opacity-20 mb-4" />
            <p className="text-muted-foreground">
              {isEn
                ? 'No browser registration windows are currently active'
                : '当前没有活动的浏览器注册窗口'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isEn
                ? 'Start a batch registration in browser mode to see windows here'
                : '在浏览器模式下启动批量注册以在此查看窗口'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {windows.map((window) => (
            <Card key={window.taskId} className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Chrome className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base font-medium">{window.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isEn ? 'Task ID' : '任务 ID'}: {window.taskId.slice(0, 16)}...
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={window.visible ? 'default' : 'secondary'}
                    className={cn(
                      'flex items-center gap-1',
                      window.visible
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                    )}
                  >
                    {window.visible ? (
                      <>
                        <Eye className="h-3 w-3" />
                        {isEn ? 'Visible' : '可见'}
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" />
                        {isEn ? 'Hidden' : '隐藏'}
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{isEn ? 'Email:' : '邮箱:'}</span>
                    <span className="font-mono font-medium">{window.email}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {isEn ? 'Provider:' : '提供商:'}
                    </span>
                    <span className="font-medium">{getEmailProvider(window.config)}</span>
                  </div>

                  {window.config.proxyUrl && (
                    <div className="flex items-center gap-2 md:col-span-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{isEn ? 'Proxy:' : '代理:'}</span>
                      <span className="font-mono text-xs truncate max-w-xs">
                        {window.config.proxyUrl}
                      </span>
                    </div>
                  )}
                </div>

                {/* Current URL */}
                {window.url && (
                  <div className="flex items-start gap-2 text-xs bg-muted/50 p-2 rounded">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 overflow-hidden">
                      <span className="text-muted-foreground">
                        {isEn ? 'Current URL:' : '当前 URL:'}
                      </span>
                      <p className="font-mono truncate mt-0.5">{window.url}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {window.visible ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleHide(window.taskId)}
                    >
                      <EyeOff className="h-4 w-4 mr-1.5" />
                      {isEn ? 'Hide' : '隐藏'}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleShow(window.taskId)}>
                      <Eye className="h-4 w-4 mr-1.5" />
                      {isEn ? 'Show' : '显示'}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestart(window.taskId)}
                  >
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    {isEn ? 'Restart' : '重启'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStop(window.taskId)}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    {isEn ? 'Stop' : '停止'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Batch Actions */}
      {windows.length > 0 && (
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {isEn ? 'Batch Actions' : '批量操作'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => windows.forEach((w) => !w.visible && handleShow(w.taskId))}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              {isEn ? 'Show All' : '全部显示'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => windows.forEach((w) => w.visible && handleHide(w.taskId))}
            >
              <EyeOff className="h-4 w-4 mr-1.5" />
              {isEn ? 'Hide All' : '全部隐藏'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => windows.forEach((w) => handleStop(w.taskId))}
              className="text-red-600 hover:text-red-700 hover:border-red-300"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              {isEn ? 'Stop All' : '全部停止'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
