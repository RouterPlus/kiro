import { ipcMain, BrowserWindow } from 'electron'
import { Registrar, newConfig, type RegistrationConfig } from './index'
import { BrowserRegistrar, type BrowserRegistrationConfig } from './browser-registrar'

// 注册池：支持多个并发注册任务
const registrarPool = new Map<string, Registrar>()
// 浏览器注册池
const browserRegistrarPool = new Map<string, BrowserRegistrar>()
// 手动模式使用固定 key
const MANUAL_KEY = '__manual__'

export function registerIPCHandlers(getMainWindow: () => BrowserWindow | null): void {
  const sendLog = (msg: string, taskId?: string): void => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('registration-log', { message: msg, taskId })
    }
  }

  // 启动自动注册（支持并发：每个 taskId 独立运行）
  ipcMain.handle('registration-start-auto', async (_event, config: Partial<RegistrationConfig> & { taskId?: string }) => {
    const taskId = config.taskId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const logPrefix = config.taskId ? `[#${config.taskId.slice(0, 12)}] ` : ''

    const cfg = newConfig(config)
    cfg.manualMode = false
    const registrar = new Registrar(cfg, (msg) => sendLog(`${logPrefix}${msg}`, config.taskId))
    registrarPool.set(taskId, registrar)

    try {
      const result = await registrar.run()
      // run() 内部 finally 已调用 cleanup()，无需再次 destroy
      registrarPool.delete(taskId)
      // 仅单次注册（无 taskId）发送 complete 事件
      if (!config.taskId) {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('registration-complete', result)
        }
      }
      return { success: true, result }
    } catch (err) {
      // run() 内部 finally 已调用 cleanup()，无需再次 destroy
      registrarPool.delete(taskId)
      const errMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errMsg }
    }
  })

  // 手动模式 Phase1: OIDC + Device
  ipcMain.handle('registration-manual-phase1', async (_event, config: Partial<RegistrationConfig>) => {
    if (registrarPool.has(MANUAL_KEY)) {
      return { success: false, error: '已有手动注册流程正在进行' }
    }

    const cfg = newConfig(config)
    cfg.manualMode = true
    const registrar = new Registrar(cfg, sendLog)
    registrarPool.set(MANUAL_KEY, registrar)

    const result = await registrar.runManualPhase1()
    if (!result.success) {
      await registrar.destroy()
      registrarPool.delete(MANUAL_KEY)
    }
    return result
  })

  // 手动模式 Phase2: 设置邮箱 -> 发送 OTP
  ipcMain.handle('registration-manual-phase2', async (_event, email: string, fullName?: string) => {
    const registrar = registrarPool.get(MANUAL_KEY)
    if (!registrar) {
      return { success: false, error: '无进行中的注册流程' }
    }
    const result = await registrar.runManualPhase2(email, fullName)
    if (!result.success) {
      await registrar.destroy()
      registrarPool.delete(MANUAL_KEY)
    }
    return result
  })

  // 手动模式 Phase3: 验证码 -> 完成注册
  // 注意：不发送 registration-complete 事件，前端 submitOTP 通过 invoke 返回值直接处理
  ipcMain.handle('registration-manual-phase3', async (_event, otp: string) => {
    const registrar = registrarPool.get(MANUAL_KEY)
    if (!registrar) {
      return { success: false, error: '无进行中的注册流程' }
    }
    const result = await registrar.runManualPhase3(otp)
    await registrar.destroy()
    registrarPool.delete(MANUAL_KEY)
    return { success: true, result }
  })

  // 取消注册（支持指定 taskId 或取消全部）
  ipcMain.handle('registration-cancel', async (_event, taskId?: string) => {
    if (taskId) {
      const registrar = registrarPool.get(taskId)
      if (registrar) {
        registrar.abort()
        await registrar.destroy()
        registrarPool.delete(taskId)
      }
    } else {
      // 取消全部
      const tasks = Array.from(registrarPool.entries())
      for (const [id, registrar] of tasks) {
        registrar.abort()
        await registrar.destroy()
        registrarPool.delete(id)
      }
    }
    return { success: true }
  })

  // 获取注册状态
  ipcMain.handle('registration-status', async () => {
    return { inProgress: registrarPool.size > 0 || browserRegistrarPool.size > 0, count: registrarPool.size + browserRegistrarPool.size }
  })

  // 获取所有浏览器注册窗口状态
  ipcMain.handle('registration-get-browser-windows', async () => {
    const windows: Array<{
      taskId: string
      email: string
      visible: boolean
      title: string
      url: string
      config: BrowserRegistrationConfig
    }> = []

    for (const [taskId, registrar] of browserRegistrarPool.entries()) {
      const win = (registrar as any).win as BrowserWindow | null
      if (win && !win.isDestroyed()) {
        windows.push({
          taskId,
          email: (registrar as any).cfg.providedEmailData?.split(':')[0] || 'N/A',
          visible: win.isVisible(),
          title: win.getTitle(),
          url: win.webContents.getURL().slice(0, 100),
          config: (registrar as any).cfg
        })
      }
    }

    return { success: true, windows }
  })

  // 显示浏览器注册窗口
  ipcMain.handle('registration-show-browser-window', async (_event, taskId: string) => {
    const registrar = browserRegistrarPool.get(taskId)
    if (!registrar) {
      return { success: false, error: 'Task not found' }
    }

    const win = (registrar as any).win as BrowserWindow | null
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      return { success: true }
    }

    return { success: false, error: 'Window not found' }
  })

  // 隐藏浏览器注册窗口
  ipcMain.handle('registration-hide-browser-window', async (_event, taskId: string) => {
    const registrar = browserRegistrarPool.get(taskId)
    if (!registrar) {
      return { success: false, error: 'Task not found' }
    }

    const win = (registrar as any).win as BrowserWindow | null
    if (win && !win.isDestroyed()) {
      win.hide()
      return { success: true }
    }

    return { success: false, error: 'Window not found' }
  })

  // 重启浏览器注册任务（使用相同的邮箱和代理）
  ipcMain.handle('registration-restart-browser-task', async (_event, taskId: string) => {
    const oldRegistrar = browserRegistrarPool.get(taskId)
    if (!oldRegistrar) {
      return { success: false, error: 'Task not found' }
    }

    // 取消旧任务
    oldRegistrar.abort()
    await oldRegistrar.destroy()
    browserRegistrarPool.delete(taskId)

    // 使用相同的配置启动新任务
    const config = (oldRegistrar as any).cfg as BrowserRegistrationConfig
    const newTaskId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const logPrefix = `[#${newTaskId.slice(0, 12)}] `

    const newRegistrar = new BrowserRegistrar(
      { ...config, taskId: newTaskId },
      (msg) => sendLog(`${logPrefix}${msg}`, newTaskId)
    )
    browserRegistrarPool.set(newTaskId, newRegistrar)

    // 启动新任务（不等待完成）
    newRegistrar.run()
      .then((result) => {
        browserRegistrarPool.delete(newTaskId)
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('registration-complete', result)
        }
      })
      .catch((err) => {
        browserRegistrarPool.delete(newTaskId)
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Browser] Task ${newTaskId} failed:`, errMsg)
      })
      .finally(() => {
        newRegistrar.destroy()
      })

    return { success: true, newTaskId }
  })

  // ============ 浏览器模式注册 ============

  ipcMain.handle('registration-start-browser', async (_event, config: BrowserRegistrationConfig) => {
    const taskId = config.taskId || `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const logPrefix = config.taskId ? `[#${config.taskId.slice(0, 12)}] ` : ''

    const registrar = new BrowserRegistrar(
      { ...config, taskId },
      (msg) => sendLog(`${logPrefix}${msg}`, config.taskId)
    )
    browserRegistrarPool.set(taskId, registrar)

    try {
      const result = await registrar.run()
      browserRegistrarPool.delete(taskId)

      if (!config.taskId) {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('registration-complete', result)
        }
      }
      return { success: true, result }
    } catch (err) {
      browserRegistrarPool.delete(taskId)
      const errMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errMsg }
    } finally {
      await registrar.destroy()
    }
  })

  // 取消浏览器注册
  ipcMain.handle('registration-cancel-browser', async (_event, taskId?: string) => {
    if (taskId) {
      const registrar = browserRegistrarPool.get(taskId)
      if (registrar) {
        registrar.abort()
        await registrar.destroy()
        browserRegistrarPool.delete(taskId)
      }
    } else {
      for (const [id, registrar] of browserRegistrarPool.entries()) {
        registrar.abort()
        await registrar.destroy()
        browserRegistrarPool.delete(id)
      }
    }
    return { success: true }
  })
}
