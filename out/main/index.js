"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const electronUpdater = require("electron-updater");
const child_process = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");
const crypto$1 = require("crypto");
const utils = require("@electron-toolkit/utils");
const promises = require("fs/promises");
const cborX = require("cbor-x");
const undici = require("undici");
const os = require("os");
const uuid = require("uuid");
const forge = require("node-forge");
const http = require("http");
const net = require("net");
const tls = require("tls");
const url = require("url");
const https = require("https");
const tlsclientwrapper = require("tlsclientwrapper");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto$1);
const forge__namespace = /* @__PURE__ */ _interopNamespaceDefault(forge);
const http__namespace = /* @__PURE__ */ _interopNamespaceDefault(http);
const net__namespace = /* @__PURE__ */ _interopNamespaceDefault(net);
const tls__namespace = /* @__PURE__ */ _interopNamespaceDefault(tls);
const url__namespace = /* @__PURE__ */ _interopNamespaceDefault(url);
const execAsync = util.promisify(child_process.exec);
function findPowerShell() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const candidates = [
    // PowerShell 7+ (pwsh)
    `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`,
    // 标准 WindowsPowerShell 路径
    `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    // SysWOW64 路径（32位进程在64位系统上）
    `${systemRoot}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`,
    // 直接用命令名（依赖 PATH）
    "pwsh.exe",
    "powershell.exe"
  ];
  for (const candidate of candidates) {
    try {
      if (path__namespace.isAbsolute(candidate)) {
        if (fs__namespace.existsSync(candidate)) return candidate;
      } else {
        const result = child_process.execSync(`where.exe ${candidate}`, {
          encoding: "utf-8",
          timeout: 3e3,
          stdio: ["pipe", "pipe", "ignore"]
        });
        const found = result.trim().split("\n")[0]?.trim();
        if (found && fs__namespace.existsSync(found)) return found;
      }
    } catch {
      continue;
    }
  }
  return null;
}
function getOSType() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}
function generateRandomMachineId() {
  return crypto__namespace.randomUUID().toLowerCase();
}
async function getCurrentMachineId$1() {
  const osType = getOSType();
  try {
    switch (osType) {
      case "windows":
        return await getWindowsMachineId();
      case "macos":
        return await getMacOSMachineId();
      case "linux":
        return await getLinuxMachineId();
      default:
        return { success: false, error: "不支持的操作系统" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "获取机器码失败"
    };
  }
}
async function setMachineId(newMachineId) {
  const osType = getOSType();
  if (!isValidMachineId(newMachineId)) {
    return { success: false, error: "无效的机器码格式" };
  }
  try {
    switch (osType) {
      case "windows":
        return await setWindowsMachineId(newMachineId);
      case "macos":
        return await setMacOSMachineId(newMachineId);
      case "linux":
        return await setLinuxMachineId(newMachineId);
      default:
        return { success: false, error: "不支持的操作系统" };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "设置机器码失败";
    if (errorMsg.includes("Access is denied") || errorMsg.includes("permission denied") || errorMsg.includes("Operation not permitted") || errorMsg.includes("EPERM") || errorMsg.includes("EACCES")) {
      return { success: false, error: "需要管理员权限", requiresAdmin: true };
    }
    return { success: false, error: errorMsg };
  }
}
async function checkAdminPrivilege() {
  const osType = getOSType();
  try {
    switch (osType) {
      case "windows": {
        const psPath = findPowerShell();
        if (psPath) {
          try {
            const psCmd = `"${psPath}" -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"`;
            const result = child_process.execSync(psCmd, {
              encoding: "utf-8",
              timeout: 5e3,
              stdio: ["pipe", "pipe", "ignore"]
            });
            const isAdmin = result.trim().toLowerCase() === "true";
            console.log("[MachineId] PowerShell admin check result:", isAdmin, "(path:", psPath, ")");
            return isAdmin;
          } catch (error) {
            console.log("[MachineId] PowerShell admin check failed:", error instanceof Error ? error.message : error);
          }
        } else {
          console.log("[MachineId] PowerShell not found, skipping PS admin check");
        }
        const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
        const netPath = `${systemRoot}\\System32\\net.exe`;
        try {
          const netCmd = fs__namespace.existsSync(netPath) ? `"${netPath}" session` : "net session";
          child_process.execSync(netCmd, { stdio: "ignore", timeout: 3e3 });
          console.log("[MachineId] net session succeeded, has admin");
          return true;
        } catch {
          console.log("[MachineId] net session failed, no admin");
        }
        try {
          const testFile = `${systemRoot}\\Temp\\admin_check_${Date.now()}`;
          fs__namespace.writeFileSync(testFile, "");
          fs__namespace.unlinkSync(testFile);
          return false;
        } catch {
        }
        return false;
      }
      case "macos":
        return true;
      case "linux":
        return process.getuid?.() === 0;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
async function requestAdminRestart() {
  const osType = getOSType();
  const appPath = electron.app.getPath("exe");
  console.log("[MachineId] Requesting admin restart, appPath:", appPath);
  try {
    switch (osType) {
      case "windows": {
        const psPath = findPowerShell();
        if (psPath) {
          const escapedAppPath = appPath.replace(/\\/g, "\\\\");
          const command = `"${psPath}" -NoProfile -Command "Start-Process -FilePath "${escapedAppPath}" -Verb RunAs"`;
          console.log("[MachineId] Running command:", command);
          child_process.exec(command, { windowsHide: true }, (error) => {
            if (error) {
              console.error("[MachineId] Admin restart via PowerShell failed:", error);
            }
          });
        } else {
          console.log("[MachineId] PowerShell not found, using electron shell openPath with runas");
          const { shell } = await import("electron");
          shell.openExternal(`file:///${appPath}`);
        }
        setTimeout(() => {
          console.log("[MachineId] Quitting app...");
          electron.app.quit();
        }, 1e3);
        return true;
      }
      case "macos": {
        const escapedPath = appPath.replace(/'/g, "\\'");
        const script = `do shell script "open -n '${escapedPath}'" with administrator privileges`;
        child_process.exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            console.error("[MachineId] Admin restart failed:", error);
          }
        });
        setTimeout(() => electron.app.quit(), 1e3);
        return true;
      }
      case "linux": {
        const sudoCommands = ["pkexec", "gksudo", "kdesudo"];
        for (const cmd of sudoCommands) {
          try {
            child_process.execSync(`which ${cmd}`, { stdio: "ignore" });
            child_process.exec(`${cmd} "${appPath}"`, (error) => {
              if (error) {
                console.error("[MachineId] Admin restart failed:", error);
              }
            });
            setTimeout(() => electron.app.quit(), 1e3);
            return true;
          } catch {
            continue;
          }
        }
        return false;
      }
      default:
        return false;
    }
  } catch (error) {
    console.error("请求管理员权限失败:", error);
    return false;
  }
}
function isValidMachineId(machineId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hexRegex = /^[0-9a-f]{32}$/i;
  return uuidRegex.test(machineId) || hexRegex.test(machineId);
}
async function getWindowsMachineId() {
  try {
    const { stdout } = await execAsync(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { timeout: 5e3 }
    );
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
    if (match && match[1]) {
      return { success: true, machineId: match[1].toLowerCase() };
    }
  } catch (error) {
    console.log("[MachineId] reg query failed, trying PowerShell:", error instanceof Error ? error.message : error);
  }
  const psPath = findPowerShell();
  if (psPath) {
    try {
      const { stdout } = await execAsync(
        `"${psPath}" -NoProfile -Command "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid"`,
        { timeout: 1e4 }
      );
      const machineId = stdout.trim().toLowerCase();
      if (machineId && isValidMachineId(machineId)) {
        return { success: true, machineId };
      }
    } catch (error) {
      console.log("[MachineId] PowerShell failed, trying WMIC:", error instanceof Error ? error.message : error);
    }
  }
  try {
    const { stdout } = await execAsync(
      "wmic csproduct get UUID",
      { timeout: 5e3 }
    );
    const lines = stdout.split("\n").filter((line) => line.trim() && !line.includes("UUID"));
    if (lines.length > 0) {
      const uuid2 = lines[0].trim().toLowerCase();
      if (uuid2 && uuid2 !== "ffffffff-ffff-ffff-ffff-ffffffffffff") {
        return { success: true, machineId: uuid2 };
      }
    }
  } catch (error) {
    console.log("[MachineId] WMIC failed:", error instanceof Error ? error.message : error);
  }
  return {
    success: false,
    error: "无法获取机器码，请尝试以管理员身份运行或检查系统权限设置"
  };
}
async function setWindowsMachineId(newMachineId) {
  try {
    await execAsync(
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid /t REG_SZ /d "${newMachineId}" /f`
    );
    return { success: true, machineId: newMachineId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";
    if (errorMsg.includes("Access is denied") || errorMsg.includes("拒绝访问")) {
      return { success: false, error: "需要管理员权限", requiresAdmin: true };
    }
    return { success: false, error: errorMsg || "设置Windows机器码失败" };
  }
}
async function getMacOSMachineId() {
  try {
    const overridePath = path__namespace.join(electron.app.getPath("userData"), "machine-id-override");
    if (fs__namespace.existsSync(overridePath)) {
      const overrideId = fs__namespace.readFileSync(overridePath, "utf-8").trim();
      if (overrideId && isValidMachineId(overrideId)) {
        return { success: true, machineId: overrideId };
      }
    }
    const kiroMachineIdPath = path__namespace.join(process.env.HOME || "", "Library/Application Support/Kiro/machineid");
    if (fs__namespace.existsSync(kiroMachineIdPath)) {
      const kiroId = fs__namespace.readFileSync(kiroMachineIdPath, "utf-8").trim();
      if (kiroId && isValidMachineId(kiroId)) {
        return { success: true, machineId: kiroId };
      }
    }
    const { stdout } = await execAsync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'"
    );
    const machineId = stdout.trim().replace(/"/g, "").toLowerCase();
    if (machineId && isValidMachineId(machineId)) {
      return { success: true, machineId };
    }
    return { success: false, error: "无法获取macOS机器码" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "获取macOS机器码失败"
    };
  }
}
async function setMacOSMachineId(newMachineId) {
  const overridePath = path__namespace.join(electron.app.getPath("userData"), "machine-id-override");
  const kiroMachineIdPath = path__namespace.join(process.env.HOME || "", "Library/Application Support/Kiro/machineid");
  try {
    fs__namespace.writeFileSync(overridePath, newMachineId, "utf-8");
    try {
      const kiroDir = path__namespace.dirname(kiroMachineIdPath);
      if (!fs__namespace.existsSync(kiroDir)) {
        fs__namespace.mkdirSync(kiroDir, { recursive: true });
      }
      fs__namespace.writeFileSync(kiroMachineIdPath, newMachineId, "utf-8");
      console.log("[MachineId] Synced to Kiro IDE machineid:", kiroMachineIdPath);
    } catch (syncError) {
      console.warn("[MachineId] Failed to sync to Kiro IDE:", syncError);
    }
    return { success: true, machineId: newMachineId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "设置macOS机器码失败"
    };
  }
}
async function getLinuxMachineId() {
  const paths = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
  for (const filePath of paths) {
    try {
      if (fs__namespace.existsSync(filePath)) {
        const content = fs__namespace.readFileSync(filePath, "utf-8").trim();
        if (content) {
          const formattedId = formatAsUUID(content);
          return { success: true, machineId: formattedId };
        }
      }
    } catch {
      continue;
    }
  }
  return { success: false, error: "无法获取Linux机器码" };
}
async function setLinuxMachineId(newMachineId) {
  const rawId = newMachineId.replace(/-/g, "").toLowerCase();
  const paths = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
  for (const filePath of paths) {
    try {
      if (fs__namespace.existsSync(filePath)) {
        fs__namespace.writeFileSync(filePath, rawId + "\n", "utf-8");
        return { success: true, machineId: newMachineId };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "";
      if (errorMsg.includes("EACCES") || errorMsg.includes("EPERM")) {
        const pkexecResult = await setLinuxMachineIdWithPkexec(rawId, filePath);
        if (pkexecResult.success) {
          return { success: true, machineId: newMachineId };
        }
        if (pkexecResult.error?.includes("用户取消") || pkexecResult.error?.includes("dismissed")) {
          return { success: false, error: "用户取消了授权" };
        }
      }
    }
  }
  return { success: false, error: "设置Linux机器码失败" };
}
async function setLinuxMachineIdWithPkexec(rawId, filePath) {
  const sudoCommands = ["pkexec", "gksudo", "kdesudo"];
  for (const cmd of sudoCommands) {
    try {
      child_process.execSync(`which ${cmd}`, { stdio: "ignore" });
      const command = `echo "${rawId}" | ${cmd} tee "${filePath}" > /dev/null`;
      console.log(`[MachineId] Running: ${cmd} to write machine-id`);
      await execAsync(command);
      if (filePath === "/etc/machine-id") {
        const dbusPath = "/var/lib/dbus/machine-id";
        if (fs__namespace.existsSync(dbusPath)) {
          try {
            const dbusCommand = `echo "${rawId}" | ${cmd} tee "${dbusPath}" > /dev/null`;
            await execAsync(dbusCommand);
          } catch {
          }
        }
      }
      return { success: true, machineId: rawId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "";
      console.log(`[MachineId] ${cmd} failed:`, errorMsg);
      if (errorMsg.includes("dismissed") || errorMsg.includes("Not authorized") || errorMsg.includes("126")) {
        return { success: false, error: "用户取消了授权" };
      }
      continue;
    }
  }
  return { success: false, error: "没有可用的权限提升工具", requiresAdmin: true };
}
function formatAsUUID(hex) {
  const clean = hex.replace(/-/g, "").toLowerCase();
  if (clean.length !== 32) return clean;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}
async function backupMachineIdToFile(machineId, filePath) {
  try {
    const backupData = {
      machineId,
      backupTime: Date.now(),
      osType: getOSType(),
      appVersion: electron.app.getVersion()
    };
    fs__namespace.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("备份机器码失败:", error);
    return false;
  }
}
async function restoreMachineIdFromFile(filePath) {
  try {
    if (!fs__namespace.existsSync(filePath)) {
      return { success: false, error: "备份文件不存在" };
    }
    const content = fs__namespace.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    if (!data.machineId || !isValidMachineId(data.machineId)) {
      return { success: false, error: "备份文件格式无效" };
    }
    return { success: true, machineId: data.machineId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "读取备份文件失败"
    };
  }
}
async function showAdminRequiredDialog() {
  const result = await electron.dialog.showMessageBox({
    type: "warning",
    title: "需要管理员权限",
    message: "修改机器码需要管理员权限",
    detail: "是否以管理员权限重新启动应用程序？",
    buttons: ["取消", "以管理员身份重启"],
    defaultId: 1,
    cancelId: 0
  });
  return result.response === 1;
}
const icon = path.join(__dirname, "../../resources/icon.png");
var ErrorType = /* @__PURE__ */ ((ErrorType2) => {
  ErrorType2["FATAL"] = "fatal";
  ErrorType2["RECOVERABLE"] = "recoverable";
  return ErrorType2;
})(ErrorType || {});
function classifyError(statusCode, reason) {
  if (statusCode === 402) return "recoverable";
  if (statusCode === 403) return "recoverable";
  if (statusCode === 429) return "recoverable";
  if (statusCode === 400) {
    return "fatal";
  }
  if (statusCode === 422) return "fatal";
  if (statusCode >= 500) return "fatal";
  return "fatal";
}
const DEFAULT_CONFIG$1 = {
  baseCooldownMs: 6e4,
  // 60s 基础冷却
  maxBackoffMultiplier: 1440,
  // 最大 1440 倍 = 24h
  quotaResetMs: 36e5,
  // 1h 配额错误本地冷却；到期后自动 half-open 重试
  probabilisticRetryChance: 0.1
  // 10% 概率重试
};
class AccountPool {
  accounts = /* @__PURE__ */ new Map();
  accountStats = /* @__PURE__ */ new Map();
  currentIndex = 0;
  config;
  // 默认 round-robin: 每次成功后指针前进 (满足负载均衡期望)
  // sticky: 一个账号成功就粘住 (保留 prompt cache 命中)
  strategy = "round-robin";
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG$1, ...config };
  }
  // 切换账号选择策略
  setStrategy(strategy) {
    if (this.strategy !== strategy) {
      console.log(`[AccountPool] Strategy changed: ${this.strategy} → ${strategy}`);
      this.strategy = strategy;
    }
  }
  getStrategy() {
    return this.strategy;
  }
  // 添加账号
  addAccount(account) {
    if (account.suspended) {
      this.removeAccount(account.id);
      console.log(`[AccountPool] Skipped suspended account: ${account.email || account.id}`);
      return;
    }
    const existing = this.accounts.get(account.id);
    this.accounts.set(account.id, {
      ...account,
      suspended: false,
      isAvailable: account.isAvailable !== false,
      requestCount: existing?.requestCount || account.requestCount || 0,
      errorCount: existing?.errorCount || account.errorCount || 0,
      lastUsed: existing?.lastUsed || account.lastUsed || 0
    });
    this.accountStats.set(account.id, {
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      errors: 0,
      lastUsed: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    });
    console.log(`[AccountPool] Added account: ${account.email || account.id}`);
  }
  // 移除账号
  removeAccount(accountId) {
    this.accounts.delete(accountId);
    this.accountStats.delete(accountId);
    console.log(`[AccountPool] Removed account: ${accountId}`);
  }
  // 更新账号
  updateAccount(accountId, updates) {
    const account = this.accounts.get(accountId);
    if (account) {
      this.accounts.set(accountId, { ...account, ...updates });
    }
  }
  // 获取下一个可用账号（粘滞 + 断路器 + 指数退避 + 概率重试）
  getNextAccount(excludeIds) {
    const accountList2 = Array.from(this.accounts.values());
    if (accountList2.length === 0) {
      return null;
    }
    if (accountList2.length === 1) {
      const account = accountList2[0];
      if (excludeIds?.has(account.id) || account.suspended) return null;
      if (this.isQuotaExhausted(account, Date.now())) return null;
      if (account.expiresAt && account.expiresAt < Date.now()) return null;
      if (account.isAvailable === false) return null;
      return account;
    }
    const now = Date.now();
    const startIndex = this.currentIndex;
    for (let i = 0; i < accountList2.length; i++) {
      const idx = (startIndex + i) % accountList2.length;
      const account = accountList2[idx];
      if (excludeIds?.has(account.id)) continue;
      if (this.isAccountAvailable(account, now)) {
        return account;
      }
    }
    const candidates = (excludeIds ? accountList2.filter((a) => !excludeIds.has(a.id)) : accountList2).filter((a) => !a.suspended);
    const allExhausted = candidates.length > 0 && candidates.every((a) => this.isQuotaExhausted(a, now));
    if (allExhausted) {
      console.log(
        `[AccountPool] All ${candidates.length} accounts quota exhausted, no fallback available`
      );
      return null;
    }
    const nonExhausted = candidates.filter((a) => !this.isQuotaExhausted(a, now));
    return this.getAccountWithShortestCooldown(nonExhausted, now);
  }
  // 获取特定账号
  getAccount(accountId) {
    return this.accounts.get(accountId) || null;
  }
  // 获取下一个可用账号（排除当前账号）
  getNextAvailableAccount(excludeAccountId) {
    const accountList2 = Array.from(this.accounts.values());
    if (accountList2.length <= 1) {
      return null;
    }
    const now = Date.now();
    for (const account of accountList2) {
      if (account.id !== excludeAccountId && this.isAccountAvailable(account, now)) {
        return account;
      }
    }
    const otherAccounts = accountList2.filter((a) => a.id !== excludeAccountId && !a.suspended);
    return this.getAccountWithShortestCooldown(otherAccounts, now);
  }
  // 获取所有账号
  getAllAccounts() {
    return Array.from(this.accounts.values());
  }
  // 标记账号为封禁/冻结，并从账号池移除
  markSuspended(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    const suspendedAccount = {
      ...account,
      suspended: true,
      isAvailable: false
    };
    console.log(
      `[AccountPool] Account ${account.email || accountId} marked as suspended and removed`
    );
    this.removeAccount(accountId);
    return suspendedAccount;
  }
  // 检查账号是否被封禁/冻结
  isSuspended(accountId) {
    const account = this.accounts.get(accountId);
    return account?.suspended === true;
  }
  // 检查账号是否可用（断路器 + 指数退避 + 概率重试）
  isAccountAvailable(account, now) {
    if (account.suspended) {
      return false;
    }
    if (this.isQuotaExhausted(account, now)) {
      return false;
    }
    if (account.expiresAt && account.expiresAt < now) {
      return false;
    }
    if (account.isAvailable === false) {
      return false;
    }
    const failures = account.errorCount || 0;
    if (failures > 0 && account.lastUsed) {
      const timeSinceFailure = now - account.lastUsed;
      const backoffMultiplier = Math.min(
        Math.pow(2, failures - 1),
        this.config.maxBackoffMultiplier
      );
      const effectiveCooldown = this.config.baseCooldownMs * backoffMultiplier;
      if (timeSinceFailure < effectiveCooldown) {
        if (Math.random() > this.config.probabilisticRetryChance) {
          return false;
        }
        console.log(
          `[AccountPool] Probabilistic retry for ${account.email || account.id} (failures=${failures}, cooldown=${Math.round(effectiveCooldown / 1e3)}s)`
        );
      }
    }
    return true;
  }
  // 检查账号配额是否耗尽
  isQuotaExhausted(account, now = Date.now()) {
    if (account.quotaResetAt && account.quotaResetAt <= now) {
      return false;
    }
    if (account.quotaExhaustedAt && account.quotaExhaustedAt > 0) {
      return now - account.quotaExhaustedAt < this.config.quotaResetMs;
    }
    if (account.quotaLimit && account.quotaLimit > 0 && (account.quotaUsed ?? 0) >= account.quotaLimit) {
      return true;
    }
    return false;
  }
  // 获取冷却时间最短的账号
  getAccountWithShortestCooldown(accounts, now) {
    accounts = accounts.filter((account) => !account.suspended);
    let bestAccount = null;
    let shortestWait = Infinity;
    for (const account of accounts) {
      const cooldownUntil = account.cooldownUntil || 0;
      const wait = Math.max(0, cooldownUntil - now);
      if (wait < shortestWait) {
        shortestWait = wait;
        bestAccount = account;
      }
    }
    return bestAccount;
  }
  // 记录请求成功（重置断路器 + 粘滞到当前账号）
  recordSuccess(accountId, tokens = 0) {
    const account = this.accounts.get(accountId);
    if (account) {
      this.accounts.set(accountId, {
        ...account,
        requestCount: (account.requestCount || 0) + 1,
        errorCount: 0,
        // 重置断路器失败计数
        lastUsed: Date.now(),
        isAvailable: true
      });
      const accountList2 = Array.from(this.accounts.keys());
      const successIndex = accountList2.indexOf(accountId);
      if (successIndex >= 0 && accountList2.length > 0) {
        if (this.strategy === "sticky") {
          this.currentIndex = successIndex;
        } else {
          this.currentIndex = (successIndex + 1) % accountList2.length;
        }
      }
    }
    const stats = this.accountStats.get(accountId);
    if (stats) {
      this.accountStats.set(accountId, {
        ...stats,
        requests: stats.requests + 1,
        tokens: stats.tokens + tokens,
        lastUsed: Date.now()
      });
    }
  }
  // 记录请求失败（区分错误类型）
  recordError(accountId, errorType = "recoverable", statusCode) {
    const account = this.accounts.get(accountId);
    if (!account) return;
    const now = Date.now();
    const stats = this.accountStats.get(accountId);
    if (stats) {
      this.accountStats.set(accountId, { ...stats, errors: stats.errors + 1, lastUsed: now });
    }
    if (errorType === "fatal") return;
    const errorCount = (account.errorCount || 0) + 1;
    let quotaExhaustedAt = account.quotaExhaustedAt;
    let quotaResetAt = account.quotaResetAt;
    const isQuotaError = statusCode === 402 || statusCode === 429;
    if (isQuotaError) {
      quotaExhaustedAt = now;
      quotaResetAt = now + this.config.quotaResetMs;
    }
    const backoffMultiplier = Math.min(
      Math.pow(2, errorCount - 1),
      this.config.maxBackoffMultiplier
    );
    const effectiveCooldown = this.config.baseCooldownMs * backoffMultiplier;
    const cooldownStr = effectiveCooldown < 6e4 ? `${Math.round(effectiveCooldown / 1e3)}s` : effectiveCooldown < 36e5 ? `${Math.round(effectiveCooldown / 6e4)}m` : `${Math.round(effectiveCooldown / 36e5)}h`;
    console.log(
      `[AccountPool] Account ${account.email || accountId} failure #${errorCount}: status=${statusCode || "?"}, cooldown=${cooldownStr}`
    );
    this.accounts.set(accountId, {
      ...account,
      errorCount,
      quotaExhaustedAt,
      quotaResetAt,
      lastUsed: now,
      isAvailable: account.suspended ? false : isQuotaError ? false : account.isAvailable
    });
  }
  // 更新账号配额信息
  updateQuota(accountId, used, limit, resetAt) {
    const account = this.accounts.get(accountId);
    if (!account) return;
    const wasExhausted = this.isQuotaExhausted(account);
    this.accounts.set(accountId, {
      ...account,
      quotaUsed: used,
      quotaLimit: limit,
      quotaResetAt: resetAt,
      // 如果配额从耗尽恢复，清除耗尽标记
      quotaExhaustedAt: used < limit ? void 0 : account.quotaExhaustedAt
    });
    if (!wasExhausted && used >= limit) {
      console.log(
        `[AccountPool] Account ${account.email || accountId} quota reached: ${used}/${limit}`
      );
    } else if (wasExhausted && used < limit) {
      console.log(
        `[AccountPool] Account ${account.email || accountId} quota recovered: ${used}/${limit}`
      );
    }
  }
  // 获取配额状态摘要
  getQuotaStatus() {
    const now = Date.now();
    const all = Array.from(this.accounts.values());
    let available = 0;
    let exhausted = 0;
    let cooldown = 0;
    for (const account of all) {
      if (this.isQuotaExhausted(account, now)) {
        exhausted++;
      } else if (account.cooldownUntil && account.cooldownUntil > now) {
        cooldown++;
      } else if (this.isAccountAvailable(account, now)) {
        available++;
      }
    }
    return { total: all.length, available, exhausted, cooldown };
  }
  // 标记账号需要刷新 Token
  markNeedsRefresh(accountId) {
    const account = this.accounts.get(accountId);
    if (account) {
      this.accounts.set(accountId, {
        ...account,
        isAvailable: false
      });
    }
  }
  // 获取统计信息
  getStats() {
    let totalRequests = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    for (const stats of this.accountStats.values()) {
      totalRequests += stats.requests;
      totalTokens += stats.tokens;
      totalErrors += stats.errors;
    }
    return {
      accounts: new Map(this.accountStats),
      total: {
        requests: totalRequests,
        tokens: totalTokens,
        errors: totalErrors
      }
    };
  }
  // 重置所有账号状态
  reset() {
    for (const [id, account] of this.accounts) {
      this.accounts.set(id, {
        ...account,
        isAvailable: true,
        errorCount: 0,
        cooldownUntil: void 0,
        quotaExhaustedAt: void 0,
        quotaResetAt: void 0
      });
    }
    this.currentIndex = 0;
  }
  // 清空所有账号
  clear() {
    this.accounts.clear();
    this.accountStats.clear();
    this.currentIndex = 0;
  }
  // 获取账号数量
  get size() {
    return this.accounts.size;
  }
  // 获取可用账号数量
  get availableCount() {
    const now = Date.now();
    let count = 0;
    for (const account of this.accounts.values()) {
      if (this.isAccountAvailable(account, now)) {
        count++;
      }
    }
    return count;
  }
}
const DEFAULT_CONFIG = {
  enabled: false,
  maxFileSize: 10 * 1024 * 1024,
  // 10MB
  maxFiles: 5,
  logToConsole: true
};
class ProxyLogger {
  config;
  logStream = null;
  currentLogFile = "";
  currentFileSize = 0;
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }
  configure(config) {
    this.config = { ...this.config, ...config };
    if (this.config.enabled && !this.config.logDir) {
      this.config.logDir = path__namespace.join(electron.app.getPath("userData"), "logs", "proxy");
    }
    if (this.config.enabled) {
      this.initLogFile();
    } else {
      this.close();
    }
  }
  initLogFile() {
    if (!this.config.logDir) return;
    try {
      fs__namespace.mkdirSync(this.config.logDir, { recursive: true });
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      this.currentLogFile = path__namespace.join(this.config.logDir, `proxy-${timestamp}.log`);
      this.logStream = fs__namespace.createWriteStream(this.currentLogFile, { flags: "a" });
      this.currentFileSize = 0;
      this.info("Logger", "Log file initialized", { file: this.currentLogFile });
    } catch (error) {
      console.error("[ProxyLogger] Failed to init log file:", error);
    }
  }
  rotateIfNeeded() {
    if (!this.config.maxFileSize || this.currentFileSize < this.config.maxFileSize) {
      return;
    }
    this.close();
    this.cleanOldLogs();
    this.initLogFile();
  }
  cleanOldLogs() {
    if (!this.config.logDir || !this.config.maxFiles) return;
    try {
      const files = fs__namespace.readdirSync(this.config.logDir).filter((f) => f.startsWith("proxy-") && f.endsWith(".log")).map((f) => ({
        name: f,
        path: path__namespace.join(this.config.logDir, f),
        time: fs__namespace.statSync(path__namespace.join(this.config.logDir, f)).mtime.getTime()
      })).sort((a, b) => b.time - a.time);
      while (files.length >= this.config.maxFiles) {
        const oldest = files.pop();
        if (oldest) {
          fs__namespace.unlinkSync(oldest.path);
        }
      }
    } catch (error) {
      console.error("[ProxyLogger] Failed to clean old logs:", error);
    }
  }
  isWriting = false;
  write(entry) {
    const line = JSON.stringify(entry) + "\n";
    if (this.config.logToConsole) {
      const prefix = `[${entry.level}][${entry.category}]`;
      this.isWriting = true;
      if (entry.level === "ERROR") {
        console.error(prefix, entry.message, entry.data || "");
      } else if (entry.level === "WARN") {
        console.warn(prefix, entry.message, entry.data || "");
      } else {
        console.log(prefix, entry.message, entry.data || "");
      }
      this.isWriting = false;
    }
    if (this.config.enabled && this.logStream) {
      this.logStream.write(line);
      this.currentFileSize += Buffer.byteLength(line);
      this.rotateIfNeeded();
    }
    proxyLogStore.add(entry);
  }
  get _isWriting() {
    return this.isWriting;
  }
  debug(category, message, data) {
    this.write({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "DEBUG",
      category,
      message,
      data
    });
  }
  info(category, message, data) {
    this.write({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "INFO",
      category,
      message,
      data
    });
  }
  warn(category, message, data) {
    this.write({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "WARN",
      category,
      message,
      data
    });
  }
  error(category, message, data) {
    this.write({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "ERROR",
      category,
      message,
      data
    });
  }
  // 记录请求
  request(info) {
    this.info("Request", `${info.method} ${info.path}`, info);
  }
  // 记录响应
  response(info) {
    if (info.error) {
      this.error("Response", `${info.path} -> ${info.status}`, info);
    } else {
      this.info("Response", `${info.path} -> ${info.status}`, info);
    }
  }
  // 记录 Token 刷新
  tokenRefresh(accountId, success, error) {
    if (success) {
      this.info("TokenRefresh", `Account ${accountId} refreshed successfully`);
    } else {
      this.error("TokenRefresh", `Account ${accountId} refresh failed`, { error });
    }
  }
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
  getLogDir() {
    return this.config.logDir;
  }
}
class ProxyLogStore {
  logs = [];
  // 5 万条 × 平均 200 字节 ≈ 10 MB；既能覆盖常规调试需求，又把单次写盘成本控制在可接受范围内
  maxLogs = 5e4;
  listeners = [];
  storePath = "";
  initialized = false;
  initialize(userDataPath) {
    if (this.initialized) return;
    this.initialized = true;
    this.storePath = path__namespace.join(userDataPath, "proxy-logs.json");
    this.load();
  }
  load() {
    try {
      if (fs__namespace.existsSync(this.storePath)) {
        const data = fs__namespace.readFileSync(this.storePath, "utf-8");
        const parsed = JSON.parse(data);
        const filtered = Array.isArray(parsed) ? parsed.filter((log) => {
          if (!log.timestamp || isNaN(new Date(log.timestamp).getTime())) return false;
          if (!log.level || !log.category) return false;
          return true;
        }) : [];
        this.logs = filtered.length > this.maxLogs ? filtered.slice(-this.maxLogs) : filtered;
        console.log(`[ProxyLogStore] Loaded ${this.logs.length} valid logs`);
      }
    } catch (error) {
      console.error("[ProxyLogStore] Failed to load logs:", error);
      this.logs = [];
    }
  }
  /** 异步保存日志（不阻塞主进程事件循环）。并发调用通过 in-flight 标志合并。 */
  writeInFlight = false;
  writePending = false;
  async save() {
    if (this.writeInFlight) {
      this.writePending = true;
      return;
    }
    this.writeInFlight = true;
    try {
      const snapshot = this.logs;
      await fs__namespace.promises.writeFile(this.storePath, JSON.stringify(snapshot), "utf-8");
    } catch (error) {
      console.error("[ProxyLogStore] Failed to save logs:", error);
    } finally {
      this.writeInFlight = false;
      if (this.writePending) {
        this.writePending = false;
        queueMicrotask(() => {
          void this.save();
        });
      }
    }
  }
  saveTimer = null;
  add(entry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
      }
    }
    this.scheduleSave();
  }
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 3e4);
  }
  /** 强制立即写盘（用于退出场景），保证最新数据落盘 */
  async flushSaveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }
  getAll() {
    return [...this.logs];
  }
  getLast(count) {
    return this.logs.slice(-count);
  }
  clear() {
    this.logs = [];
    void this.save();
  }
  count() {
    return this.logs.length;
  }
  onLog(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }
}
const proxyLogStore = new ProxyLogStore();
const proxyLogger = new ProxyLogger();
let consoleIntercepted = false;
function interceptConsole() {
  if (consoleIntercepted) return;
  consoleIntercepted = true;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const parseConsoleCategory = (args) => {
    const first = String(args[0] || "");
    const bracketMatch = first.match(/^\[(?:DEBUG|INFO|WARN|ERROR)\]?\[?([^\]]*)\]?\s*(.*)/);
    if (bracketMatch) {
      return { category: bracketMatch[1] || "App", message: bracketMatch[2] || "" };
    }
    const simpleMatch = first.match(/^\[([^\]]+)\]\s*(.*)/);
    if (simpleMatch) {
      return { category: simpleMatch[1], message: simpleMatch[2] || "" };
    }
    return { category: "App", message: first };
  };
  const buildEntry = (args, level) => {
    const { category, message } = parseConsoleCategory(args);
    const rest = args.slice(1);
    let data = void 0;
    if (rest.length === 1) {
      data = rest[0];
    } else if (rest.length > 1) {
      const allStrings = rest.every((r) => typeof r === "string");
      data = allStrings ? rest.join(" ") : rest;
    }
    return { timestamp: (/* @__PURE__ */ new Date()).toISOString(), level, category, message, data };
  };
  console.log = (...args) => {
    originalLog.apply(console, args);
    if (proxyLogger._isWriting) return;
    proxyLogStore.add(buildEntry(args, "INFO"));
  };
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    if (proxyLogger._isWriting) return;
    proxyLogStore.add(buildEntry(args, "WARN"));
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    if (proxyLogger._isWriting) return;
    proxyLogStore.add(buildEntry(args, "ERROR"));
  };
}
const logger = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  interceptConsole,
  proxyLogStore,
  proxyLogger
}, Symbol.toStringTag, { value: "Module" }));
const CA_CERT_FILENAME = "kproxy-ca.crt";
const CA_KEY_FILENAME = "kproxy-ca.key";
const CERT_CACHE_DIR = "kproxy-certs";
const certCache = /* @__PURE__ */ new Map();
class CertManager {
  dataPath;
  caCert = null;
  caKey = null;
  caInfo = null;
  constructor(dataPath) {
    this.dataPath = dataPath;
  }
  /**
   * 初始化 CA 证书（加载或生成）
   */
  async initialize() {
    const certPath = path__namespace.join(this.dataPath, CA_CERT_FILENAME);
    const keyPath = path__namespace.join(this.dataPath, CA_KEY_FILENAME);
    const cachePath = path__namespace.join(this.dataPath, CERT_CACHE_DIR);
    if (!fs__namespace.existsSync(cachePath)) {
      fs__namespace.mkdirSync(cachePath, { recursive: true });
    }
    if (fs__namespace.existsSync(certPath) && fs__namespace.existsSync(keyPath)) {
      try {
        const certPem = fs__namespace.readFileSync(certPath, "utf8");
        const keyPem = fs__namespace.readFileSync(keyPath, "utf8");
        this.caCert = forge__namespace.pki.certificateFromPem(certPem);
        this.caKey = forge__namespace.pki.privateKeyFromPem(keyPem);
        const now = /* @__PURE__ */ new Date();
        if (this.caCert.validity.notAfter > now) {
          this.caInfo = this.extractCertInfo(certPath, keyPath, certPem, keyPem);
          console.log("[CertManager] Loaded existing CA certificate");
          return this.caInfo;
        }
        console.log("[CertManager] CA certificate expired, regenerating...");
      } catch (error) {
        console.error("[CertManager] Failed to load CA certificate:", error);
      }
    }
    return this.generateCACert(certPath, keyPath);
  }
  /**
   * 生成 CA 证书
   */
  generateCACert(certPath, keyPath) {
    console.log("[CertManager] Generating new CA certificate...");
    const keys = forge__namespace.pki.rsa.generateKeyPair(2048);
    const cert = forge__namespace.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();
    cert.validity.notBefore = /* @__PURE__ */ new Date();
    cert.validity.notAfter = /* @__PURE__ */ new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
    const attrs = [
      { name: "commonName", value: "K-Proxy CA" },
      { name: "organizationName", value: "Kiro Account Manager" },
      { name: "countryName", value: "CN" }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      {
        name: "basicConstraints",
        cA: true,
        critical: true
      },
      {
        name: "keyUsage",
        keyCertSign: true,
        cRLSign: true,
        critical: true
      },
      {
        name: "subjectKeyIdentifier"
      }
    ]);
    cert.sign(keys.privateKey, forge__namespace.md.sha256.create());
    const certPem = forge__namespace.pki.certificateToPem(cert);
    const keyPem = forge__namespace.pki.privateKeyToPem(keys.privateKey);
    fs__namespace.writeFileSync(certPath, certPem);
    fs__namespace.writeFileSync(keyPath, keyPem);
    this.caCert = cert;
    this.caKey = keys.privateKey;
    this.caInfo = this.extractCertInfo(certPath, keyPath, certPem, keyPem);
    console.log("[CertManager] CA certificate generated successfully");
    return this.caInfo;
  }
  /**
   * 为指定域名生成证书
   */
  generateCertForHost(hostname) {
    const cached = certCache.get(hostname);
    if (cached) {
      return cached;
    }
    if (!this.caCert || !this.caKey) {
      throw new Error("CA certificate not initialized");
    }
    const keys = forge__namespace.pki.rsa.generateKeyPair(2048);
    const cert = forge__namespace.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();
    cert.validity.notBefore = /* @__PURE__ */ new Date();
    cert.validity.notAfter = /* @__PURE__ */ new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [
      { name: "commonName", value: hostname },
      { name: "organizationName", value: "K-Proxy" }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(this.caCert.subject.attributes);
    cert.setExtensions([
      {
        name: "basicConstraints",
        cA: false
      },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true
      },
      {
        name: "extKeyUsage",
        serverAuth: true
      },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: hostname },
          // DNS
          { type: 2, value: "*." + hostname }
          // 通配符
        ]
      }
    ]);
    cert.sign(this.caKey, forge__namespace.md.sha256.create());
    const result = {
      cert: forge__namespace.pki.certificateToPem(cert),
      key: forge__namespace.pki.privateKeyToPem(keys.privateKey)
    };
    certCache.set(hostname, result);
    return result;
  }
  /**
   * 获取 CA 证书信息
   */
  getCACertInfo() {
    return this.caInfo;
  }
  /**
   * 获取 CA 证书 PEM
   */
  getCACertPem() {
    return this.caInfo?.certPem || null;
  }
  /**
   * 清除证书缓存
   */
  clearCache() {
    certCache.clear();
  }
  /**
   * 生成序列号
   */
  generateSerialNumber() {
    return crypto__namespace.randomBytes(16).toString("hex");
  }
  /**
   * 提取证书信息
   */
  extractCertInfo(certPath, keyPath, certPem, keyPem) {
    const cert = forge__namespace.pki.certificateFromPem(certPem);
    const fingerprint = forge__namespace.md.sha256.create().update(forge__namespace.asn1.toDer(forge__namespace.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().match(/.{2}/g).join(":").toUpperCase();
    return {
      certPath,
      keyPath,
      certPem,
      keyPem,
      fingerprint,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter
    };
  }
}
function createCertManager(dataPath) {
  return new CertManager(dataPath);
}
const MACHINE_ID_REGEX = /[a-f0-9]{64}/gi;
const KIRO_UA_REGEX = /KiroIDE[-\s][\d.]+[-\s]([a-f0-9]{64})/i;
class MitmProxy {
  server = null;
  certManager;
  config;
  stats;
  events;
  tlsServers = /* @__PURE__ */ new Map();
  constructor(certManager, config, events = {}) {
    this.certManager = certManager;
    this.config = config;
    this.events = events;
    this.stats = {
      totalRequests: 0,
      mitmRequests: 0,
      bypassRequests: 0,
      modifiedRequests: 0,
      startTime: 0,
      lastRequestTime: 0
    };
  }
  /**
   * 启动代理服务器
   */
  async start() {
    if (this.server) {
      console.log("[MitmProxy] Server already running");
      return;
    }
    return new Promise((resolve, reject) => {
      this.server = http__namespace.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });
      this.server.on("connect", (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket, head);
      });
      this.server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(`[MitmProxy] Port ${this.config.port} is already in use`);
          reject(new Error(`Port ${this.config.port} is already in use`));
        } else {
          console.error("[MitmProxy] Server error:", error);
          this.events.onError?.(error);
          reject(error);
        }
      });
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[MitmProxy] Started on ${this.config.host}:${this.config.port}`);
        this.stats.startTime = Date.now();
        this.events.onStatusChange?.(true, this.config.port);
        resolve();
      });
    });
  }
  /**
   * 停止代理服务器
   */
  async stop() {
    if (!this.server) {
      return;
    }
    for (const tlsServer of this.tlsServers.values()) {
      tlsServer.close();
    }
    this.tlsServers.clear();
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("[MitmProxy] Stopped");
        this.server = null;
        this.events.onStatusChange?.(false, this.config.port);
        resolve();
      });
    });
  }
  /**
   * 处理 HTTP 请求
   */
  handleHttpRequest(req, res) {
    this.stats.totalRequests++;
    this.stats.lastRequestTime = Date.now();
    const targetUrl = url__namespace.parse(req.url || "");
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 80,
      path: targetUrl.path,
      method: req.method,
      headers: req.headers
    };
    const proxyReq = http__namespace.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", (error) => {
      console.error("[MitmProxy] HTTP proxy error:", error);
      res.writeHead(502);
      res.end("Bad Gateway");
    });
    req.pipe(proxyReq);
  }
  /**
   * 处理 CONNECT 请求（HTTPS 隧道）
   */
  handleConnect(req, clientSocket, head) {
    this.stats.totalRequests++;
    this.stats.lastRequestTime = Date.now();
    const [hostname, portStr] = (req.url || "").split(":");
    const port = parseInt(portStr, 10) || 443;
    const shouldMitm = this.shouldMitm(hostname);
    if (shouldMitm) {
      this.stats.mitmRequests++;
      this.handleMitmConnect(hostname, port, clientSocket, head);
    } else {
      this.stats.bypassRequests++;
      this.handleDirectConnect(hostname, port, clientSocket, head);
    }
  }
  /**
   * 检查域名是否需要 MITM
   */
  shouldMitm(hostname) {
    for (const domain of this.config.mitmDomains) {
      if (hostname.includes(domain)) {
        if (this.config.logRequests) {
          console.log(`[MitmProxy] MITM: ${hostname} matches ${domain}`);
        }
        return true;
      }
    }
    if (this.config.logRequests) {
      console.log(`[MitmProxy] Bypass: ${hostname}`);
    }
    return false;
  }
  /**
   * 直接转发连接（不解密）
   */
  handleDirectConnect(hostname, port, clientSocket, head) {
    const serverSocket = net__namespace.connect(port, hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on("error", (error) => {
      console.error(`[MitmProxy] Direct connect error to ${hostname}:${port}:`, error.message);
      clientSocket.end();
    });
    clientSocket.on("error", (error) => {
      console.error(`[MitmProxy] Client socket error:`, error.message);
      serverSocket.end();
    });
  }
  /**
   * MITM 拦截连接
   */
  handleMitmConnect(hostname, port, clientSocket, head) {
    try {
      const { cert, key } = this.certManager.generateCertForHost(hostname);
      const tlsOptions = {
        key,
        cert
      };
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const tlsSocket = new tls__namespace.TLSSocket(clientSocket, {
        ...tlsOptions,
        isServer: true,
        ALPNProtocols: ["http/1.1"]
      });
      tlsSocket.on("error", (error) => {
        console.error(`[MitmProxy] TLS error for ${hostname}:`, error.message);
        clientSocket.end();
      });
      if (head.length > 0) tlsSocket.unshift(head);
      this.handleDecryptedConnection(tlsSocket, hostname, port);
    } catch (error) {
      console.error(`[MitmProxy] MITM setup error for ${hostname}:`, error);
      clientSocket.end();
    }
  }
  /**
   * 处理解密后的 HTTPS 连接
   */
  handleDecryptedConnection(clientSocket, hostname, port) {
    let requestBuffer = Buffer.alloc(0);
    let headersParsed = false;
    let contentLength = 0;
    let bodyReceived = 0;
    let modifiedHeaders = "";
    let requestInfo = null;
    const onClientData = (chunk) => {
      if (!headersParsed) {
        requestBuffer = Buffer.concat([requestBuffer, chunk]);
        const headerEnd = requestBuffer.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          headersParsed = true;
          const headers = requestBuffer.subarray(0, headerEnd).toString("latin1");
          const bodyBuffer = requestBuffer.subarray(headerEnd + 4);
          const { modified, newHeaders, info } = this.modifyHeaders(headers, hostname);
          modifiedHeaders = newHeaders;
          requestInfo = info;
          if (requestInfo) {
            this.events.onRequest?.(requestInfo);
            this.events.onMitmIntercept?.(hostname, modified);
          }
          const clMatch = headers.match(/content-length:\s*(\d+)/i);
          if (clMatch) {
            contentLength = parseInt(clMatch[1], 10);
          }
          const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.toLowerCase() || "";
          let modifiedBody = bodyBuffer;
          if (contentType.includes("json") || contentType.includes("text")) {
            const body = bodyBuffer.toString("utf8");
            const requestDeviceId = info.newDeviceId || this.extractDeviceIdFromHeaders(modifiedHeaders) || this.config.deviceId;
            const modifiedText = this.modifyBody(body, requestDeviceId);
            if (modifiedText !== body) {
              modifiedBody = Buffer.from(modifiedText, "utf8");
              modifiedHeaders = modifiedHeaders.replace(
                /content-length:\s*\d+/i,
                `content-length: ${modifiedBody.length}`
              );
              contentLength = modifiedBody.length;
            }
          }
          bodyReceived = modifiedBody.length;
          clientSocket.pause();
          clientSocket.removeListener("data", onClientData);
          this.forwardRequest(
            modifiedHeaders,
            modifiedBody,
            hostname,
            port,
            clientSocket,
            contentLength,
            bodyReceived
          );
        }
      }
    };
    clientSocket.on("data", onClientData);
    clientSocket.on("error", (error) => {
      console.error(`[MitmProxy] Decrypted connection error:`, error.message);
    });
  }
  /**
   * 替换请求体中的 Machine ID
   */
  modifyBody(body, targetDeviceId) {
    if (!targetDeviceId || !body) return body;
    if (!MACHINE_ID_REGEX.test(body)) return body;
    MACHINE_ID_REGEX.lastIndex = 0;
    const result = body.replace(MACHINE_ID_REGEX, (match) => {
      if (match.toLowerCase() === targetDeviceId.toLowerCase()) return match;
      if (this.config.logRequests) {
        console.log(
          `[MitmProxy] Replaced Machine ID in body: ${match.substring(0, 16)}... -> ${targetDeviceId.substring(0, 16)}...`
        );
      }
      return targetDeviceId;
    });
    MACHINE_ID_REGEX.lastIndex = 0;
    return result;
  }
  extractDeviceIdFromHeaders(headers) {
    const match = headers.match(KIRO_UA_REGEX);
    return match?.[1];
  }
  /**
   * 修改请求头（替换 Machine ID）
   */
  modifyHeaders(headers, hostname) {
    const lines = headers.split("\r\n");
    const firstLine = lines[0];
    const [method, path2] = firstLine.split(" ");
    let modified = false;
    let originalDeviceId;
    let newDeviceId;
    const targetDeviceId = this.config.deviceId;
    const info = {
      timestamp: Date.now(),
      method: method || "UNKNOWN",
      host: hostname,
      path: path2 || "/",
      isMitm: true,
      deviceIdReplaced: false
    };
    if (!targetDeviceId) {
      return { modified: false, newHeaders: headers, info };
    }
    const modifiedLines = lines.map((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.startsWith("user-agent:") || lowerLine.startsWith("x-amz-user-agent:")) {
        const match = line.match(KIRO_UA_REGEX);
        if (match) {
          originalDeviceId = match[1];
          const newLine = line.replace(MACHINE_ID_REGEX, targetDeviceId);
          if (newLine !== line) {
            modified = true;
            newDeviceId = targetDeviceId;
            if (this.config.logRequests) {
              console.log(`[MitmProxy] Replaced Machine ID in ${line.split(":")[0]}`);
              console.log(`  Original: ${originalDeviceId?.substring(0, 16)}...`);
              console.log(`  New: ${targetDeviceId.substring(0, 16)}...`);
            }
            return newLine;
          }
        }
      }
      return line;
    });
    if (modified) {
      this.stats.modifiedRequests++;
      info.deviceIdReplaced = true;
      info.originalDeviceId = originalDeviceId;
      info.newDeviceId = newDeviceId;
    }
    return {
      modified,
      newHeaders: modifiedLines.join("\r\n"),
      info
    };
  }
  /**
   * 转发请求到目标服务器
   */
  forwardRequest(headers, initialBody, hostname, port, clientSocket, contentLength, bodyReceived) {
    const startTime = Date.now();
    const serverSocket = tls__namespace.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: true
      },
      () => {
        serverSocket.write(headers + "\r\n\r\n");
        if (initialBody.length > 0) {
          serverSocket.write(initialBody);
        }
        if (bodyReceived < contentLength) {
          const onBodyData = (chunk) => {
            serverSocket.write(chunk);
            bodyReceived += chunk.length;
            if (bodyReceived >= contentLength) {
              clientSocket.removeListener("data", onBodyData);
            }
          };
          clientSocket.on("data", onBodyData);
          clientSocket.resume();
        } else {
          clientSocket.resume();
        }
      }
    );
    serverSocket.on("data", (chunk) => {
      clientSocket.write(chunk);
    });
    serverSocket.on("end", () => {
      const duration = Date.now() - startTime;
      this.events.onResponse?.({
        timestamp: Date.now(),
        host: hostname,
        statusCode: 200,
        duration
      });
      clientSocket.end();
    });
    serverSocket.on("error", (error) => {
      console.error(`[MitmProxy] Server connection error to ${hostname}:`, error.message);
      clientSocket.end();
    });
    clientSocket.on("end", () => {
      serverSocket.end();
    });
    clientSocket.on("error", () => {
      serverSocket.end();
    });
  }
  /**
   * 更新配置
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      mitmRequests: 0,
      bypassRequests: 0,
      modifiedRequests: 0,
      startTime: this.stats.startTime,
      lastRequestTime: 0
    };
  }
  /**
   * 检查是否运行中
   */
  isRunning() {
    return this.server !== null;
  }
}
const DEFAULT_MITM_DOMAINS = [
  "amazonaws.com",
  "amazon.com",
  "kiro.dev"
];
const DEFAULT_KPROXY_CONFIG = {
  enabled: false,
  port: 8899,
  host: "127.0.0.1",
  mitmDomains: DEFAULT_MITM_DOMAINS,
  autoStart: false,
  logRequests: true
};
class KProxyService {
  certManager = null;
  mitmProxy = null;
  config;
  events;
  deviceIdMappings = /* @__PURE__ */ new Map();
  dataPath;
  initialized = false;
  cachedCaInfo = null;
  constructor(config = {}, events = {}) {
    this.config = { ...DEFAULT_KPROXY_CONFIG, ...config };
    this.events = events;
    this.dataPath = path__namespace.join(electron.app.getPath("userData"), "kproxy");
  }
  /**
   * 初始化服务（只初始化一次）
   */
  async initialize() {
    if (this.initialized && this.cachedCaInfo) {
      console.log("[KProxyService] Already initialized, returning cached CA info");
      return this.cachedCaInfo;
    }
    this.certManager = createCertManager(this.dataPath);
    const caInfo = await this.certManager.initialize();
    this.mitmProxy = new MitmProxy(this.certManager, this.config, this.events);
    this.initialized = true;
    this.cachedCaInfo = caInfo;
    console.log("[KProxyService] Initialized");
    return caInfo;
  }
  /**
   * 启动代理服务
   */
  async start() {
    if (!this.mitmProxy) {
      await this.initialize();
    }
    await this.mitmProxy.start();
    this.config.enabled = true;
  }
  /**
   * 停止代理服务
   */
  async stop() {
    if (this.mitmProxy) {
      await this.mitmProxy.stop();
    }
    this.config.enabled = false;
  }
  /**
   * 重启代理服务
   */
  async restart() {
    await this.stop();
    await this.start();
  }
  /**
   * 更新配置
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    if (this.mitmProxy) {
      this.mitmProxy.updateConfig(this.config);
    }
  }
  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * 获取统计信息
   */
  getStats() {
    return this.mitmProxy?.getStats() || null;
  }
  /**
   * 获取 CA 证书信息
   */
  getCACertInfo() {
    return this.certManager?.getCACertInfo() || null;
  }
  /**
   * 获取 CA 证书 PEM（用于导出/安装）
   */
  getCACertPem() {
    return this.certManager?.getCACertPem() || null;
  }
  /**
   * 设置当前设备 ID
   */
  setDeviceId(deviceId) {
    this.config.deviceId = deviceId;
    if (this.mitmProxy) {
      this.mitmProxy.updateConfig({ deviceId });
    }
  }
  /**
   * 获取当前设备 ID
   */
  getDeviceId() {
    return this.config.deviceId;
  }
  /**
   * 添加设备 ID 映射
   */
  addDeviceIdMapping(mapping) {
    this.deviceIdMappings.set(mapping.accountId, mapping);
  }
  /**
   * 移除设备 ID 映射
   */
  removeDeviceIdMapping(accountId) {
    this.deviceIdMappings.delete(accountId);
  }
  /**
   * 获取账号的设备 ID
   */
  getDeviceIdForAccount(accountId) {
    return this.deviceIdMappings.get(accountId)?.deviceId;
  }
  /**
   * 获取所有设备 ID 映射
   */
  getAllDeviceIdMappings() {
    return Array.from(this.deviceIdMappings.values());
  }
  /**
   * 切换到账号的设备 ID
   */
  switchToAccount(accountId) {
    const mapping = this.deviceIdMappings.get(accountId);
    if (mapping) {
      this.setDeviceId(mapping.deviceId);
      mapping.lastUsed = Date.now();
      return true;
    }
    return false;
  }
  /**
   * 检查是否运行中
   */
  isRunning() {
    return this.mitmProxy?.isRunning() || false;
  }
  /**
   * 重置统计
   */
  resetStats() {
    this.mitmProxy?.resetStats();
  }
  /**
   * 清除证书缓存
   */
  clearCertCache() {
    this.certManager?.clearCache();
  }
}
let kproxyService = null;
function getKProxyService() {
  return kproxyService;
}
function initKProxyService(config = {}, events = {}) {
  if (!kproxyService) {
    kproxyService = new KProxyService(config, events);
  }
  return kproxyService;
}
function generateDeviceId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isValidDeviceId(deviceId) {
  return /^[a-f0-9]{64}$/i.test(deviceId);
}
let _cachedSystemProxy = null;
let _systemProxyCacheTime = 0;
const SYSTEM_PROXY_CACHE_TTL = 3e4;
function isHttpLikeProxyUrl(url2) {
  try {
    const u = new URL(url2);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function parseWindowsProxyServer(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("=")) {
    const map = /* @__PURE__ */ new Map();
    for (const seg of trimmed.split(";")) {
      const eq = seg.indexOf("=");
      if (eq > 0) {
        const k = seg.slice(0, eq).trim().toLowerCase();
        const v = seg.slice(eq + 1).trim();
        if (k && v) map.set(k, v);
      }
    }
    const https2 = map.get("https");
    if (https2) return `http://${https2}`;
    const http2 = map.get("http");
    if (http2) return `http://${http2}`;
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return isHttpLikeProxyUrl(trimmed) ? trimmed : null;
  }
  return `http://${trimmed}`;
}
function getSystemProxy() {
  const now = Date.now();
  if (_systemProxyCacheTime > 0 && now - _systemProxyCacheTime < SYSTEM_PROXY_CACHE_TTL) {
    return _cachedSystemProxy;
  }
  try {
    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: "utf8", timeout: 3e3, windowsHide: true }
      );
      if (result.includes("0x1")) {
        const serverResult = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
          { encoding: "utf8", timeout: 3e3, windowsHide: true }
        );
        const match = serverResult.match(/ProxyServer\s+REG_SZ\s+(.+)/);
        if (match) {
          const parsed = parseWindowsProxyServer(match[1]);
          _cachedSystemProxy = parsed;
          _systemProxyCacheTime = now;
          return _cachedSystemProxy;
        }
      }
    } else if (process.platform === "darwin") {
      const { execSync } = require("child_process");
      const result = execSync("scutil --proxy", { encoding: "utf8", timeout: 3e3 });
      const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(result);
      if (httpsEnabled) {
        const hostMatch = result.match(/HTTPSProxy\s*:\s*(\S+)/);
        const portMatch = result.match(/HTTPSPort\s*:\s*(\d+)/);
        if (hostMatch) {
          const proxy = `http://${hostMatch[1]}${portMatch ? ":" + portMatch[1] : ""}`;
          _cachedSystemProxy = proxy;
          _systemProxyCacheTime = now;
          return _cachedSystemProxy;
        }
      }
      const httpEnabled = /HTTPEnable\s*:\s*1/.test(result);
      if (httpEnabled) {
        const hostMatch = result.match(/HTTPProxy\s*:\s*(\S+)/);
        const portMatch = result.match(/HTTPPort\s*:\s*(\d+)/);
        if (hostMatch) {
          const proxy = `http://${hostMatch[1]}${portMatch ? ":" + portMatch[1] : ""}`;
          _cachedSystemProxy = proxy;
          _systemProxyCacheTime = now;
          return _cachedSystemProxy;
        }
      }
    }
  } catch {
  }
  _cachedSystemProxy = null;
  _systemProxyCacheTime = now;
  return null;
}
function safeCreateProxyAgent(proxyUrl) {
  if (!proxyUrl) return void 0;
  let u;
  try {
    u = new URL(proxyUrl);
  } catch {
    console.warn(`[Proxy] 代理 URL 无效: ${proxyUrl}`);
    return void 0;
  }
  const protocol = u.protocol;
  if (protocol === "http:" || protocol === "https:") {
    try {
      return new undici.ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } });
    } catch (err) {
      console.warn(`[Proxy] 创建 HTTP ProxyAgent 失败，回退直连: ${proxyUrl}`, err);
      return void 0;
    }
  }
  if (protocol === "socks5:" || protocol === "socks5h:" || protocol === "socks4:" || protocol === "socks4a:") {
    try {
      return createSocksDispatcher(u);
    } catch (err) {
      console.warn(`[Proxy] 创建 SOCKS Agent 失败，回退直连: ${proxyUrl}`, err);
      return void 0;
    }
  }
  console.warn(`[Proxy] 忽略不支持的代理协议 (仅支持 http/https/socks5/socks4): ${proxyUrl}`);
  return void 0;
}
function createSocksDispatcher(u) {
  const isSocks5 = u.protocol === "socks5:" || u.protocol === "socks5h:";
  const type = isSocks5 ? 5 : 4;
  const proxyHost = u.hostname;
  const proxyPort = Number(u.port) || 1080;
  const userId = u.username ? decodeURIComponent(u.username) : void 0;
  const password = u.password ? decodeURIComponent(u.password) : void 0;
  return new undici.Agent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect: ((options, callback) => {
      const targetHost = options.hostname || options.host || "";
      const targetPort = Number(options.port) || (options.protocol === "https:" ? 443 : 80);
      let SocksClient;
      try {
        SocksClient = require("socks").SocksClient;
      } catch (err) {
        callback(err, null);
        return;
      }
      void SocksClient.createConnection({
        proxy: { host: proxyHost, port: proxyPort, type, userId, password },
        command: "connect",
        destination: { host: targetHost, port: targetPort }
      }).then(({ socket }) => {
        if (options.protocol === "https:") {
          const tlsSocket = tls__namespace.connect({
            socket,
            servername: options.servername || targetHost,
            rejectUnauthorized: options.rejectUnauthorized ?? false
          });
          tlsSocket.once("secureConnect", () => callback(null, tlsSocket));
          tlsSocket.once("error", (err) => callback(err, null));
        } else {
          callback(null, socket);
        }
      }).catch((err) => callback(err, null));
    })
  });
}
let useKProxyForApi$1 = false;
let logStreamEvents = false;
function setUseKProxyForApiInProxy(enabled) {
  useKProxyForApi$1 = enabled;
}
function setLogStreamEvents(enabled) {
  logStreamEvents = enabled;
}
let payloadSizeLimitKB = 1536;
const UPSTREAM_SAFE_PAYLOAD_LIMIT_KB = 512;
const EMERGENCY_PAYLOAD_LIMIT_KB = 320;
const UPSTREAM_ENDPOINT_TIMEOUT_MS = 25e3;
function setPayloadSizeLimitKB(limitKB) {
  payloadSizeLimitKB = Math.max(256, Math.min(10240, limitKB));
}
function getEffectivePayloadLimitBytes() {
  return Math.min(payloadSizeLimitKB || 1536, UPSTREAM_SAFE_PAYLOAD_LIMIT_KB) * 1024;
}
function getEmergencyPayloadLimitBytes(currentPayloadBytes) {
  const configuredEmergency = Math.min(
    getEffectivePayloadLimitBytes(),
    EMERGENCY_PAYLOAD_LIMIT_KB * 1024
  );
  if (!currentPayloadBytes || currentPayloadBytes <= 0) return configuredEmergency;
  return Math.min(configuredEmergency, Math.max(128 * 1024, Math.floor(currentPayloadBytes * 0.5)));
}
function isKProxyUrl$1(proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    const service = getKProxyService();
    const config = service?.getConfig();
    if (!config) return false;
    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0";
    return isLocalHost && Number(parsed.port || 80) === config.port;
  } catch {
    return false;
  }
}
function createEndpointSignal(parent) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Upstream endpoint timeout")),
    UPSTREAM_ENDPOINT_TIMEOUT_MS
  );
  const abort = () => controller.abort(getAbortError(parent));
  if (parent) {
    if (parent.aborted) abort();
    else parent.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    }
  };
}
function describeError(error) {
  if (error instanceof Error) {
    const parts = [error.name, error.message].filter(Boolean);
    const cause = error.cause;
    if (cause) parts.push(`cause=${describeError(cause)}`);
    return parts.join(": ") || String(error);
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : String(error);
  } catch {
    return String(error);
  }
}
function getNetworkAgent$1(account) {
  if (account?.proxyUrl) {
    const accountAgent = safeCreateProxyAgent(account.proxyUrl);
    if (accountAgent) return accountAgent;
  }
  if (useKProxyForApi$1) {
    const kproxyService2 = getKProxyService();
    if (kproxyService2?.isRunning()) {
      const config = kproxyService2.getConfig();
      const proxyUrl = `http://${config.host}:${config.port}`;
      const agent = safeCreateProxyAgent(proxyUrl);
      if (agent) return agent;
    }
  }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (envProxy && !isKProxyUrl$1(envProxy)) {
    return new undici.ProxyAgent({ uri: envProxy, requestTls: { rejectUnauthorized: false } });
  }
  const systemProxy = getSystemProxy();
  if (systemProxy && !isKProxyUrl$1(systemProxy)) {
    return new undici.ProxyAgent({ uri: systemProxy, requestTls: { rejectUnauthorized: false } });
  }
  return void 0;
}
async function fetchWithProxy(url2, options, account) {
  const agent = getNetworkAgent$1(account);
  if (agent) {
    proxyLogger.debug("KiroAPI", `Using proxy agent: ${agent.constructor.name}`);
    return await undici.fetch(url2, {
      ...options,
      dispatcher: agent
    });
  }
  return await fetch(url2, options);
}
const KIRO_ENDPOINTS = [
  {
    url: "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    origin: "AI_EDITOR",
    amzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
    name: "CodeWhisperer",
    protocol: "generateAssistantResponse"
  },
  {
    url: "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    origin: "AI_EDITOR",
    amzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
    name: "AmazonQ",
    protocol: "generateAssistantResponse"
  },
  {
    url: "https://q.us-east-1.amazonaws.com/SendMessageStreaming",
    origin: "AmazonQ",
    amzTarget: "AmazonQDeveloperStreamingService.SendMessage",
    name: "AmazonQCLI"
  }
];
const KIRO_VERSION$1 = "0.12.155";
const AWS_SDK_VERSION = "1.0.34";
const AWS_STREAMING_API_VERSION = "1.0.34";
const OS_PLATFORM = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "macos" : "linux";
const OS_RELEASE = (() => {
  try {
    return os.release();
  } catch {
    return "10.0.0";
  }
})();
const NODE_VERSION = process.versions.node || "22.22.0";
function getKiroUserAgent$1(machineId) {
  const suffix = machineId ? `KiroIDE-${KIRO_VERSION$1}-${machineId}` : `KiroIDE-${KIRO_VERSION$1}`;
  return `aws-sdk-js/${AWS_SDK_VERSION} ua/2.1 os/${OS_PLATFORM}#${OS_RELEASE} lang/js md/nodejs#${NODE_VERSION} api/codewhispererstreaming#${AWS_STREAMING_API_VERSION} m/E ${suffix}`;
}
function getKiroAmzUserAgent$1(machineId) {
  const suffix = machineId ? `KiroIDE ${KIRO_VERSION$1} ${machineId}` : `KiroIDE-${KIRO_VERSION$1}`;
  return `aws-sdk-js/${AWS_SDK_VERSION} ${suffix}`;
}
const AGENT_MODE_SPEC = "spec";
const AGENT_MODE_VIBE = "vibe";
const KIRO_BUILDER_ID_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX";
const KIRO_SOCIAL_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK";
function resolveProfileArn(account) {
  if (account.profileArn) return account.profileArn;
  if (account.provider === "Github" || account.provider === "Google") return KIRO_SOCIAL_PROFILE_ARN;
  return KIRO_BUILDER_ID_PROFILE_ARN;
}
const CODEWHISPERER_DEFAULT_MODEL_ID = "claude-sonnet-4.5";
const CODEWHISPERER_MODEL_CACHE_TTL = 5 * 60 * 1e3;
const codeWhispererModelCache = /* @__PURE__ */ new Map();
const MODEL_ID_MAP = {
  // Known-bad CodeWhisperer/internal IDs observed to return INVALID_MODEL_ID
  claude_sonnet_4_20250514_v1_0: "claude-sonnet-4.5",
  // Claude 4.5 系列
  "claude-sonnet-4-5": "claude-sonnet-4.5",
  "claude-sonnet-4.5": "claude-sonnet-4.5",
  "claude-haiku-4-5": "claude-haiku-4.5",
  "claude-haiku-4.5": "claude-haiku-4.5",
  "claude-opus-4-5": "claude-opus-4.5",
  "claude-opus-4.5": "claude-opus-4.5",
  // Claude 4 系列
  "claude-sonnet-4": "claude-sonnet-4",
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  // Claude 3.5 系列 (映射到 Sonnet 4.5)
  "claude-3-5-sonnet": "claude-sonnet-4.5",
  "claude-3-opus": "claude-sonnet-4.5",
  "claude-3-sonnet": "claude-sonnet-4",
  "claude-3-haiku": "claude-haiku-4.5",
  // GPT 兼容映射 (映射到 Sonnet 4.5)
  "gpt-4": "claude-sonnet-4.5",
  "gpt-4o": "claude-sonnet-4.5",
  "gpt-4-turbo": "claude-sonnet-4.5",
  "gpt-3.5-turbo": "claude-sonnet-4.5",
  default: "claude-sonnet-4.5"
};
function mapModelId(model) {
  const modelId = model.trim();
  if (!modelId) return MODEL_ID_MAP.default;
  const lower = modelId.toLowerCase();
  if (MODEL_ID_MAP[lower]) return MODEL_ID_MAP[lower];
  if (isCodeWhispererModelId(modelId)) {
    if (isKnownBadCodeWhispererModelId(modelId)) {
      console.warn(
        `[Kiro API] Known-bad model "${modelId}" → fallback to "${MODEL_ID_MAP.default}"`
      );
      return MODEL_ID_MAP.default;
    }
    return modelId;
  }
  if (/^claude-(sonnet|haiku|opus)-/.test(lower)) return modelId;
  console.warn(`[Kiro API] Unknown model "${modelId}" → fallback to "${MODEL_ID_MAP.default}"`);
  return MODEL_ID_MAP.default;
}
function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}
function stringifyJsonAsciiSafe(value) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
function getPayloadSize(payload) {
  return Buffer.byteLength(stringifyJsonAsciiSafe(payload), "utf8");
}
function appendProxyNote(message, note) {
  message.content = message.content?.trim() ? `${message.content}

${note}` : note;
}
function stripMessageAttachments(message, scope) {
  const imageCount = message.images?.length ?? 0;
  const documentCount = message.documents?.length ?? 0;
  if (imageCount === 0 && documentCount === 0) return 0;
  const approxBytes = (message.images ?? []).reduce((sum, image) => sum + (image.source?.bytes?.length ?? 0), 0) + (message.documents ?? []).reduce(
    (sum, document) => sum + (document.source?.bytes?.length ?? 0),
    0
  );
  delete message.images;
  delete message.documents;
  appendProxyNote(
    message,
    `[Proxy compacted ${scope} attachments: removed ${imageCount} image(s) and ${documentCount} document(s), approximately ${approxBytes} base64 chars, to keep the request under Kiro's payload limit.]`
  );
  return imageCount + documentCount;
}
function truncateToolResults(payload, limitBytes) {
  const TOOL_RESULT_TRUNCATE_LENGTH = 4e3;
  let size = getPayloadSize(payload);
  let count = 0;
  const messages = [
    ...payload.conversationState.history ?? [],
    payload.conversationState.currentMessage
  ];
  for (const message of messages) {
    if (size <= limitBytes) break;
    const userToolResults = message.userInputMessage?.userInputMessageContext?.toolResults;
    if (!userToolResults) continue;
    for (const toolResult of userToolResults) {
      if (size <= limitBytes) break;
      for (const contentItem of toolResult.content ?? []) {
        if (size <= limitBytes) break;
        if (contentItem.text && contentItem.text.length > TOOL_RESULT_TRUNCATE_LENGTH) {
          const originalLen = contentItem.text.length;
          contentItem.text = `${contentItem.text.slice(0, TOOL_RESULT_TRUNCATE_LENGTH)}

[Truncated by proxy: original ${originalLen} chars]`;
          count++;
          size = getPayloadSize(payload);
        }
      }
    }
  }
  return { count, size };
}
function compactLargeContextFields(payload, limitBytes) {
  let size = getPayloadSize(payload);
  let count = 0;
  const fields = [
    "additionalContext",
    "editorState",
    "shellState",
    "gitState",
    "envState"
  ];
  const messages = [
    ...payload.conversationState.history ?? [],
    payload.conversationState.currentMessage
  ];
  for (const message of messages) {
    if (size <= limitBytes) break;
    const context = message.userInputMessage?.userInputMessageContext;
    if (!context) continue;
    for (const field of fields) {
      if (size <= limitBytes) break;
      const value = context[field];
      if (value === void 0) continue;
      const valueSize = JSON.stringify(value).length;
      if (valueSize < 64 * 1024) continue;
      context[field] = `[Proxy compacted ${field}: original serialized size ${valueSize} chars]`;
      count++;
      size = getPayloadSize(payload);
    }
  }
  return { count, size };
}
const COMPACT_SUMMARY_MAX_LINES = 24;
const COMPACT_SUMMARY_LINE_MAX_CHARS = 360;
function compactText(text, maxChars) {
  return text.trim().replace(/\s+/g, " ").slice(0, maxChars);
}
function summarizeKiroMessage(message, index) {
  if (message.userInputMessage) {
    const user = message.userInputMessage;
    const parts = [];
    const text = compactText(user.content || "", COMPACT_SUMMARY_LINE_MAX_CHARS);
    if (text) parts.push(`content="${text}"`);
    const toolResults = user.userInputMessageContext?.toolResults ?? [];
    if (toolResults.length > 0) {
      const toolSummary = toolResults.slice(0, 3).map((result) => {
        const resultText = compactText(
          result.content?.map((content) => content.text).join("\n") || "",
          180
        );
        return `${result.toolUseId || "tool"}:${result.status || "ok"}${resultText ? ` ${resultText}` : ""}`;
      }).join("; ");
      parts.push(`toolResults=${toolSummary}`);
      if (toolResults.length > 3) parts.push(`+${toolResults.length - 3} more toolResults`);
    }
    const imageCount = user.images?.length ?? 0;
    const documentCount = user.documents?.length ?? 0;
    if (imageCount || documentCount)
      parts.push(`attachments=${imageCount} image(s), ${documentCount} document(s)`);
    return parts.length > 0 ? `${index}. user: ${parts.join(" | ")}` : null;
  }
  if (message.assistantResponseMessage) {
    const assistant = message.assistantResponseMessage;
    const parts = [];
    const text = compactText(assistant.content || "", COMPACT_SUMMARY_LINE_MAX_CHARS);
    if (text) parts.push(`content="${text}"`);
    const toolUses = assistant.toolUses ?? [];
    if (toolUses.length > 0) {
      const toolSummary = toolUses.slice(0, 4).map((toolUse) => `${toolUse.name || "tool"}#${toolUse.toolUseId || "?"}`).join(", ");
      parts.push(`toolUses=${toolSummary}`);
      if (toolUses.length > 4) parts.push(`+${toolUses.length - 4} more toolUses`);
    }
    return parts.length > 0 ? `${index}. assistant: ${parts.join(" | ")}` : null;
  }
  return null;
}
function buildCompactionSummary(removedMessages, maxLines) {
  const lines = removedMessages.map((message, index) => summarizeKiroMessage(message, index + 1)).filter((line) => Boolean(line)).slice(0, maxLines);
  return [
    `[Proxy server-side context compression: ${removedMessages.length} older message(s) were replaced with this extractive memory because the serialized request exceeded Kiro's payload limit.]`,
    "Important: treat this block as lossy prior conversation memory. Prefer the uncompressed recent messages below when details conflict.",
    lines.length > 0 ? "Retained memory:" : "",
    ...lines,
    removedMessages.length > lines.length ? `... ${removedMessages.length - lines.length} additional older message(s) omitted from summary.` : ""
  ].filter(Boolean).join("\n");
}
function compactHistoryMessages(payload, limitBytes) {
  let history = payload.conversationState.history ?? [];
  let size = getPayloadSize(payload);
  let removed = 0;
  if (history.length === 0 || size <= limitBytes) return { removed, size };
  const preservedPrefix = [];
  if (history[0]?.userInputMessage?.content?.includes("[Context: Current time is") && history[1]?.assistantResponseMessage) {
    preservedPrefix.push(history[0], history[1]);
    history = history.slice(2);
  }
  const removedMessages = [];
  const MIN_RECENT_HISTORY_MESSAGES = 2;
  while (history.length > MIN_RECENT_HISTORY_MESSAGES && size > limitBytes) {
    const removedMessage = history.shift();
    if (removedMessage) removedMessages.push(removedMessage);
    removed++;
    payload.conversationState.history = [...preservedPrefix, ...history];
    size = getPayloadSize(payload);
  }
  if (removed > 0) {
    let compactPair = [
      {
        userInputMessage: {
          content: buildCompactionSummary(removedMessages, COMPACT_SUMMARY_MAX_LINES),
          origin: "AI_EDITOR"
        }
      },
      { assistantResponseMessage: { content: "I understand the compressed prior context." } }
    ];
    payload.conversationState.history = [...preservedPrefix, ...compactPair, ...history];
    size = getPayloadSize(payload);
    let maxSummaryLines = COMPACT_SUMMARY_MAX_LINES;
    while (size > limitBytes && maxSummaryLines > 3) {
      maxSummaryLines = Math.max(3, Math.floor(maxSummaryLines / 2));
      compactPair[0].userInputMessage.content = buildCompactionSummary(
        removedMessages,
        maxSummaryLines
      );
      payload.conversationState.history = [...preservedPrefix, ...compactPair, ...history];
      size = getPayloadSize(payload);
    }
    while (payload.conversationState.history.length > preservedPrefix.length + compactPair.length && size > limitBytes) {
      payload.conversationState.history.splice(preservedPrefix.length + compactPair.length, 1);
      removed++;
      size = getPayloadSize(payload);
    }
    if (size > limitBytes) {
      compactPair = [
        {
          userInputMessage: {
            content: `[Proxy server-side context compression: ${removed} older message(s) omitted to satisfy Kiro payload limits.]`,
            origin: "AI_EDITOR"
          }
        },
        { assistantResponseMessage: { content: "I understand the compressed prior context." } }
      ];
      payload.conversationState.history = [...preservedPrefix, ...compactPair];
      size = getPayloadSize(payload);
    }
    if (size > limitBytes && preservedPrefix.length > 0) {
      payload.conversationState.history = compactPair;
      size = getPayloadSize(payload);
    }
  }
  if (payload.conversationState.history?.length === 0) delete payload.conversationState.history;
  return { removed, size };
}
function recoverRequestBodyInvalidPayload(payload) {
  delete payload.additionalModelRequestFields;
  const messages = [
    ...payload.conversationState.history ?? [],
    payload.conversationState.currentMessage
  ];
  for (const message of messages) {
    if (message.userInputMessage) {
      delete message.userInputMessage.cachePoint;
      delete message.userInputMessage.clientCacheConfig;
      const context = message.userInputMessage.userInputMessageContext;
      if (context) {
        delete context.additionalContext;
        delete context.editorState;
        delete context.shellState;
        delete context.gitState;
        delete context.envState;
      }
    }
    if ("assistantResponseMessage" in message && message.assistantResponseMessage) {
      const assistant = message.assistantResponseMessage;
      delete assistant.reasoningContent;
      delete assistant.reasoning_content;
      delete assistant.cachePoint;
    }
  }
  const sanitized = sanitizeConversation(messages);
  payload.conversationState.history = sanitized.slice(0, -1);
  payload.conversationState.currentMessage = sanitized.at(-1);
  if (payload.conversationState.history.length === 0) delete payload.conversationState.history;
}
function isRequestBodyInvalidError(body) {
  return body.includes("REQUEST_BODY_INVALID") || body.includes("Improperly formed request");
}
function isContentLengthExceededError(body) {
  return body.includes("CONTENT_LENGTH_EXCEEDS_THRESHOLD") || body.includes("Input content length exceeds threshold");
}
function enforcePayloadSizeLimit(payload, limitBytes) {
  const originalSize = getPayloadSize(payload);
  let size = originalSize;
  let truncatedToolResults = 0;
  let strippedAttachments = 0;
  let compactedContextFields = 0;
  let compactedHistoryMessages = 0;
  let emergencyHistoryDrop = false;
  let emergencyToolCompaction = false;
  if (size > limitBytes) {
    const result = truncateToolResults(payload, limitBytes);
    truncatedToolResults += result.count;
    size = result.size;
  }
  if (size > limitBytes && payload.conversationState.history) {
    for (const message of payload.conversationState.history) {
      if (size <= limitBytes) break;
      if (!message.userInputMessage) continue;
      strippedAttachments += stripMessageAttachments(message.userInputMessage, "history");
      size = getPayloadSize(payload);
    }
  }
  if (size > limitBytes) {
    const result = compactLargeContextFields(payload, limitBytes);
    compactedContextFields += result.count;
    size = result.size;
  }
  if (size > limitBytes) {
    const result = compactHistoryMessages(payload, limitBytes);
    compactedHistoryMessages += result.removed;
    size = result.size;
  }
  if (size > limitBytes) {
    strippedAttachments += stripMessageAttachments(
      payload.conversationState.currentMessage.userInputMessage,
      "current"
    );
    size = getPayloadSize(payload);
  }
  if (size > limitBytes) {
    const current = payload.conversationState.currentMessage.userInputMessage;
    const maxCurrentContent = 24e3;
    if (current.content.length > maxCurrentContent) {
      const originalLen = current.content.length;
      current.content = `${current.content.slice(0, maxCurrentContent)}

[Truncated by proxy: current message was ${originalLen} chars]`;
      size = getPayloadSize(payload);
    }
  }
  if (size > limitBytes && payload.conversationState.history?.length) {
    compactedHistoryMessages += payload.conversationState.history.length;
    emergencyHistoryDrop = true;
    payload.conversationState.history = [
      {
        userInputMessage: {
          content: "[Proxy emergency compression: all prior history was omitted because the serialized request still exceeded Kiro payload limits after normal compaction.]",
          origin: "AI_EDITOR"
        }
      },
      { assistantResponseMessage: { content: "I understand the emergency-compressed context." } }
    ];
    size = getPayloadSize(payload);
  }
  if (size > limitBytes) {
    const current = payload.conversationState.currentMessage.userInputMessage;
    const tools = current.userInputMessageContext?.tools;
    if (tools?.length) {
      const originalToolCount = tools.length;
      current.userInputMessageContext = {
        ...current.userInputMessageContext,
        tools: tools.slice(0, 128)
      };
      emergencyToolCompaction = true;
      appendProxyNote(
        current,
        `[Proxy emergency compression: kept ${Math.min(originalToolCount, 128)}/${originalToolCount} tool definition(s) because tool schemas exceeded the payload limit.]`
      );
      size = getPayloadSize(payload);
    }
  }
  if (size > limitBytes) {
    const current = payload.conversationState.currentMessage.userInputMessage;
    const context = current.userInputMessageContext;
    if (context?.tools?.length) {
      delete context.tools;
      emergencyToolCompaction = true;
      appendProxyNote(
        current,
        "[Proxy emergency compression: removed tool definitions because the request still exceeded the payload limit.]"
      );
      size = getPayloadSize(payload);
    }
  }
  if (truncatedToolResults > 0 || strippedAttachments > 0 || compactedContextFields > 0 || compactedHistoryMessages > 0) {
    const allMessages = sanitizeConversation([
      ...payload.conversationState.history ?? [],
      payload.conversationState.currentMessage
    ]);
    payload.conversationState.history = allMessages.slice(0, -1);
    payload.conversationState.currentMessage = allMessages.at(-1);
    if (payload.conversationState.history.length === 0) delete payload.conversationState.history;
    size = getPayloadSize(payload);
    console.log("[KiroPayload] Auto-compacted oversized payload:", {
      truncatedToolResults,
      strippedAttachments,
      compactedContextFields,
      compactedHistoryMessages,
      emergencyHistoryDrop,
      emergencyToolCompaction,
      originalSize,
      finalSize: size,
      limitBytes
    });
  }
  return size;
}
function normalizeModelKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function modelTokens(value) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function matchesRequestedModel(model, requestedModelId) {
  const requestedKey = normalizeModelKey(requestedModelId);
  const modelIdKey = normalizeModelKey(model.modelId);
  if (modelIdKey === requestedKey || modelIdKey.includes(requestedKey)) return true;
  if (model.modelName && normalizeModelKey(model.modelName).includes(requestedKey)) return true;
  const tokens = modelTokens(requestedModelId).filter(
    (token) => token !== "latest" && token !== "model"
  );
  if (tokens.length === 0) return false;
  const candidateTokens = new Set(modelTokens(`${model.modelId} ${model.modelName || ""}`));
  if (!tokens.every((token) => candidateTokens.has(token))) return false;
  const families = ["opus", "sonnet", "haiku"];
  for (const family of families) {
    if (tokens.includes(family) && !candidateTokens.has(family)) return false;
    if (!tokens.includes(family) && candidateTokens.has(family)) return false;
  }
  return true;
}
function isCodeWhispererModelId(modelId) {
  return /^[A-Z0-9_]+$/.test(modelId) && modelId.includes("_");
}
function isKnownBadCodeWhispererModelId(modelId) {
  const normalized = modelId.toUpperCase();
  return normalized === "CLAUDE_SONNET_4_20250514_V1_0";
}
function getModelCacheKey(account) {
  return `${account.id}:${account.region || "us-east-1"}:${resolveProfileArn(account)}`;
}
async function getCachedCodeWhispererModels(account, signal) {
  const key = getModelCacheKey(account);
  const cached = codeWhispererModelCache.get(key);
  if (cached && Date.now() - cached.timestamp < CODEWHISPERER_MODEL_CACHE_TTL) return cached.models;
  const models = await fetchKiroModels(account, signal);
  codeWhispererModelCache.set(key, { models, timestamp: Date.now() });
  return models;
}
async function resolveCodeWhispererModelId(account, requestedModelId, signal) {
  const modelId = requestedModelId?.trim();
  const models = await getCachedCodeWhispererModels(account, signal);
  if (!modelId) return models[0]?.modelId || CODEWHISPERER_DEFAULT_MODEL_ID;
  if (isCodeWhispererModelId(modelId)) {
    if (!isKnownBadCodeWhispererModelId(modelId)) return modelId;
    const replacement = models.find((model) => model.modelId !== modelId)?.modelId;
    if (replacement) {
      console.warn(`[KiroAPI] CodeWhisperer model ${modelId} is known bad; using ${replacement}`);
      return replacement;
    }
  }
  return models.find((model) => matchesRequestedModel(model, modelId))?.modelId || models[0]?.modelId || CODEWHISPERER_DEFAULT_MODEL_ID;
}
function getPayloadModelId(payload) {
  const currentModelId = payload.conversationState.currentMessage.userInputMessage.modelId;
  if (currentModelId) return currentModelId;
  return payload.conversationState.history?.find((message) => message.userInputMessage?.modelId)?.userInputMessage?.modelId;
}
function applyPayloadModelId(payload, modelId) {
  payload.conversationState.currentMessage.userInputMessage.modelId = modelId;
  for (const message of payload.conversationState.history ?? []) {
    if (message.userInputMessage) message.userInputMessage.modelId = modelId;
  }
}
function applyPayloadOrigin(payload, origin) {
  payload.conversationState.currentMessage.userInputMessage.origin = origin;
  for (const message of payload.conversationState.history ?? []) {
    if (message.userInputMessage) message.userInputMessage.origin = origin;
  }
}
const HELLO_MESSAGE = {
  userInputMessage: { content: "Hello", origin: "AI_EDITOR" }
};
const CONTINUE_MESSAGE = {
  userInputMessage: { content: "Continue", origin: "AI_EDITOR" }
};
const UNDERSTOOD_MESSAGE = {
  assistantResponseMessage: { content: "understood" }
};
function createFailedToolUseMessage(toolUseIds) {
  return {
    userInputMessage: {
      content: "",
      origin: "AI_EDITOR",
      userInputMessageContext: {
        toolResults: toolUseIds.map(createFailedToolResult)
      }
    }
  };
}
function isUserInputMessage(message) {
  return message != null && "userInputMessage" in message && message.userInputMessage != null;
}
function isAssistantResponseMessage(message) {
  return message != null && "assistantResponseMessage" in message && message.assistantResponseMessage != null;
}
function hasToolResults(message) {
  return !!message.userInputMessage?.userInputMessageContext?.toolResults?.length;
}
function hasToolUses(message) {
  return !!message.assistantResponseMessage?.toolUses?.length;
}
function hasMatchingToolResults(toolUses, toolResults) {
  if (!toolUses || !toolUses.length) return true;
  if (!toolResults || !toolResults.length) return false;
  const allToolUsesHaveResults = toolUses.every(
    (toolUse) => toolResults.some((result) => result.toolUseId === toolUse.toolUseId)
  );
  const allToolResultsHaveUses = toolResults.every(
    (result) => toolUses.some((toolUse) => result.toolUseId === toolUse.toolUseId)
  );
  return allToolUsesHaveResults && allToolResultsHaveUses;
}
function createFailedToolResult(toolUseId) {
  return {
    toolUseId,
    content: [{ text: "Tool execution failed" }],
    status: "error"
  };
}
function stripInvalidToolResults(message) {
  if (message.userInputMessage?.content?.trim()) {
    return {
      userInputMessage: {
        ...message.userInputMessage,
        userInputMessageContext: void 0
      }
    };
  }
  return null;
}
function ensureStartsWithUserMessage(messages) {
  if (messages.length === 0 || isUserInputMessage(messages[0])) {
    return messages;
  }
  return [HELLO_MESSAGE, ...messages];
}
function ensureEndsWithUserMessage(messages) {
  if (messages.length === 0) return [HELLO_MESSAGE];
  if (isUserInputMessage(messages[messages.length - 1])) return messages;
  return [...messages, CONTINUE_MESSAGE];
}
function ensureAlternatingMessages(messages) {
  if (messages.length <= 1) return messages;
  const result = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prevMessage = result[result.length - 1];
    const currentMessage = messages[i];
    if (isUserInputMessage(prevMessage) && isUserInputMessage(currentMessage)) {
      result.push(UNDERSTOOD_MESSAGE);
    } else if (isAssistantResponseMessage(prevMessage) && isAssistantResponseMessage(currentMessage)) {
      result.push(CONTINUE_MESSAGE);
    }
    result.push(currentMessage);
  }
  return result;
}
function relocateToolResultMessages(messages) {
  const assistantToolUseIndexes = [];
  const toolResultIndexById = /* @__PURE__ */ new Map();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (isAssistantResponseMessage(message) && hasToolUses(message)) {
      assistantToolUseIndexes.push(i);
    } else if (isUserInputMessage(message) && hasToolResults(message)) {
      for (const toolResult of message.userInputMessage?.userInputMessageContext?.toolResults ?? []) {
        if (toolResult.toolUseId && !toolResultIndexById.has(toolResult.toolUseId)) {
          toolResultIndexById.set(toolResult.toolUseId, i);
        }
      }
    }
  }
  if (assistantToolUseIndexes.length === 0) return messages;
  const result = [];
  const usedIndexes = /* @__PURE__ */ new Set();
  for (let i = 0; i < messages.length; i++) {
    if (usedIndexes.has(i)) continue;
    const message = messages[i];
    result.push(message);
    usedIndexes.add(i);
    if (isAssistantResponseMessage(message) && hasToolUses(message)) {
      for (const toolUse of message.assistantResponseMessage?.toolUses ?? []) {
        const toolResultIndex = toolResultIndexById.get(toolUse.toolUseId);
        if (toolResultIndex !== void 0 && toolResultIndex !== i + 1 && !usedIndexes.has(toolResultIndex)) {
          const toolResultMessage = messages[toolResultIndex];
          if (toolResultMessage) {
            result.push(toolResultMessage);
            usedIndexes.add(toolResultIndex);
          }
        }
      }
    }
  }
  return result;
}
function removeInvalidToolResultMessages(messages) {
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const previousMessage = i > 0 ? messages[i - 1] : null;
    if (!isUserInputMessage(message) || !hasToolResults(message)) {
      result.push(message);
      continue;
    }
    if (!previousMessage || !isAssistantResponseMessage(previousMessage) || !hasToolUses(previousMessage)) {
      const stripped = stripInvalidToolResults(message);
      if (stripped) result.push(stripped);
      continue;
    }
    const validToolUseIds = new Set(
      (previousMessage.assistantResponseMessage?.toolUses ?? []).map((toolUse) => toolUse.toolUseId).filter(Boolean)
    );
    const seenToolUseIds = /* @__PURE__ */ new Set();
    const toolResults = message.userInputMessage?.userInputMessageContext?.toolResults ?? [];
    const filteredToolResults = toolResults.filter((toolResult) => {
      if (!toolResult.toolUseId || !validToolUseIds.has(toolResult.toolUseId) || seenToolUseIds.has(toolResult.toolUseId))
        return false;
      seenToolUseIds.add(toolResult.toolUseId);
      return true;
    });
    if (filteredToolResults.length === toolResults.length) {
      result.push(message);
    } else if (filteredToolResults.length > 0) {
      result.push({
        userInputMessage: {
          ...message.userInputMessage,
          userInputMessageContext: {
            ...message.userInputMessage.userInputMessageContext,
            toolResults: filteredToolResults
          }
        }
      });
    } else {
      const stripped = stripInvalidToolResults(message);
      if (stripped) result.push(stripped);
    }
  }
  return result;
}
function ensureValidToolUsesAndResults(messages) {
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    result.push(message);
    if (isAssistantResponseMessage(message) && hasToolUses(message)) {
      const nextMessage = i + 1 < messages.length ? messages[i + 1] : null;
      const toolUses = message.assistantResponseMessage?.toolUses ?? [];
      const toolUseIds = toolUses.map((tu, idx) => tu.toolUseId ?? `toolUse_${idx + 1}`);
      if (!nextMessage || !isUserInputMessage(nextMessage) || !hasToolResults(nextMessage)) {
        result.push(createFailedToolUseMessage(toolUseIds));
      } else if (!hasMatchingToolResults(
        message.assistantResponseMessage?.toolUses,
        nextMessage.userInputMessage?.userInputMessageContext?.toolResults
      ) && !messages.some(
        (candidate, index) => index !== i && isAssistantResponseMessage(candidate) && hasToolUses(candidate) && hasMatchingToolResults(
          candidate.assistantResponseMessage?.toolUses,
          nextMessage.userInputMessage?.userInputMessageContext?.toolResults
        )
      )) {
        const existingToolResults = nextMessage.userInputMessage?.userInputMessageContext?.toolResults ?? [];
        const validToolUseIds = new Set(toolUseIds);
        const usedToolUseIds = /* @__PURE__ */ new Set();
        const completedToolResults = existingToolResults.filter((toolResult) => {
          if (!toolResult.toolUseId || !validToolUseIds.has(toolResult.toolUseId) || usedToolUseIds.has(toolResult.toolUseId))
            return false;
          usedToolUseIds.add(toolResult.toolUseId);
          return true;
        });
        for (const toolUseId of toolUseIds) {
          if (!usedToolUseIds.has(toolUseId))
            completedToolResults.push(createFailedToolResult(toolUseId));
        }
        result.push({
          userInputMessage: {
            ...nextMessage.userInputMessage,
            userInputMessageContext: {
              ...nextMessage.userInputMessage.userInputMessageContext,
              toolResults: completedToolResults
            }
          }
        });
        i++;
      }
    }
  }
  return result;
}
function removeEmptyUserMessages(messages) {
  if (messages.length <= 1) return messages;
  const firstUserMessageIndex = messages.findIndex(isUserInputMessage);
  return messages.filter((message, index) => {
    if (isAssistantResponseMessage(message)) return true;
    if (isUserInputMessage(message) && index === firstUserMessageIndex) return true;
    if (isUserInputMessage(message)) {
      const hasContent = message.userInputMessage?.content?.trim() !== "";
      return hasContent || hasToolResults(message);
    }
    return true;
  });
}
function validateConversation(messages) {
  const errors = [];
  if (messages.length === 0 || !isUserInputMessage(messages[0])) {
    errors.push("STARTS_WITH_USER_MESSAGE:index=0");
  }
  if (messages.length === 0 || !isUserInputMessage(messages[messages.length - 1])) {
    errors.push(`ENDS_WITH_USER_MESSAGE:index=${Math.max(messages.length - 1, 0)}`);
  }
  for (let i = 1; i < messages.length; i++) {
    const previousMessage = messages[i - 1];
    const currentMessage = messages[i];
    if (isUserInputMessage(previousMessage) && isUserInputMessage(currentMessage)) {
      errors.push(`ALTERNATING_MESSAGES:index=${i}`);
      break;
    }
    if (isAssistantResponseMessage(previousMessage) && isAssistantResponseMessage(currentMessage)) {
      errors.push(`ALTERNATING_MESSAGES:index=${i}`);
      break;
    }
  }
  for (let i = 0; i < messages.length - 1; i++) {
    const message = messages[i];
    const nextMessage = messages[i + 1];
    if (isAssistantResponseMessage(message) && hasToolUses(message) && (!isUserInputMessage(nextMessage) || !hasMatchingToolResults(
      message.assistantResponseMessage?.toolUses,
      nextMessage?.userInputMessage?.userInputMessageContext?.toolResults
    ))) {
      errors.push(`TOOL_USES_AND_RESULTS:index=${i + 1}`);
      break;
    }
    if (isAssistantResponseMessage(message) && !hasToolUses(message) && isUserInputMessage(nextMessage) && hasToolResults(nextMessage)) {
      errors.push(`TOOL_RESULTS_AND_NO_USES:index=${i}`);
      break;
    }
  }
  for (let i = 1; i < messages.length; i++) {
    const previousMessage = messages[i - 1];
    const currentMessage = messages[i];
    if (!isAssistantResponseMessage(previousMessage) || !hasToolUses(previousMessage) || !isUserInputMessage(currentMessage) || !hasToolResults(currentMessage))
      continue;
    const toolUseIds = new Set(
      (previousMessage.assistantResponseMessage?.toolUses ?? []).map((toolUse) => toolUse.toolUseId).filter(Boolean)
    );
    const seenToolUseIds = /* @__PURE__ */ new Set();
    const hasInvalidToolResult = (currentMessage.userInputMessage?.userInputMessageContext?.toolResults ?? []).some((toolResult) => {
      if (!toolResult.toolUseId || !toolUseIds.has(toolResult.toolUseId) || seenToolUseIds.has(toolResult.toolUseId))
        return true;
      seenToolUseIds.add(toolResult.toolUseId);
      return false;
    });
    if (hasInvalidToolResult) {
      errors.push(`TOOL_RESULTS_ORPHAN_IDS:index=${i}`);
      break;
    }
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (isUserInputMessage(message) && !message.userInputMessage?.content?.trim() && !hasToolResults(message)) {
      errors.push(`NON_EMPTY_USER_MESSAGE:index=${i}`);
      break;
    }
  }
  return errors;
}
function getToolNames(tools) {
  return new Set(
    tools.flatMap((tool) => "toolSpecification" in tool ? [tool.toolSpecification.name] : [])
  );
}
function stringifyToolInput(input) {
  if (input === void 0) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
function flattenContent(content, extra) {
  const trimmedContent = content.trim();
  if (!trimmedContent) return extra;
  if (!extra) return trimmedContent;
  return `${trimmedContent}

${extra}`;
}
function formatToolUses(toolUses) {
  return toolUses.map(
    (toolUse) => [
      `<tool_use id="${toolUse.toolUseId}" name="${toolUse.name}">`,
      stringifyToolInput(toolUse.input),
      "</tool_use>"
    ].filter(Boolean).join("\n")
  ).join("\n\n");
}
function formatToolResults(toolResults) {
  return toolResults.map(
    (toolResult) => [
      `<tool_result id="${toolResult.toolUseId}" status="${toolResult.status}">`,
      toolResult.content.map((content) => content.text).join("\n"),
      "</tool_result>"
    ].filter(Boolean).join("\n")
  ).join("\n\n");
}
function normalizeToolHistory(messages, tools) {
  const toolNames = getToolNames(tools);
  const hasUnknownToolUse = messages.some(
    (message) => message.assistantResponseMessage?.toolUses?.some((toolUse) => !toolNames.has(toolUse.name)) ?? false
  );
  if (!hasUnknownToolUse) return messages;
  return messages.map((message) => {
    if (message.assistantResponseMessage?.toolUses?.length) {
      return {
        assistantResponseMessage: {
          ...message.assistantResponseMessage,
          content: flattenContent(
            message.assistantResponseMessage.content,
            formatToolUses(message.assistantResponseMessage.toolUses)
          ),
          toolUses: void 0
        }
      };
    }
    if (message.userInputMessage?.userInputMessageContext?.toolResults?.length) {
      return {
        userInputMessage: {
          ...message.userInputMessage,
          content: flattenContent(
            message.userInputMessage.content,
            formatToolResults(message.userInputMessage.userInputMessageContext.toolResults)
          ),
          userInputMessageContext: {
            ...message.userInputMessage.userInputMessageContext,
            toolResults: void 0
          }
        }
      };
    }
    return message;
  });
}
function sanitizeConversation(messages) {
  let sanitized = [...messages];
  sanitized = ensureStartsWithUserMessage(sanitized);
  sanitized = removeEmptyUserMessages(sanitized);
  sanitized = relocateToolResultMessages(sanitized);
  sanitized = removeInvalidToolResultMessages(sanitized);
  sanitized = ensureValidToolUsesAndResults(sanitized);
  sanitized = ensureAlternatingMessages(sanitized);
  sanitized = ensureEndsWithUserMessage(sanitized);
  const validationErrors = validateConversation(sanitized);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid Kiro conversation after sanitization: ${validationErrors.join(", ")}`);
  }
  return sanitized;
}
function buildKiroPayload(content, modelId, origin, history = [], tools = [], toolResults = [], images = [], profileArn, inferenceConfig, messageOptions, additionalModelRequestFields) {
  const finalContent = content.trim() || (toolResults.length > 0 ? "" : "Continue");
  const currentUserInputMessage = {
    content: finalContent,
    modelId,
    origin
  };
  if (images.length > 0) {
    currentUserInputMessage.images = images;
  }
  if (messageOptions?.documents?.length) {
    currentUserInputMessage.documents = messageOptions.documents;
  }
  if (messageOptions?.cachePoint) {
    currentUserInputMessage.cachePoint = messageOptions.cachePoint;
  }
  if (messageOptions?.clientCacheConfig !== void 0) {
    currentUserInputMessage.clientCacheConfig = messageOptions.clientCacheConfig;
  }
  if (tools.length > 0 || toolResults.length > 0) {
    currentUserInputMessage.userInputMessageContext = {};
    if (tools.length > 0) {
      currentUserInputMessage.userInputMessageContext.tools = tools;
    }
    if (toolResults.length > 0) {
      currentUserInputMessage.userInputMessageContext.toolResults = toolResults;
    }
  }
  if (messageOptions?.context) {
    currentUserInputMessage.userInputMessageContext = {
      ...currentUserInputMessage.userInputMessageContext,
      ...messageOptions.context.editorState !== void 0 ? { editorState: messageOptions.context.editorState } : {},
      ...messageOptions.context.shellState !== void 0 ? { shellState: messageOptions.context.shellState } : {},
      ...messageOptions.context.gitState !== void 0 ? { gitState: messageOptions.context.gitState } : {},
      ...messageOptions.context.envState !== void 0 ? { envState: messageOptions.context.envState } : {},
      ...messageOptions.context.additionalContext !== void 0 ? { additionalContext: messageOptions.context.additionalContext } : {}
    };
  }
  const currentMessage = {
    userInputMessage: currentUserInputMessage
  };
  const allMessages = [...history, currentMessage];
  const sanitizedMessages = sanitizeConversation(normalizeToolHistory(allMessages, tools));
  const sanitizedHistory = sanitizedMessages.slice(0, -1);
  let finalCurrentMessage = sanitizedMessages.at(-1);
  if (!finalCurrentMessage.userInputMessage) {
    finalCurrentMessage = {
      userInputMessage: {
        content: finalContent || "Continue",
        modelId,
        origin
      }
    };
  }
  finalCurrentMessage.userInputMessage.userInputMessageContext = {
    ...finalCurrentMessage.userInputMessage.userInputMessageContext,
    ...tools.length > 0 ? { tools } : {}
  };
  const conversationId = resolveConversationId(history, messageOptions?.conversationId);
  const payload = {
    conversationState: {
      agentContinuationId: uuid.v4(),
      agentTaskType: "vibe",
      chatTriggerType: "MANUAL",
      conversationId,
      currentMessage: {
        userInputMessage: finalCurrentMessage.userInputMessage
      },
      history: sanitizedHistory.length > 0 ? sanitizedHistory : void 0
    }
  };
  if (profileArn !== void 0) {
    payload.profileArn = profileArn;
  }
  if (inferenceConfig && (inferenceConfig.maxTokens || inferenceConfig.temperature !== void 0 || inferenceConfig.topP !== void 0)) {
    payload.inferenceConfig = {};
    if (inferenceConfig.maxTokens) {
      payload.inferenceConfig.maxTokens = inferenceConfig.maxTokens;
    }
    if (inferenceConfig.temperature !== void 0) {
      payload.inferenceConfig.temperature = inferenceConfig.temperature;
    }
    if (inferenceConfig.topP !== void 0) {
      payload.inferenceConfig.topP = inferenceConfig.topP;
    }
  }
  const PAYLOAD_SIZE_LIMIT = getEffectivePayloadLimitBytes();
  const initialPayloadSize = enforcePayloadSizeLimit(payload, PAYLOAD_SIZE_LIMIT);
  console.log(`[KiroPayload] Built payload (native history mode):`, {
    contentLength: finalContent.length,
    originalHistoryLength: history.length,
    sanitizedHistoryLength: sanitizedHistory.length,
    toolsCount: tools.length,
    toolResultsCount: toolResults.length,
    hasProfileArn: payload.profileArn !== void 0,
    hasThinking: false,
    payloadSize: initialPayloadSize
  });
  return payload;
}
const conversationCache = /* @__PURE__ */ new Map();
const CONVERSATION_CACHE_TTL = 2 * 60 * 60 * 1e3;
const CONVERSATION_CACHE_MAX = 1e3;
function resolveConversationId(history, sessionHint) {
  const key = sessionHint || fingerprintFromHistory(history);
  if (!key) return uuid.v4();
  const now = Date.now();
  const cached = conversationCache.get(key);
  if (cached) {
    cached.timestamp = now;
    return cached.id;
  }
  if (conversationCache.size > CONVERSATION_CACHE_MAX) {
    const cutoff = now - CONVERSATION_CACHE_TTL;
    for (const [k, v] of conversationCache) {
      if (v.timestamp < cutoff) conversationCache.delete(k);
    }
  }
  const id = uuid.v4();
  conversationCache.set(key, { id, timestamp: now });
  return id;
}
function fingerprintFromHistory(history) {
  if (history.length === 0) return void 0;
  const fp = history.slice(0, 2).map(
    (msg) => `${msg.userInputMessage?.content || ""}|${msg.assistantResponseMessage?.content || ""}`
  ).join("::");
  return crypto$1.createHash("sha256").update(fp).digest("hex").slice(0, 32);
}
const fallbackMachineIds = /* @__PURE__ */ new Map();
function generateStableMachineId(accountId) {
  const cached = fallbackMachineIds.get(accountId);
  if (cached) return cached;
  const hash = crypto$1.createHash("sha256").update(`kiro-device-${accountId}`).digest("hex");
  fallbackMachineIds.set(accountId, hash);
  return hash;
}
function getAccountMachineId(accountId, accountMachineId) {
  if (accountMachineId) return accountMachineId;
  const kproxyService2 = getKProxyService();
  if (kproxyService2) {
    const deviceId = kproxyService2.getDeviceIdForAccount(accountId);
    if (deviceId) return deviceId;
  }
  return generateStableMachineId(accountId);
}
function getAuthHeaders(account) {
  const isIDC = account.authMethod?.toLowerCase() === "idc";
  const machineId = getAccountMachineId(account.id, account.machineId);
  const agentMode = isIDC ? AGENT_MODE_VIBE : AGENT_MODE_SPEC;
  const userAgent = getKiroUserAgent$1(machineId);
  const amzUserAgent = getKiroAmzUserAgent$1(machineId);
  const headers = {
    "content-type": "application/json",
    "x-amzn-kiro-agent-mode": agentMode,
    "x-amz-user-agent": amzUserAgent,
    "user-agent": userAgent,
    "amz-sdk-invocation-id": uuid.v4(),
    "amz-sdk-request": "attempt=1; max=3",
    Authorization: `Bearer ${account.accessToken}`
  };
  return headers;
}
function getSortedEndpoints(preferredEndpoint) {
  if (!preferredEndpoint) return KIRO_ENDPOINTS.filter((ep) => ep.name !== "AmazonQCLI");
  if (preferredEndpoint === "amazonq-cli") {
    return KIRO_ENDPOINTS.filter((ep) => ep.name === "AmazonQCLI");
  }
  const preferredName = preferredEndpoint === "codewhisperer" ? "CodeWhisperer" : "AmazonQ";
  const sorted = KIRO_ENDPOINTS.filter((ep) => ep.name !== "AmazonQCLI");
  sorted.sort((a, b) => {
    if (a.name === preferredName) return -1;
    if (b.name === preferredName) return 1;
    return 0;
  });
  return sorted;
}
function getAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  if (signal?.reason) return new Error(String(signal.reason));
  return new Error("Request aborted");
}
function throwIfAborted$1(signal) {
  if (signal?.aborted) throw getAbortError(signal);
}
async function callKiroApiStream(account, payload, onChunk, onComplete, onError, signal, preferredEndpoint) {
  const endpoints = getSortedEndpoints(preferredEndpoint);
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      throwIfAborted$1(signal);
      const requestPayload = clonePayload(payload);
      requestPayload.profileArn = resolveProfileArn(account);
      const requestedModelId = getPayloadModelId(requestPayload);
      if (endpoint.name === "CodeWhisperer") {
        applyPayloadModelId(
          requestPayload,
          await resolveCodeWhispererModelId(account, requestedModelId, signal)
        );
      }
      applyPayloadOrigin(requestPayload, endpoint.origin);
      if (endpoint.name === "AmazonQCLI") {
        delete requestPayload.conversationState.agentContinuationId;
        delete requestPayload.conversationState.agentTaskType;
      }
      enforcePayloadSizeLimit(requestPayload, getEffectivePayloadLimitBytes());
      let payloadStr = stringifyJsonAsciiSafe(requestPayload);
      const headers = getAuthHeaders(account);
      const currentUserInput = requestPayload.conversationState.currentMessage.userInputMessage;
      const historyMessages = requestPayload.conversationState.history ?? [];
      const historyToolUseCount = historyMessages.reduce(
        (count, message) => count + (message.assistantResponseMessage?.toolUses?.length ?? 0),
        0
      );
      const historyToolResultCount = historyMessages.reduce(
        (count, message) => count + (message.userInputMessage?.userInputMessageContext?.toolResults?.length ?? 0),
        0
      );
      console.log(`[KiroAPI] Request to ${endpoint.name}:`);
      console.log(`[KiroAPI]   - Content length: ${currentUserInput?.content?.length || 0}`);
      console.log(
        `[KiroAPI]   - Tools count: ${currentUserInput?.userInputMessageContext?.tools?.length || 0}`
      );
      console.log(
        `[KiroAPI]   - Current tool results: ${currentUserInput?.userInputMessageContext?.toolResults?.length || 0}`
      );
      console.log(`[KiroAPI]   - History messages: ${historyMessages.length}`);
      console.log(
        `[KiroAPI]   - History tool uses/results: ${historyToolUseCount}/${historyToolResultCount}`
      );
      console.log(`[KiroAPI]   - Model ID: ${currentUserInput?.modelId || "default"}`);
      console.log(`[KiroAPI]   - Has profileArn: ${requestPayload.profileArn !== void 0}`);
      console.log(`[KiroAPI]   - Agent mode: ${headers["x-amzn-kiro-agent-mode"]}`);
      console.log(`[KiroAPI]   - Payload size: ${payloadStr.length} bytes`);
      const agent = getNetworkAgent$1();
      const endpointSignal = createEndpointSignal(signal);
      if (agent) proxyLogger.debug("KiroAPI", `Stream request via proxy to ${endpoint.name}`);
      let response;
      const sendPayload = async () => {
        return agent ? await undici.fetch(endpoint.url, {
          method: "POST",
          headers,
          body: payloadStr,
          signal: endpointSignal.signal,
          dispatcher: agent
        }) : await fetch(endpoint.url, {
          method: "POST",
          headers,
          body: payloadStr,
          signal: endpointSignal.signal
        });
      };
      try {
        response = await sendPayload();
        if (response.status === 400) {
          const body = await response.text();
          if (isContentLengthExceededError(body)) {
            const emergencyLimit = getEmergencyPayloadLimitBytes(payloadStr.length);
            const finalSize = enforcePayloadSizeLimit(requestPayload, emergencyLimit);
            payloadStr = stringifyJsonAsciiSafe(requestPayload);
            console.warn(
              "[KiroAPI] CONTENT_LENGTH_EXCEEDS_THRESHOLD: retrying once with emergency compressed payload",
              {
                endpoint: endpoint.name,
                payloadSize: payloadStr.length,
                measuredSize: finalSize,
                emergencyLimit,
                historyMessages: requestPayload.conversationState.history?.length ?? 0
              }
            );
            response = await sendPayload();
          } else if (isRequestBodyInvalidError(body)) {
            recoverRequestBodyInvalidPayload(requestPayload);
            enforcePayloadSizeLimit(requestPayload, getEffectivePayloadLimitBytes());
            payloadStr = stringifyJsonAsciiSafe(requestPayload);
            console.warn(
              "[KiroAPI] REQUEST_BODY_INVALID: retrying once with compatibility payload",
              {
                endpoint: endpoint.name,
                payloadSize: payloadStr.length,
                historyMessages: requestPayload.conversationState.history?.length ?? 0
              }
            );
            response = await sendPayload();
          } else {
            throw new Error(`API error ${response.status}: ${body}`);
          }
        }
      } finally {
        endpointSignal.cleanup();
      }
      if (response.status === 402 || response.status === 429) {
        throwIfAborted$1(signal);
        const body = await response.text();
        throwIfAborted$1(signal);
        const message = `API error ${response.status}: ${body}`;
        console.log(`[KiroAPI] Endpoint ${endpoint.name} quota/throttle exhausted: ${message}`);
        onError(new Error(message));
        return;
      }
      if (response.status === 401 || response.status === 403) {
        throwIfAborted$1(signal);
        const body = await response.text();
        throwIfAborted$1(signal);
        throw new Error(`Auth error ${response.status}: ${body}`);
      }
      if (!response.ok) {
        throwIfAborted$1(signal);
        const body = await response.text();
        throwIfAborted$1(signal);
        throw new Error(`API error ${response.status}: ${body}`);
      }
      const inputChars = payloadStr.length;
      await parseEventStream(response.body, onChunk, onComplete, onError, inputChars, signal);
      return;
    } catch (error) {
      if (signal?.aborted) {
        onError(getAbortError(signal));
        return;
      }
      lastError = error instanceof Error ? error : new Error(describeError(error));
      console.error(`[KiroAPI] Endpoint ${endpoint.name} failed: ${describeError(error)}`);
      if (lastError.message.includes("API error 400") && (lastError.message.includes("INVALID_MODEL_ID") || lastError.message.includes("CONTENT_LENGTH_EXCEEDS_THRESHOLD") || lastError.message.includes("REQUEST_BODY_INVALID") || lastError.message.includes("Improperly formed request"))) {
        onError(lastError);
        return;
      }
      if (lastError.message.includes("Auth error") && preferredEndpoint === "amazonq-cli") {
        onError(lastError);
        return;
      }
    }
  }
  if (lastError) {
    onError(lastError);
  }
}
function extractEventType(headers) {
  let offset = 0;
  while (offset < headers.length) {
    if (offset >= headers.length) break;
    const nameLen = headers[offset];
    offset++;
    if (offset + nameLen > headers.length) break;
    const name = new TextDecoder().decode(headers.slice(offset, offset + nameLen));
    offset += nameLen;
    if (offset >= headers.length) break;
    const valueType = headers[offset];
    offset++;
    if (valueType === 7) {
      if (offset + 2 > headers.length) break;
      const valueLen = headers[offset] << 8 | headers[offset + 1];
      offset += 2;
      if (offset + valueLen > headers.length) break;
      const value = new TextDecoder().decode(headers.slice(offset, offset + valueLen));
      offset += valueLen;
      if (name === ":event-type") {
        return value;
      }
      continue;
    }
    const skipSizes = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16 };
    if (valueType === 6) {
      if (offset + 2 > headers.length) break;
      const len = headers[offset] << 8 | headers[offset + 1];
      offset += 2 + len;
    } else if (skipSizes[valueType] !== void 0) {
      offset += skipSizes[valueType];
    } else {
      break;
    }
  }
  return "";
}
function estimateTokens(text) {
  let cjkChars = 0;
  let otherChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 19968 && code <= 40959 || code >= 13312 && code <= 19903 || code >= 63744 && code <= 64255) {
      cjkChars++;
    } else {
      otherChars++;
    }
  }
  return Math.round(cjkChars * 0.6 + otherChars * 0.3);
}
async function parseEventStream(body, onChunk, onComplete, onError, inputChars = 0, signal) {
  const reader = body.getReader();
  const abort = () => {
    reader.cancel(getAbortError(signal)).catch(() => void 0);
  };
  let buffer = new Uint8Array(0);
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    credits: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0
  };
  let totalOutputChars = 0;
  const streamEventCounts = {};
  if (inputChars > 0) {
    usage.inputTokens = Math.max(1, Math.round(inputChars * 0.3));
  }
  let currentToolUse = null;
  const processedIds = /* @__PURE__ */ new Set();
  try {
    throwIfAborted$1(signal);
    signal?.addEventListener("abort", abort, { once: true });
    while (true) {
      throwIfAborted$1(signal);
      const { done, value } = await reader.read();
      throwIfAborted$1(signal);
      if (done) {
        break;
      }
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
      while (buffer.length >= 16) {
        const totalLength = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, false);
        if (buffer.length < totalLength) {
          break;
        }
        const headersLength = new DataView(buffer.buffer, buffer.byteOffset).getUint32(4, false);
        const headersStart = 12;
        const headersEnd = 12 + headersLength;
        const eventType = extractEventType(buffer.slice(headersStart, headersEnd));
        const payloadStart = 12 + headersLength;
        const payloadEnd = totalLength - 4;
        if (payloadStart < payloadEnd) {
          const payloadBytes = buffer.slice(payloadStart, payloadEnd);
          try {
            const payloadText = new TextDecoder().decode(payloadBytes);
            const event = JSON.parse(payloadText);
            if (eventType === "assistantResponseEvent" || event.assistantResponseEvent) {
              const assistantResp = event.assistantResponseEvent || event;
              const content = assistantResp.content;
              if (content) {
                onChunk(content);
                totalOutputChars += content.length;
              }
            }
            if (eventType === "toolUseEvent" || event.toolUseEvent) {
              const toolUseData = event.toolUseEvent || event;
              const toolUseId = toolUseData.toolUseId;
              const toolName = toolUseData.name;
              const isStop = toolUseData.stop === true;
              let inputFragment = "";
              let inputObj = null;
              if (typeof toolUseData.input === "string") {
                inputFragment = toolUseData.input;
              } else if (typeof toolUseData.input === "object" && toolUseData.input !== null) {
                inputObj = toolUseData.input;
              }
              if (toolUseId && toolName) {
                if (currentToolUse && currentToolUse.toolUseId !== toolUseId) {
                  if (!processedIds.has(currentToolUse.toolUseId)) {
                    let finalInput = {};
                    try {
                      if (currentToolUse.inputBuffer) {
                        finalInput = JSON.parse(currentToolUse.inputBuffer);
                      }
                    } catch {
                    }
                    onChunk("", {
                      toolUseId: currentToolUse.toolUseId,
                      name: currentToolUse.name,
                      input: finalInput
                    });
                    totalOutputChars += currentToolUse.name.length + currentToolUse.inputBuffer.length;
                    processedIds.add(currentToolUse.toolUseId);
                  }
                  currentToolUse = null;
                }
                if (!currentToolUse) {
                  if (processedIds.has(toolUseId)) {
                  } else {
                    currentToolUse = {
                      toolUseId,
                      name: toolName,
                      inputBuffer: ""
                    };
                  }
                }
              }
              if (currentToolUse && inputFragment) {
                currentToolUse.inputBuffer += inputFragment;
              }
              if (currentToolUse && inputObj) {
                currentToolUse.inputBuffer = JSON.stringify(inputObj);
              }
              if (isStop && currentToolUse) {
                let finalInput = {};
                let parseError = false;
                try {
                  if (currentToolUse.inputBuffer) {
                    if (logStreamEvents)
                      proxyLogger.debug(
                        "Kiro",
                        "Tool input buffer: " + currentToolUse.inputBuffer.substring(0, 200)
                      );
                    finalInput = JSON.parse(currentToolUse.inputBuffer);
                    if (logStreamEvents)
                      proxyLogger.debug(
                        "Kiro",
                        "Parsed tool input: " + JSON.stringify(finalInput).substring(0, 200)
                      );
                  }
                } catch (e) {
                  parseError = true;
                  console.error(
                    "[Kiro] Failed to parse tool input:",
                    e,
                    "Buffer:",
                    currentToolUse.inputBuffer?.substring(0, 100)
                  );
                  finalInput = {
                    _error: "Tool input truncated by Kiro API (output token limit exceeded)",
                    _partialInput: currentToolUse.inputBuffer?.substring(0, 500) || ""
                  };
                }
                onChunk("", {
                  toolUseId: currentToolUse.toolUseId,
                  name: currentToolUse.name,
                  input: finalInput
                });
                totalOutputChars += currentToolUse.name.length + currentToolUse.inputBuffer.length;
                if (parseError) {
                  onChunk(
                    `

⚠️ Tool "${currentToolUse.name}" input was truncated by Kiro API. The output may be incomplete due to token limits.`
                  );
                }
                processedIds.add(currentToolUse.toolUseId);
                currentToolUse = null;
              }
            }
            if (eventType === "messageMetadataEvent" || eventType === "metadataEvent" || event.messageMetadataEvent || event.metadataEvent) {
              const metadata = event.messageMetadataEvent || event.metadataEvent || event;
              proxyLogger.info("Kiro", "messageMetadataEvent", metadata);
              if (metadata.tokenUsage) {
                const tokenUsage = metadata.tokenUsage;
                proxyLogger.info("Kiro", "tokenUsage", tokenUsage);
                const uncached = tokenUsage.uncachedInputTokens || 0;
                const cacheRead = tokenUsage.cacheReadInputTokens || 0;
                const cacheWrite = tokenUsage.cacheWriteInputTokens || 0;
                const calculatedInput = uncached + cacheRead + cacheWrite;
                if (calculatedInput > 0) usage.inputTokens = calculatedInput;
                if (tokenUsage.outputTokens) usage.outputTokens = tokenUsage.outputTokens;
                if (tokenUsage.totalTokens) {
                  if (usage.inputTokens === 0 && usage.outputTokens > 0) {
                    usage.inputTokens = tokenUsage.totalTokens - usage.outputTokens;
                  }
                }
                usage.cacheReadTokens = cacheRead;
                usage.cacheWriteTokens = cacheWrite;
                if (tokenUsage.contextUsagePercentage !== void 0) {
                  proxyLogger.info(
                    "Kiro",
                    "Context usage: " + tokenUsage.contextUsagePercentage.toFixed(2) + "%"
                  );
                }
                proxyLogger.info("Kiro", "Token breakdown", {
                  uncached,
                  cacheRead,
                  cacheWrite,
                  inputTotal: calculatedInput,
                  output: tokenUsage.outputTokens || 0,
                  total: tokenUsage.totalTokens || 0,
                  contextUsage: tokenUsage.contextUsagePercentage ? `${tokenUsage.contextUsagePercentage.toFixed(2)}%` : "N/A"
                });
              }
              if (metadata.inputTokens) usage.inputTokens = metadata.inputTokens;
              if (metadata.outputTokens) usage.outputTokens = metadata.outputTokens;
            }
            if (logStreamEvents) {
              streamEventCounts[eventType || "unknown"] = (streamEventCounts[eventType || "unknown"] || 0) + 1;
            }
            if (eventType === "usageEvent" || eventType === "usage" || event.usageEvent || event.usage) {
              const usageData = event.usageEvent || event.usage || event;
              if (usageData.inputTokens) usage.inputTokens = usageData.inputTokens;
              if (usageData.outputTokens) usage.outputTokens = usageData.outputTokens;
            }
            if (eventType === "meteringEvent" || event.meteringEvent) {
              const metering = event.meteringEvent || event;
              if (metering.usage && typeof metering.usage === "number") {
                usage.credits += metering.usage;
                proxyLogger.info(
                  "Kiro",
                  `meteringEvent - credit: ${metering.usage}, total: ${usage.credits}`
                );
              }
            }
            if (eventType === "supplementaryWebLinksEvent" || event.supplementaryWebLinksEvent) {
              const webLinksEvent = event.supplementaryWebLinksEvent || event;
              if (webLinksEvent.supplementaryWebLinks && Array.isArray(webLinksEvent.supplementaryWebLinks)) {
                const links = webLinksEvent.supplementaryWebLinks.filter((link) => link.url).map((link) => {
                  const title = link.title || link.url;
                  return `- [${title}](${link.url})`;
                });
                if (links.length > 0) {
                  onChunk(`

🔗 **Web References:**
${links.join("\n")}`);
                }
              }
              proxyLogger.debug(
                "Kiro",
                "supplementaryWebLinksEvent",
                JSON.stringify(webLinksEvent).slice(0, 300)
              );
            }
            if (eventType === "contextUsageEvent" || event.contextUsageEvent) {
              const contextEvent = event.contextUsageEvent || event;
              if (contextEvent.contextUsagePercentage !== void 0) {
                const percentage = contextEvent.contextUsagePercentage;
                proxyLogger.info(
                  "Kiro",
                  "contextUsageEvent - Context usage: " + percentage.toFixed(2) + "%"
                );
                if (percentage > 80) {
                  console.warn(
                    "[Kiro] Warning: Context usage is high:",
                    percentage.toFixed(2) + "%"
                  );
                }
              }
            }
            if (eventType === "reasoningContentEvent" || event.reasoningContentEvent) {
              const reasoning = event.reasoningContentEvent || event;
              if (reasoning.text) {
                proxyLogger.info(
                  "Kiro",
                  `Received reasoning content (isThinking=true): ${reasoning.text.slice(0, 50)}...`
                );
                onChunk(reasoning.text, void 0, true, reasoning.signature, void 0);
                totalOutputChars += reasoning.text.length;
                usage.reasoningTokens += Math.max(1, Math.round(reasoning.text.length * 0.4));
              } else if (reasoning.signature && !reasoning.redactedContent) {
                onChunk("", void 0, true, reasoning.signature, void 0);
              }
              if (reasoning.redactedContent) {
                proxyLogger.info(
                  "Kiro",
                  `Received redacted thinking content (len=${reasoning.redactedContent.length})`
                );
                onChunk("", void 0, true, void 0, reasoning.redactedContent);
              }
              proxyLogger.debug(
                "Kiro",
                "reasoningContentEvent",
                JSON.stringify(reasoning).slice(0, 200)
              );
            }
            if (eventType === "codeReferenceEvent" || event.codeReferenceEvent) {
              const codeRef = event.codeReferenceEvent || event;
              if (codeRef.references && Array.isArray(codeRef.references)) {
                const refTexts = codeRef.references.filter(
                  (ref) => ref.licenseName || ref.repository
                ).map((ref) => {
                  const parts = [];
                  if (ref.licenseName) parts.push(`License: ${ref.licenseName}`);
                  if (ref.repository) parts.push(`Repo: ${ref.repository}`);
                  if (ref.url) parts.push(`URL: ${ref.url}`);
                  return parts.join(", ");
                });
                if (refTexts.length > 0) {
                  onChunk(`

📚 **Code References:**
${refTexts.join("\n")}`);
                }
              }
              proxyLogger.debug("Kiro", "codeReferenceEvent", JSON.stringify(codeRef).slice(0, 300));
            }
            if (eventType === "followupPromptEvent" || event.followupPromptEvent) {
              const followup = event.followupPromptEvent || event;
              if (followup.followupPrompt) {
                const prompt = followup.followupPrompt;
                if (prompt.content || prompt.userIntent) {
                  const suggestion = prompt.content || prompt.userIntent;
                  onChunk(`

💡 **Suggested follow-up:** ${suggestion}`);
                }
              }
              proxyLogger.debug(
                "Kiro",
                "followupPromptEvent",
                JSON.stringify(followup).slice(0, 200)
              );
            }
            if (eventType === "intentsEvent" || event.intentsEvent) {
              const intents = event.intentsEvent || event;
              proxyLogger.debug("Kiro", "intentsEvent", JSON.stringify(intents).slice(0, 300));
            }
            if (eventType === "interactionComponentsEvent" || event.interactionComponentsEvent) {
              const components = event.interactionComponentsEvent || event;
              proxyLogger.debug(
                "Kiro",
                "interactionComponentsEvent",
                JSON.stringify(components).slice(0, 300)
              );
            }
            if (eventType === "invalidStateEvent" || event.invalidStateEvent) {
              const invalid = event.invalidStateEvent || event;
              const reason = invalid.reason || "UNKNOWN";
              const message = invalid.message || "Invalid state detected";
              console.error("[Kiro] invalidStateEvent:", reason, message);
              onChunk(`

⚠️ **Warning:** ${message} (reason: ${reason})`);
            }
            if (eventType === "citationEvent" || event.citationEvent) {
              const citation = event.citationEvent || event;
              if (citation.citations && Array.isArray(citation.citations)) {
                const citationTexts = citation.citations.filter(
                  (c) => c.title || c.url
                ).map((c, i) => {
                  const parts = [`[${i + 1}]`];
                  if (c.title) parts.push(c.title);
                  if (c.url) parts.push(`(${c.url})`);
                  return parts.join(" ");
                });
                if (citationTexts.length > 0) {
                  onChunk(`

📖 **Citations:**
${citationTexts.join("\n")}`);
                }
              }
              proxyLogger.debug("Kiro", "citationEvent", JSON.stringify(citation).slice(0, 300));
            }
            if (event._type || event.error) {
              const errMsg = event.message || event.error?.message || "Unknown stream error";
              throw new Error(errMsg);
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.debug("[EventStream] JSON parse error:", parseError);
            } else {
              throw parseError;
            }
          }
        }
        buffer = buffer.slice(totalLength);
      }
    }
    if (currentToolUse && !processedIds.has(currentToolUse.toolUseId)) {
      let finalInput = {};
      try {
        if (currentToolUse.inputBuffer) {
          finalInput = JSON.parse(currentToolUse.inputBuffer);
        }
      } catch {
      }
      onChunk("", {
        toolUseId: currentToolUse.toolUseId,
        name: currentToolUse.name,
        input: finalInput
      });
      totalOutputChars += currentToolUse.name.length + currentToolUse.inputBuffer.length;
    }
    if (usage.outputTokens === 0 && totalOutputChars > 0) {
      usage.outputTokens = Math.max(1, Math.round(totalOutputChars * 0.4));
      proxyLogger.info(
        "Kiro",
        `Estimated output tokens: ${totalOutputChars} chars -> ${usage.outputTokens} tokens`
      );
    }
    if (logStreamEvents && Object.keys(streamEventCounts).length > 0) {
      const total = Object.values(streamEventCounts).reduce((a, b) => a + b, 0);
      proxyLogger.debug("Kiro", `Stream events summary (${total} total)`, streamEventCounts);
    }
    throwIfAborted$1(signal);
    proxyLogger.info("Kiro", "Stream complete, final usage", usage);
    onComplete(usage);
  } catch (error) {
    onError(signal?.aborted ? getAbortError(signal) : error);
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
async function callKiroApi(account, payload, signal) {
  return new Promise((resolve, reject) => {
    let content = "";
    let reasoningText = "";
    let reasoningSignature;
    let redactedContent = "";
    const toolUses = [];
    let usage = { inputTokens: 0, outputTokens: 0, credits: 0 };
    callKiroApiStream(
      account,
      payload,
      (text, toolUse, isThinking, signature, redacted) => {
        if (isThinking) {
          if (text) reasoningText += text;
          if (signature) reasoningSignature = signature;
          if (redacted) redactedContent += redacted;
        } else {
          content += text;
        }
        if (toolUse) {
          toolUses.push(toolUse);
        }
      },
      (u) => {
        usage = u;
        if (reasoningText || redactedContent) {
          const rc = {};
          if (reasoningText) rc.text = reasoningText;
          if (reasoningSignature) rc.signature = reasoningSignature;
          if (redactedContent) rc.redactedContent = redactedContent;
          resolve({ content, toolUses, usage, reasoningContent: rc });
          return;
        }
        resolve({ content, toolUses, usage });
      },
      reject,
      signal
    ).catch(reject);
  });
}
function getQServiceEndpoint(region) {
  if (region?.startsWith("eu-")) return "https://q.eu-central-1.amazonaws.com";
  return "https://q.us-east-1.amazonaws.com";
}
async function fetchKiroModels(account, signal) {
  const baseUrl = getQServiceEndpoint(account.region);
  const machineId = getAccountMachineId(account.id, account.machineId);
  const headers = {
    Authorization: `Bearer ${account.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": getKiroUserAgent$1(machineId),
    "x-amz-user-agent": getKiroAmzUserAgent$1(machineId),
    "x-amzn-codewhisperer-optout": "true"
  };
  const allModels = [];
  let nextToken;
  try {
    do {
      const params = new URLSearchParams({ origin: "AI_EDITOR", maxResults: "50" });
      params.set("profileArn", resolveProfileArn(account));
      if (nextToken) params.set("nextToken", nextToken);
      const url2 = `${baseUrl}/ListAvailableModels?${params.toString()}`;
      throwIfAborted$1(signal);
      const response = await fetchWithProxy(url2, { method: "GET", headers, signal }, account);
      throwIfAborted$1(signal);
      if (!response.ok) {
        console.error("[KiroAPI] ListAvailableModels failed:", response.status);
        break;
      }
      const data = await response.json();
      allModels.push(...data.models || []);
      nextToken = data.nextToken;
    } while (nextToken);
    return allModels;
  } catch (error) {
    if (signal?.aborted) throw getAbortError(signal);
    console.error("[KiroAPI] ListAvailableModels error:", error);
    return allModels.length > 0 ? allModels : [];
  }
}
const KIRO_SUBSCRIPTION_VERSION = "0.12.155";
function getSubscriptionUserAgent(machineId) {
  const suffix = machineId ? `KiroIDE-${KIRO_SUBSCRIPTION_VERSION}-${machineId}` : `KiroIDE-${KIRO_SUBSCRIPTION_VERSION}`;
  return `aws-sdk-js/1.0.0 ua/2.1 os/win32#10.0.19043 lang/js md/nodejs#22.22.0 api/codewhispererruntime#1.0.0 m/N,E ${suffix}`;
}
function getSubscriptionAmzUserAgent(machineId) {
  const suffix = machineId ? `KiroIDE-${KIRO_SUBSCRIPTION_VERSION}-${machineId}` : `KiroIDE-${KIRO_SUBSCRIPTION_VERSION}`;
  return `aws-sdk-js/1.0.0 ${suffix}`;
}
async function fetchAvailableSubscriptions(account) {
  const baseUrl = getQServiceEndpoint(account.region);
  const url2 = `${baseUrl}/listAvailableSubscriptions`;
  const machineId = getAccountMachineId(account.id, account.machineId);
  const headers = {
    Authorization: `Bearer ${account.accessToken}`,
    "content-type": "application/json",
    "user-agent": getSubscriptionUserAgent(machineId),
    "x-amz-user-agent": getSubscriptionAmzUserAgent(machineId),
    "amz-sdk-invocation-id": uuid.v4(),
    "amz-sdk-request": "attempt=1; max=1"
  };
  const profileArn = resolveProfileArn(account);
  const body = JSON.stringify({ profileArn });
  console.log(`[KiroAPI] ListAvailableSubscriptions [${account.email || account.id.slice(0, 8)}]`, {
    url: url2
  });
  try {
    const response = await fetchWithProxy(url2, { method: "POST", headers, body }, account);
    const responseText = await response.text();
    console.log(
      `[KiroAPI] ListAvailableSubscriptions → ${response.status}`,
      JSON.parse(responseText)
    );
    if (!response.ok) {
      return {};
    }
    return JSON.parse(responseText);
  } catch (error) {
    console.error("[KiroAPI] ListAvailableSubscriptions error:", error);
    return {};
  }
}
async function fetchSubscriptionToken(account, subscriptionType) {
  const baseUrl = getQServiceEndpoint(account.region);
  const url2 = `${baseUrl}/CreateSubscriptionToken`;
  const machineId = getAccountMachineId(account.id, account.machineId);
  const headers = {
    Authorization: `Bearer ${account.accessToken}`,
    "content-type": "application/json",
    "user-agent": getSubscriptionUserAgent(machineId),
    "x-amz-user-agent": getSubscriptionAmzUserAgent(machineId),
    "amz-sdk-invocation-id": uuid.v4(),
    "amz-sdk-request": "attempt=1; max=1"
  };
  const profileArn = resolveProfileArn(account);
  const payload = {
    clientToken: uuid.v4(),
    profileArn,
    provider: "STRIPE"
  };
  if (subscriptionType) {
    payload.subscriptionType = subscriptionType;
  }
  try {
    const response = await fetchWithProxy(url2, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[KiroAPI] CreateSubscriptionToken failed:", response.status, errorData);
      return { message: errorData.message || `Request failed with status ${response.status}` };
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[KiroAPI] CreateSubscriptionToken error:", error);
    return { message: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function setUserPreference(account, overageStatus) {
  const baseUrl = getQServiceEndpoint(account.region);
  const url2 = `${baseUrl}/setUserPreference`;
  const machineId = getAccountMachineId(account.id, account.machineId);
  const headers = {
    Authorization: `Bearer ${account.accessToken}`,
    "content-type": "application/json",
    "user-agent": getSubscriptionUserAgent(machineId),
    "x-amz-user-agent": getSubscriptionAmzUserAgent(machineId),
    "amz-sdk-invocation-id": uuid.v4(),
    "amz-sdk-request": "attempt=1; max=1"
  };
  const profileArn = resolveProfileArn(account);
  const body = JSON.stringify({
    overageConfiguration: { overageStatus },
    profileArn
  });
  try {
    const response = await fetchWithProxy(url2, { method: "POST", headers, body }, account);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
class ToolNameRegistry {
  originalToKiro = /* @__PURE__ */ new Map();
  kiroToOriginal = /* @__PURE__ */ new Map();
  toKiroName(name) {
    const existing = this.originalToKiro.get(name);
    if (existing) return existing;
    const baseName = name.length <= 64 ? name : this.shorten(name);
    const kiroName = this.ensureUnique(baseName, name);
    this.originalToKiro.set(name, kiroName);
    this.kiroToOriginal.set(kiroName, name);
    return kiroName;
  }
  toClientName(name) {
    return this.kiroToOriginal.get(name) || name;
  }
  restoreToolUse(toolUse) {
    return {
      ...toolUse,
      name: this.toClientName(toolUse.name)
    };
  }
  restoreToolUses(toolUses) {
    return toolUses.map((toolUse) => this.restoreToolUse(toolUse));
  }
  ensureUnique(baseName, originalName) {
    const existing = this.kiroToOriginal.get(baseName);
    if (!existing || existing === originalName) return baseName;
    const hash = this.hash(originalName);
    const suffix = `_${hash}`;
    const candidate = baseName.substring(0, Math.max(1, 64 - suffix.length)) + suffix;
    const candidateExisting = this.kiroToOriginal.get(candidate);
    if (!candidateExisting || candidateExisting === originalName) return candidate;
    throw new Error(`Tool name collision after shortening: ${originalName}`);
  }
  shorten(name) {
    const hash = this.hash(name);
    const suffix = `_${hash}`;
    const readable = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const maxPrefixLength = 64 - suffix.length;
    return readable.substring(0, maxPrefixLength) + suffix;
  }
  hash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
}
const KIRO_CACHE_POINT = { type: "default" };
function modelSupportsThinkingParam(_modelId) {
  return false;
}
function toKiroCachePoint(cacheControl) {
  if (!cacheControl) return void 0;
  if (cacheControl.type !== "ephemeral") {
    throw new Error(`Unsupported cache_control type: ${cacheControl.type}`);
  }
  return KIRO_CACHE_POINT;
}
function mergeCachePoint(first, second) {
  return first || second;
}
function responsesToOpenAIChat(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Responses request body must be an object");
  }
  if (!request.model) {
    throw new Error("Responses request requires model");
  }
  if (request.input === void 0) {
    throw new Error("Responses request requires input");
  }
  const messages = [];
  if (request.instructions) {
    messages.push({ role: "system", content: request.instructions });
  }
  if (typeof request.input === "string") {
    messages.push({ role: "user", content: request.input });
  } else {
    if (!Array.isArray(request.input)) {
      throw new Error("Responses input must be a string or an array");
    }
    for (const item of request.input) {
      const itemType = item.type;
      if (itemType === "function_call_output") {
        if (!item.call_id) {
          throw new Error("function_call_output requires call_id");
        }
        if (item.output === void 0) {
          throw new Error("function_call_output requires output");
        }
        messages.push({
          role: "tool",
          content: item.output,
          tool_call_id: item.call_id
        });
      } else if (itemType === "function_call") {
        if (!item.call_id) {
          throw new Error("function_call requires call_id");
        }
        if (!item.name) {
          throw new Error("function_call requires name");
        }
        if (item.arguments === void 0) {
          throw new Error("function_call requires arguments");
        }
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: item.call_id,
              type: "function",
              function: {
                name: item.name,
                arguments: item.arguments
              }
            }
          ]
        });
      } else {
        if (itemType !== void 0 && itemType !== "message") {
          throw new Error(`Unsupported responses input item type: ${itemType}`);
        }
        if (item.content === void 0) {
          throw new Error("message input item requires content");
        }
        messages.push({
          role: item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user",
          content: convertResponseInputContent(item.content)
        });
      }
    }
  }
  const chatRequest = {
    model: request.model,
    messages
  };
  if (request.temperature !== void 0) chatRequest.temperature = request.temperature;
  if (request.top_p !== void 0) chatRequest.top_p = request.top_p;
  if (request.max_output_tokens !== void 0) chatRequest.max_tokens = request.max_output_tokens;
  if (request.stream !== void 0) chatRequest.stream = request.stream;
  if (request.tools !== void 0) chatRequest.tools = request.tools;
  const toolChoice = convertResponseToolChoice(request.tool_choice);
  if (toolChoice !== void 0) chatRequest.tool_choice = toolChoice;
  if (request.previous_response_id !== void 0)
    chatRequest.conversation_id = request.previous_response_id;
  if (request.metadata !== void 0) chatRequest.metadata = request.metadata;
  if (request.kiro_context !== void 0) chatRequest.kiro_context = request.kiro_context;
  return chatRequest;
}
function convertResponseInputContent(content) {
  if (typeof content === "string") return content;
  if (content === void 0) return "";
  if (!Array.isArray(content)) {
    throw new Error("message content must be a string or an array");
  }
  return content.map((part) => {
    const partType = part.type;
    if (partType === "input_image") {
      if (!part.image_url) {
        throw new Error("input_image requires image_url");
      }
      return { type: "image_url", image_url: { url: part.image_url } };
    }
    if (partType === "input_file") {
      if (!part.file_data) {
        throw new Error("input_file requires file_data");
      }
      return {
        type: "file",
        file: {
          file_data: part.file_data,
          ...part.filename !== void 0 ? { filename: part.filename } : {}
        }
      };
    }
    if (partType !== "input_text" && partType !== "output_text") {
      throw new Error(`Unsupported responses content part type: ${partType}`);
    }
    if (part.text === void 0) {
      throw new Error(`${partType} requires text`);
    }
    return { type: "text", text: part.text };
  });
}
function convertResponseToolChoice(toolChoice) {
  if (!toolChoice || typeof toolChoice === "string") return toolChoice;
  if (toolChoice.type === "none" || toolChoice.type === "auto") return toolChoice.type;
  if (toolChoice.type === "function" && toolChoice.name) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  if (toolChoice.function?.name)
    return { type: "function", function: { name: toolChoice.function.name } };
  throw new Error("Unsupported responses tool_choice");
}
function openAIChatToResponsesResponse(response, previousResponseId) {
  const output = response.choices.flatMap(
    (choice) => {
      if (choice.message.tool_calls?.length) {
        return choice.message.tool_calls.map((toolCall) => ({
          type: "function_call",
          id: `fc_${uuid.v4()}`,
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        }));
      }
      return [
        {
          type: "message",
          id: `msg_${uuid.v4()}`,
          role: "assistant",
          content: [{ type: "output_text", text: choice.message.content || "" }]
        }
      ];
    }
  );
  const usage = {
    input_tokens: response.usage.prompt_tokens,
    output_tokens: response.usage.completion_tokens,
    total_tokens: response.usage.total_tokens
  };
  const cachedTokens = response.usage.prompt_tokens_details?.cached_tokens;
  if (cachedTokens !== void 0) {
    usage.input_tokens_details = { cached_tokens: cachedTokens };
  }
  const reasoningTokens = response.usage.completion_tokens_details?.reasoning_tokens;
  if (reasoningTokens !== void 0) {
    usage.output_tokens_details = { reasoning_tokens: reasoningTokens };
  }
  const responsesResponse = {
    id: `resp_${uuid.v4()}`,
    object: "response",
    created_at: response.created,
    model: response.model,
    output,
    usage
  };
  if (previousResponseId !== void 0) {
    responsesResponse.previous_response_id = previousResponseId;
  }
  return responsesResponse;
}
function openaiToKiro(request, profileArn, toolNameRegistry = new ToolNameRegistry()) {
  const modelId = mapModelId(request.model);
  const origin = "AI_EDITOR";
  let systemPrompt = "";
  let systemCachePoint;
  const nonSystemMessages = [];
  for (const msg of request.messages) {
    if (msg.role === "system") {
      systemCachePoint = mergeCachePoint(systemCachePoint, toKiroCachePoint(msg.cache_control));
      if (typeof msg.content === "string") {
        systemPrompt += (systemPrompt ? "\n" : "") + msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          systemCachePoint = mergeCachePoint(systemCachePoint, toKiroCachePoint(part.cache_control));
          if (part.type === "text" && part.text) {
            systemPrompt += (systemPrompt ? "\n" : "") + part.text;
          }
        }
      }
    } else {
      nonSystemMessages.push(msg);
    }
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  systemPrompt = `[Context: Current time is ${timestamp}]

${systemPrompt}`;
  const executionDirective = `
<execution_discipline>
当用户要求执行特定任务时，你必须遵循以下纪律：
1. **目标锁定**：在整个会话中始终牢记用户的原始目标，不要在代码探索过程中迷失方向
2. **行动优先**：优先执行任务而非仅分析或总结，除非用户明确只要求分析
3. **计划执行**：为任务创建明确的步骤计划，逐步执行并标记完成状态
4. **禁止确认性收尾**：在任务未完成前，禁止输出"需要我继续吗？"、"需要深入分析吗？"等确认性问题
5. **持续推进**：如果发现部分任务已完成，立即继续执行剩余未完成的任务
6. **完整交付**：直到所有任务步骤都执行完毕才算完成
</execution_discipline>
`;
  systemPrompt = systemPrompt + "\n\n" + executionDirective;
  const history = [];
  const toolResults = [];
  let currentContent = "";
  let currentCachePoint;
  const images = [];
  const documents = [];
  for (let i = 0; i < nonSystemMessages.length; i++) {
    const msg = nonSystemMessages[i];
    const isLast = i === nonSystemMessages.length - 1;
    if (msg.role === "user") {
      const {
        content: userContent,
        images: userImages,
        documents: userDocuments,
        cachePoint
      } = extractOpenAIContent(msg);
      const mergedContent = userContent || "Continue";
      const messageCachePoint = cachePoint;
      if (isLast) {
        currentContent = mergedContent;
        currentCachePoint = messageCachePoint;
        images.push(...userImages);
        documents.push(...userDocuments);
      } else {
        history.push({
          userInputMessage: {
            content: mergedContent,
            modelId,
            origin,
            images: userImages.length > 0 ? userImages : void 0,
            documents: userDocuments.length > 0 ? userDocuments : void 0,
            ...messageCachePoint ? { cachePoint: messageCachePoint } : {}
          }
        });
      }
    } else if (msg.role === "assistant") {
      let assistantContent = typeof msg.content === "string" ? msg.content : "";
      if (!assistantContent.trim() && msg.tool_calls && msg.tool_calls.length > 0) {
        assistantContent = " ";
      } else if (!assistantContent.trim()) {
        assistantContent = "I understand.";
      }
      const toolUses = [];
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.type === "function") {
            let input = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
            }
            toolUses.push({
              toolUseId: tc.id,
              name: toolNameRegistry.toKiroName(tc.function.name),
              input
            });
          }
        }
      }
      history.push({
        assistantResponseMessage: {
          content: assistantContent,
          toolUses: toolUses.length > 0 ? toolUses : void 0
        }
      });
    } else if (msg.role === "tool") {
      if (msg.tool_call_id) {
        const rawText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        toolResults.push({
          toolUseId: msg.tool_call_id,
          content: [{ text: rawText || "(no output)" }],
          status: "success"
        });
      }
      const nextMsg = nonSystemMessages[i + 1];
      const shouldFlush = !nextMsg || nextMsg.role !== "tool";
      if (shouldFlush && toolResults.length > 0 && !isLast) {
        history.push({
          userInputMessage: {
            content: "Tool results provided.",
            modelId,
            origin,
            userInputMessageContext: {
              toolResults: [...toolResults]
            }
          }
        });
        toolResults.length = 0;
      }
    }
  }
  if (history.length > 0 && history[history.length - 1].assistantResponseMessage && !currentContent) {
    currentContent = "Continue.";
  }
  if (!currentContent && toolResults.length > 0) {
    currentContent = "Tool results provided.";
  }
  if (systemPrompt) {
    const systemMessages = [
      {
        userInputMessage: {
          content: systemPrompt,
          userInputMessageContext: {},
          origin,
          ...systemCachePoint ? { cachePoint: systemCachePoint } : {}
        }
      },
      {
        assistantResponseMessage: {
          content: "I will follow these instructions."
        }
      }
    ];
    history.unshift(...systemMessages);
  }
  const finalContent = currentContent || "Continue.";
  const kiroTools = convertOpenAITools(request.tools, toolNameRegistry);
  if (request.thinking && request.thinking.type !== "disabled" && modelSupportsThinkingParam()) ;
  return buildKiroPayload(
    finalContent,
    modelId,
    origin,
    history,
    kiroTools,
    toolResults,
    images,
    profileArn,
    {
      maxTokens: request.max_tokens,
      temperature: request.temperature,
      topP: request.top_p
    },
    {
      cachePoint: currentCachePoint,
      documents,
      conversationId: request.conversation_id,
      context: request.kiro_context
    }
  );
}
function extractOpenAIContent(msg) {
  const images = [];
  const documents = [];
  let content = "";
  let cachePoint = toKiroCachePoint(msg.cache_control);
  if (typeof msg.content === "string") {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      cachePoint = mergeCachePoint(cachePoint, toKiroCachePoint(part.cache_control));
      if (part.type === "text" && part.text) {
        content += part.text;
      } else if (part.type === "image_url" && part.image_url?.url) {
        const image = parseImageUrl(part.image_url.url);
        if (image) {
          images.push(image);
        }
      } else if (part.type === "file" || part.type === "document") {
        if (part.file?.file_data) {
          const name = part.file.filename || part.name;
          if (!name) {
            throw new Error(`${part.type} requires filename or name`);
          }
          documents.push(parseOpenAIFileData(part.file.file_data, name));
        } else if (part.source) {
          if (!part.name) {
            throw new Error(`${part.type} requires name`);
          }
          documents.push(parseClaudeDocumentSource(part.source, part.name));
        } else {
          throw new Error(`${part.type} requires file_data or source`);
        }
      }
    }
  }
  return { content, images, documents, cachePoint };
}
function parseImageUrl(url2) {
  if (url2.startsWith("data:")) {
    const match = url2.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      return {
        format: normalizeImageFormat(match[1]),
        source: { bytes: match[2] }
      };
    }
  }
  return null;
}
function parseOpenAIFileData(fileData, name) {
  const dataUrlMatch = fileData.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      format: normalizeDocumentFormat(dataUrlMatch[1], name),
      name,
      source: { bytes: dataUrlMatch[2] }
    };
  }
  return {
    format: normalizeDocumentFormat(void 0, name),
    name,
    source: { bytes: fileData }
  };
}
function parseClaudeDocumentSource(source, name) {
  if (source.type === "base64") {
    return {
      format: normalizeDocumentFormat(source.media_type, name),
      name,
      source: { bytes: source.data }
    };
  }
  if (source.type === "text") {
    return {
      format: normalizeDocumentFormat(source.media_type, name),
      name,
      source: { bytes: Buffer.from(source.data, "utf8").toString("base64") }
    };
  }
  throw new Error(`Unsupported document source type: ${source.type}`);
}
function normalizeImageFormat(format) {
  const lower = format.toLowerCase();
  const formatMap = {
    jpg: "jpeg",
    jpeg: "jpeg",
    png: "png",
    gif: "gif",
    webp: "webp"
  };
  const normalized = formatMap[lower];
  if (!normalized) {
    throw new Error(`Unsupported image format: ${format}`);
  }
  return normalized;
}
function normalizeDocumentFormat(mediaType, name) {
  const lowerMediaType = mediaType?.toLowerCase();
  if (lowerMediaType === "application/pdf") return "pdf";
  if (lowerMediaType === "text/markdown") return "md";
  if (lowerMediaType === "text/csv") return "csv";
  if (lowerMediaType === "text/html") return "html";
  if (lowerMediaType?.startsWith("text/")) return "txt";
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "md";
  if (extension === "csv") return "csv";
  if (extension === "html" || extension === "htm") return "html";
  return "txt";
}
const KIRO_MAX_TOOL_DESC_LEN = 10237;
function convertOpenAITools(tools, toolNameRegistry) {
  if (!tools) return [];
  return tools.flatMap((tool) => {
    let description = tool.function.description || `Tool: ${tool.function.name}`;
    if (description.length > KIRO_MAX_TOOL_DESC_LEN) {
      description = description.substring(0, KIRO_MAX_TOOL_DESC_LEN) + "...";
    }
    const kiroTool = {
      toolSpecification: {
        name: shortenToolName(tool.function.name, toolNameRegistry),
        description,
        inputSchema: { json: tool.function.parameters }
      }
    };
    const cachePoint = toKiroCachePoint(tool.cache_control);
    return cachePoint ? [kiroTool, { cachePoint }] : [kiroTool];
  });
}
function shortenToolName(name, toolNameRegistry) {
  return toolNameRegistry.toKiroName(name);
}
function kiroToOpenaiResponse(content, toolUses, usage, model, toolNameRegistry = new ToolNameRegistry(), reasoningContent) {
  const restoredToolUses = toolNameRegistry.restoreToolUses(toolUses);
  const openaiUsage = {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens
  };
  if (usage.cacheReadTokens) {
    openaiUsage.prompt_tokens_details = {
      cached_tokens: usage.cacheReadTokens
    };
  }
  if (usage.reasoningTokens) {
    openaiUsage.completion_tokens_details = {
      reasoning_tokens: usage.reasoningTokens
    };
  }
  const response = {
    id: `chatcmpl-${uuid.v4()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: restoredToolUses.length > 0 || !content?.trim() ? null : content,
          ...reasoningContent?.text ? { reasoning_content: reasoningContent.text } : {},
          tool_calls: restoredToolUses.length > 0 ? restoredToolUses.map((tu) => ({
            id: tu.toolUseId,
            type: "function",
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input)
            }
          })) : void 0
        },
        finish_reason: restoredToolUses.length > 0 ? "tool_calls" : "stop"
      }
    ],
    usage: openaiUsage
  };
  return response;
}
function createOpenaiStreamChunk(id, model, delta, finishReason = null, usage) {
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason
      }
    ]
  };
  if (usage) {
    chunk.usage = usage;
  }
  return chunk;
}
function claudeToKiro(request, profileArn, toolNameRegistry = new ToolNameRegistry()) {
  const modelId = mapModelId(request.model);
  const origin = "AI_EDITOR";
  let systemPrompt = "";
  let systemCachePoint;
  if (typeof request.system === "string") {
    systemPrompt = request.system;
  } else if (Array.isArray(request.system)) {
    systemPrompt = request.system.map((b) => {
      systemCachePoint = mergeCachePoint(systemCachePoint, toKiroCachePoint(b.cache_control));
      return b.text;
    }).join("\n");
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  systemPrompt = `[Context: Current time is ${timestamp}]

${systemPrompt}`;
  const executionDirective = `
<execution_discipline>
当用户要求执行特定任务时，你必须遵循以下纪律：
1. **目标锁定**：在整个会话中始终牢记用户的原始目标，不要在代码探索过程中迷失方向
2. **行动优先**：优先执行任务而非仅分析或总结，除非用户明确只要求分析
3. **计划执行**：为任务创建明确的步骤计划，逐步执行并标记完成状态
4. **禁止确认性收尾**：在任务未完成前，禁止输出"需要我继续吗？"、"需要深入分析吗？"等确认性问题
5. **持续推进**：如果发现部分任务已完成，立即继续执行剩余未完成的任务
6. **完整交付**：直到所有任务步骤都执行完毕才算完成
</execution_discipline>
`;
  systemPrompt = systemPrompt + "\n\n" + executionDirective;
  const history = [];
  let currentToolResults = [];
  let currentContent = "";
  let currentCachePoint;
  const images = [];
  const documents = [];
  let pendingUserContent = "";
  let pendingUserImages = [];
  let pendingUserDocuments = [];
  let pendingToolResults = [];
  let pendingUserCachePoint;
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];
    const isLast = i === request.messages.length - 1;
    if (msg.role === "user") {
      const {
        content: userContent,
        images: userImages,
        documents: userDocuments,
        toolResults: userToolResults,
        cachePoint: userCachePoint
      } = extractClaudeContent(msg);
      if (isLast) {
        currentContent = pendingUserContent ? pendingUserContent + "\n" + userContent : userContent;
        images.push(...pendingUserImages, ...userImages);
        documents.push(...pendingUserDocuments, ...userDocuments);
        currentToolResults = [...pendingToolResults, ...userToolResults];
        currentCachePoint = mergeCachePoint(pendingUserCachePoint, userCachePoint);
        pendingUserContent = "";
        pendingUserImages = [];
        pendingUserDocuments = [];
        pendingToolResults = [];
        pendingUserCachePoint = void 0;
      } else {
        const nextMsg = request.messages[i + 1];
        if (nextMsg && nextMsg.role === "assistant") {
          const finalUserContent = pendingUserContent ? pendingUserContent + "\n" + userContent : userContent;
          const finalUserImages = [...pendingUserImages, ...userImages];
          const finalUserDocuments = [...pendingUserDocuments, ...userDocuments];
          const finalToolResults = [...pendingToolResults, ...userToolResults];
          const finalCachePoint = mergeCachePoint(pendingUserCachePoint, userCachePoint);
          if (finalUserContent.trim() || finalUserImages.length > 0 || finalUserDocuments.length > 0 || finalToolResults.length > 0) {
            const userInputMessage = {
              content: finalUserContent || (finalToolResults.length > 0 ? "Tool results provided." : "Continue"),
              modelId,
              origin,
              images: finalUserImages.length > 0 ? finalUserImages : void 0,
              documents: finalUserDocuments.length > 0 ? finalUserDocuments : void 0,
              ...finalCachePoint ? { cachePoint: finalCachePoint } : {}
            };
            if (finalToolResults.length > 0) {
              userInputMessage.userInputMessageContext = {
                toolResults: finalToolResults
              };
            }
            history.push({ userInputMessage });
          }
          pendingUserContent = "";
          pendingUserImages = [];
          pendingUserDocuments = [];
          pendingToolResults = [];
          pendingUserCachePoint = void 0;
        } else {
          pendingUserContent = pendingUserContent ? pendingUserContent + "\n" + userContent : userContent;
          pendingUserImages.push(...userImages);
          pendingUserDocuments.push(...userDocuments);
          pendingToolResults.push(...userToolResults);
          pendingUserCachePoint = mergeCachePoint(pendingUserCachePoint, userCachePoint);
        }
      }
    } else if (msg.role === "assistant") {
      const { content: assistantContent, toolUses } = extractClaudeAssistantContent(
        msg,
        toolNameRegistry
      );
      if (pendingUserContent.trim() || pendingUserImages.length > 0 || pendingUserDocuments.length > 0 || pendingToolResults.length > 0) {
        const userInputMessage = {
          content: pendingUserContent || (pendingToolResults.length > 0 ? "Tool results provided." : "Continue"),
          modelId,
          origin,
          images: pendingUserImages.length > 0 ? pendingUserImages : void 0,
          documents: pendingUserDocuments.length > 0 ? pendingUserDocuments : void 0,
          ...pendingUserCachePoint ? { cachePoint: pendingUserCachePoint } : {}
        };
        if (pendingToolResults.length > 0) {
          userInputMessage.userInputMessageContext = {
            toolResults: pendingToolResults
          };
        }
        history.push({ userInputMessage });
        pendingUserContent = "";
        pendingUserImages = [];
        pendingUserDocuments = [];
        pendingToolResults = [];
        pendingUserCachePoint = void 0;
      }
      const assistantResponseMessage = {
        content: assistantContent,
        ...toolUses.length > 0 ? { toolUses } : {}
      };
      history.push({ assistantResponseMessage });
    }
  }
  if (pendingUserContent.trim() || pendingUserImages.length > 0 || pendingUserDocuments.length > 0 || pendingToolResults.length > 0) {
    currentContent = pendingUserContent + (currentContent ? "\n" + currentContent : "");
    images.unshift(...pendingUserImages);
    documents.unshift(...pendingUserDocuments);
    currentToolResults = [...pendingToolResults, ...currentToolResults];
    currentCachePoint = mergeCachePoint(pendingUserCachePoint, currentCachePoint);
  }
  if (history.length > 0 && history[0].assistantResponseMessage) {
    history.unshift({
      userInputMessage: {
        content: "Begin conversation",
        modelId,
        origin
      }
    });
  }
  if (systemPrompt) {
    const systemMessages = [
      {
        userInputMessage: {
          content: systemPrompt,
          userInputMessageContext: {},
          origin,
          ...systemCachePoint ? { cachePoint: systemCachePoint } : {}
        }
      },
      {
        assistantResponseMessage: {
          content: "I will follow these instructions."
        }
      }
    ];
    history.unshift(...systemMessages);
  }
  const finalContent = currentContent || (currentToolResults.length > 0 ? "Tool results provided." : "Continue");
  const kiroTools = convertClaudeTools(request.tools, toolNameRegistry);
  if (request.thinking && request.thinking.type !== "disabled" && modelSupportsThinkingParam()) ;
  return buildKiroPayload(
    finalContent,
    modelId,
    origin,
    history,
    kiroTools,
    currentToolResults,
    images,
    profileArn,
    {
      maxTokens: request.max_tokens,
      temperature: request.temperature,
      topP: request.top_p
    },
    {
      cachePoint: currentCachePoint,
      documents,
      conversationId: request.conversation_id,
      context: request.kiro_context
    }
  );
}
function extractClaudeContent(msg) {
  const images = [];
  const documents = [];
  const toolResults = [];
  let content = "";
  let cachePoint = toKiroCachePoint(msg.cache_control);
  if (typeof msg.content === "string") {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      cachePoint = mergeCachePoint(cachePoint, toKiroCachePoint(block.cache_control));
      if (block.type === "text" && block.text) {
        content += block.text;
      } else if (block.type === "image" && block.source?.type === "base64") {
        const mediaTypeParts = block.source.media_type.split("/");
        const imageFormat = mediaTypeParts[1];
        if (mediaTypeParts[0] !== "image" || !imageFormat) {
          throw new Error(`Unsupported image media_type: ${block.source.media_type}`);
        }
        images.push({
          format: normalizeImageFormat(imageFormat),
          source: { bytes: block.source.data }
        });
      } else if (block.type === "document" && block.source) {
        if (!block.name) {
          throw new Error("document requires name");
        }
        documents.push(parseClaudeDocumentSource(block.source, block.name));
      } else if (block.type === "tool_result" && block.tool_use_id) {
        let resultContent = "";
        if (typeof block.content === "string") {
          resultContent = block.content || "(empty)";
        } else if (Array.isArray(block.content)) {
          const textParts = [];
          for (const b of block.content) {
            if (b.type === "text") {
              textParts.push(b.text || "");
            }
          }
          resultContent = textParts.join("") || "(no text output)";
        } else if (block.content === void 0 || block.content === null) {
          resultContent = "(no output)";
        } else {
          resultContent = String(block.content) || "(empty)";
        }
        toolResults.push({
          toolUseId: block.tool_use_id,
          content: [{ text: resultContent }],
          status: "success"
        });
      }
    }
  }
  return { content, images, documents, toolResults, cachePoint };
}
function extractClaudeAssistantContent(msg, toolNameRegistry) {
  const toolUses = [];
  let content = "";
  let thinking = "";
  let signature;
  let redactedContent;
  if (typeof msg.content === "string") {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "text" && block.text) {
        content += block.text;
      } else if (block.type === "thinking" && block.thinking) {
        thinking += block.thinking;
        signature = block.signature || signature;
      } else if (block.type === "redacted_thinking" && block.data) {
        redactedContent = (redactedContent || "") + block.data;
      } else if (block.type === "tool_use" && block.id && block.name) {
        if (!block.input || typeof block.input !== "object" || Array.isArray(block.input)) {
          throw new Error(`tool_use requires object input: ${block.name}`);
        }
        toolUses.push({
          toolUseId: block.id,
          name: toolNameRegistry.toKiroName(block.name),
          input: block.input
        });
      }
    }
  }
  if (!content.trim() && toolUses.length > 0) {
    content = " ";
  }
  if (thinking || redactedContent) {
    const reasoningContent = {};
    if (thinking) {
      reasoningContent.reasoningText = signature ? { text: thinking, signature } : { text: thinking };
    }
    if (redactedContent) {
      reasoningContent.redactedContent = redactedContent;
    }
    return { content, toolUses, reasoningContent };
  }
  return { content, toolUses };
}
function convertClaudeTools(tools, toolNameRegistry) {
  if (!tools) return [];
  return tools.flatMap((tool) => {
    let description = tool.description || `Tool: ${tool.name}`;
    if (description.length > KIRO_MAX_TOOL_DESC_LEN) {
      description = description.substring(0, KIRO_MAX_TOOL_DESC_LEN) + "...";
    }
    const kiroTool = {
      toolSpecification: {
        name: shortenToolName(tool.name, toolNameRegistry),
        description,
        inputSchema: { json: tool.input_schema }
      }
    };
    const cachePoint = toKiroCachePoint(tool.cache_control);
    return cachePoint ? [kiroTool, { cachePoint }] : [kiroTool];
  });
}
function kiroToClaudeResponse(content, toolUses, usage, model, toolNameRegistry = new ToolNameRegistry(), reasoningContent) {
  const contentBlocks = [];
  const restoredToolUses = toolNameRegistry.restoreToolUses(toolUses);
  if (reasoningContent?.text) {
    contentBlocks.push(
      reasoningContent.signature ? {
        type: "thinking",
        thinking: reasoningContent.text,
        signature: reasoningContent.signature
      } : {
        type: "thinking",
        thinking: reasoningContent.text
      }
    );
  }
  if (reasoningContent?.redactedContent) {
    contentBlocks.push({
      type: "redacted_thinking",
      data: reasoningContent.redactedContent
    });
  }
  if (content && content.trim()) {
    contentBlocks.push({ type: "text", text: content });
  }
  for (const tu of restoredToolUses) {
    contentBlocks.push({
      type: "tool_use",
      id: tu.toolUseId,
      name: tu.name,
      input: tu.input
    });
  }
  const claudeUsage = {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens
  };
  if (usage.cacheWriteTokens) {
    claudeUsage.cache_creation_input_tokens = usage.cacheWriteTokens;
  }
  if (usage.cacheReadTokens) {
    claudeUsage.cache_read_input_tokens = usage.cacheReadTokens;
  }
  const response = {
    id: `msg_${uuid.v4()}`,
    type: "message",
    role: "assistant",
    content: contentBlocks,
    model,
    stop_reason: restoredToolUses.length > 0 ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: claudeUsage
  };
  return response;
}
function createClaudeStreamEvent(type, data) {
  return { type, ...data };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJsonObject(content, path2) {
  const parsed = JSON.parse(path2.endsWith(".jsonc") ? stripJsonc(content) : content);
  if (!isRecord(parsed)) {
    throw new Error(`${path2} root must be a JSON object`);
  }
  return parsed;
}
function stripJsonc(content) {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < content.length; index++) {
    const current = content[index];
    const next = content[index + 1];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }
    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < content.length && content[index] !== "\n") index++;
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < content.length && !(content[index] === "*" && content[index + 1] === "/")) index++;
      index++;
      continue;
    }
    output += current;
  }
  return removeTrailingJsonCommas(output);
}
function removeTrailingJsonCommas(content) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < content.length; index++) {
    const current = content[index];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(content[nextIndex] || "")) nextIndex++;
      if (content[nextIndex] === "}" || content[nextIndex] === "]") continue;
    }
    output += current;
  }
  return output;
}
function escapeTomlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function outputLimit(model) {
  if (typeof model.maxOutputTokens === "number" && model.maxOutputTokens > 0) return model.maxOutputTokens;
  if (model.id.toLowerCase().includes("haiku")) return 8192;
  return 32e3;
}
function contextLimit(model) {
  if (typeof model.maxInputTokens === "number" && model.maxInputTokens > 0) return model.maxInputTokens;
  return 2e5;
}
function inputModalities(model) {
  const values = /* @__PURE__ */ new Set(["text"]);
  for (const item of model.inputTypes ?? []) {
    const lower = item.toLowerCase();
    if (lower.includes("image")) values.add("image");
    if (lower.includes("pdf") || lower.includes("document") || lower.includes("file")) values.add("pdf");
  }
  return Array.from(values);
}
function buildProxyOrigin(input) {
  const host = input.host === "0.0.0.0" ? "127.0.0.1" : input.host === "::" ? "::1" : input.host;
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${input.tlsEnabled ? "https" : "http"}://${urlHost}:${input.port}`;
}
async function exists(path2) {
  return promises.access(path2, fs.constants.F_OK).then(() => true, () => false);
}
async function backupIfExists(path2) {
  if (!await exists(path2)) return [];
  const backupPath = `${path2}.kiro-backup-${Date.now()}`;
  await promises.copyFile(path2, backupPath);
  return [backupPath];
}
async function readJsonObject(path2) {
  if (!await exists(path2)) return {};
  return parseJsonObject(await promises.readFile(path2, "utf-8"), path2);
}
async function writeJsonObject(path$1, value) {
  await promises.mkdir(path.dirname(path$1), { recursive: true });
  const backupPaths = await backupIfExists(path$1);
  await promises.writeFile(path$1, `${JSON.stringify(value, null, 2)}
`, "utf-8");
  return backupPaths;
}
async function writeText(path$1, value) {
  await promises.mkdir(path.dirname(path$1), { recursive: true });
  const backupPaths = await backupIfExists(path$1);
  await promises.writeFile(path$1, value.endsWith("\n") ? value : `${value}
`, "utf-8");
  return backupPaths;
}
function getClaudeSettingsPath() {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const legacyPath = path.join(os.homedir(), ".claude", "claude.json");
  return fs.existsSync(settingsPath) || !fs.existsSync(legacyPath) ? settingsPath : legacyPath;
}
function getOpenCodeConfigPath() {
  const dir = path.join(os.homedir(), ".config", "opencode");
  const candidates = [path.join(dir, "opencode.jsonc"), path.join(dir, "opencode.json"), path.join(dir, "config.json")];
  return candidates.find((path2) => fs.existsSync(path2)) || candidates[1];
}
function getCodexAuthPath() {
  return path.join(os.homedir(), ".codex", "auth.json");
}
function getCodexConfigPath() {
  return path.join(os.homedir(), ".codex", "config.toml");
}
function ensureObjectField(target, key) {
  if (!isRecord(target[key])) target[key] = {};
  return target[key];
}
async function configureClaudeCode(context) {
  const path2 = getClaudeSettingsPath();
  const config = await readJsonObject(path2);
  const env = ensureObjectField(config, "env");
  env.ANTHROPIC_BASE_URL = context.proxyOrigin;
  env.ANTHROPIC_AUTH_TOKEN = context.apiKey;
  env.ANTHROPIC_API_KEY = context.apiKey;
  env.ANTHROPIC_MODEL = context.modelId;
  const haikuModel = context.models.find((m) => m.id.toLowerCase().includes("haiku"))?.id || "claude-haiku-4.5";
  const opusModel = context.models.find((m) => m.id.toLowerCase().includes("opus"))?.id || context.modelId;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = haikuModel;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = opusModel;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = context.modelId;
  return { paths: [path2], backupPaths: await writeJsonObject(path2, config) };
}
function openCodeModelConfig(model) {
  const modalities = inputModalities(model);
  return {
    name: model.name || model.id,
    attachment: modalities.some((item) => item !== "text"),
    reasoning: false,
    temperature: true,
    tool_call: true,
    limit: {
      context: contextLimit(model),
      output: outputLimit(model)
    },
    modalities: {
      input: modalities,
      output: ["text"]
    }
  };
}
async function configureOpenCode(context) {
  const path2 = getOpenCodeConfigPath();
  const config = await readJsonObject(path2);
  const provider = ensureObjectField(config, "provider");
  provider.kiro = {
    npm: "@ai-sdk/openai-compatible",
    name: "Kiro Proxy",
    options: {
      baseURL: context.openaiBaseUrl,
      apiKey: context.apiKey
    },
    models: Object.fromEntries(context.models.map((model) => [model.id, openCodeModelConfig(model)]))
  };
  config.$schema = typeof config.$schema === "string" ? config.$schema : "https://opencode.ai/config.json";
  config.model = `kiro/${context.modelId}`;
  if (typeof config.small_model !== "string" || config.small_model.startsWith("kiro/")) {
    config.small_model = `kiro/${context.modelId}`;
  }
  if (Array.isArray(config.enabled_providers) && !config.enabled_providers.includes("kiro")) {
    config.enabled_providers = [...config.enabled_providers, "kiro"];
  }
  return { paths: [path2], backupPaths: await writeJsonObject(path2, config) };
}
function upsertRootTomlString(content, key, value) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.length === 0 ? [] : content.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const rootEnd = sectionIndex === -1 ? lines.length : sectionIndex;
  const nextLines = [];
  let written = false;
  for (let index = 0; index < lines.length; index++) {
    if (index < rootEnd && new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      if (!written) {
        nextLines.push(`${key} = "${escapeTomlString(value)}"`);
        written = true;
      }
      continue;
    }
    if (!written && index === rootEnd) {
      nextLines.push(`${key} = "${escapeTomlString(value)}"`);
      written = true;
    }
    nextLines.push(lines[index]);
  }
  if (!written) nextLines.push(`${key} = "${escapeTomlString(value)}"`);
  return nextLines.join(newline);
}
function removeTomlSection(content, section) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.length === 0 ? [] : content.split(/\r?\n/);
  const nextLines = [];
  let skipping = false;
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const line of lines) {
    if (new RegExp(`^\\s*\\[${escapedSection}\\]\\s*$`).test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) skipping = false;
    if (!skipping) nextLines.push(line);
  }
  return nextLines.join(newline).trimEnd();
}
function upsertCodexConfig(content, context) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const withProvider = upsertRootTomlString(upsertRootTomlString(content, "model_provider", "kiro"), "model", context.modelId);
  const withoutKiro = removeTomlSection(removeTomlSection(withProvider, "model_providers.kiro"), 'model_providers."kiro"');
  const separator = withoutKiro.trim() ? `${newline}${newline}` : "";
  return `${withoutKiro.trimEnd()}${separator}[model_providers.kiro]${newline}name = "Kiro Proxy"${newline}base_url = "${escapeTomlString(context.openaiBaseUrl)}"${newline}wire_api = "responses"${newline}`;
}
async function configureCodex(context) {
  const authPath = getCodexAuthPath();
  const configPath = getCodexConfigPath();
  const auth = await readJsonObject(authPath);
  auth.OPENAI_API_KEY = context.apiKey;
  const authBackups = await writeJsonObject(authPath, auth);
  const config = await exists(configPath) ? await promises.readFile(configPath, "utf-8") : "";
  const configBackups = await writeText(configPath, upsertCodexConfig(config, context));
  return { paths: [authPath, configPath], backupPaths: [...authBackups, ...configBackups] };
}
function getGeminiEnvPath() {
  return path.join(os.homedir(), ".gemini", ".env");
}
function getGeminiSettingsPath() {
  return path.join(os.homedir(), ".gemini", "settings.json");
}
function buildEnvContent(entries) {
  return Object.entries(entries).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
}
function parseEnvFile(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) result[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
  }
  return result;
}
async function configureGemini(context) {
  const envPath = getGeminiEnvPath();
  const settingsPath = getGeminiSettingsPath();
  const allPaths = [envPath, settingsPath];
  const allBackups = [];
  const existingEnv = await exists(envPath) ? parseEnvFile(await promises.readFile(envPath, "utf-8")) : {};
  existingEnv.GEMINI_API_KEY = context.apiKey;
  existingEnv.GOOGLE_GEMINI_BASE_URL = `${context.proxyOrigin}/v1beta`;
  existingEnv.GEMINI_MODEL = context.modelId;
  allBackups.push(...await writeText(envPath, buildEnvContent(existingEnv)));
  const settings = await readJsonObject(settingsPath);
  const security = ensureObjectField(settings, "security");
  const auth = ensureObjectField(security, "auth");
  auth.selectedType = "gemini-api-key";
  allBackups.push(...await writeJsonObject(settingsPath, settings));
  return { paths: allPaths, backupPaths: allBackups };
}
function getHermesConfigPath() {
  return path.join(os.homedir(), ".hermes", "config.yaml");
}
async function configureHermes(context) {
  const configPath = getHermesConfigPath();
  const existing = await exists(configPath) ? await promises.readFile(configPath, "utf-8") : "";
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const modelsYaml = context.models.map((m) => {
    const ctx = typeof m.maxInputTokens === "number" && m.maxInputTokens > 0 ? m.maxInputTokens : 2e5;
    return `      ${m.id}:${newline}        context_length: ${ctx}`;
  }).join(newline);
  const providerBlock = [
    `  - name: kiro`,
    `    base_url: ${context.openaiBaseUrl}`,
    `    api_key: ${context.apiKey}`,
    `    model: ${context.modelId}`,
    `    models:`,
    modelsYaml
  ].join(newline);
  let content = existing;
  const kiroProviderRegex = /^\s*- name:\s*kiro\b[\s\S]*?(?=^\s*- name:|^[a-z]|$)/gm;
  if (kiroProviderRegex.test(content)) {
    content = content.replace(kiroProviderRegex, providerBlock + newline);
  } else if (content.includes("custom_providers:")) {
    content = content.replace(/(custom_providers:\s*)/, `$1${newline}${providerBlock}${newline}`);
  } else {
    content = `${content.trimEnd()}${newline}${newline}custom_providers:${newline}${providerBlock}${newline}`;
  }
  const modelSection = `model:${newline}  default: "kiro/${context.modelId}"${newline}  provider: "kiro"${newline}`;
  if (/^model:/m.test(content)) {
    content = content.replace(/^model:.*(?:\n(?=\s).*)*$/m, modelSection.trimEnd());
  } else {
    content = `${content.trimEnd()}${newline}${newline}${modelSection}`;
  }
  const backups = await writeText(configPath, content);
  return { paths: [configPath], backupPaths: backups };
}
function getOpenClawConfigPath() {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}
async function configureOpenClaw(context) {
  const configPath = getOpenClawConfigPath();
  const config = await readJsonObject(configPath);
  const models = ensureObjectField(config, "models");
  if (typeof models.mode !== "string") models.mode = "merge";
  const providers = ensureObjectField(models, "providers");
  providers.kiro = {
    base_url: context.openaiBaseUrl,
    api_key: context.apiKey,
    api: "openai-chat",
    models: context.models.map((m) => ({ id: m.id, name: m.name || m.id, context_window: typeof m.maxInputTokens === "number" && m.maxInputTokens > 0 ? m.maxInputTokens : 2e5 }))
  };
  const agents = ensureObjectField(config, "agents");
  const defaults = ensureObjectField(agents, "defaults");
  defaults.model = { primary: `kiro/${context.modelId}`, fallbacks: [] };
  const backups = await writeJsonObject(configPath, config);
  return { paths: [configPath], backupPaths: backups };
}
const ALL_CLIENT_TARGETS = ["claudeCode", "opencode", "codex", "gemini", "hermes", "openclaw"];
async function configureClient(client, context) {
  try {
    const result = client === "claudeCode" ? await configureClaudeCode(context) : client === "opencode" ? await configureOpenCode(context) : client === "codex" ? await configureCodex(context) : client === "gemini" ? await configureGemini(context) : client === "hermes" ? await configureHermes(context) : await configureOpenClaw(context);
    return { client, success: true, ...result };
  } catch (error) {
    return { client, success: false, paths: [], backupPaths: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function configureProxyClients(input) {
  const modelId = input.modelId.trim();
  const apiKey = input.apiKey?.trim();
  if (!Array.isArray(input.clients)) throw new Error("Client targets are required");
  const clients = Array.from(new Set(input.clients));
  if (!modelId) throw new Error("Model is required");
  if (!apiKey) throw new Error("API Key is required");
  if (clients.length === 0) throw new Error("At least one client is required");
  if (clients.some((client) => !ALL_CLIENT_TARGETS.includes(client))) throw new Error("Unsupported client target");
  const proxyOrigin = buildProxyOrigin(input);
  const modelMap = new Map((input.models?.length ? input.models : [{ id: modelId, name: input.modelName || modelId }]).map((model) => [model.id, model]));
  if (!modelMap.has(modelId)) modelMap.set(modelId, { id: modelId, name: input.modelName || modelId });
  const context = {
    proxyOrigin,
    openaiBaseUrl: `${proxyOrigin.replace(/\/$/, "")}/v1`,
    apiKey,
    modelId,
    models: Array.from(modelMap.values())
  };
  const results = [];
  for (const client of clients) {
    results.push(await configureClient(client, context));
  }
  return { success: results.every((result) => result.success), proxyOrigin, openaiBaseUrl: context.openaiBaseUrl, results };
}
const DEFAULT_CACHE_TTL = 5 * 60 * 1e3;
const ONE_HOUR_CACHE_TTL = 60 * 60 * 1e3;
const DEFAULT_MIN_CACHEABLE_TOKENS = 1024;
const OPUS_MIN_CACHEABLE_TOKENS = 4096;
const MAX_CACHE_RATIO = 0.85;
const MAX_ENTRIES_PER_ACCOUNT = 200;
const PRUNE_INTERVAL = 60 * 1e3;
class PromptCacheTracker {
  entriesByAccount = /* @__PURE__ */ new Map();
  lastPrune = Date.now();
  // 从 Claude 请求构建缓存 profile
  buildClaudeProfile(system, messages, tools, totalInputTokens, model) {
    const blocks = this.flattenCacheBlocks(system, messages, tools);
    if (blocks.length === 0) return null;
    const hasher = crypto$1.createHash("sha256");
    const breakpoints = [];
    let cumulativeTokens = 0;
    let activeTTL = 0;
    for (const block of blocks) {
      this.hashChunk(hasher, block.value);
      cumulativeTokens += block.tokens;
      let breakpointTTL = 0;
      if (block.ttl > 0) {
        breakpointTTL = block.ttl;
        activeTTL = block.ttl;
      } else if (block.isMessageEnd && activeTTL > 0) {
        breakpointTTL = activeTTL;
      }
      if (breakpointTTL <= 0) continue;
      breakpoints.push({
        fingerprint: hasher.copy().digest("hex"),
        cumulativeTokens,
        ttl: breakpointTTL
      });
    }
    if (breakpoints.length === 0) return null;
    return {
      breakpoints,
      totalInputTokens: Math.max(totalInputTokens, cumulativeTokens),
      model
    };
  }
  // 计算缓存命中情况
  compute(accountId, profile) {
    if (!profile || profile.breakpoints.length === 0 || !accountId) {
      return { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, cacheCreation5mTokens: 0, cacheCreation1hTokens: 0 };
    }
    const minTokens = this.minCacheableTokens(profile.model);
    const last = profile.breakpoints[profile.breakpoints.length - 1];
    let lastTokens = Math.min(last.cumulativeTokens, profile.totalInputTokens);
    const now = Date.now();
    this.pruneIfNeeded(now);
    const entries = this.entriesByAccount.get(accountId);
    if (!entries || entries.size === 0) {
      const effectiveCreation = lastTokens >= minTokens ? lastTokens : 0;
      const [cache5m2, cache1h2] = this.computeTTLBreakdown(profile, 0);
      return {
        cacheCreationInputTokens: effectiveCreation,
        cacheReadInputTokens: 0,
        cacheCreation5mTokens: cache5m2,
        cacheCreation1hTokens: cache1h2
      };
    }
    const maxCacheable = Math.floor(profile.totalInputTokens * MAX_CACHE_RATIO);
    if (lastTokens > maxCacheable) lastTokens = maxCacheable;
    let matchedTokens = 0;
    for (let i = profile.breakpoints.length - 1; i >= 0; i--) {
      const bp = profile.breakpoints[i];
      if (bp.cumulativeTokens < minTokens) continue;
      const entry = entries.get(bp.fingerprint);
      if (!entry || entry.expiresAt < now) continue;
      entry.expiresAt = now + entry.ttl;
      matchedTokens = Math.min(bp.cumulativeTokens, profile.totalInputTokens);
      if (matchedTokens > lastTokens) matchedTokens = lastTokens;
      break;
    }
    const creation = Math.max(lastTokens - matchedTokens, 0);
    const [cache5m, cache1h] = this.computeTTLBreakdown(profile, matchedTokens);
    return {
      cacheCreationInputTokens: creation,
      cacheReadInputTokens: matchedTokens,
      cacheCreation5mTokens: cache5m,
      cacheCreation1hTokens: cache1h
    };
  }
  // 更新缓存条目（请求成功后调用）
  update(accountId, profile) {
    if (!profile || profile.breakpoints.length === 0 || !accountId) return;
    const minTokens = this.minCacheableTokens(profile.model);
    const now = Date.now();
    let entries = this.entriesByAccount.get(accountId);
    if (!entries) {
      entries = /* @__PURE__ */ new Map();
      this.entriesByAccount.set(accountId, entries);
    }
    for (const bp of profile.breakpoints) {
      if (bp.cumulativeTokens < minTokens) continue;
      entries.set(bp.fingerprint, {
        expiresAt: now + bp.ttl,
        ttl: bp.ttl
      });
    }
    if (entries.size > MAX_ENTRIES_PER_ACCOUNT) {
      const sorted = [...entries.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toDelete = sorted.slice(0, entries.size - MAX_ENTRIES_PER_ACCOUNT);
      for (const [key] of toDelete) entries.delete(key);
    }
  }
  // 清除所有缓存
  clear() {
    const count = this.totalEntries();
    this.entriesByAccount.clear();
    return count;
  }
  totalEntries() {
    let count = 0;
    for (const entries of this.entriesByAccount.values()) count += entries.size;
    return count;
  }
  // ============ 内部方法 ============
  flattenCacheBlocks(system, messages, tools) {
    const blocks = [];
    if (tools) {
      for (const tool of tools) {
        const value = this.canonicalize({ kind: "tool", name: tool.name, description: tool.description, input_schema: tool.input_schema });
        blocks.push({
          value,
          tokens: estimateTokens(value),
          ttl: this.extractTTL(tool),
          isMessageEnd: false
        });
      }
    }
    this.appendSystemBlocks(blocks, system);
    for (let i = 0; i < messages.length; i++) {
      this.appendMessageBlocks(blocks, messages[i], i);
    }
    return blocks;
  }
  appendSystemBlocks(blocks, system) {
    if (!system) return;
    if (typeof system === "string") {
      const value = this.canonicalize({ kind: "system", type: "text", text: system });
      blocks.push({ value, tokens: estimateTokens(system), ttl: 0, isMessageEnd: false });
    } else if (Array.isArray(system)) {
      for (const block of system) {
        const obj = typeof block === "string" ? { type: "text", text: block } : block;
        const value = this.canonicalize({ kind: "system", block: obj });
        const text = obj.text || "";
        blocks.push({
          value,
          tokens: estimateTokens(text || JSON.stringify(obj)),
          ttl: this.extractTTL(obj),
          isMessageEnd: false
        });
      }
    }
  }
  appendMessageBlocks(blocks, msg, messageIndex) {
    const content = msg.content;
    if (typeof content === "string") {
      const value = this.canonicalize({ kind: "message", role: msg.role, index: messageIndex, type: "text", text: content });
      blocks.push({
        value,
        tokens: estimateTokens(content),
        ttl: this.extractTTL(msg),
        isMessageEnd: true
      });
    } else if (Array.isArray(content)) {
      const lastIdx = content.length - 1;
      for (let i = 0; i < content.length; i++) {
        const block = content[i];
        const text = block.text || block.thinking || "";
        const value = this.canonicalize({ kind: "message", role: msg.role, index: messageIndex, blockIndex: i, block });
        blocks.push({
          value,
          tokens: estimateTokens(text || JSON.stringify(block)),
          ttl: this.extractTTL(block),
          isMessageEnd: i === lastIdx
        });
      }
    }
  }
  extractTTL(obj) {
    if (!obj || typeof obj !== "object") return 0;
    const record = obj;
    const cacheControl = record.cache_control;
    if (!cacheControl) return 0;
    if (String(cacheControl.type).toLowerCase() !== "ephemeral") return 0;
    const ttlValue = cacheControl.ttl;
    if (ttlValue === "1h" || ttlValue === "1H") return ONE_HOUR_CACHE_TTL;
    if (typeof ttlValue === "number" && ttlValue > 0) return ttlValue * 1e3;
    return DEFAULT_CACHE_TTL;
  }
  canonicalize(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }
  hashChunk(hasher, chunk) {
    hasher.update(`${chunk.length}\0${chunk}\0`);
  }
  minCacheableTokens(model) {
    return model.toLowerCase().includes("opus") ? OPUS_MIN_CACHEABLE_TOKENS : DEFAULT_MIN_CACHEABLE_TOKENS;
  }
  computeTTLBreakdown(profile, matchedTokens) {
    let cache5m = 0;
    let cache1h = 0;
    let previous = matchedTokens;
    for (const bp of profile.breakpoints) {
      const current = Math.min(bp.cumulativeTokens, profile.totalInputTokens);
      if (current <= previous) continue;
      const delta = current - previous;
      if (bp.ttl >= ONE_HOUR_CACHE_TTL) {
        cache1h += delta;
      } else {
        cache5m += delta;
      }
      previous = current;
    }
    return [cache5m, cache1h];
  }
  pruneIfNeeded(now) {
    if (now - this.lastPrune < PRUNE_INTERVAL) return;
    this.lastPrune = now;
    for (const [accountId, entries] of this.entriesByAccount) {
      for (const [fp, entry] of entries) {
        if (entry.expiresAt < now) entries.delete(fp);
      }
      if (entries.size === 0) this.entriesByAccount.delete(accountId);
    }
  }
}
const promptCacheTracker = new PromptCacheTracker();
function modelDisplayName(id, modelName) {
  if (modelName?.trim()) return modelName;
  return id.split("-").filter(Boolean).map(
    (part) => part === "gpt" ? "GPT" : part === "ai" ? "AI" : part[0]?.toUpperCase() + part.slice(1)
  ).join(" ");
}
function modelFamily(id) {
  const lower = id.toLowerCase();
  if (lower.includes("opus")) return "claude-opus";
  if (lower.includes("sonnet")) return "claude-sonnet";
  if (lower.includes("haiku")) return "claude-haiku";
  if (lower.includes("gpt-4o")) return "gpt-4o";
  if (lower.includes("gpt-4")) return "gpt-4";
  if (lower.includes("gpt-3.5")) return "gpt-3.5";
  if (lower.includes("glm")) return "glm";
  if (lower === "auto") return "auto";
  return lower.split(/[.-]/).slice(0, 2).join("-") || lower;
}
function modelOutputLimit(id, output) {
  if (typeof output === "number" && output > 0) return output;
  const lower = id.toLowerCase();
  if (lower.includes("haiku") || lower.includes("gpt-3.5")) return 8192;
  return 32e3;
}
function modelInputModalities(inputTypes) {
  const values = /* @__PURE__ */ new Set(["text"]);
  for (const item of inputTypes ?? []) {
    const lower = item.toLowerCase();
    if (lower.includes("image")) values.add("image");
    if (lower.includes("pdf") || lower.includes("document") || lower.includes("file"))
      values.add("pdf");
    if (lower.includes("audio")) values.add("audio");
    if (lower.includes("video")) values.add("video");
  }
  return Array.from(values);
}
function modelCapabilityMap(modalities) {
  return {
    text: modalities.includes("text"),
    audio: modalities.includes("audio"),
    image: modalities.includes("image"),
    video: modalities.includes("video"),
    pdf: modalities.includes("pdf")
  };
}
const MODEL_PRICING = {
  "claude-sonnet-4.5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4.5": { input: 1, output: 5 },
  "deepseek-3.2": { input: 0.252, output: 0.378 },
  "minimax-m2.5": { input: 0.15, output: 1.15 },
  "minimax-m2.1": { input: 0.3, output: 1.2 },
  "glm-5": { input: 0.6, output: 1.92 },
  "qwen3-coder-next": { input: 0.11, output: 0.8 },
  "claude-3.7-sonnet": { input: 3, output: 15 }
};
function normalizeModelIdForPricing(model) {
  return (model || "").toLowerCase().replace(/^anthropic\./, "").replace(/-v\d+:\d+$/, "").replace(/_/g, "-");
}
function calculateTokenCost(model, inputTokens, outputTokens) {
  const normalized = normalizeModelIdForPricing(model);
  const pricingKey = Object.keys(MODEL_PRICING).find((key) => normalized.includes(key));
  if (!pricingKey) return 0;
  const pricing = MODEL_PRICING[pricingKey];
  return inputTokens / 1e6 * pricing.input + outputTokens / 1e6 * pricing.output;
}
function extractThinkingEfforts(schema) {
  if (!schema) return void 0;
  const props = schema.properties;
  if (!props?.thinking) return void 0;
  const thinking = props.thinking;
  const thinkingProps = thinking.properties;
  const typeField = thinkingProps?.type;
  const enumValues = typeField?.enum;
  if (enumValues?.includes("adaptive") || enumValues?.includes("disabled")) {
    const effortField = props.output_config?.properties;
    const effortEnum = effortField?.effort?.enum;
    return effortEnum || void 0;
  }
  return void 0;
}
function buildClientModel(input) {
  const name = modelDisplayName(input.id, input.modelName);
  const inputModalities2 = modelInputModalities(input.supportedInputTypes);
  const outputModalities = ["text"];
  const output = modelOutputLimit(input.id, input.maxOutputTokens);
  const context = typeof input.maxInputTokens === "number" && input.maxInputTokens > 0 ? input.maxInputTokens : 2e5;
  const reasoning = false;
  const interleaved = false;
  return {
    id: input.id,
    object: "model",
    created: input.created,
    owned_by: input.ownedBy,
    name,
    description: input.description || name,
    model_name: input.modelName || name,
    family: modelFamily(input.id),
    release_date: "",
    attachment: inputModalities2.some((item) => item !== "text"),
    reasoning,
    temperature: true,
    tool_call: true,
    interleaved,
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    limit: {
      context,
      ...typeof input.maxInputTokens === "number" && input.maxInputTokens > 0 ? { input: input.maxInputTokens } : {},
      output
    },
    modalities: { input: inputModalities2, output: outputModalities },
    capabilities: {
      temperature: true,
      reasoning,
      attachment: inputModalities2.some((item) => item !== "text"),
      toolcall: true,
      input: modelCapabilityMap(inputModalities2),
      output: modelCapabilityMap(outputModalities),
      interleaved
    },
    context_length: context,
    max_tokens: output,
    ...typeof input.maxInputTokens === "number" && input.maxInputTokens > 0 ? { max_input_tokens: input.maxInputTokens } : {},
    max_output_tokens: output,
    inputTypes: input.supportedInputTypes,
    rateMultiplier: input.rateMultiplier,
    rateUnit: input.rateUnit,
    supportsThinking: !!input.additionalModelRequestFieldsSchema?.properties?.thinking,
    thinkingEfforts: extractThinkingEfforts(input.additionalModelRequestFieldsSchema),
    supportsPromptCaching: input.promptCaching?.supportsPromptCaching || false,
    modelProvider: input.modelProvider || void 0,
    permission: [],
    root: input.id,
    parent: null
  };
}
class BodyTooLargeError extends Error {
  constructor(received, limit) {
    super(`Request body too large: ${received} bytes exceeds limit of ${limit} bytes`);
    this.received = received;
    this.limit = limit;
    this.name = "BodyTooLargeError";
  }
  received;
  limit;
}
class ProxyServer {
  server = null;
  fallbackServer = null;
  // HTTPS 启用时同时监听 HTTP（可选）
  accountPool;
  config;
  stats;
  sessionStats;
  events;
  refreshingTokens = /* @__PURE__ */ new Set();
  // 防止并发刷新
  isHttps = false;
  isStopping = false;
  activeRequests = /* @__PURE__ */ new Set();
  sockets = /* @__PURE__ */ new Set();
  /** P1-7 按 API Key/IP 的滑动窗口限流（每分钟桶） */
  rateLimitBuckets = /* @__PURE__ */ new Map();
  /** P1-8 会话粘性：session hint → accountId 的映射（10 分钟 TTL） */
  sessionAffinity = /* @__PURE__ */ new Map();
  /** P2-17 审计日志（最近 200 条） */
  auditLog = [];
  /** Webhook 触发回调（由外部注入，避免 main → renderer 循环依赖） */
  webhookTrigger;
  /** 定期清理 timer */
  cleanupTimer = null;
  /**
   * 从请求中提取 session hint，用于稳定 conversationId
   * 优先级 1：显式稳定 ID（header）
   * 优先级 2：请求体中的会话相关字段（body）
   * 优先级 3：返回 undefined（由 kiroApi 用 history fingerprint 兜底）
   */
  static extractSessionHint(req, body) {
    const b = body && typeof body === "object" ? body : {};
    const h = req.headers;
    const headerHint = h["x-claude-code-session-id"] || h["x-opencode-session"] || h["x-session-affinity"] || h["x-conversation-id"];
    if (headerHint) return headerHint;
    const bodyHint = b.prompt_cache_key || b.promptCacheKey || b.conversation_id || b.conversationId || b.thread_id || b.threadId || b.session_id || b.sessionId;
    if (bodyHint) return bodyHint;
    const metadata = b.metadata;
    if (metadata) {
      const metaHint = metadata.session_id || metadata.conversation_id;
      if (metaHint) return metaHint;
    }
    return void 0;
  }
  constructor(config = {}, events = {}) {
    this.config = {
      enabled: false,
      port: 5580,
      host: "127.0.0.1",
      enableMultiAccount: true,
      selectedAccountIds: [],
      logRequests: true,
      maxConcurrent: 10,
      maxRetries: 3,
      retryDelayMs: 1e3,
      tokenRefreshBeforeExpiry: 300,
      // 5分钟提前刷新
      autoStart: false,
      // 是否自动启动
      enableServerSideToolAutoContinue: false,
      clientDrivenToolExecution: true,
      ...config
    };
    this.accountPool = new AccountPool();
    this.accountPool.setStrategy(this.config.accountSelectionStrategy || "round-robin");
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCredits: 0,
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      startTime: Date.now(),
      accountStats: /* @__PURE__ */ new Map(),
      endpointStats: /* @__PURE__ */ new Map(),
      modelStats: /* @__PURE__ */ new Map(),
      recentRequests: []
    };
    this.sessionStats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      startTime: 0
    };
    this.events = events;
  }
  /**
   * 检测当前绑定地址是否会暴露到本机以外
   * 0.0.0.0 / :: / 网卡地址 → true；127.0.0.1 / ::1 / localhost → false
   */
  isBindingExternal(host) {
    if (!host) return false;
    const h = host.toLowerCase().trim();
    return h === "0.0.0.0" || h === "::" || h === "*" || h !== "127.0.0.1" && h !== "::1" && h !== "localhost";
  }
  // 启动服务器
  async start() {
    if (this.server) {
      console.log("[ProxyServer] Server already running");
      return;
    }
    if (this.isBindingExternal(this.config.host)) {
      const hasAnyKey = (this.config.apiKeys?.some((k) => k.enabled && k.key) ?? false) || !!this.config.apiKey;
      if (!hasAnyKey && !this.config.allowExternalWithoutApiKey) {
        const err = new Error(
          `[Security] Refused to start: host=${this.config.host} exposes to network but no API Key configured. Set at least one API Key, or change host to 127.0.0.1, or set allowExternalWithoutApiKey=true (NOT RECOMMENDED).`
        );
        console.error("[ProxyServer]", err.message);
        this.events.onError?.(err);
        throw err;
      }
      if (!hasAnyKey) {
        console.warn(
          `[ProxyServer] [Security] WARNING: binding to ${this.config.host} without API Key (allowExternalWithoutApiKey=true). This exposes your accounts to the network!`
        );
      }
    }
    return new Promise((resolve, reject) => {
      this.isStopping = false;
      const requestHandler = (req, res) => this.handleRequest(req, res);
      if (this.config.tls?.enabled) {
        try {
          const tlsOptions = this.getTlsOptions();
          this.server = https.createServer(tlsOptions, requestHandler);
          this.isHttps = true;
        } catch (error) {
          reject(new Error(`TLS configuration error: ${error.message}`));
          return;
        }
      } else {
        this.server = http.createServer(requestHandler);
        this.isHttps = false;
      }
      this.server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(`[ProxyServer] Port ${this.config.port} is already in use`);
          reject(new Error(`Port ${this.config.port} is already in use`));
        } else {
          console.error("[ProxyServer] Server error:", error);
          reject(error);
        }
        this.events.onError?.(error);
      });
      this.server.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
        socket.on("drain", () => {
          if (socket.writableLength > 0) {
            proxyLogger.debug("ProxyServer", `Socket drain: bufferedLen=${socket.writableLength}`);
          }
        });
      });
      this.server.on("close", () => {
        if (!this.isStopping && this.config.autoStart && this.config.enabled) {
          console.log("[ProxyServer] Server closed unexpectedly, attempting restart in 3s...");
          setTimeout(() => {
            if (!this.isStopping && this.config.autoStart && !this.isRunning()) {
              console.log("[ProxyServer] Auto-restarting...");
              this.start().catch((err) => {
                console.error("[ProxyServer] Auto-restart failed:", err);
              });
            }
          }, 3e3);
        }
      });
      const keepAliveMs = this.config.keepAliveTimeoutMs ?? 65e3;
      const headersMs = this.config.headersTimeoutMs ?? 6e4;
      this.server.keepAliveTimeout = keepAliveMs;
      this.server.headersTimeout = Math.max(headersMs, keepAliveMs + 1e3);
      this.server.requestTimeout = 0;
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);
      this.cleanupTimer = setInterval(() => this.cleanupExpiredCaches(), 5 * 6e4);
      this.cleanupTimer.unref?.();
      const protocol = this.isHttps ? "https" : "http";
      this.server.listen(this.config.port, this.config.host, () => {
        proxyLogger.info(
          "ProxyServer",
          `Started on ${protocol}://${this.config.host}:${this.config.port}`
        );
        this.stats.startTime = Date.now();
        this.sessionStats = {
          totalRequests: 0,
          successRequests: 0,
          failedRequests: 0,
          startTime: Date.now()
        };
        this.events.onStatusChange?.(true, this.config.port);
        resolve();
      });
      if (this.isHttps && this.config.fallbackPort && this.config.fallbackPort !== this.config.port) {
        const fallback = http.createServer(requestHandler);
        fallback.keepAliveTimeout = keepAliveMs;
        fallback.headersTimeout = Math.max(headersMs, keepAliveMs + 1e3);
        fallback.requestTimeout = 0;
        fallback.on("connection", (socket) => {
          this.sockets.add(socket);
          socket.on("close", () => this.sockets.delete(socket));
        });
        fallback.on(
          "error",
          (err) => proxyLogger.warn("ProxyServer", `Fallback HTTP error: ${err.message}`)
        );
        fallback.listen(this.config.fallbackPort, this.config.host, () => {
          proxyLogger.info(
            "ProxyServer",
            `Fallback HTTP listening on http://${this.config.host}:${this.config.fallbackPort}`
          );
        });
        this.fallbackServer = fallback;
      }
    });
  }
  // 获取 TLS 配置选项
  // P1-13 当 tls.enabled 但未提供 cert/key 时，自动生成自签证书
  getTlsOptions() {
    const tls2 = this.config.tls;
    let cert;
    let key;
    if (tls2.cert && tls2.key) {
      cert = tls2.cert;
      key = tls2.key;
    } else if (tls2.certPath && tls2.keyPath) {
      cert = fs.readFileSync(tls2.certPath, "utf8");
      key = fs.readFileSync(tls2.keyPath, "utf8");
    } else {
      try {
        const { app } = require("electron");
        const { ensureProxySelfSignedCert } = require("./selfSignedCert");
        const hostnames = [this.config.host || "127.0.0.1"];
        const result = ensureProxySelfSignedCert(app.getPath("userData"), hostnames);
        proxyLogger.info(
          "ProxyServer",
          `Using self-signed TLS cert (SAN=${result.altNames.join(",")}, fingerprint=${result.fingerprint.slice(0, 19)}...)`
        );
        cert = result.cert;
        key = result.key;
      } catch (err) {
        throw new Error(
          `TLS enabled but no certificate/key provided and auto-generation failed: ${err.message}`
        );
      }
    }
    return { cert, key };
  }
  /**
   * 获取（或生成）反代自签证书信息（供 UI 显示/导出 PEM）
   */
  getSelfSignedCertInfo() {
    try {
      const { app } = require("electron");
      const { ensureProxySelfSignedCert } = require("./selfSignedCert");
      return ensureProxySelfSignedCert(app.getPath("userData"), [this.config.host || "127.0.0.1"]);
    } catch (err) {
      proxyLogger.warn("ProxyServer", `getSelfSignedCertInfo failed: ${err.message}`);
      return null;
    }
  }
  /** 强制重新生成自签证书（用户在 UI 上点"重新生成"） */
  regenerateSelfSignedCert() {
    try {
      const { app } = require("electron");
      const { ensureProxySelfSignedCert } = require("./selfSignedCert");
      this.appendAuditLog("regenerate_self_signed_cert", { host: this.config.host });
      return ensureProxySelfSignedCert(
        app.getPath("userData"),
        [this.config.host || "127.0.0.1"],
        true
      );
    } catch (err) {
      proxyLogger.warn("ProxyServer", `regenerateSelfSignedCert failed: ${err.message}`);
      return null;
    }
  }
  /**
   * 优雅停止服务器
   * - 立刻拒绝新连接（server.close）
   * - 给正在进行中的请求 5 秒完成；超时后强制 destroy socket
   * - 同时停 fallback HTTP 服务器
   */
  async stop(gracefulMs = 5e3) {
    if (!this.server) {
      return;
    }
    this.isStopping = true;
    const main = this.server;
    const fallback = this.fallbackServer;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        proxyLogger.info("ProxyServer", "Stopped");
        this.server = null;
        this.fallbackServer = null;
        this.isStopping = false;
        this.activeRequests.clear();
        this.sockets.clear();
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        this.events.onStatusChange?.(false, this.config.port);
        resolve();
      };
      main.close(() => {
        fallback?.close(() => finish()) || finish();
      });
      this.activeRequests.forEach(
        (controller) => controller.abort(new Error("Proxy server stopped"))
      );
      setTimeout(() => {
        this.sockets.forEach((socket) => socket.destroy());
        finish();
      }, gracefulMs);
    });
  }
  // 更新配置
  // P2-18 检测到 port/host/tls 变更时，标记 needsRestart=true，UI 可读取并提示
  _needsRestart = false;
  updateConfig(config) {
    const restartTriggerFields = ["port", "host", "tls", "fallbackPort"];
    const willRestart = restartTriggerFields.some(
      (k) => k in config && JSON.stringify(this.config[k]) !== JSON.stringify(config[k])
    );
    if (willRestart && this.isRunning()) {
      this._needsRestart = true;
      proxyLogger.warn(
        "ProxyServer",
        `Config change requires restart: ${restartTriggerFields.filter((k) => k in config).join(", ")}`
      );
    }
    this.appendAuditLog("config_changed", {
      fields: Object.keys(config),
      needsRestart: willRestart
    });
    this.config = { ...this.config, ...config };
    if (config.accountSelectionStrategy !== void 0) {
      this.accountPool.setStrategy(this.config.accountSelectionStrategy || "round-robin");
    }
  }
  /** UI 可用此判断是否需提示用户重启 */
  needsRestart() {
    return this._needsRestart;
  }
  /** 重启后调用清除 needsRestart 标记 */
  async restartServer() {
    if (!this.isRunning()) {
      await this.start();
      this._needsRestart = false;
      return;
    }
    await this.stop();
    await this.start();
    this._needsRestart = false;
  }
  // 获取配置
  getConfig() {
    return { ...this.config };
  }
  validateCacheControl(cacheControl) {
    if (!cacheControl) return;
    if (cacheControl.type !== "ephemeral") {
      throw new Error(`Unsupported cache_control type: ${cacheControl.type}`);
    }
  }
  validateClaudeContentBlocks(blocks) {
    blocks.forEach((block) => {
      this.validateCacheControl(block.cache_control);
      if (Array.isArray(block.content)) {
        this.validateClaudeContentBlocks(block.content);
      }
    });
  }
  validateOpenAICacheControls(request) {
    request.messages.forEach((message) => {
      this.validateCacheControl(message.cache_control);
      if (Array.isArray(message.content)) {
        message.content.forEach((part) => this.validateCacheControl(part.cache_control));
      }
    });
    request.tools?.forEach((tool) => this.validateCacheControl(tool.cache_control));
  }
  validateClaudeCacheControls(request) {
    if (Array.isArray(request.system)) {
      request.system.forEach((block) => this.validateCacheControl(block.cache_control));
    }
    request.messages.forEach((message) => {
      this.validateCacheControl(message.cache_control);
      if (Array.isArray(message.content)) {
        this.validateClaudeContentBlocks(message.content);
      }
    });
    request.tools?.forEach((tool) => this.validateCacheControl(tool.cache_control));
  }
  async downloadImageDataUrl(url2, signal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const abort = () => controller.abort(this.getAbortError(signal));
    try {
      if (signal?.aborted) throw this.getAbortError(signal);
      signal?.addEventListener("abort", abort, { once: true });
      const agent = (() => {
        const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        if (envProxy) {
          const { ProxyAgent } = require("undici");
          return new ProxyAgent({ uri: envProxy, requestTls: { rejectUnauthorized: false } });
        }
        const { getSystemProxy: getSystemProxy2 } = require("./systemProxy");
        const systemProxy = getSystemProxy2();
        if (systemProxy) {
          const { ProxyAgent } = require("undici");
          return new ProxyAgent({ uri: systemProxy, requestTls: { rejectUnauthorized: false } });
        }
        return void 0;
      })();
      const { fetch: undiciFetch } = require("undici");
      const response = agent ? await undiciFetch(url2, {
        signal: controller.signal,
        dispatcher: agent
      }) : await fetch(url2, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase();
      if (!contentType || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(contentType)) {
        throw new Error(`Unsupported image content-type: ${contentType || "unknown"}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
        throw new Error("Image exceeds 10MB limit");
      }
      return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  async resolveOpenAIHttpImages(request, signal) {
    await Promise.all(
      request.messages.map(async (message) => {
        if (!Array.isArray(message.content)) return;
        await Promise.all(
          message.content.map(async (part) => {
            if (part.type !== "image_url" || !part.image_url?.url.startsWith("http")) return;
            part.image_url.url = await this.downloadImageDataUrl(part.image_url.url, signal);
          })
        );
      })
    );
    return request;
  }
  async resolveClaudeHttpImages(request, signal) {
    await Promise.all(
      request.messages.map(async (message) => {
        if (!Array.isArray(message.content)) return;
        await Promise.all(
          message.content.map(async (block) => {
            if (block.type !== "image" || block.source?.type !== "url") return;
            const dataUrl = await this.downloadImageDataUrl(block.source.url, signal);
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) {
              throw new Error("Downloaded image produced invalid data URL");
            }
            block.source = { type: "base64", media_type: match[1], data: match[2] };
          })
        );
      })
    );
    return request;
  }
  prepareOpenAIRequest(request) {
    this.validateOpenAICacheControls(request);
    if (this.config.disableTools || request.tool_choice === "none") {
      return { ...request, tools: void 0, tool_choice: void 0 };
    }
    if (request.tool_choice && typeof request.tool_choice === "object" && request.tool_choice.type === "function" && !request.tool_choice.function?.name) {
      throw new Error("tool_choice function requires a tool name");
    }
    if (request.tool_choice && typeof request.tool_choice === "object" && request.tool_choice.function?.name) {
      const selectedToolName = request.tool_choice.function.name;
      if (!request.tools?.some((tool) => tool.function.name === selectedToolName)) {
        throw new Error(`tool_choice references unknown tool: ${selectedToolName}`);
      }
      return {
        ...request,
        tools: request.tools?.filter((tool) => tool.function.name === selectedToolName)
      };
    }
    return request;
  }
  prepareClaudeRequest(request) {
    this.validateClaudeCacheControls(request);
    if (this.config.disableTools || request.tool_choice?.type === "none") {
      return { ...request, tools: void 0, tool_choice: void 0 };
    }
    if (request.tool_choice?.type === "tool" && !request.tool_choice.name) {
      throw new Error("tool_choice tool requires a tool name");
    }
    if (request.tool_choice?.name) {
      const selectedToolName = request.tool_choice.name;
      if (!request.tools?.some((tool) => tool.name === selectedToolName)) {
        throw new Error(`tool_choice references unknown tool: ${selectedToolName}`);
      }
      return {
        ...request,
        tools: request.tools?.filter((tool) => tool.name === selectedToolName)
      };
    }
    return request;
  }
  // 获取统计信息
  getStats() {
    return {
      totalRequests: this.stats.totalRequests,
      successRequests: this.stats.successRequests,
      failedRequests: this.stats.failedRequests,
      totalTokens: this.stats.totalTokens,
      totalCredits: this.stats.totalCredits,
      // Existing installs may have restored token totals from storage before totalCost existed.
      // If no per-request cost has been accumulated yet, fall back to Sonnet pricing so the
      // dashboard never shows $0.00 for non-zero tokens. New requests still use their actual model.
      totalCost: Math.max(
        this.stats.totalCost,
        calculateTokenCost("claude-sonnet-4.5", this.stats.inputTokens, this.stats.outputTokens)
      ),
      inputTokens: this.stats.inputTokens,
      outputTokens: this.stats.outputTokens,
      cacheReadTokens: this.stats.cacheReadTokens,
      cacheWriteTokens: this.stats.cacheWriteTokens,
      reasoningTokens: this.stats.reasoningTokens,
      startTime: this.stats.startTime,
      accountStats: this.stats.accountStats,
      endpointStats: this.stats.endpointStats,
      modelStats: this.stats.modelStats,
      recentRequests: this.stats.recentRequests
    };
  }
  // 获取账号池
  getAccountPool() {
    return this.accountPool;
  }
  // 设置初始累计 credits（用于从持久化存储恢复）
  setTotalCredits(credits) {
    this.stats.totalCredits = credits;
  }
  // 重置累计 credits
  resetTotalCredits() {
    this.stats.totalCredits = 0;
    this.events.onCreditsUpdate?.(0);
  }
  // 设置初始累计 tokens（用于从持久化存储恢复）
  setTotalTokens(inputTokens, outputTokens) {
    this.stats.inputTokens = inputTokens;
    this.stats.outputTokens = outputTokens;
    this.stats.totalTokens = inputTokens + outputTokens;
    this.stats.totalCost = Math.max(
      this.stats.totalCost,
      calculateTokenCost("claude-sonnet-4.5", inputTokens, outputTokens)
    );
  }
  // 重置累计 tokens
  resetTotalTokens() {
    this.stats.inputTokens = 0;
    this.stats.outputTokens = 0;
    this.stats.totalTokens = 0;
    this.stats.totalCost = 0;
    this.stats.cacheReadTokens = 0;
    this.stats.cacheWriteTokens = 0;
    this.stats.reasoningTokens = 0;
    this.stats.recentRequests = [];
    this.events.onTokensUpdate?.(0, 0);
  }
  // 设置请求统计（用于从持久化存储恢复）
  setRequestStats(totalRequests, successRequests, failedRequests) {
    this.stats.totalRequests = totalRequests;
    this.stats.successRequests = successRequests;
    this.stats.failedRequests = failedRequests;
  }
  // 重置请求统计
  resetRequestStats() {
    this.stats.totalRequests = 0;
    this.stats.successRequests = 0;
    this.stats.failedRequests = 0;
    this.notifyRequestStatsUpdate();
  }
  // 通知请求统计更新
  notifyRequestStatsUpdate() {
    this.events.onRequestStatsUpdate?.(
      this.stats.totalRequests,
      this.stats.successRequests,
      this.stats.failedRequests
    );
  }
  // 记录请求成功
  recordRequestSuccess() {
    this.stats.successRequests++;
    this.sessionStats.successRequests++;
    this.notifyRequestStatsUpdate();
  }
  // 记录请求失败
  recordRequestFailed() {
    this.stats.failedRequests++;
    this.sessionStats.failedRequests++;
    this.notifyRequestStatsUpdate();
  }
  // 记录新请求
  recordNewRequest() {
    this.stats.totalRequests++;
    this.sessionStats.totalRequests++;
    this.notifyRequestStatsUpdate();
  }
  // 获取会话统计（当前服务运行期间的统计）
  getSessionStats() {
    return { ...this.sessionStats };
  }
  // 是否运行中
  isRunning() {
    return this.server !== null;
  }
  getAbortError(signal) {
    if (signal?.reason instanceof Error) return signal.reason;
    if (signal?.reason) return new Error(String(signal.reason));
    return new Error("Request aborted");
  }
  isAbortError(error, signal) {
    return signal?.aborted === true || error instanceof Error && (error.message.includes("Client disconnected") || error.message.includes("Proxy server stopped"));
  }
  throwIfAborted(signal) {
    if (signal?.aborted) throw this.getAbortError(signal);
  }
  throwIfResponseClosed(res, signal) {
    this.throwIfAborted(signal);
    if (res.writableEnded || res.destroyed) throw new Error("Client disconnected");
  }
  isResponseClosed(res) {
    return res.writableEnded || res.destroyed;
  }
  waitForRetry(ms, signal) {
    this.throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, ms);
      const abort = () => {
        clearTimeout(timeout);
        reject(this.getAbortError(signal));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  async abortable(promise, signal) {
    this.throwIfAborted(signal);
    if (!signal) return promise;
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        const abort = () => reject(this.getAbortError(signal));
        signal.addEventListener("abort", abort, { once: true });
        promise.then(
          () => signal.removeEventListener("abort", abort),
          () => signal.removeEventListener("abort", abort)
        );
      })
    ]);
  }
  // 清除模型缓存，强制下次请求重新获取
  clearModelCache() {
    this.modelCache = null;
    console.log("[ProxyServer] Model cache cleared");
  }
  // 获取可用模型列表
  static mapKiroModelToApi(m) {
    return {
      id: m.modelId,
      name: m.modelName,
      description: m.description,
      inputTypes: m.supportedInputTypes,
      maxInputTokens: m.tokenLimits?.maxInputTokens,
      maxOutputTokens: m.tokenLimits?.maxOutputTokens,
      rateMultiplier: m.rateMultiplier,
      rateUnit: m.rateUnit,
      supportsThinking: !!m.additionalModelRequestFieldsSchema?.properties?.thinking,
      thinkingEfforts: extractThinkingEfforts(m.additionalModelRequestFieldsSchema),
      supportsPromptCaching: m.promptCaching?.supportsPromptCaching || false,
      modelProvider: m.modelProvider || void 0
    };
  }
  async getAvailableModels(signal) {
    const now = Date.now();
    let kiroModels;
    let fromCache = false;
    if (this.modelCache && now - this.modelCache.timestamp < this.MODEL_CACHE_TTL) {
      kiroModels = this.modelCache.models;
      fromCache = true;
    } else {
      this.throwIfAborted(signal);
      const account = await this.getAvailableAccount(signal);
      this.throwIfAborted(signal);
      if (!account) {
        return { models: [], fromCache: false };
      }
      try {
        kiroModels = await fetchKiroModels(account, signal);
        if (kiroModels.length > 0) {
          this.modelCache = { models: kiroModels, timestamp: now };
        }
      } catch (error) {
        if (this.isAbortError(error, signal)) throw error;
        console.error("[ProxyServer] Failed to fetch models:", error);
        return { models: [], fromCache: false };
      }
    }
    const modelIds = new Set(kiroModels.map((m) => m.modelId));
    const hiddenModels = [
      {
        modelId: "claude-3.7-sonnet",
        modelName: "Claude 3.7 Sonnet",
        description: "Claude 3.7 Sonnet (hidden)",
        supportedInputTypes: ["TEXT", "IMAGE"],
        tokenLimits: { maxInputTokens: 2e5, maxOutputTokens: 64e3 }
      },
      {
        modelId: "simple-task",
        modelName: "Simple Task",
        description: "Kiro fast model (routes to Haiku)",
        supportedInputTypes: ["TEXT"],
        tokenLimits: { maxInputTokens: 2e5, maxOutputTokens: 4096 }
      },
      {
        modelId: "CLAUDE_HAIKU_4_5_20251001_V1_0",
        modelName: "Claude Haiku 4.5 (CW)",
        description: "CodeWhisperer internal ID",
        supportedInputTypes: ["TEXT", "IMAGE"],
        tokenLimits: { maxInputTokens: 2e5, maxOutputTokens: 64e3 }
      },
      {
        modelId: "CLAUDE_3_7_SONNET_20250219_V1_0",
        modelName: "Claude 3.7 Sonnet (CW)",
        description: "CodeWhisperer internal ID",
        supportedInputTypes: ["TEXT", "IMAGE"],
        tokenLimits: { maxInputTokens: 2e5, maxOutputTokens: 64e3 }
      }
    ];
    const merged = [...kiroModels, ...hiddenModels.filter((m) => !modelIds.has(m.modelId))];
    return { models: merged.map(ProxyServer.mapKiroModelToApi), fromCache };
  }
  // 检查 Token 是否需要刷新
  isTokenExpiringSoon(account) {
    if (!account.expiresAt) return false;
    const refreshBeforeMs = (this.config.tokenRefreshBeforeExpiry || 300) * 1e3;
    return Date.now() + refreshBeforeMs >= account.expiresAt;
  }
  // 刷新 Token
  async refreshToken(account, signal) {
    this.throwIfAborted(signal);
    if (!this.events.onTokenRefresh) {
      console.warn("[ProxyServer] No token refresh callback configured");
      return false;
    }
    if (this.refreshingTokens.has(account.id)) {
      console.log(
        `[ProxyServer] Token refresh already in progress for ${account.email || account.id}`
      );
      await this.waitForRetry(1e3, signal);
      return !this.isTokenExpiringSoon(this.accountPool.getAccount(account.id) || account);
    }
    this.refreshingTokens.add(account.id);
    console.log(`[ProxyServer] Refreshing token for ${account.email || account.id}`);
    try {
      const jitter = Math.floor(Math.random() * 3e3);
      if (jitter > 0) await this.waitForRetry(jitter, signal);
      const result = await this.abortable(this.events.onTokenRefresh(account), signal);
      if (result.success && result.accessToken) {
        this.accountPool.updateAccount(account.id, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || account.refreshToken,
          expiresAt: result.expiresAt
        });
        this.events.onAccountUpdate?.({
          ...account,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || account.refreshToken,
          expiresAt: result.expiresAt
        });
        console.log(`[ProxyServer] Token refreshed for ${account.email || account.id}`);
        return true;
      } else {
        console.error(
          `[ProxyServer] Token refresh failed for ${account.email || account.id}: ${result.error}`
        );
        if (this.isSuspendedError(String(result.error || ""))) {
          const suspendedAccount = this.accountPool.markSuspended(account.id);
          if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
        } else {
          this.accountPool.markNeedsRefresh(account.id);
        }
        return false;
      }
    } catch (error) {
      if (this.isAbortError(error, signal)) throw error;
      console.error(`[ProxyServer] Token refresh error for ${account.email || account.id}:`, error);
      if (this.isSuspendedError(error instanceof Error ? error.message : String(error))) {
        const suspendedAccount = this.accountPool.markSuspended(account.id);
        if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
      } else {
        this.accountPool.markNeedsRefresh(account.id);
      }
      return false;
    } finally {
      this.refreshingTokens.delete(account.id);
    }
  }
  /**
   * 计算 API Key 允许使用的账号 ID 集合（P2-21）
   * 返回 undefined = 不限制（允许所有账号）
   */
  getAllowedAccountIds(apiKeyId) {
    if (!apiKeyId) return void 0;
    const bindings = this.config.apiKeyAccountBindings?.[apiKeyId];
    if (!bindings || bindings.length === 0) return void 0;
    return new Set(bindings);
  }
  // 获取可用账号（包含 Token 刷新检查）
  // P1-8 sessionHint：相同会话尽量复用同一账号（命中 prompt cache + 防风控）
  // P2-21 apiKeyId：用于过滤 API Key 允许使用的账号子集
  async getAvailableAccount(signal, sessionHint, apiKeyId) {
    const allowedIds = this.getAllowedAccountIds(apiKeyId);
    const isAllowed = (acc) => !acc || !allowedIds || allowedIds.has(acc.id);
    this.throwIfAborted(signal);
    if (this.accountPool.size === 0 && this.events.onPoolEmpty) {
      console.log("[ProxyServer] Account pool empty, triggering lazy sync...");
      await this.abortable(this.events.onPoolEmpty(), signal);
    }
    this.throwIfAborted(signal);
    if (this.config.sessionAffinityEnabled && sessionHint) {
      const sticky = this.pickAccountWithAffinity(sessionHint);
      if (sticky && isAllowed(sticky)) {
        proxyLogger.debug(
          "ProxyServer",
          `Session affinity hit: ${sessionHint.slice(0, 16)} → ${sticky.email || sticky.id.slice(0, 8)}`
        );
        if (this.isTokenExpiringSoon(sticky)) {
          const refreshed = await this.refreshToken(sticky, signal);
          if (refreshed) {
            return this.accountPool.getAccount(sticky.id) || sticky;
          }
        } else {
          return sticky;
        }
      }
    }
    let account;
    if (this.config.enableMultiAccount) {
      account = this.accountPool.getNextAccount();
      if (account && !isAllowed(account)) {
        const allAccounts2 = this.accountPool.getAllAccounts();
        const exclude = /* @__PURE__ */ new Set();
        for (const a of allAccounts2) {
          if (!isAllowed(a)) exclude.add(a.id);
        }
        account = this.accountPool.getNextAccount(exclude);
      }
      if (!account) {
        const status = this.accountPool.getQuotaStatus();
        if (status.exhausted > 0 && status.available === 0) {
          console.log(
            `[ProxyServer] All accounts quota exhausted (${status.exhausted}/${status.total}), no available accounts`
          );
        }
      }
    } else {
      if (this.config.selectedAccountIds && this.config.selectedAccountIds.length > 0) {
        account = this.accountPool.getAccount(this.config.selectedAccountIds[0]);
        if (account && this.accountPool.isQuotaExhausted(account) && this.config.autoSwitchOnQuotaExhausted) {
          const nextAccount = this.accountPool.getNextAvailableAccount(account.id);
          if (nextAccount) {
            console.log(
              `[ProxyServer] Selected account ${account.email || account.id} quota exhausted, auto-switching to ${nextAccount.email || nextAccount.id}`
            );
            this.config.selectedAccountIds = [nextAccount.id];
            this.events.onAccountUpdate?.(nextAccount);
            account = nextAccount;
          }
        }
        if (account && this.accountPool.isSuspended(account.id)) {
          console.log(
            `[ProxyServer] Selected account ${account.email || account.id} is suspended, trying another account`
          );
          account = this.accountPool.getNextAvailableAccount(account.id);
        }
        if (!account) {
          console.log(
            `[ProxyServer] Selected account ${this.config.selectedAccountIds[0]} not found/unavailable, using first available`
          );
          account = this.accountPool.getNextAccount();
        }
      } else {
        account = this.accountPool.getNextAccount();
      }
    }
    if (!account) return null;
    if (this.isTokenExpiringSoon(account)) {
      const refreshed = await this.refreshToken(account, signal);
      if (!refreshed) {
        return this.accountPool.getNextAccount(/* @__PURE__ */ new Set([account.id])) || this.accountPool.getNextAccount();
      }
      const refreshedAccount = this.accountPool.getAccount(account.id);
      if (refreshedAccount && sessionHint) this.rememberAffinity(sessionHint, refreshedAccount.id);
      return refreshedAccount;
    }
    if (sessionHint) this.rememberAffinity(sessionHint, account.id);
    return account;
  }
  getStableDeviceId(account) {
    return crypto$1.createHash("sha256").update(`kiro-kproxy-device:${account.id}:${account.email || ""}`).digest("hex");
  }
  // 同步 K-Proxy 设备 ID（根据账号自动切换）
  syncKProxyDeviceId(account) {
    const kproxyService2 = getKProxyService();
    if (!kproxyService2 || !kproxyService2.isRunning()) {
      return;
    }
    const switched = kproxyService2.switchToAccount(account.id);
    if (!switched) {
      const newDeviceId = account.machineId || this.getStableDeviceId(account);
      kproxyService2.addDeviceIdMapping({
        accountId: account.id,
        deviceId: newDeviceId,
        description: account.email || `Account ${account.id.substring(0, 8)}`,
        createdAt: Date.now()
      });
      kproxyService2.setDeviceId(newDeviceId);
      proxyLogger.info(
        "ProxyServer",
        `Auto-generated device ID for account ${account.email || account.id.substring(0, 8)}`
      );
    } else {
      proxyLogger.debug(
        "ProxyServer",
        `Switched to device ID for account ${account.email || account.id.substring(0, 8)}`
      );
    }
  }
  // 带重试的 API 调用
  async callWithRetry(account, apiCall, _path, signal) {
    const configuredMaxRetries = this.config.maxRetries || 3;
    const maxRetries = Math.max(configuredMaxRetries, Math.max(1, this.accountPool.size + 1) * 2);
    const retryDelay = this.config.retryDelayMs || 1e3;
    let lastError = null;
    let currentAccount2 = account;
    let endpointIndex = 0;
    const triedAccounts = /* @__PURE__ */ new Set();
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      this.throwIfAborted(signal);
      try {
        this.syncKProxyDeviceId(currentAccount2);
        const result = await apiCall(currentAccount2, endpointIndex);
        return { result, account: currentAccount2 };
      } catch (error) {
        if (this.isAbortError(error, signal)) throw error;
        lastError = error;
        const errMsg = lastError.message || "";
        console.log(
          `[ProxyServer] API call failed (attempt ${attempt + 1}/${maxRetries}): ${errMsg}`
        );
        if (this.isSuspendedError(errMsg)) {
          console.log(
            `[ProxyServer] Account ${currentAccount2.email || currentAccount2.id} is suspended/locked, removing and switching account`
          );
          triedAccounts.add(currentAccount2.id);
          const suspendedAccount = this.accountPool.markSuspended(currentAccount2.id);
          this.events.onAccountUpdate?.(
            suspendedAccount || {
              ...currentAccount2,
              suspended: true,
              isAvailable: false
            }
          );
          const nextAccount = this.accountPool.getNextAccount(triedAccounts);
          if (nextAccount && nextAccount.id !== currentAccount2.id) {
            currentAccount2 = nextAccount;
            endpointIndex = 0;
            continue;
          }
          break;
        }
        if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("Auth")) {
          console.log("[ProxyServer] Auth error, attempting token refresh");
          const refreshed = await this.refreshToken(currentAccount2, signal);
          if (refreshed) {
            currentAccount2 = this.accountPool.getAccount(currentAccount2.id) || currentAccount2;
            if (this.accountPool.isSuspended(currentAccount2.id)) {
              console.log(
                `[ProxyServer] Account ${currentAccount2.email || currentAccount2.id} still suspended after refresh`
              );
              triedAccounts.add(currentAccount2.id);
              const nextAccount2 = this.accountPool.getNextAccount(triedAccounts);
              if (nextAccount2 && nextAccount2.id !== currentAccount2.id) {
                currentAccount2 = nextAccount2;
                continue;
              }
              break;
            }
            continue;
          }
          triedAccounts.add(currentAccount2.id);
          const nextAccount = this.accountPool.getNextAccount(triedAccounts);
          if (nextAccount && nextAccount.id !== currentAccount2.id) {
            currentAccount2 = nextAccount;
            continue;
          }
        }
        if (this.isQuotaError(errMsg)) {
          const statusCode = errMsg.includes("402") || errMsg.toLowerCase().includes("monthly_request_count") ? 402 : 429;
          console.log(
            `[ProxyServer] Quota/throttle error (${statusCode}) for ${currentAccount2.email || currentAccount2.id}, disabling account until reset and switching account`
          );
          this.accountPool.recordError(currentAccount2.id, ErrorType.RECOVERABLE, statusCode);
          triedAccounts.add(currentAccount2.id);
          if (this.config.enableMultiAccount) {
            const nextAccount = this.accountPool.getNextAccount(triedAccounts);
            if (nextAccount && nextAccount.id !== currentAccount2.id) {
              currentAccount2 = nextAccount;
              endpointIndex = 0;
              continue;
            }
          } else if (this.config.autoSwitchOnQuotaExhausted) {
            const nextAccount = this.accountPool.getNextAvailableAccount(currentAccount2.id);
            if (nextAccount && nextAccount.id !== currentAccount2.id) {
              console.log(
                `[ProxyServer] Auto-switching from ${currentAccount2.id} to ${nextAccount.id} due to quota exhausted`
              );
              currentAccount2 = nextAccount;
              endpointIndex = 0;
              this.config.selectedAccountIds = [nextAccount.id];
              this.events.onAccountUpdate?.(nextAccount);
              continue;
            }
          }
          endpointIndex = (endpointIndex + 1) % 2;
          continue;
        }
        if (errMsg.includes("500") || errMsg.includes("502") || errMsg.includes("503") || errMsg.includes("504")) {
          console.log("[ProxyServer] Server error, retrying");
          await this.waitForRetry(retryDelay * (attempt + 1), signal);
          continue;
        }
        break;
      }
    }
    throw lastError || new Error("Unknown error");
  }
  /**
   * 常数时间字符串比较（防时序攻击）
   * 长度不同时返回 false 但仍走一次 timingSafeEqual 防止旁路
   */
  safeStringEq(a, b) {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
      try {
        crypto$1.timingSafeEqual(ab, ab);
      } catch {
      }
      return false;
    }
    try {
      return crypto$1.timingSafeEqual(ab, bb);
    } catch {
      return false;
    }
  }
  // 验证 API Key 并返回匹配的 Key（用于统计）
  validateApiKey(req) {
    const hasApiKeys = this.config.apiKeys && this.config.apiKeys.length > 0;
    const hasLegacyKey = !!this.config.apiKey;
    if (!hasApiKeys && !hasLegacyKey) return { valid: true };
    const authHeader = req.headers["authorization"] || "";
    const apiKeyHeader = req.headers["x-api-key"] || "";
    let providedKey = "";
    if (authHeader.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7);
    }
    if (!providedKey && apiKeyHeader) {
      providedKey = apiKeyHeader;
    }
    if (!providedKey) return { valid: false };
    if (hasApiKeys) {
      const matchedKey = this.config.apiKeys.find((k) => k.enabled && k.key === providedKey);
      if (matchedKey) {
        if (matchedKey.creditsLimit && matchedKey.usage.totalCredits >= matchedKey.creditsLimit) {
          return { valid: false, reason: "Credits limit exceeded" };
        }
        return { valid: true, apiKey: matchedKey };
      }
    }
    if (hasLegacyKey && this.safeStringEq(this.config.apiKey, providedKey)) {
      return { valid: true };
    }
    return { valid: false };
  }
  /**
   * P0-4 IP 访问控制
   * - deniedIPs 优先：命中即拒绝
   * - allowedIPs 配置后：必须在列表内（白名单模式）
   * - 都未配置：允许
   * 支持单 IP 和 CIDR（IPv4 / IPv6 简化处理）
   */
  isClientIPAllowed(clientIP) {
    if (!clientIP) return { allowed: true };
    const ip = clientIP.startsWith("::ffff:") ? clientIP.slice(7) : clientIP;
    const matchEntry = (entry) => {
      const e = entry.trim();
      if (!e) return false;
      if (e.includes("/")) {
        return this.ipInCidr(ip, e);
      }
      return e === ip;
    };
    const denied = this.config.deniedIPs?.find(matchEntry);
    if (denied) return { allowed: false, reason: `IP ${ip} matches denied entry ${denied}` };
    const allowList = this.config.allowedIPs;
    if (allowList && allowList.length > 0) {
      const allowed = allowList.some(matchEntry);
      if (!allowed) return { allowed: false, reason: `IP ${ip} not in allowed list` };
    }
    return { allowed: true };
  }
  /**
   * 简化 IPv4/IPv6 CIDR 匹配（不依赖外部库）
   * IPv4 CIDR：1.2.3.0/24；IPv6 CIDR：仅前缀逐 bit 比较
   */
  ipInCidr(ip, cidr) {
    const [range, bitsStr] = cidr.split("/");
    const bits = parseInt(bitsStr, 10);
    if (!Number.isFinite(bits)) return false;
    const isV4 = ip.includes(".") && range.includes(".");
    if (isV4) {
      const ipNum = this.ipv4ToInt(ip);
      const rangeNum = this.ipv4ToInt(range);
      if (ipNum < 0 || rangeNum < 0) return false;
      const mask = bits === 0 ? 0 : -1 << 32 - bits >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    }
    const ipBytes = this.ipv6ToBytes(ip);
    const rangeBytes = this.ipv6ToBytes(range);
    if (!ipBytes || !rangeBytes) return false;
    let bitsLeft = bits;
    for (let i = 0; i < 16 && bitsLeft > 0; i++) {
      if (bitsLeft >= 8) {
        if (ipBytes[i] !== rangeBytes[i]) return false;
        bitsLeft -= 8;
      } else {
        const mask = 255 << 8 - bitsLeft & 255;
        if ((ipBytes[i] & mask) !== (rangeBytes[i] & mask)) return false;
        bitsLeft = 0;
      }
    }
    return true;
  }
  ipv4ToInt(ip) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return -1;
    return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  }
  ipv6ToBytes(ip) {
    try {
      const parts = ip.split("::");
      let head = [];
      let tail = [];
      if (parts.length === 1) {
        head = parts[0].split(":");
      } else if (parts.length === 2) {
        head = parts[0] ? parts[0].split(":") : [];
        tail = parts[1] ? parts[1].split(":") : [];
      } else {
        return null;
      }
      const missing = 8 - head.length - tail.length;
      if (missing < 0) return null;
      const segments = [...head, ...new Array(missing).fill("0"), ...tail];
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 8; i++) {
        const v = parseInt(segments[i] || "0", 16);
        if (!Number.isFinite(v) || v < 0 || v > 65535) return null;
        bytes[i * 2] = v >> 8 & 255;
        bytes[i * 2 + 1] = v & 255;
      }
      return bytes;
    } catch {
      return null;
    }
  }
  /** 取客户端真实 IP（不信任 X-Forwarded-For，仅取 socket address） */
  getClientIP(req) {
    return req.socket.remoteAddress || "";
  }
  // 记录 API Key 用量
  recordApiKeyUsage(apiKeyId, credits, inputTokens, outputTokens, model, path2) {
    if (!this.config.apiKeys) return;
    const apiKey = this.config.apiKeys.find((k) => k.id === apiKeyId);
    if (!apiKey) return;
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const now = Date.now();
    apiKey.usage.totalRequests++;
    apiKey.usage.totalCredits += credits;
    apiKey.usage.totalInputTokens += inputTokens;
    apiKey.usage.totalOutputTokens += outputTokens;
    apiKey.lastUsedAt = now;
    if (!apiKey.usage.daily[today]) {
      apiKey.usage.daily[today] = { requests: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
    }
    apiKey.usage.daily[today].requests++;
    apiKey.usage.daily[today].credits += credits;
    apiKey.usage.daily[today].inputTokens += inputTokens;
    apiKey.usage.daily[today].outputTokens += outputTokens;
    if (model) {
      if (!apiKey.usage.byModel) {
        apiKey.usage.byModel = {};
      }
      if (!apiKey.usage.byModel[model]) {
        apiKey.usage.byModel[model] = { requests: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
      }
      apiKey.usage.byModel[model].requests++;
      apiKey.usage.byModel[model].credits += credits;
      apiKey.usage.byModel[model].inputTokens += inputTokens;
      apiKey.usage.byModel[model].outputTokens += outputTokens;
    }
    if (!apiKey.usageHistory) {
      apiKey.usageHistory = [];
    }
    apiKey.usageHistory.unshift({
      timestamp: now,
      model: model || "unknown",
      inputTokens,
      outputTokens,
      credits,
      path: path2 || "unknown"
    });
    if (apiKey.usageHistory.length > 100) {
      apiKey.usageHistory = apiKey.usageHistory.slice(0, 100);
    }
    this.events.onConfigChanged?.(this.config);
  }
  // 应用模型映射
  applyModelMapping(requestedModel, apiKeyId) {
    const mappings = this.config.modelMappings;
    if (!mappings || mappings.length === 0) return requestedModel;
    const sortedMappings = [...mappings].sort((a, b) => a.priority - b.priority);
    for (const rule of sortedMappings) {
      if (!rule.enabled) continue;
      if (rule.apiKeyIds && rule.apiKeyIds.length > 0 && apiKeyId) {
        if (!rule.apiKeyIds.includes(apiKeyId)) continue;
      }
      const sourcePattern = rule.sourceModel.replace(/\*/g, ".*");
      const regex = new RegExp(`^${sourcePattern}$`, "i");
      if (!regex.test(requestedModel)) continue;
      const validTargets = rule.targetModels.filter((t) => t.trim());
      if (validTargets.length === 0) continue;
      let targetModel;
      if (rule.type === "loadbalance" && validTargets.length > 1) {
        const weights = rule.weights || validTargets.map(() => 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        let selectedIndex = 0;
        for (let i = 0; i < weights.length; i++) {
          random -= weights[i];
          if (random <= 0) {
            selectedIndex = i;
            break;
          }
        }
        targetModel = validTargets[selectedIndex];
      } else {
        targetModel = validTargets[0];
      }
      proxyLogger.info(
        "ProxyServer",
        `Model mapping applied: ${requestedModel} -> ${targetModel} (rule: ${rule.name}, type: ${rule.type})`
      );
      return targetModel;
    }
    return requestedModel;
  }
  // 处理请求
  async handleRequest(req, res) {
    const path2 = req.url || "/";
    const method = req.method || "GET";
    const clientIP = this.getClientIP(req);
    const controller = new AbortController();
    const abortRequest = () => {
      if (!this.isStopping && res.writableEnded) return;
      if (!controller.signal.aborted) {
        controller.abort(
          new Error(this.isStopping ? "Proxy server stopped" : "Client disconnected")
        );
      }
    };
    this.activeRequests.add(controller);
    req.on("aborted", abortRequest);
    res.on("close", abortRequest);
    if (method === "OPTIONS") {
      this.setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      req.off("aborted", abortRequest);
      res.off("close", abortRequest);
      this.activeRequests.delete(controller);
      return;
    }
    try {
      this.setCorsHeaders(res);
      const ipCheck = this.isClientIPAllowed(clientIP);
      if (!ipCheck.allowed) {
        proxyLogger.warn("ProxyServer", `Blocked request from ${clientIP}: ${ipCheck.reason}`);
        this.appendAuditLog("ip_blocked", { ip: clientIP, path: path2, reason: ipCheck.reason });
        this.sendError(res, 403, "Forbidden");
        return;
      }
      if (path2 !== "/health" && path2 !== "/") {
        const authResult = this.validateApiKey(req);
        if (!authResult.valid) {
          const errorMsg = authResult.reason || "Invalid or missing API key";
          const statusCode = authResult.reason === "Credits limit exceeded" ? 429 : 401;
          this.sendError(
            res,
            statusCode,
            errorMsg,
            this.isAnthropicPath(path2) ? "anthropic" : "openai"
          );
          return;
        }
        ;
        req.matchedApiKey = authResult.apiKey;
      }
      if (this.config.logRequests) {
        proxyLogger.info("ProxyServer", `${method} ${path2}`);
      }
      const pathWithoutQuery = path2.split("?")[0];
      if (pathWithoutQuery === "/v1/models" || pathWithoutQuery === "/models") {
        await this.handleModels(res, controller.signal);
      } else if (pathWithoutQuery === "/v1/chat/completions" || pathWithoutQuery === "/chat/completions") {
        await this.handleOpenAIChat(req, res, controller.signal);
      } else if (pathWithoutQuery === "/v1/responses" || pathWithoutQuery === "/responses") {
        await this.handleOpenAIResponses(req, res, controller.signal);
      } else if (pathWithoutQuery === "/v1/messages" || pathWithoutQuery === "/messages" || pathWithoutQuery === "/anthropic/v1/messages") {
        await this.handleClaudeMessages(req, res, controller.signal);
      } else if (pathWithoutQuery === "/v1/messages/count_tokens" || pathWithoutQuery === "/messages/count_tokens") {
        await this.handleCountTokens(req, res, controller.signal);
      } else if (pathWithoutQuery === "/api/event_logging/batch") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else if (pathWithoutQuery.startsWith("/v1beta/models/")) {
        await this.handleGeminiRequest(req, res, pathWithoutQuery, controller.signal);
      } else if (pathWithoutQuery === "/v1beta/models") {
        await this.handleGeminiModels(res, controller.signal);
      } else if (pathWithoutQuery === "/health" || pathWithoutQuery === "/") {
        this.handleHealth(res);
      } else if (pathWithoutQuery === "/metrics" && this.config.enableMetrics) {
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
        res.end(this.renderPrometheusMetrics());
      } else if (pathWithoutQuery.startsWith("/admin/")) {
        await this.handleAdminApi(req, res, pathWithoutQuery, controller.signal);
      } else {
        console.log(`[ProxyServer] Unknown path: ${path2} (method: ${method})`);
        this.sendError(res, 404, `Not Found: ${pathWithoutQuery}`);
      }
    } catch (error) {
      if (this.isAbortError(error, controller.signal)) {
        proxyLogger.info("ProxyServer", `Request aborted: ${method} ${path2}`);
        return;
      }
      if (error instanceof BodyTooLargeError) {
        proxyLogger.warn(
          "ProxyServer",
          `Body too large from ${clientIP}: ${error.received}/${error.limit} bytes (${path2})`
        );
        this.sendError(
          res,
          413,
          `Request body too large (max ${error.limit} bytes)`,
          this.isAnthropicPath(path2) ? "anthropic" : "openai"
        );
        return;
      }
      console.error("[ProxyServer] Request error:", error);
      this.sendError(
        res,
        500,
        error.message,
        this.isAnthropicPath(path2) ? "anthropic" : "openai"
      );
      this.events.onError?.(error);
    } finally {
      req.off("aborted", abortRequest);
      res.off("close", abortRequest);
      this.activeRequests.delete(controller);
    }
  }
  // 管理 API 端点
  async handleAdminApi(req, res, path2, signal) {
    const method = req.method || "GET";
    const authResult = this.validateApiKey(req);
    if (!authResult.valid) {
      this.sendError(res, 401, "Admin API requires authentication");
      return;
    }
    if (path2 === "/admin/stats" && method === "GET") {
      this.handleAdminStats(res);
    } else if (path2 === "/admin/accounts" && method === "GET") {
      this.handleAdminAccounts(res);
    } else if (path2 === "/admin/config" && method === "GET") {
      this.handleAdminConfig(res);
    } else if (path2 === "/admin/config" && method === "POST") {
      const body = await this.readBody(req, signal);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        this.sendError(res, 400, "Invalid JSON body");
        return;
      }
      const safeUpdate = this.filterAdminConfigUpdate(parsed);
      this.updateConfig(safeUpdate);
      this.appendAuditLog("config_updated", { fields: Object.keys(safeUpdate) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          applied: Object.keys(safeUpdate),
          config: this.handleAdminConfigPayload()
        })
      );
    } else if (path2 === "/admin/audit" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ entries: this.auditLog.slice(-100) }));
    } else if (path2 === "/admin/logs" && method === "GET") {
      this.handleAdminLogs(res);
    } else if (path2 === "/admin/cache/clear" && method === "POST") {
      const { clearAllCaches } = require("./kiroApi");
      const cleared = clearAllCaches();
      const promptCacheCleared = promptCacheTracker.clear();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ success: true, cleared: { ...cleared, promptCache: promptCacheCleared } })
      );
    } else {
      this.sendError(res, 404, "Admin endpoint not found");
    }
  }
  // 管理 API - 详细统计
  handleAdminStats(res) {
    const stats = this.getStats();
    const accountStats = {};
    stats.accountStats.forEach((v, k) => {
      accountStats[k] = v;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        totalRequests: stats.totalRequests,
        successRequests: stats.successRequests,
        failedRequests: stats.failedRequests,
        totalTokens: stats.totalTokens,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        uptime: Date.now() - stats.startTime,
        startTime: stats.startTime,
        accountStats,
        recentRequests: stats.recentRequests.slice(-50)
      })
    );
  }
  // 管理 API - 账号列表
  handleAdminAccounts(res) {
    const accounts = this.accountPool.getAllAccounts().map((acc) => ({
      id: acc.id,
      email: acc.email,
      isAvailable: acc.isAvailable !== false,
      lastUsed: acc.lastUsed,
      requestCount: acc.requestCount || 0,
      errorCount: acc.errorCount || 0,
      expiresAt: acc.expiresAt,
      authMethod: acc.authMethod
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        total: accounts.length,
        available: accounts.filter((a) => a.isAvailable).length,
        accounts
      })
    );
  }
  /**
   * P1-12 构造脱敏后的配置（apiKeys[].key 全部脱敏，tls 私钥不返回）
   * 暴露给 /admin/config GET
   */
  handleAdminConfigPayload() {
    const config = this.getConfig();
    const maskKey = (k) => {
      if (!k) return void 0;
      if (k.length <= 8) return "***";
      return `${k.slice(0, 4)}***${k.slice(-4)}`;
    };
    return {
      ...config,
      apiKey: maskKey(config.apiKey),
      apiKeys: config.apiKeys?.map((k) => ({ ...k, key: maskKey(k.key) || "***" })),
      tls: config.tls ? {
        enabled: config.tls.enabled,
        hasCert: !!(config.tls.cert || config.tls.certPath),
        hasKey: !!(config.tls.key || config.tls.keyPath)
      } : void 0
    };
  }
  // 管理 API - 配置
  handleAdminConfig(res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.handleAdminConfigPayload()));
  }
  /**
   * P1-9 admin/config POST 字段白名单过滤
   * 仅允许"可远程改"的字段；apiKeys/apiKey 等敏感字段必须通过本地 IPC 改
   */
  filterAdminConfigUpdate(input) {
    const allowed = [
      "enabled",
      "enableMultiAccount",
      "logRequests",
      "logStreamEvents",
      "maxConcurrent",
      "maxRetries",
      "retryDelayMs",
      "preferredEndpoint",
      "tokenRefreshBeforeExpiry",
      "autoStart",
      "clientDrivenToolExecution",
      "disableTools",
      "payloadSizeLimitKB",
      "enableTokenBufferReserve",
      "tokenBufferReserve",
      "autoSwitchOnQuotaExhausted",
      "accountSelectionStrategy",
      "multiAccountSelectionMode",
      "multiAccountGroupIds",
      "modelMappings",
      "maxRequestBodyBytes",
      "allowedIPs",
      "deniedIPs",
      "rateLimitPerKeyPerMinute",
      "sessionAffinityEnabled",
      "keepAliveTimeoutMs",
      "headersTimeoutMs",
      "recentRequestsLimit",
      "enableMetrics",
      "apiKeyGroupBindings",
      "enableAuditLog"
      // 故意排除：port / host / apiKey / apiKeys / tls / fallbackPort / allowExternalWithoutApiKey
      // 这些字段会改变监听行为或安全策略，必须本地 IPC 改
    ];
    const out = {};
    for (const key of allowed) {
      if (key in input) {
        out[key] = input[key];
      }
    }
    return out;
  }
  // 管理 API - 日志
  handleAdminLogs(res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        recentRequests: this.stats.recentRequests.slice(-100)
      })
    );
  }
  // 设置 CORS 头
  setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Api-Key, anthropic-version, anthropic-beta, x-api-key, x-stainless-os, x-stainless-lang, x-stainless-package-version, x-stainless-runtime, x-stainless-runtime-version, x-stainless-arch"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "x-request-id, x-ratelimit-limit-requests, x-ratelimit-limit-tokens, x-ratelimit-remaining-requests, x-ratelimit-remaining-tokens, x-ratelimit-reset-requests, x-ratelimit-reset-tokens"
    );
  }
  isAnthropicPath(path2) {
    const pathWithoutQuery = path2.split("?")[0];
    return pathWithoutQuery === "/v1/messages" || pathWithoutQuery === "/messages" || pathWithoutQuery === "/anthropic/v1/messages" || pathWithoutQuery === "/v1/messages/count_tokens" || pathWithoutQuery === "/messages/count_tokens";
  }
  getAnthropicErrorType(status) {
    if (status === 400) return "invalid_request_error";
    if (status === 401) return "authentication_error";
    if (status === 403) return "permission_error";
    if (status === 404) return "not_found_error";
    if (status === 429) return "rate_limit_error";
    return "api_error";
  }
  buildClaudeUsage(usage, simulatedCache) {
    const cacheWrite = usage.cacheWriteTokens || simulatedCache?.cacheCreationInputTokens || 0;
    const cacheRead = usage.cacheReadTokens || simulatedCache?.cacheReadInputTokens || 0;
    const adjustedInput = Math.max(0, usage.inputTokens - cacheWrite - cacheRead);
    return {
      input_tokens: adjustedInput,
      output_tokens: usage.outputTokens,
      ...cacheWrite ? { cache_creation_input_tokens: cacheWrite } : {},
      ...cacheRead ? { cache_read_input_tokens: cacheRead } : {}
    };
  }
  estimateTokenCount(value) {
    if (value === null || value === void 0) return 0;
    if (typeof value === "string") return Math.ceil(value.length / 4);
    if (typeof value === "number" || typeof value === "boolean") return 1;
    if (Array.isArray(value)) {
      return value.reduce((total, item) => total + this.estimateTokenCount(item), 0);
    }
    if (typeof value !== "object") return 0;
    const record = value;
    if (record.type === "text" || record.type === "input_text" || record.type === "output_text")
      return this.estimateTokenCount(record.text) + 4;
    if (record.type === "thinking")
      return this.estimateTokenCount(record.thinking) + this.estimateTokenCount(record.signature) + 4;
    if (record.type === "redacted_thinking") return 8;
    if (record.type === "image" || record.type === "input_image") return 170;
    if (record.type === "document" || record.type === "input_file")
      return this.estimateTokenCount(record.title) + this.estimateTokenCount(record.name) + this.estimateTokenCount(record.filename) + this.estimateTokenCount(record.source) + this.estimateTokenCount(record.file_data) + 120;
    if (record.type === "tool_use")
      return this.estimateTokenCount(record.name) + this.estimateTokenCount(record.input) + 12;
    if (record.type === "tool_result") return this.estimateTokenCount(record.content) + 8;
    if (typeof record.role === "string" && "content" in record)
      return this.estimateTokenCount(record.content) + 4;
    if (typeof record.name === "string" && "input_schema" in record)
      return this.estimateTokenCount(record.name) + this.estimateTokenCount(record.description) + this.estimateTokenCount(record.input_schema) + 32;
    return Object.entries(record).reduce(
      (total, [key, item]) => key === "cache_control" ? total : total + this.estimateTokenCount(item),
      0
    );
  }
  // 健康检查
  handleHealth(res) {
    const stats = this.getStats();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        version: "1.0.0",
        accounts: this.accountPool.size,
        availableAccounts: this.accountPool.availableCount,
        stats: {
          totalRequests: stats.totalRequests,
          successRequests: stats.successRequests,
          failedRequests: stats.failedRequests,
          totalTokens: stats.totalTokens,
          uptime: Date.now() - stats.startTime
        }
      })
    );
  }
  // Claude Code token 计数（模拟响应）
  async handleCountTokens(req, res, signal) {
    try {
      this.throwIfAborted(signal);
      const body = await this.readBody(req, signal);
      this.throwIfAborted(signal);
      const request = JSON.parse(body);
      if (!Array.isArray(request.messages)) {
        throw new Error("count_tokens requires messages");
      }
      const estimatedTokens = Math.max(
        1,
        this.estimateTokenCount(request.system) + this.estimateTokenCount(request.messages) + this.estimateTokenCount(request.tools)
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ input_tokens: estimatedTokens }));
    } catch (error) {
      if (this.isAbortError(error, signal)) return;
      this.sendError(
        res,
        400,
        error instanceof Error ? error.message : "Invalid request body",
        "anthropic"
      );
    }
  }
  // Gemini v1beta 模型列表
  async handleGeminiModels(res, signal) {
    const result = await this.getAvailableModels(signal);
    const geminiModels = result.models.map((m) => ({
      name: `models/${m.id}`,
      version: "001",
      displayName: m.name || m.id,
      description: m.description || "",
      inputTokenLimit: m.maxInputTokens || 2e5,
      outputTokenLimit: m.maxOutputTokens || 64e3,
      supportedGenerationMethods: ["generateContent", "streamGenerateContent"]
    }));
    this.throwIfResponseClosed(res, signal);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models: geminiModels }));
  }
  // Gemini v1beta generateContent / streamGenerateContent
  async handleGeminiRequest(req, res, path2, signal) {
    const body = await this.readBody(req, signal);
    this.throwIfAborted(signal);
    const geminiReq = JSON.parse(body);
    const matchedApiKey = req.matchedApiKey;
    const match = path2.match(/\/v1beta\/models\/([^:]+):(\w+)/);
    if (!match) {
      this.sendError(res, 400, "Invalid Gemini endpoint path");
      return;
    }
    const [, modelId, method] = match;
    const isStream = method === "streamGenerateContent";
    const messages = [];
    if (geminiReq.systemInstruction?.parts) {
      const sysText = geminiReq.systemInstruction.parts.map((p) => p.text || "").join("\n");
      if (sysText) messages.push({ role: "system", content: sysText });
    }
    for (const content of geminiReq.contents || []) {
      const role = content.role === "model" ? "assistant" : "user";
      const text = (content.parts || []).map((p) => p.text || "").join("");
      if (text) messages.push({ role, content: text });
    }
    if (messages.length === 0) {
      messages.push({ role: "user", content: "Hello" });
    }
    const openaiRequest = {
      model: this.applyModelMapping(modelId, matchedApiKey?.id),
      messages,
      stream: isStream,
      temperature: geminiReq.generationConfig?.temperature,
      top_p: geminiReq.generationConfig?.topP,
      max_tokens: geminiReq.generationConfig?.maxOutputTokens
    };
    const startTime = Date.now();
    this.recordNewRequest();
    this.throwIfAborted(signal);
    const account = await this.getAvailableAccount(signal);
    this.throwIfAborted(signal);
    if (!account) {
      this.sendError(res, 503, "No available accounts");
      return;
    }
    try {
      const toolNameRegistry = new ToolNameRegistry();
      const kiroPayload = openaiToKiro(openaiRequest, account.profileArn, toolNameRegistry);
      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        return new Promise((resolve) => {
          callKiroApiStream(
            account,
            kiroPayload,
            (text) => {
              if (signal?.aborted || this.isResponseClosed(res)) return;
              if (text) {
                const chunk = {
                  candidates: [
                    { content: { parts: [{ text }], role: "model" }, finishReason: null }
                  ]
                };
                res.write(`data: ${JSON.stringify(chunk)}

`);
              }
            },
            (usage) => {
              if (signal?.aborted || this.isResponseClosed(res)) {
                resolve();
                return;
              }
              const finalChunk = {
                candidates: [
                  { content: { parts: [{ text: "" }], role: "model" }, finishReason: "STOP" }
                ],
                usageMetadata: {
                  promptTokenCount: usage.inputTokens,
                  candidatesTokenCount: usage.outputTokens,
                  totalTokenCount: usage.inputTokens + usage.outputTokens
                }
              };
              res.write(`data: ${JSON.stringify(finalChunk)}

`);
              res.end();
              this.recordRequestSuccess();
              this.stats.totalTokens += usage.inputTokens + usage.outputTokens;
              this.stats.inputTokens += usage.inputTokens;
              this.stats.outputTokens += usage.outputTokens;
              this.stats.totalCredits += usage.credits || 0;
              this.accountPool.recordSuccess(account.id, usage.inputTokens + usage.outputTokens);
              resolve();
            },
            (error) => {
              if (this.isAbortError(error, signal) || this.isResponseClosed(res)) {
                resolve();
                return;
              }
              res.write(`data: ${JSON.stringify({ error: { message: error.message } })}

`);
              res.end();
              this.recordRequestFailed();
              resolve();
            },
            signal,
            this.config.preferredEndpoint
          ).catch((error) => {
            if (!this.isAbortError(error, signal) && !this.isResponseClosed(res)) {
              res.write(`data: ${JSON.stringify({ error: { message: error.message } })}

`);
              res.end();
              this.recordRequestFailed();
            }
            resolve();
          });
        });
      } else {
        const result = await callKiroApi(account, kiroPayload, signal);
        this.throwIfResponseClosed(res, signal);
        this.recordRequestSuccess();
        this.stats.totalTokens += result.usage.inputTokens + result.usage.outputTokens;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: result.content }], role: "model" },
                finishReason: "STOP"
              }
            ],
            usageMetadata: {
              promptTokenCount: result.usage.inputTokens,
              candidatesTokenCount: result.usage.outputTokens,
              totalTokenCount: result.usage.inputTokens + result.usage.outputTokens
            }
          })
        );
      }
    } catch (error) {
      this.handleApiError(res, account, error, "/v1beta", modelId, startTime, signal);
    }
  }
  // 模型列表缓存
  modelCache = null;
  MODEL_CACHE_TTL = 5 * 60 * 1e3;
  // 5 分钟缓存
  // 模型列表
  async handleModels(res, signal) {
    const now = Date.now();
    const kiroOfficialModels = [
      buildClientModel({
        id: "auto",
        created: now,
        ownedBy: "kiro-api",
        description: "Auto select best model"
      }),
      buildClientModel({
        id: "claude-sonnet-4.5",
        created: now,
        ownedBy: "kiro-api",
        description: "The latest Claude Sonnet model"
      }),
      buildClientModel({
        id: "claude-sonnet-4",
        created: now,
        ownedBy: "kiro-api",
        description: "Hybrid reasoning and coding"
      }),
      buildClientModel({
        id: "claude-haiku-4.5",
        created: now,
        ownedBy: "kiro-api",
        description: "The latest Claude Haiku model"
      }),
      buildClientModel({
        id: "claude-opus-4.5",
        created: now,
        ownedBy: "kiro-api",
        description: "The most powerful model"
      })
    ];
    const hiddenModels = [
      buildClientModel({
        id: "claude-3.7-sonnet",
        created: now,
        ownedBy: "kiro-api",
        description: "Claude 3.7 Sonnet (hidden)",
        modelName: "Claude 3.7 Sonnet",
        supportedInputTypes: ["TEXT", "IMAGE"],
        maxInputTokens: 2e5,
        maxOutputTokens: 64e3
      }),
      buildClientModel({
        id: "simple-task",
        created: now,
        ownedBy: "kiro-api",
        description: "Kiro fast model for intent classification and lightweight tasks (routes to Haiku)",
        modelName: "Simple Task",
        supportedInputTypes: ["TEXT"],
        maxInputTokens: 2e5,
        maxOutputTokens: 4096
      }),
      buildClientModel({
        id: "CLAUDE_HAIKU_4_5_20251001_V1_0",
        created: now,
        ownedBy: "kiro-api",
        description: "Claude Haiku 4.5 (CodeWhisperer internal ID)",
        modelName: "Claude Haiku 4.5 (CW)",
        supportedInputTypes: ["TEXT", "IMAGE"],
        maxInputTokens: 2e5,
        maxOutputTokens: 64e3
      }),
      buildClientModel({
        id: "CLAUDE_3_7_SONNET_20250219_V1_0",
        created: now,
        ownedBy: "kiro-api",
        description: "Claude 3.7 Sonnet (CodeWhisperer internal ID)",
        modelName: "Claude 3.7 Sonnet (CW)",
        supportedInputTypes: ["TEXT", "IMAGE"],
        maxInputTokens: 2e5,
        maxOutputTokens: 64e3
      })
    ];
    const presetModels = [
      buildClientModel({
        id: "gpt-4o",
        created: now,
        ownedBy: "kiro-proxy",
        description: "GPT-compatible alias for Kiro"
      }),
      buildClientModel({
        id: "gpt-4",
        created: now,
        ownedBy: "kiro-proxy",
        description: "GPT-compatible alias for Kiro"
      }),
      buildClientModel({
        id: "gpt-4-turbo",
        created: now,
        ownedBy: "kiro-proxy",
        description: "GPT-compatible alias for Kiro"
      }),
      buildClientModel({
        id: "gpt-3.5-turbo",
        created: now,
        ownedBy: "kiro-proxy",
        description: "GPT-compatible alias for Kiro"
      })
    ];
    let kiroModels = [];
    if (this.modelCache && now - this.modelCache.timestamp < this.MODEL_CACHE_TTL) {
      kiroModels = this.modelCache.models;
    } else {
      const account = this.accountPool.getNextAccount();
      if (account) {
        try {
          kiroModels = await fetchKiroModels(account, signal);
          if (kiroModels.length > 0) {
            this.modelCache = { models: kiroModels, timestamp: now };
            proxyLogger.info("ProxyServer", `Fetched ${kiroModels.length} models from Kiro API`);
          }
        } catch (error) {
          if (this.isAbortError(error, signal)) throw error;
          console.error("[ProxyServer] Failed to fetch Kiro models:", error);
        }
      }
    }
    const dynamicModels = kiroModels.map(
      (m) => buildClientModel({
        id: m.modelId,
        created: now,
        ownedBy: "kiro-api",
        description: m.description,
        modelName: m.modelName,
        supportedInputTypes: m.supportedInputTypes,
        maxInputTokens: m.tokenLimits?.maxInputTokens,
        maxOutputTokens: m.tokenLimits?.maxOutputTokens,
        rateMultiplier: m.rateMultiplier,
        rateUnit: m.rateUnit,
        promptCaching: m.promptCaching,
        additionalModelRequestFieldsSchema: m.additionalModelRequestFieldsSchema,
        modelProvider: m.modelProvider
      })
    );
    const modelIds = /* @__PURE__ */ new Set();
    const allModels = [];
    for (const m of dynamicModels) {
      if (!modelIds.has(m.id)) {
        modelIds.add(m.id);
        allModels.push(m);
      }
    }
    for (const m of hiddenModels) {
      if (!modelIds.has(m.id)) {
        modelIds.add(m.id);
        allModels.push(m);
      }
    }
    if (dynamicModels.length === 0) {
      for (const m of [...kiroOfficialModels, ...presetModels]) {
        if (!modelIds.has(m.id)) {
          modelIds.add(m.id);
          allModels.push(m);
        }
      }
    }
    this.throwIfResponseClosed(res, signal);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: allModels }));
  }
  // 处理 OpenAI Chat Completions 请求
  async handleOpenAIChat(req, res, signal) {
    const body = await this.readBody(req, signal);
    this.throwIfAborted(signal);
    const request = JSON.parse(body);
    const matchedApiKey = req.matchedApiKey;
    const rawHintChat = ProxyServer.extractSessionHint(req, request);
    if (!request.conversation_id && rawHintChat) {
      const keyPrefix = matchedApiKey?.id?.slice(0, 8) || "default";
      request.conversation_id = `${keyPrefix}:${rawHintChat}`;
    }
    const affinityHintChat = request.conversation_id;
    request.model = this.applyModelMapping(request.model, matchedApiKey?.id);
    const startTime = Date.now();
    this.recordNewRequest();
    this.events.onRequest?.({ path: "/v1/chat/completions", method: "POST" });
    let processedRequest;
    try {
      processedRequest = await this.resolveOpenAIHttpImages(
        this.prepareOpenAIRequest(request),
        signal
      );
    } catch (error) {
      if (this.isAbortError(error, signal)) return;
      this.recordRequestFailed();
      const message = error instanceof Error ? error.message : "Invalid request";
      this.sendError(res, 400, message);
      this.events.onResponse?.({
        path: "/v1/chat/completions",
        model: request.model,
        status: 400,
        error: message
      });
      this.recordRequest({
        path: "/v1/chat/completions",
        model: request.model,
        responseTime: Date.now() - startTime,
        success: false,
        error: message
      });
      return;
    }
    this.throwIfAborted(signal);
    const account = await this.getAvailableAccount(signal, affinityHintChat, matchedApiKey?.id);
    this.throwIfAborted(signal);
    if (!account) {
      this.recordRequestFailed();
      const quotaStatus = this.accountPool.getQuotaStatus();
      const errorMsg = quotaStatus.exhausted > 0 && quotaStatus.available === 0 ? `All accounts quota exhausted (${quotaStatus.exhausted}/${quotaStatus.total} exhausted, ${quotaStatus.cooldown} in cooldown)` : "No available accounts";
      this.sendError(res, 503, errorMsg);
      this.events.onResponse?.({
        path: "/v1/chat/completions",
        model: request.model,
        status: 503,
        error: errorMsg
      });
      this.recordRequest({
        path: "/v1/chat/completions",
        model: request.model,
        success: false,
        error: errorMsg
      });
      return;
    }
    this.events.onRequest?.({ path: "/v1/chat/completions", method: "POST", accountId: account.id });
    try {
      const toolNameRegistry = new ToolNameRegistry();
      const kiroPayload = openaiToKiro(processedRequest, account.profileArn, toolNameRegistry);
      if (this.config.logRequests) {
        const userInput = kiroPayload.conversationState.currentMessage?.userInputMessage;
        const contentLength = typeof userInput?.content === "string" ? userInput.content.length : 0;
        const toolsCount = userInput?.userInputMessageContext?.tools?.length || 0;
        const historyLength = kiroPayload.conversationState.history?.length || 0;
        const hasImages = (userInput?.images?.length || 0) > 0;
        proxyLogger.info("ProxyServer", `OpenAI API: ${request.model}`, {
          model: request.model,
          stream: request.stream,
          contentLength,
          toolsCount,
          historyLength,
          hasImages,
          accountId: account.id
        });
      }
      if (request.stream) {
        await this.handleOpenAIStream(
          res,
          account,
          kiroPayload,
          request.model,
          startTime,
          0,
          void 0,
          false,
          matchedApiKey,
          toolNameRegistry,
          signal
        );
      } else {
        const { result, account: usedAccount } = await this.callWithRetry(
          account,
          async (acc) => {
            const retryPayload = openaiToKiro(processedRequest, acc.profileArn, toolNameRegistry);
            return callKiroApi(acc, retryPayload, signal);
          },
          "/v1/chat/completions",
          signal
        );
        const response = kiroToOpenaiResponse(
          result.content,
          result.toolUses,
          result.usage,
          request.model,
          toolNameRegistry,
          result.reasoningContent
        );
        this.throwIfResponseClosed(res, signal);
        this.recordRequestSuccess();
        this.stats.totalTokens += result.usage.inputTokens + result.usage.outputTokens;
        this.stats.inputTokens += result.usage.inputTokens;
        this.stats.outputTokens += result.usage.outputTokens;
        this.accountPool.recordSuccess(
          usedAccount.id,
          result.usage.inputTokens + result.usage.outputTokens
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        const respTime = Date.now() - startTime;
        this.events.onResponse?.({
          path: "/v1/chat/completions",
          model: request.model,
          status: 200,
          tokens: result.usage.inputTokens + result.usage.outputTokens,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          reasoningTokens: result.usage.reasoningTokens,
          credits: result.usage.credits,
          responseTime: respTime
        });
        this.recordRequest({
          path: "/v1/chat/completions",
          model: request.model,
          accountId: usedAccount.id,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          credits: result.usage.credits,
          responseTime: respTime,
          success: true
        });
        if (matchedApiKey) {
          this.recordApiKeyUsage(
            matchedApiKey.id,
            result.usage.credits || 0,
            result.usage.inputTokens,
            result.usage.outputTokens,
            request.model,
            "/v1/chat/completions"
          );
        }
      }
    } catch (error) {
      this.handleApiError(
        res,
        account,
        error,
        "/v1/chat/completions",
        request.model,
        startTime,
        signal
      );
    }
  }
  async handleOpenAIResponses(req, res, signal) {
    const body = await this.readBody(req, signal);
    this.throwIfAborted(signal);
    const matchedApiKey = req.matchedApiKey;
    const startTime = Date.now();
    this.recordNewRequest();
    this.events.onRequest?.({ path: "/v1/responses", method: "POST" });
    let responseRequest;
    let chatRequest;
    let processedRequest;
    let affinityHintResp;
    try {
      responseRequest = JSON.parse(body);
      chatRequest = responsesToOpenAIChat(responseRequest);
      const rawHintResp = ProxyServer.extractSessionHint(req, responseRequest);
      if (rawHintResp) {
        const keyPrefix = matchedApiKey?.id?.slice(0, 8) || "default";
        affinityHintResp = `${keyPrefix}:${rawHintResp}`;
      }
      chatRequest.model = this.applyModelMapping(chatRequest.model, matchedApiKey?.id);
      processedRequest = await this.resolveOpenAIHttpImages(
        this.prepareOpenAIRequest(chatRequest),
        signal
      );
    } catch (error) {
      if (this.isAbortError(error, signal)) return;
      this.recordRequestFailed();
      const message = error instanceof Error ? error.message : "Invalid request";
      this.sendError(res, 400, message);
      this.events.onResponse?.({ path: "/v1/responses", status: 400, error: message });
      this.recordRequest({
        path: "/v1/responses",
        responseTime: Date.now() - startTime,
        success: false,
        error: message
      });
      return;
    }
    this.throwIfAborted(signal);
    const account = await this.getAvailableAccount(signal, affinityHintResp, matchedApiKey?.id);
    this.throwIfAborted(signal);
    if (!account) {
      this.recordRequestFailed();
      const quotaStatus = this.accountPool.getQuotaStatus();
      const errorMsg = quotaStatus.exhausted > 0 && quotaStatus.available === 0 ? `All accounts quota exhausted (${quotaStatus.exhausted}/${quotaStatus.total} exhausted, ${quotaStatus.cooldown} in cooldown)` : "No available accounts";
      this.sendError(res, 503, errorMsg);
      this.events.onResponse?.({
        path: "/v1/responses",
        model: chatRequest.model,
        status: 503,
        error: errorMsg
      });
      this.recordRequest({
        path: "/v1/responses",
        model: chatRequest.model,
        success: false,
        error: "No available accounts"
      });
      return;
    }
    this.events.onRequest?.({ path: "/v1/responses", method: "POST", accountId: account.id });
    try {
      const toolNameRegistry = new ToolNameRegistry();
      if (processedRequest.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        const responseId = `resp_${uuid.v4()}`;
        res.write(
          `event: response.created
data: ${JSON.stringify({ type: "response.created", response: { id: responseId, object: "response", created_at: Math.floor(Date.now() / 1e3), model: chatRequest.model, output: [] } })}

`
        );
        const { result: result2, account: usedAccount2 } = await this.callWithRetry(
          account,
          async (acc) => {
            const retryPayload = openaiToKiro(processedRequest, acc.profileArn, toolNameRegistry);
            return callKiroApi(acc, retryPayload, signal);
          },
          "/v1/responses",
          signal
        );
        const chatResponse2 = kiroToOpenaiResponse(
          result2.content,
          result2.toolUses,
          result2.usage,
          chatRequest.model,
          toolNameRegistry,
          result2.reasoningContent
        );
        this.throwIfResponseClosed(res, signal);
        const response2 = openAIChatToResponsesResponse(
          chatResponse2,
          responseRequest.previous_response_id
        );
        const streamedResponse = { ...response2, id: responseId };
        streamedResponse.output.forEach((item, outputIndex) => {
          this.throwIfResponseClosed(res, signal);
          res.write(
            `event: response.output_item.added
data: ${JSON.stringify({ type: "response.output_item.added", output_index: outputIndex, item })}

`
          );
          if (item.type === "message") {
            item.content.forEach((part, contentIndex) => {
              this.throwIfResponseClosed(res, signal);
              res.write(
                `event: response.content_part.added
data: ${JSON.stringify({ type: "response.content_part.added", item_id: item.id, output_index: outputIndex, content_index: contentIndex, part: { type: part.type, text: "" } })}

`
              );
              if (part.text) {
                res.write(
                  `event: response.output_text.delta
data: ${JSON.stringify({ type: "response.output_text.delta", item_id: item.id, output_index: outputIndex, content_index: contentIndex, delta: part.text })}

`
                );
              }
              res.write(
                `event: response.output_text.done
data: ${JSON.stringify({ type: "response.output_text.done", item_id: item.id, output_index: outputIndex, content_index: contentIndex, text: part.text })}

`
              );
              res.write(
                `event: response.content_part.done
data: ${JSON.stringify({ type: "response.content_part.done", item_id: item.id, output_index: outputIndex, content_index: contentIndex, part })}

`
              );
            });
          } else {
            if (item.arguments) {
              res.write(
                `event: response.function_call_arguments.delta
data: ${JSON.stringify({ type: "response.function_call_arguments.delta", item_id: item.id, output_index: outputIndex, delta: item.arguments })}

`
              );
            }
            res.write(
              `event: response.function_call_arguments.done
data: ${JSON.stringify({ type: "response.function_call_arguments.done", item_id: item.id, output_index: outputIndex, arguments: item.arguments })}

`
            );
          }
          this.throwIfResponseClosed(res, signal);
          res.write(
            `event: response.output_item.done
data: ${JSON.stringify({ type: "response.output_item.done", output_index: outputIndex, item })}

`
          );
        });
        this.throwIfResponseClosed(res, signal);
        res.write(
          `event: response.completed
data: ${JSON.stringify({ type: "response.completed", response: streamedResponse })}

`
        );
        res.end();
        this.recordRequestSuccess();
        this.stats.totalTokens += result2.usage.inputTokens + result2.usage.outputTokens;
        this.stats.inputTokens += result2.usage.inputTokens;
        this.stats.outputTokens += result2.usage.outputTokens;
        this.accountPool.recordSuccess(
          usedAccount2.id,
          result2.usage.inputTokens + result2.usage.outputTokens
        );
        const respTime2 = Date.now() - startTime;
        this.events.onResponse?.({
          path: "/v1/responses",
          model: chatRequest.model,
          status: 200,
          tokens: result2.usage.inputTokens + result2.usage.outputTokens,
          inputTokens: result2.usage.inputTokens,
          outputTokens: result2.usage.outputTokens,
          cacheReadTokens: result2.usage.cacheReadTokens,
          reasoningTokens: result2.usage.reasoningTokens,
          credits: result2.usage.credits,
          responseTime: respTime2
        });
        this.recordRequest({
          path: "/v1/responses",
          model: chatRequest.model,
          accountId: usedAccount2.id,
          inputTokens: result2.usage.inputTokens,
          outputTokens: result2.usage.outputTokens,
          credits: result2.usage.credits,
          responseTime: respTime2,
          success: true
        });
        if (matchedApiKey) {
          this.recordApiKeyUsage(
            matchedApiKey.id,
            result2.usage.credits || 0,
            result2.usage.inputTokens,
            result2.usage.outputTokens,
            chatRequest.model,
            "/v1/responses"
          );
        }
        return;
      }
      const { result, account: usedAccount } = await this.callWithRetry(
        account,
        async (acc) => {
          const retryPayload = openaiToKiro(processedRequest, acc.profileArn, toolNameRegistry);
          return callKiroApi(acc, retryPayload, signal);
        },
        "/v1/responses",
        signal
      );
      const chatResponse = kiroToOpenaiResponse(
        result.content,
        result.toolUses,
        result.usage,
        chatRequest.model,
        toolNameRegistry,
        result.reasoningContent
      );
      this.throwIfResponseClosed(res, signal);
      const response = openAIChatToResponsesResponse(
        chatResponse,
        responseRequest.previous_response_id
      );
      this.recordRequestSuccess();
      this.stats.totalTokens += result.usage.inputTokens + result.usage.outputTokens;
      this.stats.inputTokens += result.usage.inputTokens;
      this.stats.outputTokens += result.usage.outputTokens;
      this.accountPool.recordSuccess(
        usedAccount.id,
        result.usage.inputTokens + result.usage.outputTokens
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      const respTime = Date.now() - startTime;
      this.events.onResponse?.({
        path: "/v1/responses",
        model: chatRequest.model,
        status: 200,
        tokens: result.usage.inputTokens + result.usage.outputTokens,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        reasoningTokens: result.usage.reasoningTokens,
        credits: result.usage.credits,
        responseTime: respTime
      });
      this.recordRequest({
        path: "/v1/responses",
        model: chatRequest.model,
        accountId: usedAccount.id,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        credits: result.usage.credits,
        responseTime: respTime,
        success: true
      });
      if (matchedApiKey) {
        this.recordApiKeyUsage(
          matchedApiKey.id,
          result.usage.credits || 0,
          result.usage.inputTokens,
          result.usage.outputTokens,
          chatRequest.model,
          "/v1/responses"
        );
      }
    } catch (error) {
      this.handleApiError(
        res,
        account,
        error,
        "/v1/responses",
        chatRequest.model,
        startTime,
        signal
      );
    }
  }
  // 处理 OpenAI 流式响应
  async handleOpenAIStream(res, account, kiroPayload, model, startTime, currentRound = 0, streamId, headersSent = false, matchedApiKey, toolNameRegistry = new ToolNameRegistry(), signal, triedAccounts = /* @__PURE__ */ new Set()) {
    if (!headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
    }
    const id = streamId || `chatcmpl-${uuid.v4()}`;
    let toolCallIndex = 0;
    const pendingToolCalls = /* @__PURE__ */ new Map();
    let collectedContent = "";
    if (currentRound === 0) {
      const initialChunk = createOpenaiStreamChunk(id, model, { role: "assistant" });
      res.write(`data: ${JSON.stringify(initialChunk)}

`);
    }
    return new Promise((resolve) => {
      callKiroApiStream(
        account,
        kiroPayload,
        (text, toolUse, isThinking) => {
          if (signal?.aborted || this.isResponseClosed(res)) return;
          if (text && text.trim()) {
            if (isThinking) {
              const chunk = createOpenaiStreamChunk(id, model, { reasoning_content: text });
              res.write(`data: ${JSON.stringify(chunk)}

`);
            } else {
              collectedContent += text;
              const chunk = createOpenaiStreamChunk(id, model, { content: text });
              res.write(`data: ${JSON.stringify(chunk)}

`);
            }
          }
          if (toolUse) {
            const idx = toolCallIndex++;
            const restoredToolUse = toolNameRegistry.restoreToolUse(toolUse);
            pendingToolCalls.set(toolUse.toolUseId, {
              index: idx,
              name: toolUse.name,
              arguments: JSON.stringify(toolUse.input)
            });
            const toolChunk = createOpenaiStreamChunk(id, model, {
              tool_calls: [
                {
                  index: idx,
                  id: toolUse.toolUseId,
                  type: "function",
                  function: {
                    name: restoredToolUse.name,
                    arguments: JSON.stringify(toolUse.input)
                  }
                }
              ]
            });
            res.write(`data: ${JSON.stringify(toolChunk)}

`);
          }
        },
        async (usage) => {
          if (signal?.aborted || this.isResponseClosed(res)) {
            resolve();
            return;
          }
          this.recordRequestSuccess();
          this.stats.totalTokens += usage.inputTokens + usage.outputTokens;
          this.stats.inputTokens += usage.inputTokens;
          this.stats.outputTokens += usage.outputTokens;
          this.stats.cacheReadTokens += usage.cacheReadTokens || 0;
          this.stats.cacheWriteTokens += usage.cacheWriteTokens || 0;
          this.stats.reasoningTokens += usage.reasoningTokens || 0;
          this.stats.totalCredits += usage.credits || 0;
          this.events.onCreditsUpdate?.(this.stats.totalCredits);
          this.events.onTokensUpdate?.(this.stats.inputTokens, this.stats.outputTokens);
          this.accountPool.recordSuccess(account.id, usage.inputTokens + usage.outputTokens);
          const oaiRespTime = Date.now() - startTime;
          this.events.onResponse?.({
            path: "/v1/chat/completions",
            model,
            status: 200,
            tokens: usage.inputTokens + usage.outputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            reasoningTokens: usage.reasoningTokens,
            credits: usage.credits,
            responseTime: oaiRespTime
          });
          this.recordRequest({
            path: "/v1/chat/completions",
            model,
            accountId: account.id,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            credits: usage.credits,
            responseTime: oaiRespTime,
            success: true
          });
          if (matchedApiKey) {
            this.recordApiKeyUsage(
              matchedApiKey.id,
              usage.credits || 0,
              usage.inputTokens,
              usage.outputTokens,
              model,
              "/v1/chat/completions"
            );
          }
          const maxRounds = this.config.autoContinueRounds || 0;
          const hasToolCalls = pendingToolCalls.size > 0;
          const shouldContinue = this.config.clientDrivenToolExecution !== true && this.config.enableServerSideToolAutoContinue === true && hasToolCalls && maxRounds > 0 && currentRound < maxRounds;
          if (shouldContinue) {
            console.log(`[ProxyServer] Auto-continue round ${currentRound + 1}/${maxRounds}`);
            const toolResults = Array.from(pendingToolCalls.entries()).map(([toolId]) => ({
              toolUseId: toolId,
              content: [{ text: "Done. Continue with the next step." }]
            }));
            const originalMsg = kiroPayload.conversationState?.currentMessage?.userInputMessage;
            const modelId = originalMsg?.modelId || "anthropic.claude-sonnet-4-20250514-v1:0";
            const origin = originalMsg?.origin || "CHAT";
            const continuePayload = {
              ...kiroPayload,
              conversationState: {
                ...kiroPayload.conversationState,
                currentMessage: {
                  userInputMessage: {
                    content: "Continue.",
                    userInputMessageContext: {},
                    modelId,
                    origin
                  }
                },
                history: [
                  ...kiroPayload.conversationState?.history || [],
                  // 添加 assistant 响应
                  {
                    assistantResponseMessage: {
                      content: collectedContent || "I will continue with the task.",
                      ...pendingToolCalls.size > 0 ? {
                        toolUses: Array.from(pendingToolCalls.entries()).map(
                          ([toolId, toolData]) => ({
                            toolUseId: toolId,
                            name: toolData.name,
                            input: JSON.parse(toolData.arguments)
                          })
                        )
                      } : {}
                    }
                  },
                  // 添加工具结果（作为 user 消息）
                  ...toolResults.length > 0 ? [
                    {
                      userInputMessage: {
                        content: "Tool results provided.",
                        modelId,
                        origin,
                        userInputMessageContext: {
                          toolResults
                        }
                      }
                    }
                  ] : []
                ]
              }
            };
            try {
              await this.handleOpenAIStream(
                res,
                account,
                continuePayload,
                model,
                startTime,
                currentRound + 1,
                id,
                true,
                matchedApiKey,
                toolNameRegistry,
                signal,
                triedAccounts
              );
            } catch (error) {
              if (this.isAbortError(error, signal) || this.isResponseClosed(res)) {
                resolve();
                return;
              }
              console.error("[ProxyServer] Auto-continue error:", error);
            }
            resolve();
          } else {
            const finishReason = hasToolCalls ? "tool_calls" : "stop";
            const usageInfo = {
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.inputTokens + usage.outputTokens
            };
            if (usage.cacheReadTokens && usage.cacheReadTokens > 0) {
              usageInfo.prompt_tokens_details = { cached_tokens: usage.cacheReadTokens };
            }
            if (usage.reasoningTokens && usage.reasoningTokens > 0) {
              usageInfo.completion_tokens_details = { reasoning_tokens: usage.reasoningTokens };
            }
            const finalChunk = createOpenaiStreamChunk(id, model, {}, finishReason, usageInfo);
            res.write(`data: ${JSON.stringify(finalChunk)}

`);
            res.write("data: [DONE]\n\n");
            res.end();
            resolve();
          }
        },
        async (error) => {
          if (this.isAbortError(error, signal) || this.isResponseClosed(res)) {
            resolve();
            return;
          }
          console.error("[ProxyServer] Stream error:", error);
          const isSuspendedError = this.isSuspendedError(error.message);
          if (isSuspendedError) {
            const suspendedAccount = this.accountPool.markSuspended(account.id);
            if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
          } else if (this.isQuotaError(error.message)) {
            this.markQuotaError(account.id, error.message);
          } else {
            const errStatusCode = this.getErrorStatusCode(error);
            this.accountPool.recordError(
              account.id,
              errStatusCode ? classifyError(errStatusCode) : ErrorType.RECOVERABLE,
              errStatusCode
            );
          }
          const shouldFailoverAccount = isSuspendedError || this.isQuotaError(error.message) || error.message.includes("401") || error.message.includes("403") || error.message.includes("Auth");
          if (shouldFailoverAccount && collectedContent.length === 0 && pendingToolCalls.size === 0) {
            triedAccounts.add(account.id);
            const nextAccount = this.accountPool.getNextAccount(triedAccounts);
            if (nextAccount && nextAccount.id !== account.id) {
              await this.handleOpenAIStream(
                res,
                nextAccount,
                kiroPayload,
                model,
                startTime,
                currentRound,
                id,
                true,
                matchedApiKey,
                toolNameRegistry,
                signal,
                triedAccounts
              );
              resolve();
              return;
            }
          }
          res.write(`data: ${JSON.stringify({ error: { message: error.message } })}

`);
          res.end();
          this.recordRequestFailed();
          this.events.onResponse?.({
            path: "/v1/chat/completions",
            model,
            status: 500,
            error: error.message
          });
          this.recordRequest({
            path: "/v1/chat/completions",
            model,
            accountId: account.id,
            responseTime: Date.now() - startTime,
            success: false,
            error: error.message
          });
          resolve();
        },
        signal,
        this.config.preferredEndpoint
      ).catch((error) => {
        if (!this.isAbortError(error, signal) && !this.isResponseClosed(res)) {
          res.write(`data: ${JSON.stringify({ error: { message: error.message } })}

`);
          res.end();
          this.recordRequestFailed();
        }
        resolve();
      });
    });
  }
  // 处理 Claude Messages 请求
  async handleClaudeMessages(req, res, signal) {
    const body = await this.readBody(req, signal);
    this.throwIfAborted(signal);
    const request = JSON.parse(body);
    const matchedApiKey = req.matchedApiKey;
    const rawHint = ProxyServer.extractSessionHint(req, request);
    if (!request.conversation_id && rawHint) {
      const keyPrefix = matchedApiKey?.id?.slice(0, 8) || "default";
      request.conversation_id = `${keyPrefix}:${rawHint}`;
    }
    const affinityHint = request.conversation_id;
    request.model = this.applyModelMapping(request.model, matchedApiKey?.id);
    const startTime = Date.now();
    this.recordNewRequest();
    this.events.onRequest?.({ path: "/v1/messages", method: "POST" });
    let processedRequest;
    try {
      processedRequest = await this.resolveClaudeHttpImages(
        this.prepareClaudeRequest(request),
        signal
      );
    } catch (error) {
      if (this.isAbortError(error, signal)) return;
      this.recordRequestFailed();
      const message = error instanceof Error ? error.message : "Invalid request";
      this.sendError(res, 400, message, "anthropic");
      this.events.onResponse?.({
        path: "/v1/messages",
        model: request.model,
        status: 400,
        error: message
      });
      this.recordRequest({
        path: "/v1/messages",
        model: request.model,
        responseTime: Date.now() - startTime,
        success: false,
        error: message
      });
      return;
    }
    this.throwIfAborted(signal);
    const account = await this.getAvailableAccount(signal, affinityHint, matchedApiKey?.id);
    this.throwIfAborted(signal);
    if (!account) {
      this.recordRequestFailed();
      const quotaStatus = this.accountPool.getQuotaStatus();
      const errorMsg = quotaStatus.exhausted > 0 && quotaStatus.available === 0 ? `All accounts quota exhausted (${quotaStatus.exhausted}/${quotaStatus.total} exhausted, ${quotaStatus.cooldown} in cooldown)` : "No available accounts";
      this.sendError(res, 503, errorMsg, "anthropic");
      this.events.onResponse?.({
        path: "/v1/messages",
        model: request.model,
        status: 503,
        error: errorMsg
      });
      this.recordRequest({
        path: "/v1/messages",
        model: request.model,
        success: false,
        error: errorMsg
      });
      return;
    }
    this.events.onRequest?.({ path: "/v1/messages", method: "POST", accountId: account.id });
    try {
      const toolNameRegistry = new ToolNameRegistry();
      this.syncKProxyDeviceId(account);
      const kiroPayload = claudeToKiro(processedRequest, account.profileArn, toolNameRegistry);
      const estimatedInputTokens = Math.max(1, Math.round(JSON.stringify(kiroPayload).length * 0.3));
      const cacheProfile = promptCacheTracker.buildClaudeProfile(
        processedRequest.system,
        processedRequest.messages,
        processedRequest.tools,
        estimatedInputTokens,
        processedRequest.model
      );
      const cacheUsage = promptCacheTracker.compute(account.id, cacheProfile);
      if (cacheProfile) {
        proxyLogger.info(
          "ProxyServer",
          `Prompt cache: ${cacheProfile.breakpoints.length} breakpoints, creation=${cacheUsage.cacheCreationInputTokens}, read=${cacheUsage.cacheReadInputTokens}`
        );
      }
      if (this.config.logRequests) {
        const userInput = kiroPayload.conversationState.currentMessage?.userInputMessage;
        const contentLength = typeof userInput?.content === "string" ? userInput.content.length : 0;
        const toolsCount = userInput?.userInputMessageContext?.tools?.length || 0;
        const historyLength = kiroPayload.conversationState.history?.length || 0;
        const hasImages = (userInput?.images?.length || 0) > 0;
        proxyLogger.info("ProxyServer", `Claude API: ${request.model}`, {
          model: request.model,
          stream: request.stream,
          contentLength,
          toolsCount,
          historyLength,
          hasImages,
          accountId: account.id.substring(0, 8) + "..."
        });
      }
      if (request.stream) {
        await this.handleClaudeStream(
          res,
          account,
          kiroPayload,
          request.model,
          startTime,
          0,
          void 0,
          false,
          0,
          matchedApiKey,
          toolNameRegistry,
          signal,
          cacheProfile ? { ...cacheUsage, cacheProfile, accountId: account.id } : void 0
        );
      } else {
        const { result, account: usedAccount } = await this.callWithRetry(
          account,
          async (acc) => {
            const retryPayload = claudeToKiro(processedRequest, acc.profileArn, toolNameRegistry);
            return callKiroApi(acc, retryPayload, signal);
          },
          "/v1/messages",
          signal
        );
        const response = kiroToClaudeResponse(
          result.content,
          result.toolUses,
          result.usage,
          request.model,
          toolNameRegistry,
          result.reasoningContent
        );
        if (cacheProfile && cacheUsage) {
          if (cacheUsage.cacheCreationInputTokens > 0)
            response.usage.cache_creation_input_tokens = cacheUsage.cacheCreationInputTokens;
          if (cacheUsage.cacheReadInputTokens > 0)
            response.usage.cache_read_input_tokens = cacheUsage.cacheReadInputTokens;
          promptCacheTracker.update(usedAccount.id, cacheProfile);
        }
        this.throwIfResponseClosed(res, signal);
        this.recordRequestSuccess();
        this.stats.totalTokens += result.usage.inputTokens + result.usage.outputTokens;
        this.stats.inputTokens += result.usage.inputTokens;
        this.stats.outputTokens += result.usage.outputTokens;
        this.accountPool.recordSuccess(
          usedAccount.id,
          result.usage.inputTokens + result.usage.outputTokens
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        const respTime = Date.now() - startTime;
        this.events.onResponse?.({
          path: "/v1/messages",
          model: request.model,
          status: 200,
          tokens: result.usage.inputTokens + result.usage.outputTokens,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          reasoningTokens: result.usage.reasoningTokens,
          credits: result.usage.credits,
          responseTime: respTime
        });
        this.recordRequest({
          path: "/v1/messages",
          model: request.model,
          accountId: usedAccount.id,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          credits: result.usage.credits,
          responseTime: respTime,
          success: true
        });
      }
    } catch (error) {
      this.handleApiError(
        res,
        account,
        error,
        "/v1/messages",
        request.model,
        startTime,
        signal
      );
    }
  }
  // 处理 Claude 流式响应
  async handleClaudeStream(res, account, kiroPayload, model, startTime, currentRound = 0, msgId, headersSent = false, contentBlockIndex = 0, matchedApiKey, toolNameRegistry = new ToolNameRegistry(), signal, simulatedCacheUsage, triedAccounts = /* @__PURE__ */ new Set()) {
    let streamStarted = headersSent;
    const id = msgId || `msg_${uuid.v4()}`;
    const ensureStreamStarted = () => {
      if (streamStarted) return;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      streamStarted = true;
      if (currentRound === 0) {
        const messageStart = createClaudeStreamEvent("message_start", {
          message: {
            id,
            type: "message",
            role: "assistant",
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: estimatedInputTokens, output_tokens: 0 }
          }
        });
        res.write(`event: message_start
data: ${JSON.stringify(messageStart)}

`);
      }
    };
    let currentBlockIndex = contentBlockIndex;
    let hasStartedTextBlock = false;
    let hasStartedThinkingBlock = false;
    let pendingThinkingSignature;
    let collectedContent = "";
    const pendingToolCalls = /* @__PURE__ */ new Map();
    const flushThinkingSignature = () => {
      if (!pendingThinkingSignature) return;
      const signatureDelta = createClaudeStreamEvent("content_block_delta", {
        index: currentBlockIndex,
        delta: { type: "signature_delta", signature: pendingThinkingSignature }
      });
      res.write(`event: content_block_delta
data: ${JSON.stringify(signatureDelta)}

`);
      pendingThinkingSignature = void 0;
    };
    const estimatedInputTokens = Math.max(1, Math.round(JSON.stringify(kiroPayload).length / 3));
    return new Promise((resolve) => {
      this.syncKProxyDeviceId(account);
      callKiroApiStream(
        account,
        kiroPayload,
        (text, toolUse, isThinking, reasoningSignature, redactedContent) => {
          if (signal?.aborted || this.isResponseClosed(res)) return;
          ensureStreamStarted();
          if (redactedContent) {
            if (hasStartedTextBlock) {
              const blockStop2 = createClaudeStreamEvent("content_block_stop", {
                index: currentBlockIndex
              });
              res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop2)}

`);
              currentBlockIndex++;
              hasStartedTextBlock = false;
            }
            if (hasStartedThinkingBlock) {
              flushThinkingSignature();
              const blockStop2 = createClaudeStreamEvent("content_block_stop", {
                index: currentBlockIndex
              });
              res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop2)}

`);
              currentBlockIndex++;
              hasStartedThinkingBlock = false;
            }
            const blockStart = createClaudeStreamEvent("content_block_start", {
              index: currentBlockIndex,
              content_block: { type: "redacted_thinking", data: redactedContent }
            });
            res.write(`event: content_block_start
data: ${JSON.stringify(blockStart)}

`);
            const blockStop = createClaudeStreamEvent("content_block_stop", {
              index: currentBlockIndex
            });
            res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
            currentBlockIndex++;
            return;
          }
          if (text && text.trim()) {
            if (isThinking) {
              if (hasStartedTextBlock) {
                const blockStop = createClaudeStreamEvent("content_block_stop", {
                  index: currentBlockIndex
                });
                res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
                currentBlockIndex++;
                hasStartedTextBlock = false;
              }
              if (!hasStartedThinkingBlock) {
                const blockStart = createClaudeStreamEvent("content_block_start", {
                  index: currentBlockIndex,
                  content_block: { type: "thinking", thinking: "" }
                });
                res.write(`event: content_block_start
data: ${JSON.stringify(blockStart)}

`);
                hasStartedThinkingBlock = true;
              }
              const delta = createClaudeStreamEvent("content_block_delta", {
                index: currentBlockIndex,
                delta: { type: "thinking_delta", thinking: text }
              });
              res.write(`event: content_block_delta
data: ${JSON.stringify(delta)}

`);
              if (reasoningSignature) {
                pendingThinkingSignature = reasoningSignature;
              }
            } else {
              if (hasStartedThinkingBlock) {
                flushThinkingSignature();
                const blockStop = createClaudeStreamEvent("content_block_stop", {
                  index: currentBlockIndex
                });
                res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
                currentBlockIndex++;
                hasStartedThinkingBlock = false;
              }
              collectedContent += text;
              if (!hasStartedTextBlock) {
                const blockStart = createClaudeStreamEvent("content_block_start", {
                  index: currentBlockIndex,
                  content_block: { type: "text", text: "" }
                });
                res.write(`event: content_block_start
data: ${JSON.stringify(blockStart)}

`);
                hasStartedTextBlock = true;
              }
              const delta = createClaudeStreamEvent("content_block_delta", {
                index: currentBlockIndex,
                delta: { type: "text_delta", text }
              });
              res.write(`event: content_block_delta
data: ${JSON.stringify(delta)}

`);
            }
          } else if (isThinking && reasoningSignature) {
            if (!hasStartedThinkingBlock) {
              const blockStart = createClaudeStreamEvent("content_block_start", {
                index: currentBlockIndex,
                content_block: { type: "thinking", thinking: "" }
              });
              res.write(`event: content_block_start
data: ${JSON.stringify(blockStart)}

`);
              hasStartedThinkingBlock = true;
            }
            pendingThinkingSignature = reasoningSignature;
          }
          if (toolUse) {
            const restoredToolUse = toolNameRegistry.restoreToolUse(toolUse);
            if (hasStartedThinkingBlock) {
              flushThinkingSignature();
              const blockStop = createClaudeStreamEvent("content_block_stop", {
                index: currentBlockIndex
              });
              res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
              currentBlockIndex++;
              hasStartedThinkingBlock = false;
            }
            if (hasStartedTextBlock) {
              const blockStop = createClaudeStreamEvent("content_block_stop", {
                index: currentBlockIndex
              });
              res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
              currentBlockIndex++;
              hasStartedTextBlock = false;
            }
            pendingToolCalls.set(toolUse.toolUseId, { name: toolUse.name, input: toolUse.input });
            const toolBlockStart = createClaudeStreamEvent("content_block_start", {
              index: currentBlockIndex,
              content_block: {
                type: "tool_use",
                id: toolUse.toolUseId,
                name: restoredToolUse.name,
                input: {}
              }
            });
            res.write(`event: content_block_start
data: ${JSON.stringify(toolBlockStart)}

`);
            const toolDelta = createClaudeStreamEvent("content_block_delta", {
              index: currentBlockIndex,
              delta: {
                type: "input_json_delta",
                partial_json: JSON.stringify(toolUse.input)
              }
            });
            res.write(`event: content_block_delta
data: ${JSON.stringify(toolDelta)}

`);
            const toolBlockStop = createClaudeStreamEvent("content_block_stop", {
              index: currentBlockIndex
            });
            res.write(`event: content_block_stop
data: ${JSON.stringify(toolBlockStop)}

`);
            currentBlockIndex++;
          }
        },
        async (usage) => {
          if (signal?.aborted || this.isResponseClosed(res)) {
            resolve();
            return;
          }
          if (hasStartedThinkingBlock) {
            flushThinkingSignature();
            const blockStop = createClaudeStreamEvent("content_block_stop", {
              index: currentBlockIndex
            });
            res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
            currentBlockIndex++;
            hasStartedThinkingBlock = false;
          }
          if (hasStartedTextBlock) {
            const blockStop = createClaudeStreamEvent("content_block_stop", {
              index: currentBlockIndex
            });
            res.write(`event: content_block_stop
data: ${JSON.stringify(blockStop)}

`);
            currentBlockIndex++;
          }
          this.recordRequestSuccess();
          this.stats.totalTokens += usage.inputTokens + usage.outputTokens;
          this.stats.inputTokens += usage.inputTokens;
          this.stats.outputTokens += usage.outputTokens;
          this.stats.totalCredits += usage.credits || 0;
          this.events.onCreditsUpdate?.(this.stats.totalCredits);
          this.events.onTokensUpdate?.(this.stats.inputTokens, this.stats.outputTokens);
          this.accountPool.recordSuccess(account.id, usage.inputTokens + usage.outputTokens);
          this.stats.cacheReadTokens += usage.cacheReadTokens || simulatedCacheUsage?.cacheReadInputTokens || 0;
          this.stats.cacheWriteTokens += usage.cacheWriteTokens || simulatedCacheUsage?.cacheCreationInputTokens || 0;
          this.stats.reasoningTokens += usage.reasoningTokens || 0;
          const respTime = Date.now() - startTime;
          this.events.onResponse?.({
            path: "/v1/messages",
            model,
            status: 200,
            tokens: usage.inputTokens + usage.outputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens || simulatedCacheUsage?.cacheReadInputTokens,
            reasoningTokens: usage.reasoningTokens,
            credits: usage.credits,
            responseTime: respTime
          });
          this.recordRequest({
            path: "/v1/messages",
            model,
            accountId: account.id,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            credits: usage.credits,
            responseTime: respTime,
            success: true
          });
          if (matchedApiKey) {
            this.recordApiKeyUsage(
              matchedApiKey.id,
              usage.credits || 0,
              usage.inputTokens,
              usage.outputTokens,
              model,
              "/v1/messages"
            );
          }
          const maxRounds = this.config.autoContinueRounds || 0;
          const hasToolCalls = pendingToolCalls.size > 0;
          const shouldContinue = this.config.clientDrivenToolExecution !== true && this.config.enableServerSideToolAutoContinue === true && hasToolCalls && maxRounds > 0 && currentRound < maxRounds;
          if (shouldContinue) {
            console.log(`[ProxyServer] Claude auto-continue round ${currentRound + 1}/${maxRounds}`);
            const toolResults = Array.from(pendingToolCalls.entries()).map(([toolId]) => ({
              toolUseId: toolId,
              content: [{ text: "Done. Continue with the next step." }],
              status: "success"
            }));
            const originalMsg = kiroPayload.conversationState?.currentMessage?.userInputMessage;
            const modelId = originalMsg?.modelId || "anthropic.claude-sonnet-4-20250514-v1:0";
            const origin = originalMsg?.origin || "CHAT";
            const continuePayload = {
              ...kiroPayload,
              conversationState: {
                ...kiroPayload.conversationState,
                currentMessage: {
                  userInputMessage: {
                    content: "Continue.",
                    userInputMessageContext: {
                      toolResults
                    },
                    modelId,
                    origin
                  }
                },
                history: [
                  ...kiroPayload.conversationState?.history || [],
                  {
                    assistantResponseMessage: {
                      content: collectedContent || "I will continue with the task.",
                      ...pendingToolCalls.size > 0 ? {
                        toolUses: Array.from(pendingToolCalls.entries()).map(
                          ([toolId, toolData]) => ({
                            toolUseId: toolId,
                            name: toolData.name,
                            input: toolData.input
                          })
                        )
                      } : {}
                    }
                  }
                ]
              }
            };
            try {
              await this.handleClaudeStream(
                res,
                account,
                continuePayload,
                model,
                startTime,
                currentRound + 1,
                id,
                true,
                currentBlockIndex,
                matchedApiKey,
                toolNameRegistry,
                signal,
                void 0,
                triedAccounts
              );
            } catch (error) {
              if (this.isAbortError(error, signal) || this.isResponseClosed(res)) {
                resolve();
                return;
              }
              console.error("[ProxyServer] Claude auto-continue error:", error);
            }
            resolve();
          } else {
            if (simulatedCacheUsage?.cacheProfile && simulatedCacheUsage?.accountId) {
              promptCacheTracker.update(
                simulatedCacheUsage.accountId,
                simulatedCacheUsage.cacheProfile
              );
            }
            const stopReason = hasToolCalls ? "tool_use" : "end_turn";
            const messageDelta = createClaudeStreamEvent("message_delta", {
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage: this.buildClaudeUsage(usage, simulatedCacheUsage)
            });
            res.write(`event: message_delta
data: ${JSON.stringify(messageDelta)}

`);
            const messageStop = createClaudeStreamEvent("message_stop");
            res.write(`event: message_stop
data: ${JSON.stringify(messageStop)}

`);
            res.end();
            resolve();
          }
        },
        async (error) => {
          if (this.isAbortError(error, signal) || this.isResponseClosed(res)) {
            resolve();
            return;
          }
          console.error("[ProxyServer] Stream error:", error);
          const errStatusCode2 = this.getErrorStatusCode(error);
          const isSuspendedError = this.isSuspendedError(error.message);
          if (isSuspendedError) {
            const suspendedAccount = this.accountPool.markSuspended(account.id);
            if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
          } else if (this.isQuotaError(error.message)) {
            this.markQuotaError(account.id, error.message);
          } else {
            this.accountPool.recordError(
              account.id,
              errStatusCode2 ? classifyError(errStatusCode2) : ErrorType.RECOVERABLE,
              errStatusCode2
            );
          }
          const shouldFailoverAccount = isSuspendedError || this.isQuotaError(error.message) || error.message.includes("401") || error.message.includes("403") || error.message.includes("Auth");
          if (shouldFailoverAccount) {
            triedAccounts.add(account.id);
          }
          const nextAccount = shouldFailoverAccount ? this.accountPool.getNextAccount(triedAccounts) : null;
          if (nextAccount && nextAccount.id !== account.id) {
            const nextPayload = {
              ...kiroPayload,
              conversationState: {
                ...kiroPayload.conversationState,
                currentMessage: {
                  userInputMessage: {
                    ...kiroPayload.conversationState.currentMessage.userInputMessage,
                    profileArn: nextAccount.profileArn
                  }
                }
              }
            };
            await this.handleClaudeStream(
              res,
              nextAccount,
              nextPayload,
              model,
              startTime,
              currentRound,
              id,
              streamStarted,
              currentBlockIndex,
              matchedApiKey,
              toolNameRegistry,
              signal,
              simulatedCacheUsage,
              triedAccounts
            );
            resolve();
            return;
          }
          this.recordRequestFailed();
          if (!streamStarted) {
            this.sendError(res, 503, error.message, "anthropic");
            resolve();
            return;
          }
          const errorEvent = createClaudeStreamEvent("error", {
            error: { type: "api_error", message: error.message }
          });
          res.write(`event: error
data: ${JSON.stringify(errorEvent)}

`);
          res.end();
          this.events.onResponse?.({
            path: "/v1/messages",
            model,
            status: 500,
            error: error.message
          });
          this.recordRequest({
            path: "/v1/messages",
            model,
            accountId: account.id,
            responseTime: Date.now() - startTime,
            success: false,
            error: error.message
          });
          resolve();
        },
        signal,
        this.config.preferredEndpoint
      ).catch(async (error) => {
        if (!this.isAbortError(error, signal) && !this.isResponseClosed(res)) {
          const isSuspendedError = this.isSuspendedError(error.message);
          if (isSuspendedError) {
            const suspendedAccount = this.accountPool.markSuspended(account.id);
            if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
          } else if (this.isQuotaError(error.message)) {
            this.markQuotaError(account.id, error.message);
          }
          const shouldFailoverAccount = isSuspendedError || this.isQuotaError(error.message) || error.message.includes("401") || error.message.includes("403") || error.message.includes("Auth");
          if (shouldFailoverAccount) triedAccounts.add(account.id);
          const nextAccount = shouldFailoverAccount ? this.accountPool.getNextAccount(triedAccounts) : null;
          if (nextAccount && nextAccount.id !== account.id) {
            const nextPayload = {
              ...kiroPayload,
              conversationState: {
                ...kiroPayload.conversationState,
                currentMessage: {
                  userInputMessage: {
                    ...kiroPayload.conversationState.currentMessage.userInputMessage,
                    profileArn: nextAccount.profileArn
                  }
                }
              }
            };
            await this.handleClaudeStream(
              res,
              nextAccount,
              nextPayload,
              model,
              startTime,
              currentRound,
              id,
              streamStarted,
              currentBlockIndex,
              matchedApiKey,
              toolNameRegistry,
              signal,
              simulatedCacheUsage,
              triedAccounts
            );
          } else {
            this.recordRequestFailed();
            if (!streamStarted) {
              this.sendError(res, 503, error.message, "anthropic");
            } else {
              const errorEvent = createClaudeStreamEvent("error", {
                error: { type: "api_error", message: error.message }
              });
              res.write(`event: error
data: ${JSON.stringify(errorEvent)}

`);
              res.end();
            }
          }
        }
        resolve();
      });
    });
  }
  isSuspendedError(message) {
    const lower = message.toLowerCase();
    return lower.includes("accountsuspended") || lower.includes("suspended") || lower.includes("locked") || lower.includes("temporarily_suspended") || lower.includes("temporarily suspended") || lower.includes("temporarily is suspended") || lower.includes("security precaution");
  }
  getErrorStatusCode(error) {
    const message = error.message || "";
    const apiMatch = message.match(/(?:API error|Auth error)\s+(\d{3})/i);
    if (apiMatch) return parseInt(apiMatch[1], 10);
    const anyMatch = message.match(/\b(\d{3})\b/);
    return anyMatch ? parseInt(anyMatch[1], 10) : void 0;
  }
  isQuotaError(message) {
    const lower = message.toLowerCase();
    return lower.includes("api error 402") || lower.includes("api error 429") || lower.includes("monthly_request_count") || lower.includes("you have reached the limit") || lower.includes("quota") || lower.includes("throttlingexception") || lower.includes("servicequotaexceededexception") || lower.includes("limit exceeded") || lower.includes("rate limit");
  }
  markQuotaError(accountId, message) {
    const statusCode = message.includes("402") || message.toLowerCase().includes("monthly_request_count") ? 402 : 429;
    this.accountPool.recordError(accountId, ErrorType.RECOVERABLE, statusCode);
  }
  // 处理 API 错误
  handleApiError(res, account, error, path2, model, startTime, signal) {
    if (this.isAbortError(error, signal) || this.isResponseClosed(res)) return;
    this.recordRequestFailed();
    const parsedCode = this.getErrorStatusCode(error) || 500;
    const errorType = classifyError(parsedCode);
    const isAuthError = error.message.includes("401") || error.message.includes("403") || error.message.includes("Auth");
    if (isAuthError && this.isSuspendedError(error.message)) {
      const suspendedAccount = this.accountPool.markSuspended(account.id);
      if (suspendedAccount) this.events.onAccountUpdate?.(suspendedAccount);
    } else if (this.isQuotaError(error.message)) {
      this.markQuotaError(account.id, error.message);
    } else {
      this.accountPool.recordError(account.id, errorType, parsedCode);
    }
    let statusCode = parsedCode;
    if (isAuthError) statusCode = 401;
    if (res.headersSent) {
      if (!this.isResponseClosed(res)) {
        if (path2 === "/v1/responses" || path2 === "/responses") {
          res.write(
            `event: response.failed
data: ${JSON.stringify({ type: "response.failed", error: { type: "api_error", message: error.message } })}

`
          );
        }
        res.end();
      }
      this.events.onResponse?.({ path: path2, status: statusCode, error: error.message });
      this.recordRequest({
        path: path2,
        model,
        accountId: account.id,
        responseTime: startTime ? Date.now() - startTime : 0,
        success: false,
        error: error.message
      });
      return;
    }
    this.sendError(
      res,
      statusCode,
      error.message,
      this.isAnthropicPath(path2) ? "anthropic" : "openai"
    );
    this.events.onResponse?.({ path: path2, status: statusCode, error: error.message });
    this.recordRequest({
      path: path2,
      model,
      accountId: account.id,
      responseTime: startTime ? Date.now() - startTime : 0,
      success: false,
      error: error.message
    });
  }
  // 读取请求体
  /**
   * 读取请求体，限制最大字节数以防 DoS
   * - Content-Length 头超限：立即 reject
   * - 流式累加超限：销毁连接并 reject
   * 触发 BodyTooLarge 错误时上层会发 413 Payload Too Large
   */
  readBody(req, signal) {
    const maxBytes = Math.max(1024, this.config.maxRequestBodyBytes ?? 10 * 1024 * 1024);
    const declaredLen = parseInt(req.headers["content-length"] || "0", 10);
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
      return Promise.reject(new BodyTooLargeError(declaredLen, maxBytes));
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      const cleanup = () => {
        req.off("data", onData);
        req.off("end", onEnd);
        req.off("error", onError);
        req.off("aborted", onAborted);
        signal?.removeEventListener("abort", onAbort);
      };
      const onData = (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          cleanup();
          reject(new BodyTooLargeError(total, maxBytes));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      };
      const onEnd = () => {
        cleanup();
        resolve(Buffer.concat(chunks, total).toString("utf8"));
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onAborted = () => {
        cleanup();
        reject(new Error("Client disconnected"));
      };
      const onAbort = () => {
        cleanup();
        reject(this.getAbortError(signal));
      };
      if (signal?.aborted) {
        reject(this.getAbortError(signal));
        return;
      }
      req.on("data", onData);
      req.on("end", onEnd);
      req.on("error", onError);
      req.on("aborted", onAborted);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  // 发送错误响应
  sendError(res, status, message, format = "openai") {
    if (res.writableEnded || res.destroyed) return;
    const safeMessage = status >= 500 && status < 600 ? this.sanitizeErrorMessage(message) || "Internal server error" : message;
    if (status === 503) {
      this.notifyAllAccountsExhausted("unknown");
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    if (format === "anthropic") {
      res.end(
        JSON.stringify({
          type: "error",
          error: {
            type: this.getAnthropicErrorType(status),
            message
          }
        })
      );
      return;
    }
    res.end(JSON.stringify({ error: { message: safeMessage, type: "error", code: status } }));
  }
  /**
   * P0-5 / P2-19 错误消息脱敏（移除可能含的 Bearer/Token/路径等敏感信息）
   * 用于错误响应和日志输出
   */
  sanitizeErrorMessage(msg) {
    if (!msg) return "";
    return msg.replace(/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, "Bearer ***").replace(
      /(access[_-]?token|refresh[_-]?token|api[_-]?key|x-api-key)["'\s:=]+[^"',\s}]+/gi,
      "$1=***"
    ).replace(/eyJ[A-Za-z0-9\-_]{20,}/g, "eyJ***").replace(/C:\\Users\\[^\\/\s]+/gi, "C:\\Users\\***").replace(/\/home\/[^\s/]+/g, "/home/***").replace(/\/Users\/[^\s/]+/g, "/Users/***");
  }
  /**
   * P1-7 滑动窗口限流：每分钟 N 次（按 API Key id 或 IP）
   * 0 = 不限制
   */
  checkRateLimit(id) {
    const limit = this.config.rateLimitPerKeyPerMinute || 0;
    if (limit <= 0) return { allowed: true, retryAfterMs: 0 };
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(id);
    if (!bucket || now - bucket.windowStart >= 6e4) {
      this.rateLimitBuckets.set(id, { count: 1, windowStart: now });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, retryAfterMs: 6e4 - (now - bucket.windowStart) };
    }
    bucket.count++;
    return { allowed: true, retryAfterMs: 0 };
  }
  /** 定期清理过期的限流桶 / 会话粘性条目（避免内存泄漏） */
  cleanupExpiredCaches() {
    const now = Date.now();
    for (const [key, bucket] of this.rateLimitBuckets) {
      if (now - bucket.windowStart > 12e4) this.rateLimitBuckets.delete(key);
    }
    for (const [key, entry] of this.sessionAffinity) {
      if (now - entry.lastAt > 6e5) this.sessionAffinity.delete(key);
    }
    if (this.auditLog.length > 200) {
      this.auditLog = this.auditLog.slice(-200);
    }
  }
  /**
   * P1-8 会话粘性账号选择：相同 session hint 优先复用同一账号
   * 实现方式：用 sessionHint hash 索引到固定账号；账号失效时自动失效粘性
   */
  pickAccountWithAffinity(sessionHint) {
    if (!this.config.sessionAffinityEnabled || !sessionHint) return null;
    const entry = this.sessionAffinity.get(sessionHint);
    if (entry) {
      const account = this.accountPool.getAccount(entry.accountId);
      if (account && !this.accountPool.isSuspended(account.id) && account.isAvailable !== false) {
        entry.lastAt = Date.now();
        return account;
      }
      this.sessionAffinity.delete(sessionHint);
    }
    return null;
  }
  /** 记录粘性映射 */
  rememberAffinity(sessionHint, accountId) {
    if (!this.config.sessionAffinityEnabled || !sessionHint) return;
    this.sessionAffinity.set(sessionHint, { accountId, lastAt: Date.now() });
  }
  /** P2-17 审计日志 */
  appendAuditLog(type, data) {
    if (!this.config.enableAuditLog) return;
    this.auditLog.push({ ts: Date.now(), type, data });
    if (this.auditLog.length > 200) this.auditLog.shift();
  }
  /** 获取审计日志（供管理 API） */
  getAuditLog() {
    return this.auditLog;
  }
  /** 注入 webhook 触发器（由 main/index.ts 注入，调用 renderer 的 webhook store） */
  setWebhookTrigger(fn) {
    this.webhookTrigger = fn;
  }
  /** 关键事件去重时间戳（5 分钟内同事件不重复推） */
  lastWebhookByEvent = /* @__PURE__ */ new Map();
  /** P1-6 触发 webhook（封装错误处理 + 5 分钟去重） */
  triggerWebhook(event, payload) {
    const now = Date.now();
    const last = this.lastWebhookByEvent.get(event) || 0;
    if (now - last < 5 * 6e4) return;
    this.lastWebhookByEvent.set(event, now);
    try {
      this.webhookTrigger?.(event, payload);
    } catch (err) {
      proxyLogger.warn("ProxyServer", `Webhook trigger failed: ${err.message}`);
    }
  }
  /** 全员配额耗尽 webhook（503 时调用） */
  notifyAllAccountsExhausted(path2, model) {
    const quota = this.accountPool.getQuotaStatus();
    this.appendAuditLog("all_accounts_exhausted", { path: path2, model, ...quota });
    this.triggerWebhook("proxy-all-exhausted", {
      title: "反代账号全部不可用",
      message: `所有账号配额耗尽或冷却中（exhausted=${quota.exhausted}/${quota.total}，cooldown=${quota.cooldown}）`,
      level: "error",
      fields: {
        端点: path2,
        模型: model || "-",
        总账号: quota.total,
        配额耗尽: quota.exhausted,
        冷却中: quota.cooldown,
        可用: quota.available
      }
    });
  }
  /** P2-16 Prometheus metrics 文本 */
  renderPrometheusMetrics() {
    const s = this.stats;
    const ap = this.accountPool;
    const lines = [];
    lines.push("# HELP kiro_proxy_requests_total Total requests handled");
    lines.push("# TYPE kiro_proxy_requests_total counter");
    lines.push(`kiro_proxy_requests_total ${s.totalRequests}`);
    lines.push("# HELP kiro_proxy_requests_success_total Total successful requests");
    lines.push("# TYPE kiro_proxy_requests_success_total counter");
    lines.push(`kiro_proxy_requests_success_total ${s.successRequests}`);
    lines.push("# HELP kiro_proxy_requests_failed_total Total failed requests");
    lines.push("# TYPE kiro_proxy_requests_failed_total counter");
    lines.push(`kiro_proxy_requests_failed_total ${s.failedRequests}`);
    lines.push("# HELP kiro_proxy_tokens_total Total tokens consumed");
    lines.push("# TYPE kiro_proxy_tokens_total counter");
    lines.push(`kiro_proxy_tokens_total{type="input"} ${s.inputTokens}`);
    lines.push(`kiro_proxy_tokens_total{type="output"} ${s.outputTokens}`);
    lines.push(`kiro_proxy_tokens_total{type="cache_read"} ${s.cacheReadTokens}`);
    lines.push(`kiro_proxy_tokens_total{type="cache_write"} ${s.cacheWriteTokens}`);
    lines.push("# HELP kiro_proxy_credits_total Total credits consumed");
    lines.push("# TYPE kiro_proxy_credits_total counter");
    lines.push(`kiro_proxy_credits_total ${s.totalCredits}`);
    lines.push("# HELP kiro_proxy_accounts Accounts by status");
    lines.push("# TYPE kiro_proxy_accounts gauge");
    const quota = ap.getQuotaStatus();
    lines.push(`kiro_proxy_accounts{status="total"} ${quota.total}`);
    lines.push(`kiro_proxy_accounts{status="available"} ${quota.available}`);
    lines.push(`kiro_proxy_accounts{status="exhausted"} ${quota.exhausted}`);
    lines.push(`kiro_proxy_accounts{status="cooldown"} ${quota.cooldown}`);
    lines.push("# HELP kiro_proxy_uptime_seconds Server uptime in seconds");
    lines.push("# TYPE kiro_proxy_uptime_seconds gauge");
    lines.push(`kiro_proxy_uptime_seconds ${Math.floor((Date.now() - s.startTime) / 1e3)}`);
    return lines.join("\n") + "\n";
  }
  recordModelUsage(model, inputTokens, outputTokens) {
    const key = model || "unknown";
    const existing = this.stats.modelStats.get(key) || { model: key, requests: 0, tokens: 0 };
    existing.requests++;
    existing.tokens += inputTokens + outputTokens;
    this.stats.modelStats.set(key, existing);
    this.stats.totalCost += calculateTokenCost(model, inputTokens, outputTokens);
  }
  // 记录请求到 recentRequests
  recordRequest(log) {
    this.recordModelUsage(log.model, log.inputTokens || 0, log.outputTokens || 0);
    this.stats.recentRequests.push({
      timestamp: Date.now(),
      path: log.path,
      model: log.model || "unknown",
      accountId: log.accountId || "unknown",
      inputTokens: log.inputTokens || 0,
      outputTokens: log.outputTokens || 0,
      credits: log.credits,
      responseTime: log.responseTime || 0,
      success: log.success,
      // P2-19 错误消息脱敏
      error: log.error ? this.sanitizeErrorMessage(log.error).slice(0, 500) : void 0
    });
    const limit = Math.min(1e4, Math.max(20, this.config.recentRequestsLimit || 100));
    if (this.stats.recentRequests.length > limit) {
      this.stats.recentRequests = this.stats.recentRequests.slice(-limit);
    }
  }
}
const LSUBID_PREFIXES = ["X10", "X19", "X42", "X55", "X73", "X81", "X96"];
const FIRST_NAMES$1 = [
  "James",
  "Robert",
  "John",
  "Michael",
  "David",
  "William",
  "Richard",
  "Joseph",
  "Thomas",
  "Charles",
  "Christopher",
  "Daniel",
  "Matthew",
  "Anthony",
  "Mark",
  "Donald",
  "Steven",
  "Paul",
  "Andrew",
  "Joshua",
  "Kenneth",
  "Kevin",
  "Brian",
  "George",
  "Timothy",
  "Ronald",
  "Edward",
  "Jason",
  "Jeffrey",
  "Ryan",
  "Jacob",
  "Gary",
  "Nicholas",
  "Eric",
  "Jonathan",
  "Stephen",
  "Larry",
  "Justin",
  "Scott",
  "Brandon",
  "Benjamin",
  "Samuel",
  "Raymond",
  "Gregory",
  "Frank",
  "Alexander",
  "Patrick",
  "Jack",
  "Dennis",
  "Jerry",
  "Mary",
  "Patricia",
  "Jennifer",
  "Linda",
  "Barbara",
  "Elizabeth",
  "Susan",
  "Jessica",
  "Sarah",
  "Karen",
  "Lisa",
  "Nancy",
  "Betty",
  "Margaret",
  "Sandra",
  "Ashley",
  "Dorothy",
  "Kimberly",
  "Emily",
  "Donna",
  "Michelle",
  "Carol",
  "Amanda",
  "Melissa",
  "Deborah",
  "Stephanie",
  "Rebecca",
  "Sharon",
  "Laura",
  "Cynthia",
  "Kathleen",
  "Amy",
  "Angela",
  "Shirley",
  "Anna",
  "Brenda",
  "Pamela",
  "Emma",
  "Nicole",
  "Helen",
  "Samantha",
  "Katherine",
  "Christine",
  "Debra",
  "Rachel",
  "Carolyn",
  "Janet",
  "Catherine",
  "Maria",
  "Heather"
];
const LAST_NAMES$1 = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Perez",
  "Thompson",
  "White",
  "Harris",
  "Sanchez",
  "Clark",
  "Ramirez",
  "Lewis",
  "Robinson",
  "Walker",
  "Young",
  "Allen",
  "King",
  "Wright",
  "Scott",
  "Torres",
  "Nguyen",
  "Hill",
  "Flores",
  "Green",
  "Adams",
  "Nelson",
  "Baker",
  "Hall",
  "Rivera",
  "Campbell",
  "Mitchell",
  "Carter",
  "Roberts"
];
const GPU_CONFIGS = [
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) UHD Graphics 730 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)", model: "ANGLE (Intel, Intel(R) Iris(R) Plus Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", model: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)", model: "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)", model: "ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)", model: "ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)", model: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)", model: "ANGLE (AMD, AMD Radeon RX 570 Direct3D11 vs_5_0 ps_5_0, D3D11)" }
];
const SCREEN_CONFIGS = [
  [1920, 1080, 1920, 1040, 24],
  [2560, 1440, 2560, 1400, 24],
  [1920, 1200, 1920, 1160, 24],
  [1366, 768, 1366, 728, 24],
  [1536, 864, 1536, 824, 24],
  [1680, 1050, 1680, 1010, 24],
  [1440, 900, 1440, 860, 24],
  [1600, 900, 1600, 860, 24],
  [2560, 1080, 2560, 1040, 24],
  [3440, 1440, 3440, 1400, 24],
  [3840, 2160, 3840, 2120, 24],
  [1280, 1024, 1280, 984, 24]
];
const MATH_POOL = [
  { tan: "-1.4214488238747245", sin: "0.8178819121159085", cos: "-0.5753861119575491" },
  { tan: "-1.4214488238747245", sin: "0.8178819121159085", cos: "-0.5765775004286854" },
  { tan: "-1.4214488238747243", sin: "0.8178819121159083", cos: "-0.5753861119575489" },
  { tan: "-1.4214488238747247", sin: "0.8178819121159087", cos: "-0.5753861119575493" },
  { tan: "-1.4214488238747244", sin: "0.8178819121159084", cos: "-0.5765775004286855" },
  { tan: "-1.4214488238747246", sin: "0.8178819121159086", cos: "-0.5753861119575490" },
  { tan: "-1.4214488238747242", sin: "0.8178819121159082", cos: "-0.5765775004286853" },
  { tan: "-1.4214488238747248", sin: "0.8178819121159088", cos: "-0.5753861119575492" },
  { tan: "-1.4214488238747241", sin: "0.8178819121159081", cos: "-0.5765775004286852" },
  { tan: "-1.4214488238747249", sin: "0.8178819121159089", cos: "-0.5753861119575494" }
];
const WEBGL_EXT_CORE = [
  "ANGLE_instanced_arrays",
  "EXT_blend_minmax",
  "EXT_color_buffer_half_float",
  "EXT_float_blend",
  "EXT_frag_depth",
  "EXT_shader_texture_lod",
  "EXT_texture_filter_anisotropic",
  "EXT_sRGB",
  "KHR_parallel_shader_compile",
  "OES_element_index_uint",
  "OES_fbo_render_mipmap",
  "OES_standard_derivatives",
  "OES_texture_float",
  "OES_texture_float_linear",
  "OES_texture_half_float",
  "OES_texture_half_float_linear",
  "OES_vertex_array_object",
  "WEBGL_color_buffer_float",
  "WEBGL_compressed_texture_s3tc",
  "WEBGL_compressed_texture_s3tc_srgb",
  "WEBGL_debug_renderer_info",
  "WEBGL_debug_shaders",
  "WEBGL_depth_texture",
  "WEBGL_draw_buffers",
  "WEBGL_lose_context",
  "WEBGL_multi_draw"
];
const WEBGL_EXT_OPTIONAL = [
  "EXT_disjoint_timer_query",
  "EXT_texture_compression_bptc",
  "EXT_texture_compression_rgtc",
  "WEBGL_compressed_texture_astc",
  "WEBGL_compressed_texture_etc",
  "OES_draw_buffers_indexed",
  "EXT_color_buffer_float"
];
const PLUGINS_POOL = [
  { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
  { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
  { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
  { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
  { name: "WebKit built-in PDF", filename: "internal-pdf-viewer", description: "Portable Document Format" }
];
function randInt$1(max) {
  return Math.floor(Math.random() * max);
}
function pick(arr) {
  return arr[randInt$1(arr.length)];
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt$1(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function generateCanvasData() {
  const bins = new Array(256).fill(0);
  const totalSamples = 36e3;
  bins[0] = 1e4 + randInt$1(5001);
  bins[255] = 12e3 + randInt$1(4001);
  const colorPeaks = [
    [255, 400 + randInt$1(301)],
    [165, 200 + randInt$1(201)],
    [0, 300 + randInt$1(301)],
    [128, 100 + randInt$1(201)],
    [64, 50 + randInt$1(101)],
    [192, 80 + randInt$1(121)],
    [32, 30 + randInt$1(71)],
    [224, 60 + randInt$1(121)]
  ];
  for (const [idx, val] of colorPeaks) bins[idx] = val;
  let remaining = totalSamples - bins.reduce((a, b) => a + b, 0);
  for (let i = 1; i < 255; i++) {
    if (bins[i] === 0 && remaining > 0) {
      const v = Math.min(4 + randInt$1(97), remaining);
      bins[i] = v;
      remaining -= v;
    }
  }
  bins[0] += remaining;
  const raw = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) raw.writeUInt32LE(bins[i], i * 4);
  const digest = crypto$1.createHash("sha256").update(raw).digest();
  const hash = digest.readInt32LE(0);
  return { hash, histogram: bins };
}
function randomIdentity() {
  const gpu = pick(GPU_CONFIGS);
  const scr = pick(SCREEN_CONFIGS);
  const math = pick(MATH_POOL);
  const { hash: canvasHash, histogram } = generateCanvasData();
  const exts = [...WEBGL_EXT_CORE];
  const nOpt = randInt$1(5);
  if (nOpt > 0) {
    const perm = shuffle([...Array(WEBGL_EXT_OPTIONAL.length).keys()]);
    for (let i = 0; i < Math.min(nOpt, WEBGL_EXT_OPTIONAL.length); i++) {
      exts.push(WEBGL_EXT_OPTIONAL[perm[i]]);
    }
  }
  exts.sort();
  const plugins = shuffle([...PLUGINS_POOL]);
  return {
    chromeVer: "148.0.0.0",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
    gpuVendor: gpu.vendor,
    gpuModel: gpu.model,
    webGLExts: exts,
    canvasHash,
    histogramBase: histogram,
    mathTan: math.tan,
    mathSin: math.sin,
    mathCos: math.cos,
    plugins,
    screen: {
      width: scr[0],
      height: scr[1],
      availWidth: scr[2],
      availHeight: scr[3],
      colorDepth: scr[4]
    },
    lsubidPrefixSignin: pick(LSUBID_PREFIXES),
    lsubidPrefixProfile: pick(LSUBID_PREFIXES),
    webpackHash: randInt$1(2147483647).toString(16).padStart(10, "0").slice(0, 10)
  };
}
function randomFullName() {
  return `${pick(FIRST_NAMES$1)} ${pick(LAST_NAMES$1)}`;
}
const DELTA = 2654435769 >>> 0;
const FALLBACK_KEY = [1888420705, 2576816180, 2347232058, 874813317];
const FALLBACK_VER = "4.0.0";
const FALLBACK_IDENTIFIER = "ECdITeCs";
let cachedKey = null;
let cachedVersion = "";
let cachedIdentifier = "";
let refreshPromise = null;
function extractFromAppJS(js) {
  let key = null;
  let identifier = "";
  let version = "";
  const keyMatch = js.match(
    /var\s+\w+\s*=\s*\[(\d+),\s*"([A-Za-z0-9]+)",\s*(\d+),\s*(\d+),\s*(\d+)\]/
  );
  if (keyMatch) {
    const nums = [keyMatch[1], keyMatch[3], keyMatch[4], keyMatch[5]].map(Number);
    key = [nums[2], nums[0], nums[3], nums[1]];
    identifier = keyMatch[2];
  }
  const verMatch = js.match(/FWCIM_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
  if (verMatch) {
    version = verMatch[1];
  }
  return { key, identifier, version };
}
async function refreshAppJSConfig(fetchFn) {
  if (cachedKey) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (cachedKey) return;
    try {
      const resp = await fetchFn("https://us-east-1.signin.aws/assets/js/app.js", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          Accept: "*/*",
          Referer: "https://us-east-1.signin.aws/"
        }
      });
      const js = await resp.text();
      if (js) {
        const result = extractFromAppJS(js);
        if (result.key) cachedKey = result.key;
        if (result.identifier) cachedIdentifier = result.identifier;
        if (result.version) cachedVersion = result.version;
      }
    } catch (err) {
      console.log("[xxtea] 下载 app.js 失败:", err);
    }
    if (!cachedKey) {
      console.log("[xxtea] 使用 fallback 密钥");
      cachedKey = [...FALLBACK_KEY];
    }
    if (!cachedVersion) cachedVersion = FALLBACK_VER;
    if (!cachedIdentifier) cachedIdentifier = FALLBACK_IDENTIFIER;
  })();
  return refreshPromise;
}
function getTESVersion() {
  return cachedVersion || FALLBACK_VER;
}
function getIdentifier() {
  return cachedIdentifier || FALLBACK_IDENTIFIER;
}
function getActiveKey() {
  return cachedKey ? [...cachedKey] : [...FALLBACK_KEY];
}
function xxteaEncryptCore(plaintext, key) {
  if (!plaintext.length) return Buffer.alloc(0);
  const n = Math.ceil(plaintext.length / 4);
  const v = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    if (4 * i < plaintext.length) b0 = plaintext.charCodeAt(4 * i);
    if (4 * i + 1 < plaintext.length) b1 = plaintext.charCodeAt(4 * i + 1);
    if (4 * i + 2 < plaintext.length) b2 = plaintext.charCodeAt(4 * i + 2);
    if (4 * i + 3 < plaintext.length) b3 = plaintext.charCodeAt(4 * i + 3);
    v[i] = (b0 | b1 << 8 | b2 << 16 | b3 << 24) >>> 0;
  }
  const rounds = 6 + Math.floor(52 / n);
  let z = v[n - 1];
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    total = total + DELTA >>> 0;
    const e = total >>> 2 & 3;
    for (let p = 0; p < n; p++) {
      const y = v[(p + 1) % n];
      const part1 = (z >>> 5 ^ y << 2) >>> 0;
      const part2 = (y >>> 3 ^ z << 4) >>> 0;
      const group1 = part1 + part2 >>> 0;
      const part3 = (total ^ y) >>> 0;
      const part4 = (key[p & 3 ^ e] ^ z) >>> 0;
      const group2 = part3 + part4 >>> 0;
      const mx = (group1 ^ group2) >>> 0;
      v[p] = v[p] + mx >>> 0;
      z = v[p];
    }
  }
  const result = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    result[4 * i] = v[i] & 255;
    result[4 * i + 1] = v[i] >>> 8 & 255;
    result[4 * i + 2] = v[i] >>> 16 & 255;
    result[4 * i + 3] = v[i] >>> 24 & 255;
  }
  return result;
}
function encryptFingerprint(jsonStr) {
  const crc = crc32(jsonStr);
  const crcHex = crc.toString(16).toUpperCase().padStart(8, "0");
  const plaintext = crcHex + "#" + jsonStr;
  const key = getActiveKey();
  const encrypted = xxteaEncryptCore(plaintext, key);
  const encoded = encrypted.toString("base64");
  return getIdentifier() + ":" + encoded;
}
function crc32(str) {
  const table = crc32Table();
  let crc = 4294967295 >>> 0;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8 ^ table[(crc ^ str.charCodeAt(i)) & 255]) >>> 0;
  }
  return (crc ^ 4294967295) >>> 0;
}
let _crc32Table = null;
function crc32Table() {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i >>> 0;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (3988292384 ^ c >>> 1) >>> 0 : c >>> 1;
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}
function randInt(max) {
  return Math.floor(Math.random() * max);
}
function crc32Str(str) {
  let crc = 4294967295 >>> 0;
  const table = getCrc32Table();
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8 ^ table[(crc ^ str.charCodeAt(i)) & 255]) >>> 0;
  }
  return (crc ^ 4294967295) >>> 0;
}
let _t = null;
function getCrc32Table() {
  if (_t) return _t;
  _t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i >>> 0;
    for (let j = 0; j < 8; j++) c = c & 1 ? (3988292384 ^ c >>> 1) >>> 0 : c >>> 1;
    _t[i] = c;
  }
  return _t;
}
class OrderedMap {
  keys = [];
  values = /* @__PURE__ */ new Map();
  set(key, value) {
    if (!this.values.has(key)) this.keys.push(key);
    this.values.set(key, value);
  }
  toJSON() {
    const parts = [];
    for (const k of this.keys) {
      parts.push(`${JSON.stringify(k)}:${JSON.stringify(this.values.get(k))}`);
    }
    return `{${parts.join(",")}}`;
  }
}
function newFPContext(identity) {
  const ts = Math.floor(Date.now() / 1e3);
  return {
    identity,
    canvasHash: identity.canvasHash,
    histogramBins: [...identity.histogramBase],
    lsUbidSignin: `${identity.lsubidPrefixSignin}-${String(randInt(1e7)).padStart(7, "0")}-${String(randInt(1e7)).padStart(7, "0")}:${ts}`,
    lsUbidProfile: "",
    perfTiming: null,
    startTime: null
  };
}
function resetPerfTiming(ctx) {
  ctx.perfTiming = null;
}
function genPerfTiming(nowMs) {
  const loadEventEnd = nowMs - (500 + randInt(1001));
  const loadDuration = 2e3 + randInt(2001);
  const base = loadEventEnd - loadDuration;
  const dnsOffset = 2 + randInt(8);
  const connectEndOffset = 300 + randInt(300);
  const responseOffset = connectEndOffset + 200 + randInt(400);
  const domInteractiveOffset = loadDuration - (5 + randInt(11));
  const domContentLoadedStart = domInteractiveOffset + randInt(3);
  return {
    connectStart: base + dnsOffset + 1 + randInt(3),
    secureConnectionStart: base + dnsOffset + 3 + randInt(5),
    unloadEventEnd: 0,
    domainLookupStart: base + dnsOffset,
    domainLookupEnd: base + dnsOffset + randInt(2),
    responseStart: base + responseOffset,
    connectEnd: base + connectEndOffset,
    responseEnd: base + responseOffset + randInt(5),
    requestStart: base + connectEndOffset,
    domLoading: base + responseOffset + 2 + randInt(5),
    redirectStart: 0,
    loadEventEnd,
    domComplete: loadEventEnd,
    navigationStart: base,
    loadEventStart: loadEventEnd,
    domContentLoadedEventEnd: loadEventEnd,
    unloadEventStart: 0,
    redirectEnd: 0,
    domInteractive: base + domInteractiveOffset,
    fetchStart: base + dnsOffset,
    domContentLoadedEventStart: base + domContentLoadedStart
  };
}
function getPerfTiming(ctx, nowMs) {
  if (!ctx.perfTiming) ctx.perfTiming = genPerfTiming(nowMs);
  return ctx.perfTiming;
}
function getLsUbid(ctx, pageType) {
  if (pageType === "profile") {
    if (!ctx.lsUbidProfile) {
      const ts = ctx.perfTiming ? Math.floor(ctx.perfTiming.loadEventEnd / 1e3) : Math.floor(Date.now() / 1e3);
      ctx.lsUbidProfile = `${ctx.identity.lsubidPrefixProfile}-${String(randInt(1e7)).padStart(7, "0")}-${String(randInt(1e7)).padStart(7, "0")}:${ts}`;
    }
    return ctx.lsUbidProfile;
  }
  return ctx.lsUbidSignin;
}
function getStartTime(ctx, nowMs) {
  if (ctx.startTime === null) ctx.startTime = nowMs;
  return ctx.startTime;
}
function genMetricsFirstLoad(pageType) {
  const m = {
    el: 0,
    script: 0,
    h: 0,
    batt: 0,
    perf: 0,
    auto: 0,
    tz: 0,
    fp2: 0,
    lsubid: 0,
    browser: 0,
    capabilities: 0,
    gpu: 0,
    dnt: 0,
    math: 0,
    tts: 0,
    input: 0,
    canvas: 0,
    captchainput: 0,
    pow: 0
  };
  switch (pageType) {
    case "profile":
      m.batt = 5 + randInt(21);
      m.fp2 = 1 + randInt(8);
      m.browser = randInt(4);
      m.capabilities = 1 + randInt(8);
      m.dnt = randInt(4);
      m.input = 8 + randInt(23);
      m.canvas = 5 + randInt(16);
      break;
    case "signup":
      m.script = randInt(3);
      m.batt = randInt(6);
      m.fp2 = randInt(4);
      m.gpu = 3 + randInt(6);
      break;
    default:
      m.script = randInt(3);
      m.auto = randInt(3);
      m.browser = randInt(3);
      m.gpu = 3 + randInt(6);
  }
  return m;
}
function genMetricsPageSubmit() {
  return {
    el: 0,
    script: 0,
    h: 0,
    batt: 0,
    perf: randInt(3),
    auto: 0,
    tz: 0,
    fp2: 0,
    lsubid: 0,
    browser: 0,
    capabilities: 0,
    gpu: 0,
    dnt: 0,
    math: 0,
    tts: 0,
    input: 0,
    canvas: 0,
    captchainput: 0,
    pow: 0
  };
}
function genInteraction(eventType) {
  if (eventType === "PageLoad" || eventType === "first_load") {
    return {
      clicks: 0,
      touches: 0,
      keyPresses: 0,
      cuts: 0,
      copies: 0,
      pastes: 0,
      keyPressTimeIntervals: [],
      mouseClickPositions: [],
      keyCycles: [],
      mouseCycles: [],
      touchCycles: []
    };
  }
  const nClicks = 1 + randInt(3);
  const nKeys = 3 + randInt(8);
  const nIntervals = Math.max(1, Math.floor(nKeys / 3)) + randInt(Math.max(1, Math.floor(nKeys / 2) - Math.floor(nKeys / 3) + 1));
  const nCycles = Math.max(2, Math.floor(nKeys / 2)) + randInt(Math.max(1, Math.floor(nKeys * 2 / 3) - Math.floor(nKeys / 2) + 1));
  return {
    clicks: nClicks,
    touches: 0,
    keyPresses: nKeys,
    cuts: 0,
    copies: 0,
    pastes: 0,
    keyPressTimeIntervals: Array.from({ length: nIntervals }, () => 80 + randInt(621)),
    mouseClickPositions: Array.from({ length: nClicks }, () => `${400 + randInt(401)},${300 + randInt(201)}`),
    keyCycles: Array.from({ length: nCycles }, () => 20 + randInt(281)),
    mouseCycles: Array.from({ length: nClicks }, () => 50 + randInt(101)),
    touchCycles: []
  };
}
function genFormField(startMs, emailLen, email, interaction) {
  const fieldTs = startMs - (10 + randInt(41));
  const fieldRand = 1e3 + randInt(9e3);
  const fieldName = `formField29-${fieldTs}-${fieldRand}`;
  let nKeys = Math.max(3, Math.floor(emailLen / 3) + randInt(5) - 2);
  const intervals = Array.from({ length: Math.min(nKeys - 1, 5) }, () => 80 + randInt(621));
  const keyCycles = Array.from({ length: Math.min(nKeys, 6) }, () => 20 + randInt(231));
  if (typeof interaction.keyPresses === "number" && interaction.keyPresses > 0) {
    nKeys = interaction.keyPresses;
  }
  const checksumStr = email || `user${1e3 + randInt(9e3)}@example.com`;
  const cksum = crc32Str(checksumStr).toString(16).toUpperCase().padStart(8, "0");
  return {
    [fieldName]: {
      clicks: 1,
      touches: 0,
      keyPresses: nKeys,
      cuts: 0,
      copies: 0,
      pastes: 0,
      keyPressTimeIntervals: intervals,
      mouseClickPositions: [`${100 + randInt(151)}.5,${10 + randInt(11)}.5`],
      keyCycles,
      mouseCycles: [80 + randInt(71)],
      touchCycles: [],
      width: 180,
      height: 32,
      totalFocusTime: 0,
      checksum: cksum,
      autocomplete: false,
      prefilled: false
    }
  };
}
function formatScreen(s) {
  return `${s.width}-${s.height}-${s.availHeight}-${s.colorDepth}-*-*-*`;
}
function formatPlugins(plugins) {
  return plugins.map((p) => p.name).join(" ");
}
function buildFingerprintData(identity, locationURL, referrer, nowMs, ctx, pageType, eventType, timeOnPage, emailLen, email) {
  const canvasHash = ctx ? ctx.canvasHash : identity.canvasHash;
  const histogram = ctx ? ctx.histogramBins : identity.histogramBase;
  const perfTiming = ctx ? getPerfTiming(ctx, nowMs) : genPerfTiming(nowMs);
  let lsUbid;
  if (ctx) {
    lsUbid = getLsUbid(ctx, pageType);
  } else {
    lsUbid = `${identity.lsubidPrefixSignin}-${String(randInt(1e7)).padStart(7, "0")}-${String(randInt(1e7)).padStart(7, "0")}:${Math.floor(perfTiming.loadEventEnd / 1e3)}`;
  }
  let dynamicURLs;
  let scriptsElapsed;
  let historyLength;
  let isCompatible;
  switch (pageType) {
    case "profile":
      dynamicURLs = [`/dist/main/app_${identity.webpackHash}.min.js`];
      scriptsElapsed = 0;
      historyLength = 2 + randInt(4);
      isCompatible = true;
      break;
    case "signup":
      dynamicURLs = ["/assets/js/app.js"];
      scriptsElapsed = 1;
      historyLength = 3 + randInt(5);
      isCompatible = true;
      break;
    default:
      dynamicURLs = ["/assets/js/app.js"];
      scriptsElapsed = 1;
      historyLength = 1 + randInt(3);
      isCompatible = false;
  }
  let metrics;
  if (eventType === "first_load" || eventType === "PageLoad" && pageType === "profile") {
    metrics = genMetricsFirstLoad(pageType);
  } else {
    metrics = genMetricsPageSubmit();
  }
  const interaction = genInteraction(eventType);
  const endMs = nowMs + randInt(51);
  let startTime;
  if (eventType !== "PageLoad" && eventType !== "first_load" && timeOnPage > 0) {
    startTime = endMs - timeOnPage;
  } else if (ctx) {
    if (eventType === "first_load") {
      startTime = getStartTime(ctx, nowMs - (500 + randInt(501)));
    } else if (eventType === "PageLoad" && pageType === "profile") {
      startTime = getStartTime(ctx, nowMs - (30 + randInt(51)));
    } else {
      startTime = getStartTime(ctx, nowMs);
    }
  } else {
    startTime = nowMs;
  }
  const pluginsStr = formatPlugins(identity.plugins);
  const screenStr = formatScreen(identity.screen);
  const result = new OrderedMap();
  const US_TZ_OFFSETS = [-5, -6, -7, -8];
  const tzOffset = US_TZ_OFFSETS[randInt(US_TZ_OFFSETS.length)];
  result.set("metrics", metrics);
  result.set("start", startTime);
  result.set("interaction", interaction);
  result.set("scripts", {
    dynamicUrls: dynamicURLs,
    inlineHashes: [],
    elapsed: scriptsElapsed,
    dynamicUrlCount: dynamicURLs.length,
    inlineHashesCount: 0
  });
  result.set("history", { length: historyLength });
  result.set("battery", {});
  result.set("performance", { timing: perfTiming });
  result.set("automation", {
    wd: { properties: { document: [], window: [], navigator: [] } },
    phantom: { properties: { window: [] } }
  });
  result.set("end", endMs);
  result.set("timeZone", tzOffset);
  result.set("flashVersion", null);
  result.set("plugins", pluginsStr + " ||" + screenStr);
  result.set("dupedPlugins", pluginsStr + " ||" + screenStr);
  result.set("screenInfo", screenStr);
  result.set("lsUbid", lsUbid);
  result.set("referrer", referrer);
  result.set("userAgent", identity.ua);
  result.set("location", locationURL);
  result.set("webDriver", false);
  result.set("capabilities", {
    css: {
      textShadow: 1,
      WebkitTextStroke: 1,
      boxShadow: 1,
      borderRadius: 1,
      borderImage: 1,
      opacity: 1,
      transform: 1,
      transition: 1
    },
    js: {
      audio: true,
      geolocation: true,
      localStorage: "supported",
      touch: false,
      video: true,
      webWorker: true
    },
    elapsed: 0
  });
  result.set("gpu", {
    vendor: identity.gpuVendor,
    model: identity.gpuModel,
    extensions: identity.webGLExts
  });
  result.set("dnt", null);
  result.set("math", { tan: identity.mathTan, sin: identity.mathSin, cos: identity.mathCos });
  if (pageType === "profile") {
    if (eventType === "PageLoad" || eventType === "first_load") {
      result.set("timeToSubmit", 1 + randInt(5));
    } else if (timeOnPage > 0) {
      result.set("timeToSubmit", timeOnPage);
    } else {
      result.set("timeToSubmit", 2e3 + randInt(4001));
    }
  }
  if (pageType === "profile" && eventType !== "PageLoad" && eventType !== "first_load" && emailLen > 0) {
    result.set("form", genFormField(nowMs, emailLen, email, interaction));
  } else {
    result.set("form", {});
  }
  result.set("canvas", { hash: canvasHash, emailHash: null, histogramBins: [...histogram] });
  result.set("token", { isCompatible, pageHasCaptcha: 0 });
  result.set("auth", { form: { method: "get" } });
  result.set("errors", []);
  result.set("version", getTESVersion());
  return result;
}
function generateFingerprint(identity, locationURL, referrer, ctx, pageType, eventType, timeOnPage, emailLen, email) {
  const nowMs = Date.now();
  const fpData = buildFingerprintData(
    identity,
    locationURL,
    referrer,
    nowMs,
    ctx,
    pageType,
    eventType,
    timeOnPage,
    emailLen,
    email
  );
  const jsonStr = fpData.toJSON();
  return encryptFingerprint(jsonStr);
}
function b64url(data) {
  return data.toString("base64url");
}
function jwkToPublicKey(jwk) {
  const n = Buffer.from(jwk.n, "base64url");
  const e = Buffer.from(jwk.e, "base64url");
  return crypto$1.createPublicKey({
    key: {
      kty: "RSA",
      n: n.toString("base64url"),
      e: e.toString("base64url")
    },
    format: "jwk"
  });
}
function genUUID() {
  const b = crypto$1.randomBytes(16);
  return [
    b.subarray(0, 4).toString("hex"),
    b.subarray(4, 6).toString("hex"),
    b.subarray(6, 8).toString("hex"),
    b.subarray(8, 10).toString("hex"),
    b.subarray(10, 16).toString("hex")
  ].join("-");
}
function encryptPassword(password, publicKey, issuer, audience, region) {
  const header = {
    alg: "RSA-OAEP-256",
    kid: publicKey.kid,
    enc: "A256GCM",
    cty: "enc",
    typ: "application/aws+signin+jwe"
  };
  const headerJSON = Buffer.from(JSON.stringify(header));
  const headerB64 = b64url(headerJSON);
  const cek = crypto$1.randomBytes(32);
  const pubKey = jwkToPublicKey(publicKey);
  const encryptedCEK = crypto$1.publicEncrypt(
    {
      key: pubKey,
      padding: crypto$1.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    cek
  );
  const now = Math.floor(Date.now() / 1e3);
  const claims = {
    iss: `${region}.${issuer}`,
    iat: now,
    nbf: now,
    jti: genUUID(),
    exp: now + 300,
    aud: `${region}.${audience}`,
    password
  };
  const plaintext = Buffer.from(JSON.stringify(claims));
  const iv = crypto$1.randomBytes(12);
  const cipher = crypto$1.createCipheriv("aes-256-gcm", cek, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(headerB64, "ascii"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${headerB64}.${b64url(encryptedCEK)}.${b64url(iv)}.${b64url(ct)}.${b64url(tag)}`;
}
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0";
const DEFAULT_SEC_UA = '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"';
function hex4() {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}
function visitorId() {
  return `${hex4()}${hex4()}-${hex4()}-7${hex4().slice(1)}-${hex4()}-${hex4()}${hex4()}${hex4()}`;
}
function awsccc() {
  const d = {
    e: 1,
    p: 1,
    f: 1,
    a: 1,
    i: `${hex4()}${hex4()}-${hex4()}-4${hex4().slice(1)}-${hex4()}-${hex4()}${hex4()}${hex4()}`,
    v: "1"
  };
  return Buffer.from(JSON.stringify(d)).toString("base64");
}
function ubidGen() {
  const prefixes = ["135", "146", "162", "174", "182", "195", "407", "411", "423", "434", "456", "467"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const d7a = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  const d7b = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  return `${prefix}-${d7a}-${d7b}`;
}
function amznFbgId() {
  const prefixes = ["X10", "X19", "X42", "X55", "X73", "X81", "X96", "X97"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const d7 = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  const d10 = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");
  return `${prefix}-${d7}:${d10}`;
}
function newUUID() {
  const b = crypto$1.randomBytes(16);
  return [
    b.subarray(0, 4).toString("hex"),
    b.subarray(4, 6).toString("hex"),
    b.subarray(6, 8).toString("hex"),
    b.subarray(8, 10).toString("hex"),
    b.subarray(10, 16).toString("hex")
  ].join("-");
}
function gmtDate() {
  return (/* @__PURE__ */ new Date()).toUTCString();
}
function extractParam(rawURL, key) {
  try {
    const u = new URL(rawURL);
    return u.searchParams.get(key) || "";
  } catch {
    return "";
  }
}
function splitAfter(s, sep) {
  const idx = s.indexOf(sep);
  if (idx < 0) return "";
  const rest = s.slice(idx + sep.length);
  const ampIdx = rest.indexOf("&");
  return ampIdx >= 0 ? rest.slice(0, ampIdx) : rest;
}
function getNestedMap(data, ...keys) {
  let current = data;
  for (const k of keys) {
    if (typeof current !== "object" || current === null) return null;
    current = current[k];
  }
  return typeof current === "object" && current !== null ? current : null;
}
function getNestedStringMap(data, key) {
  if (!data) return null;
  const nested = data[key];
  if (typeof nested !== "object" || nested === null) return null;
  const result = {};
  for (const [k, v] of Object.entries(nested)) {
    if (typeof v === "string") result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : null;
}
function saveCookies(cookies, headers) {
  const skip = /* @__PURE__ */ new Set(["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"]);
  const setCookieHeader = headers["set-cookie"];
  if (!setCookieHeader) return;
  const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of values) {
    if (!raw.includes("=")) continue;
    const mainPart = raw.split(";")[0];
    const eqIdx = mainPart.indexOf("=");
    if (eqIdx < 0) continue;
    const k = mainPart.slice(0, eqIdx).trim();
    const v = mainPart.slice(eqIdx + 1).trim();
    if (!skip.has(k.toLowerCase()) && k) {
      cookies.set(k, v);
    }
  }
}
function getRegistrationProxyUrl() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || getSystemProxy() || void 0;
}
async function proxyFetch(url2, options) {
  const proxyUrl = getRegistrationProxyUrl();
  if (proxyUrl) {
    const agent = safeCreateProxyAgent(proxyUrl);
    return await undici.fetch(url2, {
      ...options,
      dispatcher: agent
    });
  }
  return await fetch(url2, options);
}
const OTP_PATTERN = /\b(\d{6})\b/g;
function extractCode(body) {
  const matches = body.match(OTP_PATTERN);
  if (!matches || matches.length === 0) return "";
  return matches[matches.length - 1];
}
function parseProvidedEmailLines(data) {
  return data.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return null;
    const email = line.slice(0, idx).trim();
    const password = line.slice(idx + 1).trim();
    if (!email || !password || !email.includes("@")) return null;
    return { email, password };
  }).filter((item) => Boolean(item));
}
class GenericIMAPClient {
  socket = null;
  buffer = "";
  tagCounter = 0;
  async connect(host, port = 993) {
    return new Promise((resolve, reject) => {
      const socket = tls__namespace.connect(port, host, { servername: host });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connect timeout: ${host}:${port}`));
      }, 15e3);
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.readLine().then(() => resolve()).catch(reject);
      });
    });
  }
  readLine() {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Not connected"));
      const check = () => {
        const idx = this.buffer.indexOf("\r\n");
        if (idx >= 0) {
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          resolve(line);
        }
      };
      check();
      const onData = (chunk) => {
        this.buffer += chunk.toString("utf8");
        const idx = this.buffer.indexOf("\r\n");
        if (idx >= 0) {
          this.socket.removeListener("data", onData);
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          resolve(line);
        }
      };
      this.socket.on("data", onData);
      this.socket.once("error", reject);
    });
  }
  async sendCommand(cmd) {
    if (!this.socket) throw new Error("Not connected");
    this.tagCounter++;
    const tag = `G${String(this.tagCounter).padStart(3, "0")}`;
    this.socket.write(`${tag} ${cmd}\r
`);
    return tag;
  }
  async readUntilTag(tag) {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) return { lines, result: line };
      lines.push(line);
    }
  }
  async login(email, password) {
    const esc = (v) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const tag = await this.sendCommand(`LOGIN "${esc(email)}" "${esc(password)}"`);
    const { result } = await this.readUntilTag(tag);
    if (!/OK/i.test(result)) throw new Error(`LOGIN failed: ${result}`);
  }
  async selectInbox() {
    const tag = await this.sendCommand("SELECT INBOX");
    const { result } = await this.readUntilTag(tag);
    if (!/OK/i.test(result)) throw new Error(`SELECT INBOX failed: ${result}`);
  }
  async searchFromUid(sender, minUid) {
    const tag = await this.sendCommand(`UID SEARCH UID ${minUid}:* FROM "${sender}"`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!/OK/i.test(result)) throw new Error(`SEARCH failed: ${result}`);
    const found = [];
    for (const line of lines) {
      const m = line.match(/^\* SEARCH\s*(.*)$/i);
      if (m?.[1]) found.push(...m[1].trim().split(/\s+/).filter(Boolean));
    }
    return found;
  }
  async fetchBodyByUID(uid) {
    const tag = await this.sendCommand(`UID FETCH ${uid} (BODY.PEEK[])`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!/OK/i.test(result)) throw new Error(`FETCH failed: ${result}`);
    return decodeMimeBody(lines.join("\n"));
  }
  async markSeen(uid) {
    const tag = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Seen)`);
    await this.readUntilTag(tag).catch(() => void 0);
  }
  close() {
    if (this.socket) {
      try {
        this.socket.write("G999 LOGOUT\r\n");
      } catch {
      }
      this.socket.destroy();
      this.socket = null;
    }
  }
}
class ProvidedEmailService {
  account;
  hosts;
  address = "";
  host = "";
  baselineAwsUid = "0";
  baselineTime = 0;
  apiKey;
  apiBaseURL;
  constructor(account, apiKey = "", apiBaseURL = "https://firstmail.ltd/api/v1") {
    this.account = account;
    this.apiKey = apiKey;
    this.apiBaseURL = apiBaseURL.replace(/\/+$/, "");
    const domain = account.email.split("@")[1];
    this.hosts = [`imap.${domain}`, `mail.${domain}`, domain];
  }
  async create() {
    this.address = this.account.email;
    return this.address;
  }
  getAddress() {
    return this.address;
  }
  async beforeSendCode() {
    this.baselineTime = Date.now();
    if (this.apiKey) {
      console.log(
        `[FirstMail] Baseline time before OTP send: ${new Date(this.baselineTime).toISOString()}`
      );
      return;
    }
    try {
      this.baselineAwsUid = await this.getLatestAwsUid();
      console.log(`[ProvidedEmail] Baseline AWS mail UID before OTP send: ${this.baselineAwsUid}`);
    } catch (err) {
      console.log(
        `[ProvidedEmail] Failed to capture baseline (will use 0): ${err instanceof Error ? err.message : String(err)}`
      );
      this.baselineAwsUid = "0";
    }
  }
  async waitForCode(timeoutSec, intervalSec, abortCheck) {
    if (!this.address) throw new Error("邮箱地址为空");
    if (this.apiKey) return this.waitForCodeViaFirstMailAPI(timeoutSec, intervalSec, abortCheck);
    const maxRetries = Math.floor(timeoutSec / intervalSec);
    const checkedUids = /* @__PURE__ */ new Set();
    const minUid = String((Number.parseInt(this.baselineAwsUid || "0", 10) || 0) + 1);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (abortCheck?.()) throw new Error("Registration cancelled");
      await sleep$3(intervalSec * 1e3);
      if (abortCheck?.()) throw new Error("Registration cancelled");
      let client = null;
      try {
        client = await this.connectClient();
        const uids = await client.searchFromUid("no-reply@signin.aws", minUid);
        const sortedUids = uids.sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(
            `[ProvidedEmail] [${attempt}/${maxRetries}] AWS UIDs: [${sortedUids.join(",")}]`
          );
        }
        for (const uid of sortedUids.slice(0, 10)) {
          if (checkedUids.has(uid)) continue;
          checkedUids.add(uid);
          const body = await client.fetchBodyByUID(uid);
          const code = extractCode(body);
          if (code) {
            console.log(`[ProvidedEmail] 验证码: ${code}`);
            await client.markSeen(uid);
            return code;
          }
        }
      } catch (err) {
        if (attempt % 5 === 0) {
          console.log(`[ProvidedEmail] [${attempt}/${maxRetries}] 查询失败:`, err);
        }
      } finally {
        client?.close();
      }
    }
    throw new Error(`等待验证码超时 (${timeoutSec}s)`);
  }
  async waitForCodeViaFirstMailAPI(timeoutSec, intervalSec, abortCheck) {
    const maxRetries = Math.floor(timeoutSec / intervalSec);
    const checkedIds = /* @__PURE__ */ new Set();
    const baseline = this.baselineTime || Date.now();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (abortCheck?.()) throw new Error("Registration cancelled");
      await sleep$3(intervalSec * 1e3);
      if (abortCheck?.()) throw new Error("Registration cancelled");
      try {
        const messages = await this.fetchFirstMailMessages();
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(`[FirstMail] [${attempt}/${maxRetries}] messages: ${messages.length}`);
        }
        for (const msg of messages) {
          const id = String(msg.id || msg.uid || `${msg.date || ""}-${msg.subject || ""}`);
          if (checkedIds.has(id)) continue;
          const msgTime = Date.parse(String(msg.date || msg.created_at || ""));
          if (Number.isFinite(msgTime) && msgTime + 1e4 < baseline) continue;
          const sender = String(msg.from || "").toLowerCase();
          const subject = String(msg.subject || "");
          const text = String(msg.body_text || "");
          const html = String(msg.body_html || "");
          const body = `${subject}
${text}
${html}`;
          const code = extractCode(body);
          const looksLikeAws = sender.includes("no-reply@signin.aws") || /aws|amazon/i.test(body);
          if (code && looksLikeAws) {
            console.log(`[FirstMail] 验证码: ${code}`);
            checkedIds.add(id);
            return code;
          }
          checkedIds.add(id);
        }
      } catch (err) {
        if (attempt % 5 === 0) console.log(`[FirstMail] [${attempt}/${maxRetries}] 查询失败:`, err);
      }
    }
    throw new Error(`等待验证码超时 (${timeoutSec}s)`);
  }
  async fetchFirstMailMessages() {
    const resp = await proxyFetch(`${this.apiBaseURL}/email/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey
      },
      body: JSON.stringify({
        email: this.account.email,
        password: this.account.password,
        limit: 20,
        folder: "INBOX"
      }),
      signal: AbortSignal.timeout(2e4)
    });
    const raw = await resp.json();
    if (!resp.ok || raw.success === false) {
      throw new Error(
        `FirstMail API error ${resp.status}: ${String(raw.error || JSON.stringify(raw)).slice(0, 300)}`
      );
    }
    const data = raw.data;
    if (Array.isArray(data?.messages)) return data.messages;
    if (Array.isArray(raw.messages)) return raw.messages;
    return [];
  }
  async getLatestAwsUid() {
    const client = await this.connectClient();
    try {
      const uids = await client.searchFromUid("no-reply@signin.aws", "1");
      if (uids.length === 0) return "0";
      return uids.reduce(
        (max, uid) => Number.parseInt(uid, 10) > Number.parseInt(max, 10) ? uid : max
      );
    } finally {
      client.close();
    }
  }
  async connectClient() {
    const hosts = this.host ? [this.host, ...this.hosts.filter((h) => h !== this.host)] : this.hosts;
    let lastError;
    for (const host of hosts) {
      const client = new GenericIMAPClient();
      try {
        await client.connect(host);
        await client.login(this.account.email, this.account.password);
        await client.selectInbox();
        this.host = host;
        return client;
      } catch (err) {
        client.close();
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || "IMAP connect failed"));
  }
}
class MoEmailService {
  baseURL;
  apiKey;
  address = "";
  constructor(baseURL, apiKey) {
    this.baseURL = MoEmailService.normalizeBaseURL(baseURL);
    this.apiKey = apiKey;
  }
  /**
   * 归一化用户输入的 baseURL：
   *   - 去除首尾空白与末尾斜杠
   *   - 缺少 protocol 时补 `https://`
   *   - 校验协议仅允许 http / https，否则抛清晰错误
   * 用于规避 fetch 因协议不合法抛出
   * "Invalid URL protocol: the URL must start with `http:` or `https:`."
   */
  static normalizeBaseURL(raw) {
    const trimmed = (raw || "").trim().replace(/\/+$/, "");
    if (!trimmed) throw new Error("MoEmail BaseURL 未配置");
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let u;
    try {
      u = new URL(withScheme);
    } catch {
      throw new Error(`MoEmail BaseURL 格式无效: ${raw}`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`MoEmail BaseURL 协议不支持 (仅支持 http/https): ${u.protocol}`);
    }
    return withScheme;
  }
  async create() {
    const url2 = `${this.baseURL}/api/mail/create`;
    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const resp = await proxyFetch(url2, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(3e4)
    });
    const data = await resp.json();
    const addr = data.address || data.email || data.data?.address || data.data?.email || "";
    if (!addr) {
      console.log("[MoEmail] 创建邮箱失败:", JSON.stringify(data));
      return "";
    }
    this.address = addr;
    return addr;
  }
  async waitForCode(timeoutSec, intervalSec, abortCheck) {
    if (!this.address) throw new Error("邮箱地址为空");
    const maxRetries = Math.floor(timeoutSec / intervalSec);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (abortCheck?.()) throw new Error("Registration cancelled");
      await sleep$3(intervalSec * 1e3);
      if (abortCheck?.()) throw new Error("Registration cancelled");
      try {
        const code = await this.fetchCode();
        if (code) return code;
      } catch (err) {
        if (attempt % 5 === 0) console.log(`[MoEmail] [${attempt}/${maxRetries}] 查询失败:`, err);
      }
      if (attempt % 5 === 0) console.log(`[MoEmail] [${attempt}/${maxRetries}] 暂无验证码...`);
    }
    throw new Error(`等待验证码超时 (${timeoutSec}s)`);
  }
  getAddress() {
    return this.address;
  }
  async fetchCode() {
    const url2 = `${this.baseURL}/api/mail/messages?address=${this.address}`;
    const headers = {};
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const resp = await proxyFetch(url2, { headers, signal: AbortSignal.timeout(15e3) });
    const raw = await resp.json();
    let messages = [];
    if (Array.isArray(raw)) {
      messages = raw;
    } else if (typeof raw === "object" && raw !== null) {
      const wrapper = raw;
      if (Array.isArray(wrapper.data)) {
        messages = wrapper.data;
      }
    }
    for (const msg of messages) {
      const text = msg.text || msg.body || msg.html || "";
      if (text) {
        const code = extractCode(text);
        if (code) return code;
      }
    }
    return "";
  }
}
const FIRST_NAMES = [
  "james",
  "john",
  "robert",
  "michael",
  "david",
  "william",
  "richard",
  "joseph",
  "thomas",
  "charles",
  "mary",
  "patricia",
  "jennifer",
  "linda",
  "elizabeth",
  "barbara",
  "susan",
  "jessica",
  "sarah",
  "karen",
  "daniel",
  "matthew",
  "anthony",
  "mark",
  "steven",
  "paul",
  "andrew",
  "joshua",
  "kenneth",
  "christopher",
  "nancy",
  "betty",
  "margaret",
  "sandra",
  "ashley",
  "dorothy",
  "kimberly",
  "emily",
  "donna",
  "michelle",
  "ryan",
  "kevin",
  "brian",
  "jason",
  "timothy",
  "sean",
  "nathan",
  "brandon",
  "adam",
  "tyler",
  "rachel",
  "samantha",
  "katherine",
  "christine",
  "stephanie",
  "heather",
  "lauren",
  "rebecca",
  "victoria",
  "megan"
];
const LAST_NAMES = [
  "smith",
  "johnson",
  "williams",
  "brown",
  "jones",
  "garcia",
  "miller",
  "davis",
  "rodriguez",
  "martinez",
  "hernandez",
  "lopez",
  "gonzalez",
  "wilson",
  "anderson",
  "thomas",
  "taylor",
  "moore",
  "jackson",
  "martin",
  "lee",
  "perez",
  "thompson",
  "white",
  "harris",
  "sanchez",
  "clark",
  "ramirez",
  "lewis",
  "robinson",
  "walker",
  "young",
  "allen",
  "king",
  "wright",
  "scott",
  "torres",
  "nguyen",
  "hill",
  "flores",
  "green",
  "adams",
  "nelson",
  "baker",
  "hall",
  "rivera",
  "campbell",
  "mitchell",
  "carter",
  "roberts"
];
function randomEmailPrefix() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const r = Math.random();
  if (r < 0.5) return `${first}.${last}`;
  if (r < 0.75) return `${first}${last}`;
  const digits = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${first}.${last}${digits}`;
}
class TempMailPlusService {
  static BASE_URL = "https://tempmail.plus/api";
  tmEmail;
  // tempmail.plus 用户名（不含 @mailto.plus）
  epin;
  domain;
  address = "";
  constructor(tmEmail, epin, domain) {
    this.tmEmail = tmEmail;
    this.epin = epin;
    this.domain = domain.replace(/^@/, "");
  }
  get headers() {
    return {
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
      Referer: "https://tempmail.plus/zh/",
      cookie: `email=${encodeURIComponent(this.fullEmail)}`
    };
  }
  async create() {
    const prefix = randomEmailPrefix();
    this.address = `${prefix}@${this.domain}`;
    console.log(`[TempMailPlus] 生成邮箱: ${this.address}`);
    return this.address;
  }
  getAddress() {
    return this.address;
  }
  async waitForCode(timeoutSec, intervalSec, abortCheck) {
    if (!this.address) throw new Error("邮箱地址为空");
    const maxRetries = Math.floor(timeoutSec / intervalSec);
    const checkedIds = /* @__PURE__ */ new Set();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (abortCheck?.()) throw new Error("Registration cancelled");
      await sleep$3(intervalSec * 1e3);
      if (abortCheck?.()) throw new Error("Registration cancelled");
      try {
        const mails = await this.fetchMailList();
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(`[TempMailPlus] [${attempt}/${maxRetries}] 邮件数: ${mails.length}`);
        }
        for (const mail of mails) {
          const mailId = mail.mail_id;
          if (checkedIds.has(mailId)) continue;
          checkedIds.add(mailId);
          const detail = await this.fetchMailDetail(mailId);
          if (!detail) continue;
          const toField = String(detail.to || "").toLowerCase();
          if (!toField.includes(this.address.toLowerCase())) {
            console.log(`[TempMailPlus] 收件人不匹配: ${toField} (期望包含: ${this.address})`);
            continue;
          }
          const code = this.extractOTP(detail);
          if (code) {
            console.log(`[TempMailPlus] 验证码: ${code}`);
            await this.deleteMail(mailId);
            return code;
          } else {
            console.log(`[TempMailPlus] 邮件 ${mailId} 未提取到验证码`);
          }
        }
      } catch (err) {
        console.log(`[TempMailPlus] [${attempt}/${maxRetries}] 查询失败:`, err);
      }
      if (attempt % 5 === 0) console.log(`[TempMailPlus] [${attempt}/${maxRetries}] 暂无验证码...`);
    }
    throw new Error(`等待验证码超时 (${timeoutSec}s)`);
  }
  get fullEmail() {
    return `${this.tmEmail}@mailto.plus`;
  }
  async fetchMailList() {
    const url2 = `${TempMailPlusService.BASE_URL}/mails?email=${encodeURIComponent(this.fullEmail)}&first_id=0&epin=${encodeURIComponent(this.epin)}`;
    const resp = await proxyFetch(url2, {
      headers: this.headers,
      signal: AbortSignal.timeout(15e3)
    });
    const data = await resp.json();
    if (!data.result) return [];
    return data.mail_list || [];
  }
  async fetchMailDetail(mailId) {
    const url2 = `${TempMailPlusService.BASE_URL}/mails/${mailId}?email=${encodeURIComponent(this.fullEmail)}&epin=${encodeURIComponent(this.epin)}`;
    const resp = await proxyFetch(url2, {
      headers: this.headers,
      signal: AbortSignal.timeout(15e3)
    });
    const data = await resp.json();
    return data.result ? data : null;
  }
  async deleteMail(mailId) {
    const url2 = `${TempMailPlusService.BASE_URL}/mails/${mailId}`;
    const headers = {
      ...this.headers,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
    };
    const body = `email=${encodeURIComponent(this.fullEmail)}&epin=${encodeURIComponent(this.epin)}`;
    try {
      await proxyFetch(url2, { method: "DELETE", headers, body, signal: AbortSignal.timeout(1e4) });
      console.log(`[TempMailPlus] 已删除邮件: ${mailId}`);
    } catch (err) {
      console.log(`[TempMailPlus] 删除邮件失败:`, err);
    }
  }
  extractOTP(detail) {
    const subject = String(detail.subject || "");
    const subjectMatch = subject.match(/(\d{6})/);
    if (subjectMatch) return subjectMatch[1];
    const text = String(detail.text || "");
    const code = extractCode(text);
    if (code) return code;
    const html = String(detail.html || "");
    return extractCode(html);
  }
}
function parseOutlookLines(data) {
  const accounts = [];
  data = data.trim();
  if (!data) return accounts;
  const lines = data.split("\n");
  const parseEntry = (entry) => {
    entry = entry.trim();
    if (!entry) return;
    const parts = entry.split("----");
    if (parts.length === 4) {
      accounts.push({
        email: parts[0].trim(),
        password: parts[1].trim(),
        clientId: parts[2].trim(),
        refreshToken: parts[3].trim()
      });
    }
  };
  if (lines.length === 1) {
    for (const part of data.split(/\s+/)) parseEntry(part);
  } else {
    for (const line of lines) parseEntry(line);
  }
  return accounts;
}
async function refreshOutlookToken(acc) {
  const form = new URLSearchParams({
    client_id: acc.clientId,
    refresh_token: acc.refreshToken,
    grant_type: "refresh_token",
    scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
  });
  const resp = await proxyFetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const data = await resp.json();
  if (resp.status !== 200)
    throw new Error(`刷新失败 ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const token = data.access_token;
  if (!token) throw new Error("响应中无 access_token");
  return token;
}
function buildXOAuth2(email, accessToken) {
  const auth = `user=${email}auth=Bearer ${accessToken}`;
  return Buffer.from(auth).toString("base64");
}
class IMAPClient {
  socket = null;
  buffer = "";
  tag = 0;
  async connect() {
    return new Promise((resolve, reject) => {
      const socket = tls__namespace.connect(993, "outlook.office365.com", {
        servername: "outlook.office365.com"
      });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("连接超时"));
      }, 15e3);
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.readLine().then(() => resolve()).catch(reject);
      });
    });
  }
  readLine() {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("未连接"));
      const check = () => {
        const idx = this.buffer.indexOf("\r\n");
        if (idx >= 0) {
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          resolve(line);
          return;
        }
      };
      check();
      const onData = (chunk) => {
        this.buffer += chunk.toString();
        const idx = this.buffer.indexOf("\r\n");
        if (idx >= 0) {
          this.socket.removeListener("data", onData);
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          resolve(line);
        }
      };
      this.socket.on("data", onData);
      this.socket.once("error", reject);
    });
  }
  async sendCommand(cmd) {
    if (!this.socket) throw new Error("未连接");
    this.tag++;
    const tagStr = `A${String(this.tag).padStart(3, "0")}`;
    this.socket.write(`${tagStr} ${cmd}\r
`);
    return tagStr;
  }
  async readUntilTag(tag) {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) return { lines, result: line };
      lines.push(line);
    }
  }
  async authenticate(email, accessToken) {
    const xoauth2 = buildXOAuth2(email, accessToken);
    const tag = await this.sendCommand(`AUTHENTICATE XOAUTH2 ${xoauth2}`);
    const { result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) throw new Error(`认证失败: ${result}`);
    console.log("[IMAP] 认证成功");
    await sleep$3(800);
  }
  async selectInbox() {
    for (let retry = 0; retry < 3; retry++) {
      const tag = await this.sendCommand("SELECT INBOX");
      const { lines, result } = await this.readUntilTag(tag);
      if (result.includes("OK")) {
        for (const line of lines) {
          const m = line.match(/\*\s+(\d+)\s+EXISTS/);
          if (m) return parseInt(m[1], 10);
        }
        return 0;
      }
      if (retry < 2) {
        console.log(`[IMAP] SELECT INBOX 失败 (${result}), 重试 ${retry + 1}/3...`);
        await sleep$3((1 + retry) * 1e3);
      }
    }
    throw new Error("SELECT INBOX 重试耗尽");
  }
  async fetchLatestBody(seq) {
    if (seq <= 0) throw new Error("无效的邮件序号");
    const tag = await this.sendCommand(`FETCH ${seq} (BODY.PEEK[TEXT])`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) throw new Error(`FETCH TEXT 失败: ${result}`);
    const rawLines = [];
    let inBody = false;
    for (const line of lines) {
      if (line.includes("FETCH")) {
        inBody = true;
        continue;
      }
      if (line === ")") continue;
      if (inBody) rawLines.push(line);
    }
    const raw = rawLines.join("\n");
    const parts = raw.split("------=_Part_");
    let decoded = "";
    for (const part of parts) {
      if (part.includes("base64")) {
        const idx = part.indexOf("base64");
        const content = part.slice(idx + 6);
        const b64 = content.replace(/[\s]/g, "");
        try {
          decoded += Buffer.from(b64, "base64").toString() + " ";
        } catch {
        }
      }
    }
    if (decoded) return decoded;
    const cleaned = raw.replace(/[\s]/g, "");
    try {
      return Buffer.from(cleaned, "base64").toString();
    } catch {
      return raw;
    }
  }
  close() {
    if (this.socket) {
      try {
        this.socket.write("A999 LOGOUT\r\n");
      } catch {
      }
      this.socket.destroy();
      this.socket = null;
    }
  }
}
async function getInboxCount(acc) {
  const accessToken = await refreshOutlookToken(acc);
  const client = new IMAPClient();
  try {
    await client.connect();
    await client.authenticate(acc.email, accessToken);
    return await client.selectInbox();
  } finally {
    client.close();
  }
}
async function waitForOTP(acc, beforeCount, timeout, interval, abortCheck) {
  console.log(`[Outlook IMAP] 等待验证码, 邮箱=${acc.email}, 发送前邮件数=${beforeCount}`);
  let accessToken = await refreshOutlookToken(acc);
  const maxRetries = Math.floor(timeout / interval);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (abortCheck?.()) throw new Error("Registration cancelled");
    let client = null;
    try {
      client = new IMAPClient();
      await client.connect();
      await client.authenticate(acc.email, accessToken);
      const total = await client.selectInbox();
      if (total <= beforeCount) {
        if (attempt % 5 === 0)
          console.log(`[Outlook IMAP] [${attempt}/${maxRetries}] 暂无新邮件 (当前${total}封)...`);
        await sleep$3(interval * 1e3);
        if (abortCheck?.()) throw new Error("Registration cancelled");
        continue;
      }
      for (let i = total; i > beforeCount; i--) {
        try {
          const body = await client.fetchLatestBody(i);
          const code = extractCode(body);
          if (code) {
            console.log(`[Outlook IMAP] 获取到验证码: ${code}`);
            return code;
          }
        } catch {
        }
      }
      if (attempt % 5 === 0)
        console.log(`[Outlook IMAP] [${attempt}/${maxRetries}] 新邮件中未找到验证码...`);
    } catch (err) {
      if (attempt % 5 === 0) console.log(`[Outlook IMAP] 连接失败:`, err);
      try {
        accessToken = await refreshOutlookToken(acc);
      } catch {
      }
    } finally {
      client?.close();
    }
    await sleep$3(interval * 1e3);
  }
  throw new Error(`等待验证码超时 (${timeout}s)`);
}
function sleep$3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
class DuckDuckGoEmailService {
  static QUACK_URL = "https://quack.duckduckgo.com/api";
  authToken;
  // Bearer token from DDG account
  gmailAccount;
  address = "";
  baselineAwsUid = "0";
  //private generatedUsername = ''
  constructor(authToken, gmailAccount) {
    this.authToken = authToken;
    this.gmailAccount = gmailAccount;
  }
  async create() {
    const resp = await proxyFetch(`${DuckDuckGoEmailService.QUACK_URL}/email/addresses`, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        authorization: `Bearer ${this.authToken}`,
        "sec-ch-ua": '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
        referrer: "https://duckduckgo.com/"
      }
    });
    if (!resp.ok) {
      throw new Error(`DDG address creation failed: ${resp.status}`);
    }
    const data = await resp.json();
    const username = data.address;
    if (!username) throw new Error("No address returned from DDG API");
    this.address = `${username}@duck.com`;
    console.log(`[DDG] Generated address: ${this.address}`);
    return this.address;
  }
  getAddress() {
    return this.address;
  }
  async beforeSendCode() {
    try {
      const service = new GmailIMAPService(this.gmailAccount, this.address);
      this.baselineAwsUid = await service.getLatestAwsUid();
      console.log(`[DDG] Baseline AWS mail UID before OTP send: ${this.baselineAwsUid}`);
    } catch (err) {
      console.log(
        `[DDG] Failed to capture AWS mail UID baseline (will use 0): ${err instanceof Error ? err.message : String(err)}`
      );
      this.baselineAwsUid = "0";
    }
  }
  async waitForCode(timeoutSec, intervalSec, abortCheck) {
    if (!this.address) throw new Error("Address not created yet");
    const service = new GmailIMAPService(this.gmailAccount, this.address, this.baselineAwsUid);
    return service.waitForCode(timeoutSec, intervalSec, abortCheck);
  }
}
class GmailIMAPService {
  account;
  filterForAddress;
  baselineAwsUid;
  constructor(account, filterForAddress, baselineAwsUid = "0") {
    this.account = account;
    this.filterForAddress = filterForAddress.toLowerCase();
    this.baselineAwsUid = baselineAwsUid;
  }
  async waitForCode(timeoutSec, intervalSec, abortCheck) {
    const maxRetries = Math.floor(timeoutSec / intervalSec);
    const checkedUids = /* @__PURE__ */ new Set();
    const baselineUidNum = Number.parseInt(this.baselineAwsUid || "0", 10) || 0;
    console.log(`[Gmail IMAP] Waiting for AWS OTP after UID ${baselineUidNum}`);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (abortCheck?.()) throw new Error("Registration cancelled");
      await sleep$3(intervalSec * 1e3);
      if (abortCheck?.()) throw new Error("Registration cancelled");
      let client = null;
      try {
        client = new GmailIMAPClient();
        await client.connect();
        if (this.account.appPassword) {
          await client.authenticatePlain(this.account.email, this.account.appPassword);
        } else {
          await client.authenticateXOAuth2(this.account.email, this.account.accessToken);
        }
        await client.selectInbox();
        const uids = await client.searchFromUid("no-reply@signin.aws", String(baselineUidNum + 1));
        const sortedUids = uids.sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
        console.log(
          `[Gmail IMAP] [${attempt}/${maxRetries}] AWS sender UIDs after baseline: [${sortedUids.join(",")}]`
        );
        if (sortedUids.length === 0) continue;
        for (const uid of sortedUids.slice(0, 10)) {
          if (checkedUids.has(uid)) continue;
          checkedUids.add(uid);
          const body = await client.fetchBodyByUID(uid);
          if (!body) continue;
          const containsAlias = !this.filterForAddress || body.toLowerCase().includes(this.filterForAddress);
          const code = extractCode(body);
          if (code) {
            if (!containsAlias) {
              console.log(
                `[Gmail IMAP] UID ${uid} has OTP but does not mention ${this.filterForAddress}; accepting because it is newer than baseline`
              );
            }
            console.log(`[Gmail IMAP] Got OTP: ${code} from UID ${uid}`);
            await client.markSeen(uid);
            return code;
          } else {
            console.log(
              `[Gmail IMAP] UID ${uid} from AWS but no 6-digit code found, body length: ${body.length}, aliasMatch=${containsAlias}`
            );
          }
        }
      } catch (err) {
        console.log(
          `[Gmail IMAP] [${attempt}/${maxRetries}] Error: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        client?.close();
      }
    }
    throw new Error(`OTP wait timed out (${timeoutSec}s)`);
  }
  async getLatestAwsUid() {
    const client = new GmailIMAPClient();
    try {
      await client.connect();
      if (this.account.appPassword) {
        await client.authenticatePlain(this.account.email, this.account.appPassword);
      } else {
        await client.authenticateXOAuth2(this.account.email, this.account.accessToken);
      }
      await client.selectInbox();
      const uids = await client.searchFromUid("no-reply@signin.aws", "1");
      if (uids.length === 0) return "0";
      return uids.reduce(
        (max, uid) => Number.parseInt(uid, 10) > Number.parseInt(max, 10) ? uid : max
      );
    } finally {
      client.close();
    }
  }
}
function decodeMimeBody(raw) {
  const result = [];
  const lines = raw.split(/\r?\n/);
  let encoding = "";
  let collectingContent = false;
  const contentLines = [];
  const flushContent = () => {
    if (contentLines.length === 0) return;
    const content = contentLines.join("\n");
    const enc = encoding.toLowerCase().trim();
    if (enc === "base64") {
      try {
        const decoded = Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf-8");
        result.push(decoded);
      } catch {
      }
    } else if (enc === "quoted-printable") {
      result.push(decodeQuotedPrintable(content));
    } else {
      result.push(content);
    }
    contentLines.length = 0;
    encoding = "";
  };
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.startsWith("--")) {
      flushContent();
      collectingContent = false;
      continue;
    }
    if (lower.startsWith("content-transfer-encoding:")) {
      flushContent();
      encoding = line.slice("content-transfer-encoding:".length).trim();
      collectingContent = false;
      continue;
    }
    if (!collectingContent && line.trim() === "") {
      collectingContent = true;
      continue;
    }
    if (collectingContent) {
      contentLines.push(line);
    }
  }
  flushContent();
  const joined = result.join("\n");
  return joined.length > 0 ? joined : raw;
}
function decodeQuotedPrintable(input) {
  return input.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
class GmailIMAPClient {
  socket = null;
  buffer = "";
  tagCounter = 0;
  async connect() {
    return new Promise((resolve, reject) => {
      const socket = tls__namespace.connect(993, "imap.gmail.com", { servername: "imap.gmail.com" });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Connect timeout"));
      }, 15e3);
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.readLine().then(() => resolve()).catch(reject);
      });
    });
  }
  async authenticatePlain(email, appPassword) {
    const password = appPassword.replace(/\s/g, "");
    const escaped = password.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const tag = await this.sendCommand(`LOGIN "${email}" "${escaped}"`);
    const { result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) throw new Error(`Gmail LOGIN failed: ${result}`);
    console.log("[Gmail IMAP] Authenticated (plain)");
  }
  async authenticateXOAuth2(email, accessToken) {
    const auth = `user=${email}auth=Bearer ${accessToken}`;
    const b64 = Buffer.from(auth).toString("base64");
    const tag = await this.sendCommand(`AUTHENTICATE XOAUTH2 ${b64}`);
    const { result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) throw new Error(`Gmail XOAUTH2 failed: ${result}`);
    console.log("[Gmail IMAP] Authenticated (OAuth2)");
  }
  async selectInbox() {
    const tag = await this.sendCommand("SELECT INBOX");
    const { lines, result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) throw new Error(`SELECT INBOX failed: ${result}`);
    for (const line of lines) {
      const m = line.match(/\*\s+(\d+)\s+EXISTS/);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }
  // Search by sender, optionally restricted to messages after a UID floor.
  async searchFromUid(sender, uidStart) {
    const tag = await this.sendCommand(`UID SEARCH UID ${uidStart}:* FROM "${sender}"`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) return [];
    for (const line of lines) {
      if (line.startsWith("* SEARCH")) {
        return line.split(" ").slice(2).filter(Boolean);
      }
    }
    return [];
  }
  // Get UIDs of messages by sequence number range
  async fetchUidsBySeqRange(from, to) {
    const tag = await this.sendCommand(`FETCH ${from}:${to} (UID)`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) return [];
    const uids = [];
    for (const line of lines) {
      const m = line.match(/\*\s+\d+\s+FETCH\s+\(UID\s+(\d+)\)/i);
      if (m) uids.push(m[1]);
    }
    return uids;
  }
  async fetchBodyByUID(uid) {
    const tag = await this.sendCommand(`UID FETCH ${uid} (BODY.PEEK[])`);
    const { lines, result } = await this.readUntilTag(tag);
    if (!result.includes("OK")) return "";
    let inBody = false;
    const bodyLines = [];
    for (const line of lines) {
      if (!inBody) {
        if (line.includes("FETCH") && line.includes("BODY")) {
          inBody = true;
        }
        continue;
      }
      if (line === ")") break;
      bodyLines.push(line);
    }
    const raw = bodyLines.join("\r\n");
    return decodeMimeBody(raw);
  }
  async markSeen(uid) {
    const tag = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Seen)`);
    await this.readUntilTag(tag);
  }
  close() {
    if (this.socket) {
      try {
        this.socket.write("A999 LOGOUT\r\n");
      } catch {
      }
      this.socket.destroy();
      this.socket = null;
    }
  }
  nextTag() {
    return `T${String(++this.tagCounter).padStart(3, "0")}`;
  }
  async sendCommand(cmd) {
    if (!this.socket) throw new Error("Not connected");
    const tag = this.nextTag();
    this.socket.write(`${tag} ${cmd}\r
`);
    return tag;
  }
  readLine() {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Not connected"));
      const idx = this.buffer.indexOf("\r\n");
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        return resolve(line);
      }
      const onData = (chunk) => {
        this.buffer += chunk.toString();
        const i = this.buffer.indexOf("\r\n");
        if (i >= 0) {
          this.socket.removeListener("data", onData);
          this.socket.removeListener("error", onError);
          const line = this.buffer.slice(0, i);
          this.buffer = this.buffer.slice(i + 2);
          resolve(line);
        }
      };
      const onError = (err) => {
        this.socket.removeListener("data", onData);
        this.socket.removeListener("error", onError);
        reject(err);
      };
      this.socket.on("data", onData);
      this.socket.once("error", onError);
    });
  }
  async readUntilTag(tag) {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) return { lines, result: line };
      lines.push(line);
    }
  }
}
function sleep$2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
class Registrar {
  cfg;
  session = null;
  moduleClient = null;
  cookies = /* @__PURE__ */ new Map();
  identity;
  fpCtx;
  vid;
  email = "";
  emailSvc = null;
  clientId = "";
  clientSecret = "";
  deviceCode = "";
  userCode = "";
  workflowHandle = "";
  workflowId = "";
  workflowState = "";
  ubid = "";
  regCode = "";
  signState = "";
  authCode = "";
  ssoState = "";
  wdcCSRFToken = "";
  ssoToken = "";
  outlookMailCount = 0;
  log;
  abortController = new AbortController();
  constructor(cfg, log) {
    this.cfg = cfg;
    this.identity = randomIdentity();
    this.fpCtx = newFPContext(this.identity);
    this.vid = visitorId();
    this.log = log || ((msg) => console.log(msg));
  }
  /** 中止当前注册流程 */
  abort() {
    this.abortController.abort();
  }
  checkAborted() {
    if (this.abortController.signal.aborted) throw new Error("注册已取消");
  }
  /** TLS SessionClient 选项 */
  get sessionOpts() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || getSystemProxy() || void 0;
    const tlsIds = ["chrome_120", "chrome_124", "chrome_131", "chrome_133"];
    const tlsClientIdentifier = tlsIds[Math.floor(Math.random() * tlsIds.length)];
    return {
      tlsClientIdentifier,
      timeoutSeconds: 60,
      followRedirects: true,
      insecureSkipVerify: true,
      proxyUrl
    };
  }
  /**
   * 初始化 TLS 客户端
   *
   * DLL 存储策略（按优先级，从高到低）：
   *   1. userData/tls-client/ — 应用用户数据目录（系统不会清理，**永久复用**）
   *   2. resources/ — 应用安装目录（打包资源，开发版可能不存在）
   *   3. tmpdir → 自动迁移到 userData（老版本兼容）
   *   4. GitHub 下载到 userData（最后兜底，仅首次）
   */
  async initTlsClient() {
    this.ensureTlsLib();
    this.moduleClient = new tlsclientwrapper.ModuleClient();
    await this.moduleClient.open();
    this.log(
      "[TLS] open() completed, pool stats: " + JSON.stringify(this.moduleClient.getPoolStats())
    );
    this.session = new tlsclientwrapper.SessionClient(this.moduleClient, this.sessionOpts);
  }
  /**
   * 确保 tls-client 共享库可用
   * @returns existingPath 已经存在的完整 DLL 文件路径（如有，传 customLibraryPath）
   *          downloadDir  需要下载到的目录（如未找到，传 customLibraryDownloadPath 让 tlsclientwrapper 自动下载）
   *
   * 优先放到 userData，避免被系统临时目录清理工具误删（之前用 tmpdir 会被清理）
   */
  ensureTlsLib() {
    const os2 = require("os");
    const path2 = require("path");
    const fs2 = require("fs");
    const { app } = require("electron");
    const platform = os2.platform();
    const arch = os2.arch();
    let filename = "tls-client-xgo-1.14.0-";
    if (platform === "win32") {
      filename += (arch.includes("64") ? "windows-amd64" : "windows-386") + ".dll";
    } else if (platform === "darwin") {
      filename += (arch === "arm64" ? "darwin-arm64" : "darwin-amd64") + ".dylib";
    } else {
      filename += (arch === "arm64" ? "linux-arm64" : "linux-amd64") + ".so";
    }
    const userDataDir = app.getPath("userData");
    const tlsClientDir = path2.join(userDataDir, "tls-client");
    const finalPath = path2.join(tlsClientDir, filename);
    try {
      fs2.mkdirSync(tlsClientDir, { recursive: true });
    } catch {
    }
    if (fs2.existsSync(finalPath)) {
      this.log("[TLS] Library reused from userData (persistent): " + finalPath);
      return { existingPath: finalPath, downloadDir: tlsClientDir };
    }
    const resourcePath = path2.join(process.resourcesPath || "", filename);
    if (fs2.existsSync(resourcePath)) {
      this.log(
        "[TLS] Copying library from resources to userData (one-time): " + resourcePath + " -> " + finalPath
      );
      try {
        fs2.copyFileSync(resourcePath, finalPath);
        return { existingPath: finalPath, downloadDir: tlsClientDir };
      } catch (err) {
        this.log("[TLS] Failed to copy from resources: " + err.message);
      }
    }
    this.log(
      "[TLS] Library not found in resources, will download from GitHub. Searched: " + resourcePath
    );
    return { downloadDir: tlsClientDir };
  }
  async rebuildTlsClient() {
    try {
      await this.session?.destroySession();
    } catch {
    }
    this.session = null;
    if (this.moduleClient) {
      try {
        await this.moduleClient.terminate();
      } catch {
      }
      this.moduleClient = null;
    }
    await this.initTlsClient();
  }
  /**
   * 用 undici 直接 fetch 静态资源（如 AWS signin app.js），绕过 tls-client。
   * 原因：tls-client 的 dll 是进程级单例，失败请求会污染其全局状态，
   * 导致后续重建 SessionClient 后仍报 "no tls client for modification check"。
   * 静态资源不需要 TLS 指纹伪装，直接用 Node/undici fetch 即可。
   */
  async fetchAppJS(url2, init) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || getSystemProxy() || void 0;
    if (proxyUrl) {
      const agent = safeCreateProxyAgent(proxyUrl);
      const resp = await undici.fetch(url2, { ...init, dispatcher: agent });
      return resp;
    }
    return await fetch(url2, init);
  }
  isRecoverableTlsClientError(err) {
    if (!(err instanceof Error)) return false;
    return err.message.includes("EOF") || err.message.includes("no tls client for modification check") || err.message.includes("failed to modify existing client");
  }
  /** 清理 TLS 客户端资源 */
  async cleanup() {
    if (this.session) {
      try {
        await this.session.destroySession();
      } catch {
      }
      this.session = null;
    }
    if (this.moduleClient) {
      try {
        await this.moduleClient.terminate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("aborted") && !msg.includes("terminated")) {
          console.error("Error during ModuleClient termination:", err);
        }
      }
      this.moduleClient = null;
    }
  }
  /** 公共销毁方法，供外部调用释放资源 */
  async destroy() {
    await this.cleanup();
  }
  // ============ HTTP 工具方法 ============
  cookieString() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  buildHeaders(referer, origin) {
    const h = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/json",
      "User-Agent": DEFAULT_UA,
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin"
    };
    if (referer) h["Referer"] = referer;
    if (origin) h["Origin"] = origin;
    if (this.cookies.size > 0) h["Cookie"] = this.cookieString();
    return h;
  }
  buildProfileHeaders(referer) {
    const h = {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json;charset=UTF-8",
      "User-Agent": DEFAULT_UA,
      Origin: this.cfg.profileBase,
      Referer: referer,
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      priority: "u=1, i"
    };
    const keys = ["awsccc", "aws-user-profile-ubid", "amznfbgid", "i18next"];
    if (this.cookies.has("awsd2c-token")) keys.push("awsd2c-token", "awsd2c-token-c");
    const parts = keys.filter((k) => this.cookies.has(k)).map((k) => `${k}=${this.cookies.get(k)}`);
    if (parts.length) h["Cookie"] = parts.join("; ");
    return h;
  }
  async doGet(url2, headers) {
    if (!this.session) throw new Error("TLS 客户端未初始化");
    try {
      const resp = await this.session.get(url2, { headers });
      return {
        body: resp.body || "",
        status: resp.status,
        headers: resp.headers || {}
      };
    } catch (err) {
      if (this.isRecoverableTlsClientError(err)) {
        this.log(
          "[TLS] Recoverable GET error, rebuilding TLS client: " + (err instanceof Error ? err.message : String(err))
        );
        await this.rebuildTlsClient();
        const resp = await this.session.get(url2, { headers });
        return {
          body: resp.body || "",
          status: resp.status,
          headers: resp.headers || {}
        };
      }
      throw err;
    }
  }
  async doPost(url2, payload, headers) {
    if (!this.session) throw new Error("TLS 客户端未初始化");
    const body = JSON.stringify(payload);
    try {
      const resp = await this.session.post(url2, body, { headers });
      return {
        body: resp.body || "",
        status: resp.status,
        headers: resp.headers || {}
      };
    } catch (err) {
      if (this.isRecoverableTlsClientError(err)) {
        this.log(
          "[TLS] Recoverable POST error, rebuilding TLS client: " + (err instanceof Error ? err.message : String(err))
        );
        await this.rebuildTlsClient();
        const resp = await this.session.post(url2, body, { headers });
        return {
          body: resp.body || "",
          status: resp.status,
          headers: resp.headers || {}
        };
      }
      throw err;
    }
  }
  /**
   * tls-client 返回的 body 是字节透传字符串（latin1）；
   * 如果响应实际是 UTF-8 编码（含中文等多字节），需要二次解码。
   * 实现：把 string 当作 latin1 字节读回，再用 UTF-8 解码；
   * 若解码后含 U+FFFD 替换字符比原文多很多，则回退原值（说明原本就是 latin1 / ASCII）。
   */
  decodeBody(body) {
    if (!body) return "";
    try {
      if (/^[\x00-\x7F]*$/.test(body)) return body;
      const buf = Buffer.from(body, "latin1");
      const utf8 = buf.toString("utf-8");
      const replaceInOriginal = (body.match(/\uFFFD/g) || []).length;
      const replaceInUtf8 = (utf8.match(/\uFFFD/g) || []).length;
      if (replaceInUtf8 > replaceInOriginal + 2) return body;
      return utf8;
    } catch {
      return body;
    }
  }
  parseBody(body) {
    try {
      return JSON.parse(this.decodeBody(body));
    } catch {
      return {};
    }
  }
  /**
   * 识别 AWS 风控触发的错误响应，返回人类可读的标签
   * @returns 风控类型标签（如 'AWS-RISK-CONTROL'），不是风控返回 null
   */
  detectRiskControl(body, status) {
    if (status !== 400) return null;
    const lower = body.toLowerCase();
    if (body.includes("请稍后再试") && body.includes("管理员")) return "AWS-RISK-CONTROL";
    if (body.includes("发生意外错误")) return "AWS-RISK-CONTROL";
    if (lower.includes("try again later") && lower.includes("administrator"))
      return "AWS-RISK-CONTROL";
    if (lower.includes("unexpected error") && lower.includes("contact")) return "AWS-RISK-CONTROL";
    return null;
  }
  /** 把响应错误格式化为更友好的消息（含风控识别） */
  formatErrorBody(body, status) {
    const risk = this.detectRiskControl(body, status);
    if (risk) {
      return `${risk}（AWS 风控，建议：1) 启用代理池 N:1 分桶；2) 启用限速 + 风控自动暂停；3) 避免同邮箱域名大量注册）`;
    }
    return `status=${status} body=${body.substring(0, 200)}`;
  }
  async fetchD2CToken(origin, referer) {
    const headers = {
      Accept: "*/*",
      "Content-Type": "application/json",
      "User-Agent": DEFAULT_UA,
      Origin: origin,
      Referer: referer,
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      priority: "u=1, i"
    };
    const parts = [];
    if (this.cookies.has("awsccc")) parts.push("awsccc=" + this.cookies.get("awsccc"));
    if (this.cookies.has("awsd2c-token")) {
      const old = this.cookies.get("awsd2c-token");
      parts.push("awsd2c-token=" + old, "awsd2c-token-c=" + old);
    }
    if (parts.length) headers["Cookie"] = parts.join("; ");
    const payload = {};
    if (this.cookies.has("awsd2c-token")) payload.token = this.cookies.get("awsd2c-token");
    const resp = await this.doPost("https://vs.aws.amazon.com/token", payload, headers);
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    const tok = data.token;
    if (tok) {
      this.cookies.set("awsd2c-token", tok);
      this.cookies.set("awsd2c-token-c", tok);
      const jwtParts = tok.split(".");
      if (jwtParts.length >= 2) {
        try {
          const decoded = JSON.parse(Buffer.from(jwtParts[1], "base64url").toString());
          if (decoded.vid) this.vid = decoded.vid;
        } catch {
        }
      }
    }
  }
  // ============ 指纹生成 ============
  genFP(pageType, eventType, emailLen, emailAddr) {
    return this.genFPWithTime(pageType, eventType, 0, emailLen, emailAddr);
  }
  genFPWithTime(pageType, eventType, timeOnPage, emailLen, emailAddr) {
    const did = this.cfg.directoryId;
    let loc = "", ref = "";
    switch (pageType) {
      case "signin":
        loc = `${this.cfg.signinBase}/platform/${did}/login?workflowStateHandle=${this.workflowHandle}`;
        break;
      case "signup":
        loc = `${this.cfg.signinBase}/platform/${did}/signup?workflowStateHandle=${this.workflowHandle}`;
        break;
      default:
        if (eventType === "PageSubmit") {
          loc = `${this.cfg.profileBase}/?workflowID=${this.workflowId}#/signup/enter-email`;
        } else {
          loc = `${this.cfg.profileBase}/?workflowID=${this.workflowId}#/signup/start`;
        }
        if (!this.workflowId) loc = this.cfg.profileBase + "/";
    }
    if (pageType === "profile") {
      ref = `${this.cfg.signinBase}/platform/${did}/signup?workflowStateHandle=${this.workflowHandle}`;
    } else {
      ref = this.cfg.viewBase + "/";
    }
    return generateFingerprint(
      this.identity,
      loc,
      ref,
      this.fpCtx,
      pageType,
      eventType,
      timeOnPage,
      emailLen,
      emailAddr
    );
  }
  // ============ 注册步骤 ============
  async step1OIDC() {
    this.log("[1] OIDC 注册");
    const payload = {
      clientName: "Amazon Q Developer for command line",
      clientType: "public",
      scopes: [
        "codewhisperer:completions",
        "codewhisperer:analysis",
        "codewhisperer:conversations",
        "codewhisperer:transformations",
        "codewhisperer:taskassist"
      ]
    };
    const headers = { "Content-Type": "application/json" };
    let resp = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resp = await this.doPost(this.cfg.oidcBase + "/client/register", payload, headers);
        if (resp.status === 200) break;
      } catch (err) {
        if (attempt < 2) {
          this.log(`[1] OIDC 重试 (${attempt + 1}/3)...`);
          await sleep$2(2e3 * (attempt + 1));
          await this.rebuildTlsClient();
          continue;
        }
        throw err;
      }
    }
    if (!resp) throw new Error("OIDC 注册失败: 所有重试均失败");
    const data = this.parseBody(resp.body);
    this.clientId = data.clientId || "";
    this.clientSecret = data.clientSecret || "";
    if (!this.clientId) throw new Error(`OIDC 注册失败: ${resp.body.slice(0, 200)}`);
  }
  async step2Device() {
    this.log("[2] 设备授权");
    const resp = await this.doPost(
      this.cfg.oidcBase + "/device_authorization",
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        startUrl: this.cfg.startURL
      },
      { "Content-Type": "application/json" }
    );
    const data = this.parseBody(resp.body);
    this.deviceCode = data.deviceCode || "";
    this.userCode = data.userCode || "";
    this.log(`user_code=${this.userCode}`);
  }
  async step3Email() {
    if (this.cfg.manualMode) return;
    if (this.cfg.useOutlook && this.cfg.outlookData) {
      this.log("[3] 使用 Outlook 邮箱");
      const accounts = parseOutlookLines(this.cfg.outlookData);
      if (accounts.length === 0) throw new Error("无可用的 Outlook 账号");
      const acc = accounts.length === 1 ? accounts[0] : accounts[Math.floor(Math.random() * accounts.length)];
      this.email = acc.email;
      this.log(`email=${this.email}`);
      return;
    }
    if (this.cfg.useTempMailPlus) {
      this.log("[3] 使用自建域名邮箱 (TempMail.Plus)");
      if (!this.cfg.tempMailPlusEmail || !this.cfg.tempMailPlusEpin || !this.cfg.tempMailPlusDomain) {
        throw new Error("TempMail.Plus 配置不完整");
      }
      this.emailSvc = new TempMailPlusService(
        this.cfg.tempMailPlusEmail,
        this.cfg.tempMailPlusEpin,
        this.cfg.tempMailPlusDomain
      );
      this.email = await this.emailSvc.create();
      if (!this.email) throw new Error("生成邮箱地址失败");
      this.log(`email=${this.email}`);
      return;
    }
    if (this.cfg.useDDG) {
      this.log("[3] 使用 DuckDuckGo Email Protection");
      if (!this.cfg.ddgAuthToken || !this.cfg.ddgGmailEmail) {
        throw new Error("DDG 配置不完整 (需要 authToken 和 Gmail 地址)");
      }
      const gmailAccount = {
        email: this.cfg.ddgGmailEmail,
        accessToken: this.cfg.ddgGmailAccessToken,
        appPassword: this.cfg.ddgGmailAppPassword || void 0
      };
      this.emailSvc = new DuckDuckGoEmailService(this.cfg.ddgAuthToken, gmailAccount);
      this.email = await this.emailSvc.create();
      if (!this.email) throw new Error("DDG 地址生成失败");
      this.log(`email=${this.email}`);
      return;
    }
    this.log("[3] 创建临时邮箱");
    if (!this.cfg.moEmailBaseURL) throw new Error("MoEmail 未配置");
    this.emailSvc = new MoEmailService(this.cfg.moEmailBaseURL, this.cfg.moEmailAPIKey);
    this.email = await this.emailSvc.create();
    if (!this.email) throw new Error("创建临时邮箱失败");
    this.log(`email=${this.email}`);
  }
  async step4Portal() {
    this.log("[4] Portal 初始化");
    this.cookies.set("awsccc", awsccc());
    this.cookies.set("amznfbgid", amznFbgId());
    const redirect = `${this.cfg.viewBase}/start/#/device?user_code=${this.userCode}`;
    const url2 = `${this.cfg.portalBase}/login?directory_id=view&redirect_url=${redirect}`;
    const h = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json",
      Origin: this.cfg.viewBase,
      Referer: this.cfg.viewBase + "/",
      "User-Agent": DEFAULT_UA,
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site"
    };
    const resp = await this.doGet(url2, h);
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    const rurl = data.redirectUrl || "";
    if (rurl.includes("workflowStateHandle=")) {
      this.workflowHandle = splitAfter(rurl, "workflowStateHandle=");
    }
    if (data.csrfToken) this.cookies.set("loginCsrfToken", data.csrfToken);
    if (!this.workflowHandle) throw new Error("Portal 未返回 workflow handle");
    const loginURL = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
    await this.fetchD2CToken(this.cfg.signinBase, loginURL);
  }
  async step5WorkflowInit() {
    this.log("[5] 工作流初始化");
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
    let fp = this.genFP("signin", "first_load", 0, "");
    let rid = newUUID();
    let h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    let resp = await this.doPost(
      api,
      {
        stepId: "",
        workflowStateHandle: this.workflowHandle,
        inputs: [{ input_type: "FingerPrintRequestInput", fingerPrint: fp }],
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    let data = this.parseBody(resp.body);
    if (data.workflowStateHandle) this.workflowHandle = data.workflowStateHandle;
    if (data.stepId === "start") {
      fp = this.genFP("signin", "PageLoad", 0, "");
      rid = newUUID();
      h = this.buildHeaders(ref, this.cfg.signinBase);
      h["x-amzn-requestid"] = rid;
      h["x-amz-date"] = gmtDate();
      h["priority"] = "u=1, i";
      resp = await this.doPost(
        api,
        {
          stepId: "start",
          workflowStateHandle: this.workflowHandle,
          inputs: [{ input_type: "FingerPrintRequestInput", fingerPrint: fp }],
          requestId: rid
        },
        h
      );
      saveCookies(this.cookies, resp.headers);
      data = this.parseBody(resp.body);
      if (data.workflowStateHandle) this.workflowHandle = data.workflowStateHandle;
    }
  }
  async step6SubmitEmail() {
    this.log(`[6] 提交邮箱 ${this.email}`);
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
    const fp = this.genFP("signin", "PageSubmit", this.email.length, this.email);
    const rid = newUUID();
    const h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    const resp = await this.doPost(
      api,
      {
        stepId: "get-identity-user",
        workflowStateHandle: this.workflowHandle,
        actionId: "SUBMIT",
        inputs: [
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "ApplicationTypeRequestInput", applicationType: "SSO_INDIVIDUAL_ID" },
          {
            input_type: "UserEventRequestInput",
            directoryId: this.cfg.directoryId,
            userName: this.email,
            userEvents: [
              {
                input_type: "UserEvent",
                eventType: "PAGE_SUBMIT",
                pageName: "IDENTIFICATION",
                timeSpentOnPage: 5e3
              }
            ]
          },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    if (data.workflowStateHandle) this.workflowHandle = data.workflowStateHandle;
    if (resp.status === 400) return "signup";
    if (resp.status === 200) return "login";
    throw new Error(`提交邮箱失败: ${resp.status} - ${resp.body.slice(0, 200)}`);
  }
  async step7Signup() {
    this.log("[7] 注册 (SIGNUP)");
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${this.workflowHandle}`;
    const fp = this.genFP("signup", "PageSubmit", 0, "");
    const rid = newUUID();
    const h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    const resp = await this.doPost(
      api,
      {
        stepId: "get-identity-user",
        workflowStateHandle: this.workflowHandle,
        actionId: "SIGNUP",
        inputs: [
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    const redir = data.redirect;
    const rurl = redir?.url;
    if (rurl?.includes("workflowStateHandle=")) {
      this.workflowHandle = splitAfter(rurl, "workflowStateHandle=");
    }
  }
  async step7_5SignupInit() {
    this.log("[7.5] Signup API 初始化");
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup?workflowStateHandle=${this.workflowHandle}`;
    let fp = this.genFP("signup", "first_load", 0, "");
    let rid = newUUID();
    let h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    let resp = await this.doPost(
      api,
      {
        stepId: "",
        workflowStateHandle: this.workflowHandle,
        inputs: [
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    let data = this.parseBody(resp.body);
    if (data.workflowStateHandle) this.workflowHandle = data.workflowStateHandle;
    if (data.stepId !== "start")
      throw new Error(
        `Signup init 返回意外 stepId: ${data.stepId}, resp status: ${resp.status}, body: ${resp.body.substring(0, 200)}`
      );
    fp = this.genFP("signup", "PageLoad", 0, "");
    rid = newUUID();
    h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    resp = await this.doPost(
      api,
      {
        stepId: "start",
        workflowStateHandle: this.workflowHandle,
        inputs: [
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    data = this.parseBody(resp.body);
    if (data.workflowStateHandle) this.workflowHandle = data.workflowStateHandle;
    const redir = data.redirect;
    const rurl = redir?.url;
    if (rurl?.includes("workflowID=")) {
      let wid = splitAfter(rurl, "workflowID=");
      const hashIdx = wid.indexOf("#");
      if (hashIdx >= 0) wid = wid.slice(0, hashIdx);
      this.workflowId = wid;
    }
    if (!this.workflowId) throw new Error("Signup init 未返回 workflowID");
  }
  async step7_8ProfileInit() {
    this.log("[7.8] Profile 页面初始化");
    this.ubid = ubidGen();
    this.cookies.set("aws-user-profile-ubid", this.ubid);
    if (!this.cookies.has("amznfbgid")) this.cookies.set("amznfbgid", amznFbgId());
    if (!this.cookies.has("awsccc")) this.cookies.set("awsccc", awsccc());
    const url2 = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
    const resp = await this.doGet(url2, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": DEFAULT_UA,
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate"
    });
    saveCookies(this.cookies, resp.headers);
    resetPerfTiming(this.fpCtx);
    await this.fetchD2CToken(this.cfg.profileBase, url2);
  }
  async step8ProfileStart() {
    this.log("[8] Profile 启动");
    const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
    const fp = this.genFP("profile", "PageLoad", 0, "");
    const resp = await this.doPost(
      this.cfg.profileBase + "/api/start",
      {
        workflowID: this.workflowId,
        browserData: {
          attributes: {
            fingerprint: fp,
            eventTimestamp: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
            timeSpentOnPage: String(800 + Math.floor(Math.random() * 2200)),
            eventType: "PageLoad",
            ubid: this.ubid,
            visitorId: this.vid
          },
          cookies: {}
        }
      },
      this.buildProfileHeaders(ref)
    );
    const data = this.parseBody(resp.body);
    this.workflowState = data.workflowState || "";
    if (!this.workflowState)
      throw new Error(`Profile start 未返回 workflowState: ${resp.body.slice(0, 200)}`);
  }
  async step9SendOTP() {
    this.log("[9] 发送验证码");
    if (this.cfg.useOutlook && this.cfg.outlookData) {
      const accounts = parseOutlookLines(this.cfg.outlookData);
      const acc = accounts.find((a) => a.email === this.email);
      if (acc) {
        try {
          this.outlookMailCount = await getInboxCount(acc);
          this.log(`发送前邮件数: ${this.outlookMailCount}`);
        } catch (err) {
          this.log(`获取邮件数量失败: ${err}, 默认为0`);
        }
      }
    }
    const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
    const timeOnPage = 5e3 + Math.floor(Math.random() * 3001);
    const fp = this.genFPWithTime(
      "profile",
      "PageSubmit",
      timeOnPage,
      this.email.length,
      this.email
    );
    const tsp = String(timeOnPage);
    const payload = {
      workflowState: this.workflowState,
      email: this.email,
      browserData: {
        attributes: {
          fingerprint: fp,
          eventTimestamp: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
          timeSpentOnPage: tsp,
          pageName: "EMAIL_COLLECTION",
          eventType: "PageSubmit",
          ubid: this.ubid,
          visitorId: this.vid
        },
        cookies: {}
      }
    };
    const resp = await this.doPost(
      this.cfg.profileBase + "/api/send-otp",
      payload,
      this.buildProfileHeaders(ref)
    );
    if (resp.status !== 200)
      throw new Error(`send-otp 失败 (${resp.status}), body: ${resp.body.substring(0, 300)}`);
    this.log("验证码已发送");
  }
  async step10GetOTP() {
    if (this.cfg.manualMode) throw new Error("手动模式需外部提供验证码");
    this.log("[10] 等待验证码");
    if (this.cfg.useOutlook && this.cfg.outlookData) {
      const accounts = parseOutlookLines(this.cfg.outlookData);
      const acc = accounts.find((a) => a.email === this.email);
      if (!acc) throw new Error("未找到对应 Outlook 账号");
      return await waitForOTP(
        acc,
        this.outlookMailCount,
        120,
        5,
        () => this.abortController.signal.aborted
      );
    }
    if (!this.emailSvc) throw new Error("邮箱服务未初始化");
    return await this.emailSvc.waitForCode(120, 3, () => this.abortController.signal.aborted);
  }
  async step11CreateIdentity(otp) {
    this.log("[11] 创建身份");
    const ref = `${this.cfg.profileBase}/?workflowID=${this.workflowId}`;
    const fp = this.genFP("profile", "EmailVerification", 0, "");
    const resp = await this.doPost(
      this.cfg.profileBase + "/api/create-identity",
      {
        workflowState: this.workflowState,
        userData: { email: this.email, fullName: this.cfg.fullName },
        otpCode: otp,
        browserData: {
          attributes: {
            fingerprint: fp,
            eventTimestamp: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
            timeSpentOnPage: String(3e4 + Math.floor(Math.random() * 3e4)),
            pageName: "EMAIL_VERIFICATION",
            eventType: "EmailVerification",
            ubid: this.ubid,
            visitorId: this.vid
          },
          cookies: {}
        }
      },
      this.buildProfileHeaders(ref)
    );
    const data = this.parseBody(resp.body);
    this.regCode = data.registrationCode || "";
    this.signState = data.signInState || "";
    if (!this.regCode)
      throw new Error(`create-identity 未返回 registrationCode: ${resp.body.slice(0, 200)}`);
  }
  async step12SetPassword() {
    this.log("[12] 设置密码");
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/signup?registrationCode=${this.regCode}&state=${this.signState}`;
    let fp = this.genFP("signup", "PageSubmit", 0, "");
    let rid = newUUID();
    let h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    let resp = await this.doPost(
      api,
      {
        stepId: "",
        state: this.signState,
        inputs: [
          {
            input_type: "UserRegistrationRequestInput",
            registrationCode: this.regCode,
            state: this.signState
          },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    let data = this.parseBody(resp.body);
    this.workflowHandle = data.workflowStateHandle || "";
    const encCtx = getNestedMap(
      data,
      "workflowResponseData",
      "encryptionContextResponse"
    );
    const pubKeyMap = encCtx ? getNestedStringMap(encCtx, "publicKey") : null;
    if (!pubKeyMap?.n)
      throw new Error(`未获取到加密公钥: ${this.formatErrorBody(resp.body, resp.status)}`);
    const issuer = encCtx?.issuer || "signin";
    const audience = encCtx?.audience || "AWSPasswordService";
    const region = encCtx?.region || "us-east-1";
    const encrypted = encryptPassword(this.cfg.password, pubKeyMap, issuer, audience, region);
    fp = this.genFP("signup", "PageSubmit", 0, "");
    rid = newUUID();
    h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    resp = await this.doPost(
      api,
      {
        stepId: "get-new-password-for-password-creation",
        workflowStateHandle: this.workflowHandle,
        actionId: "SUBMIT",
        inputs: [
          {
            input_type: "PasswordRequestInput",
            password: encrypted,
            successfullyEncrypted: "SUCCESSFUL"
          },
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    data = this.parseBody(resp.body);
    const redir = data.redirect;
    const rurl = redir?.url;
    if (!rurl) throw new Error(`密码设置未返回 redirect: ${resp.body.slice(0, 200)}`);
    const wh = extractParam(rurl, "workflowStateHandle");
    const st = extractParam(rurl, "state");
    const rh = extractParam(rurl, "workflowResultHandle");
    await this.completeSignup(wh, st, rh);
  }
  async completeSignup(wh, state, rh) {
    this.log("[12.5] 完成注册工作流");
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${wh}&state=${state}&workflowResultHandle=${rh}`;
    const fp = this.genFP("signin", "PageLoad", 0, "");
    const rid = newUUID();
    const h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    const resp = await this.doPost(
      api,
      {
        stepId: "",
        workflowStateHandle: wh,
        workflowResultHandle: rh,
        state,
        inputs: [
          { input_type: "UserRequestInput", username: this.email },
          { input_type: "FingerPrintRequestInput", fingerPrint: fp }
        ],
        visitorId: this.vid,
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    if (data.stepId !== "end-of-workflow-success")
      throw new Error(
        `完成工作流失败: ${data.stepId || "undefined"} ${this.formatErrorBody(resp.body, resp.status)}`
      );
    const redir = data.redirect;
    const rurl = redir?.url;
    if (rurl) {
      this.authCode = extractParam(rurl, "workflowResultHandle");
      this.ssoState = extractParam(rurl, "state");
      this.wdcCSRFToken = extractParam(rurl, "wdc_csrf_token");
    }
  }
  // ============ SSO 授权 (Step12.8-13) ============
  async step12_8SSOWorkflow() {
    this.log("[12.8] SSO 工作流");
    const redirectURL = encodeURIComponent(this.cfg.viewBase + "/start/#/");
    const loginURL = `${this.cfg.portalBase}/login?directory_id=view&redirect_url=${redirectURL}`;
    const h = {
      Accept: "*/*",
      "User-Agent": DEFAULT_UA,
      Origin: this.cfg.viewBase,
      Referer: this.cfg.viewBase + "/",
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      priority: "u=1, i"
    };
    if (this.cookies.has("awsccc")) h["Cookie"] = "awsccc=" + this.cookies.get("awsccc");
    const resp = await this.doGet(loginURL, h);
    saveCookies(this.cookies, resp.headers);
    const data = this.parseBody(resp.body);
    if (data.csrfToken) this.cookies.set("loginCsrfToken", data.csrfToken);
    const rurl = data.redirectUrl || "";
    let wh = "";
    if (rurl.includes("workflowStateHandle=")) {
      wh = splitAfter(rurl, "workflowStateHandle=");
    }
    if (!wh) throw new Error("SSO 无法获取 workflowStateHandle");
    await this.completeSSOWorkflow(wh);
  }
  async completeSSOWorkflow(wh) {
    const api = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/api/execute`;
    const ref = `${this.cfg.signinBase}/platform/${this.cfg.directoryId}/login?workflowStateHandle=${wh}`;
    let fp = this.genFP("signin", "PageLoad", 0, "");
    let rid = newUUID();
    let h = this.buildHeaders(ref, this.cfg.signinBase);
    h["x-amzn-requestid"] = rid;
    h["x-amz-date"] = gmtDate();
    h["priority"] = "u=1, i";
    let resp = await this.doPost(
      api,
      {
        stepId: "",
        workflowStateHandle: wh,
        inputs: [{ input_type: "FingerPrintRequestInput", fingerPrint: fp }],
        requestId: rid
      },
      h
    );
    saveCookies(this.cookies, resp.headers);
    let data = this.parseBody(resp.body);
    let newWH = data.workflowStateHandle || wh;
    if (data.stepId === "start") {
      fp = this.genFP("signin", "PageLoad", 0, "");
      rid = newUUID();
      h = this.buildHeaders(ref, this.cfg.signinBase);
      h["x-amzn-requestid"] = rid;
      h["x-amz-date"] = gmtDate();
      h["priority"] = "u=1, i";
      resp = await this.doPost(
        api,
        {
          stepId: "start",
          workflowStateHandle: newWH,
          inputs: [{ input_type: "FingerPrintRequestInput", fingerPrint: fp }],
          requestId: rid
        },
        h
      );
      saveCookies(this.cookies, resp.headers);
      data = this.parseBody(resp.body);
    }
    if (data.stepId === "end-of-workflow-success") {
      const redir = data.redirect;
      const rurl = redir?.url;
      if (rurl) {
        this.authCode = extractParam(rurl, "workflowResultHandle");
        this.ssoState = extractParam(rurl, "state");
        this.wdcCSRFToken = extractParam(rurl, "wdc_csrf_token");
      }
    }
    const params = new URLSearchParams();
    if (this.ssoState) params.set("state", this.ssoState);
    params.set("workflowResultHandle", this.authCode);
    if (this.wdcCSRFToken) params.set("wdc_csrf_token", this.wdcCSRFToken);
    const startURL = this.cfg.viewBase + "/start/?" + params.toString();
    const cookieParts = [];
    if (this.cookies.has("loginCsrfToken"))
      cookieParts.push("loginCsrfToken=" + this.cookies.get("loginCsrfToken"));
    if (this.cookies.has("awsccc")) cookieParts.push("awsccc=" + this.cookies.get("awsccc"));
    await this.doGet(startURL, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": DEFAULT_UA,
      Referer: this.cfg.signinBase + "/",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      ...cookieParts.length ? { Cookie: cookieParts.join("; ") } : {}
    });
  }
  async step13SSOToken() {
    this.log("[13] 获取 SSO Token");
    const csrf = this.cookies.get("loginCsrfToken");
    if (!csrf) throw new Error("缺少 loginCsrfToken");
    const h = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_UA,
      Origin: this.cfg.viewBase,
      Referer: this.cfg.viewBase + "/",
      "x-amz-sso-csrf-token": csrf,
      "sec-ch-ua": DEFAULT_SEC_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      priority: "u=1, i"
    };
    const formData = `authCode=${encodeURIComponent(this.authCode)}&state=${encodeURIComponent(this.ssoState)}&orgId=view`;
    const ssoSession = new tlsclientwrapper.SessionClient(this.moduleClient, this.sessionOpts);
    try {
      for (let retry = 0; retry < 5; retry++) {
        const resp2 = await ssoSession.post(this.cfg.portalBase + "/auth/sso-token", formData, {
          headers: h
        });
        const data = JSON.parse(resp2.body || "{}");
        if (data.token) {
          this.ssoToken = data.token;
          break;
        }
        const errMsg = data.errorMessage || "";
        if (errMsg.toLowerCase().includes("not authorized")) {
          await sleep$2(3e3);
          continue;
        }
        throw new Error(`SSO Token 失败: ${resp2.body?.slice(0, 200)}`);
      }
    } finally {
      try {
        await ssoSession.destroySession();
      } catch {
      }
    }
    if (!this.ssoToken) throw new Error("SSO Token 重试 5 次仍失败");
    let resp = await this.doPost(
      this.cfg.oidcBase + "/device_authorization/accept_user_code",
      {
        userCode: this.userCode,
        userSessionId: this.ssoToken
      },
      { "Content-Type": "application/json" }
    );
    const dcData = this.parseBody(resp.body);
    const dc = dcData.deviceContext;
    await this.doPost(
      this.cfg.oidcBase + "/device_authorization/associate_token",
      {
        deviceContext: dc,
        userSessionId: this.ssoToken
      },
      { "Content-Type": "application/json" }
    );
    for (let i = 0; i < 30; i++) {
      resp = await this.doPost(
        this.cfg.oidcBase + "/token",
        {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          deviceCode: this.deviceCode,
          grantType: "urn:ietf:params:oauth:grant-type:device_code"
        },
        { "Content-Type": "application/json" }
      );
      if (resp.status === 200) return this.parseBody(resp.body);
      await sleep$2(2e3);
    }
    throw new Error("Token 轮询超时");
  }
  // ============ 主流程 ============
  /** 执行完整注册流程（自动模式） */
  async run() {
    try {
      await this.initTlsClient();
      await refreshAppJSConfig((url2, init) => this.fetchAppJS(url2, init));
      await this.rebuildTlsClient();
      const initSteps = [
        { name: "OIDC", fn: () => this.step1OIDC() },
        { name: "Device", fn: () => this.step2Device() },
        { name: "Email", fn: () => this.step3Email() },
        { name: "Portal", fn: () => this.step4Portal() },
        { name: "WorkflowInit", fn: () => this.step5WorkflowInit() }
      ];
      for (const s of initSteps) {
        this.checkAborted();
        try {
          await s.fn();
        } catch (err) {
          return {
            status: "failed",
            email: this.email,
            error: `[${s.name}] ${err.message}`
          };
        }
      }
      this.checkAborted();
      const emailStatus = await this.step6SubmitEmail();
      if (emailStatus === "signup") {
        const signupSteps = [
          { name: "Signup", fn: () => this.step7Signup() },
          { name: "SignupInit", fn: () => this.step7_5SignupInit() },
          { name: "ProfileInit", fn: () => this.step7_8ProfileInit() },
          { name: "ProfileStart", fn: () => this.step8ProfileStart() },
          { name: "SendOTP", fn: () => this.step9SendOTP() }
        ];
        for (const s of signupSteps) {
          this.checkAborted();
          try {
            await s.fn();
          } catch (err) {
            return {
              status: "failed",
              email: this.email,
              error: `[${s.name}] ${err.message}`
            };
          }
        }
        this.checkAborted();
        let otp;
        try {
          otp = await this.step10GetOTP();
        } catch (err) {
          return {
            status: "failed",
            email: this.email,
            error: `[GetOTP] ${err.message}`
          };
        }
        for (const s of [
          { name: "CreateIdentity", fn: () => this.step11CreateIdentity(otp) },
          { name: "SetPassword", fn: () => this.step12SetPassword() }
        ]) {
          this.checkAborted();
          try {
            await s.fn();
          } catch (err) {
            return {
              status: "failed",
              email: this.email,
              error: `[${s.name}] ${err.message}`
            };
          }
        }
      } else {
        return { status: "failed", email: this.email, error: "该邮箱已注册过" };
      }
      this.checkAborted();
      try {
        await this.step12_8SSOWorkflow();
      } catch (err) {
        return {
          status: "failed",
          email: this.email,
          error: `[SSOWorkflow] ${err.message}`
        };
      }
      await sleep$2(2e3);
      this.checkAborted();
      let awsToken;
      try {
        awsToken = await this.step13SSOToken();
      } catch (err) {
        return {
          status: "failed",
          email: this.email,
          error: `[SSOToken] ${err.message}`
        };
      }
      return {
        status: "success",
        email: this.email,
        password: this.cfg.password,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: awsToken.refreshToken || "",
        accessToken: awsToken.accessToken || "",
        region: "us-east-1",
        provider: "BuilderId"
      };
    } finally {
      await this.cleanup();
    }
  }
  /**
   * 返回本次注册实际生效的代理 URL（按 sessionOpts 同样的优先级解析），
   * 用于在指纹摘要里准确显示是直连还是走代理。
   */
  resolvedProxyUrl() {
    return this.cfg.proxy && this.cfg.proxy.trim() || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || getSystemProxy() || void 0;
  }
  /** 输出本次注册使用的指纹摘要（用于审计与后续复用） */
  fingerprintSnapshot() {
    const resolved = this.resolvedProxyUrl();
    return {
      chromeVer: this.identity.chromeVer,
      ua: this.identity.ua,
      gpuVendor: this.identity.gpuVendor,
      gpuModel: this.identity.gpuModel,
      canvasHash: this.identity.canvasHash,
      screen: { width: this.identity.screen.width, height: this.identity.screen.height },
      // 脱敏后保存（隐藏密码部分），同时确保系统/环境变量代理也被捕获
      proxyUrl: resolved ? resolved.replace(/:([^:@/]+)@/, ":***@") : void 0
    };
  }
  /** 手动模式注册 - Step1-2 自动，Step3 等待外部设置邮箱，Step4-9 自动，Step10 等待外部 OTP */
  async runManualPhase1() {
    try {
      await this.initTlsClient();
      await refreshAppJSConfig((url2, init) => this.fetchAppJS(url2, init));
      await this.rebuildTlsClient();
      await this.step1OIDC();
      await this.step2Device();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  /** 手动模式 - 设置邮箱后继续注册流程到发送 OTP */
  async runManualPhase2(email, fullName) {
    this.email = email;
    if (fullName) this.cfg.fullName = fullName;
    try {
      await this.step4Portal();
      await this.step5WorkflowInit();
      const status = await this.step6SubmitEmail();
      if (status !== "signup") return { success: false, error: "该邮箱已注册过" };
      await this.step7Signup();
      await this.step7_5SignupInit();
      await this.step7_8ProfileInit();
      await this.step8ProfileStart();
      await this.step9SendOTP();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  /** 手动模式 - 输入 OTP 后完成注册 */
  async runManualPhase3(otp) {
    try {
      await this.step11CreateIdentity(otp);
      await this.step12SetPassword();
      await this.step12_8SSOWorkflow();
      await sleep$2(2e3);
      const awsToken = await this.step13SSOToken();
      return {
        status: "success",
        email: this.email,
        password: this.cfg.password,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: awsToken.refreshToken || "",
        accessToken: awsToken.accessToken || "",
        region: "us-east-1",
        provider: "BuilderId"
      };
    } catch (err) {
      return { status: "failed", email: this.email, error: err.message };
    } finally {
      await this.cleanup();
    }
  }
}
function genPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*";
  let pw = "";
  for (let i = 0; i < 3; i++) pw += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 6; i++) pw += lower[Math.floor(Math.random() * lower.length)];
  for (let i = 0; i < 3; i++) pw += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 2; i++) pw += special[Math.floor(Math.random() * special.length)];
  const arr = pw.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}
function newConfig(overrides) {
  return {
    oidcBase: "https://oidc.us-east-1.amazonaws.com",
    signinBase: "https://us-east-1.signin.aws",
    profileBase: "https://profile.aws.amazon.com",
    viewBase: "https://view.awsapps.com",
    portalBase: "https://portal.sso.us-east-1.amazonaws.com",
    directoryId: "d-9067642ac7",
    startURL: "https://view.awsapps.com/start",
    password: genPassword(),
    fullName: randomFullName(),
    proxy: "",
    moEmailBaseURL: "",
    moEmailAPIKey: "",
    useOutlook: false,
    outlookData: "",
    useTempMailPlus: false,
    tempMailPlusEmail: "",
    tempMailPlusEpin: "",
    tempMailPlusDomain: "",
    useDDG: false,
    ddgAuthToken: "",
    ddgGmailEmail: "",
    ddgGmailAppPassword: "",
    ddgGmailAccessToken: "",
    manualMode: false,
    ...overrides
  };
}
const OIDC_BASE = "https://oidc.us-east-1.amazonaws.com";
const KIRO_SCOPES = "codewhisperer:completions,codewhisperer:analysis,codewhisperer:conversations,codewhisperer:transformations,codewhisperer:taskassist";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
function sleep$1(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelay(min, max) {
  return sleep$1(min + Math.random() * (max - min));
}
function isWindowUsable(win) {
  try {
    return !win.isDestroyed() && !win.webContents.isDestroyed();
  } catch {
    return false;
  }
}
function getProxyUrl(cfgProxy) {
  return cfgProxy || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || getSystemProxy() || void 0;
}
async function apiFetch(url2, options = {}) {
  const h = { "User-Agent": BROWSER_UA, ...options.headers || {} };
  const fetchOpts = {
    method: options.method || "GET",
    headers: h,
    body: options.body
  };
  const proxyUrl = getProxyUrl(options.proxyUrl);
  if (proxyUrl) {
    const agent = new undici.ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } });
    fetchOpts.dispatcher = agent;
  }
  const resp = await undici.fetch(url2, fetchOpts);
  const body = await resp.text();
  return { status: resp.status, body };
}
async function waitForSelector(win, selector, timeoutMs = 3e4) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isWindowUsable(win)) return false;
    try {
      const found = await win.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (found) return true;
    } catch {
    }
    await sleep$1(500);
  }
  return false;
}
async function waitForPageLoad(win, extraMs = 1500) {
  if (!isWindowUsable(win)) return;
  await new Promise((resolve) => {
    if (!isWindowUsable(win)) return resolve();
    const done = () => {
      if (win.webContents.isDestroyed()) return resolve();
      win.webContents.removeListener("did-finish-load", done);
      win.webContents.removeListener("did-fail-load", done);
      resolve();
    };
    try {
      if (!win.webContents.isLoading()) {
        resolve();
      } else {
        win.webContents.once("did-finish-load", done);
        win.webContents.once("did-fail-load", done);
      }
    } catch {
      resolve();
    }
  });
  await randomDelay(extraMs, extraMs + 1e3);
}
async function getFatalRegistrationPageError(win) {
  if (!isWindowUsable(win)) return null;
  return win.webContents.executeJavaScript(
    `
      (function() {
        const text = (document.body && document.body.innerText) || '';
        const heading = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
          .map((el) => (el.textContent || '').trim())
          .join('\\n');
        if (/sign\\s*in\\s*with\\s*your\\s*aws\\s*builder\\s*id/i.test(heading) ||
            /sign\\s*in\\s*with\\s*your\\s*aws\\s*builder\\s*id/i.test(text)) {
          return 'AWS Builder ID sign-in page detected instead of signup';
        }
        if (/\\berror\\b[\\s\\S]*sorry,\\s*there\\s*was\\s*an\\s*error\\s*processing\\s*your\\s*request\\.\\s*please\\s*try\\s*again\\./i.test(text)) {
          return 'AWS request processing error page detected';
        }
        if (/it(?:'|’)?s\\s*not\\s*you,?\\s*it(?:'|’)?s\\s*us[\\s\\S]*we\\s*couldn(?:'|’)?t\\s*complete\\s*your\\s*request\\s*right\\s*now\\.\\s*please\\s*try\\s*again\\s*later\\./i.test(text)) {
          return 'AWS could not complete request page detected';
        }
        return null;
      })()
    `
  ).catch(() => null);
}
async function failOnFatalRegistrationPageError(win, context) {
  const error = await getFatalRegistrationPageError(win);
  if (!error) return;
  throw new Error(`${error}${context ? ` (${context})` : ""}`);
}
async function clickWithCookieDismiss(win, selector, timeoutMs = 1e4) {
  const dismissCookies = async () => {
    if (!isWindowUsable(win)) return;
    await win.webContents.executeJavaScript(
      `
      (function() {
        const btn = document.querySelector('button[data-id="awsccc-cb-btn-accept"]');
        if (btn) btn.click();
      })()
    `
    ).catch(() => {
    });
    await sleep$1(300);
  };
  await dismissCookies();
  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (Date.now() < deadline && isWindowUsable(win)) {
    await failOnFatalRegistrationPageError(win, `waiting for ${selector}`);
    found = await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
    if (found) break;
    await sleep$1(500);
  }
  if (!found) {
    await failOnFatalRegistrationPageError(win, `selector not found: ${selector}`);
    return false;
  }
  for (let i = 0; i < 3; i++) {
    await failOnFatalRegistrationPageError(win, `before clicking ${selector}`);
    if (!isWindowUsable(win)) return false;
    await dismissCookies();
    await win.webContents.executeJavaScript(
      `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.click();
      })()
    `
    ).catch(() => {
    });
    await sleep$1(400);
    if (!isWindowUsable(win)) return true;
    await failOnFatalRegistrationPageError(win, `after clicking ${selector}`);
    const stillThere = await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
    if (!stillThere) return true;
    if (i < 2) await sleep$1(600);
  }
  return true;
}
async function typeInto(win, selector, text, timeoutMs = 15e3) {
  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (Date.now() < deadline && isWindowUsable(win)) {
    await failOnFatalRegistrationPageError(win, `waiting to type into ${selector}`);
    found = await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
    if (found) break;
    await sleep$1(500);
  }
  if (!found || !isWindowUsable(win)) {
    await failOnFatalRegistrationPageError(win, `input not found: ${selector}`);
    return false;
  }
  await win.webContents.executeJavaScript(
    `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, '');
      else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `
  ).catch(() => {
  });
  for (const char of text) {
    if (!isWindowUsable(win)) return false;
    await win.webContents.executeJavaScript(
      `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, el.value + ${JSON.stringify(char)});
        else el.value += ${JSON.stringify(char)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `
    ).catch(() => {
    });
    await sleep$1(60 + Math.random() * 80);
  }
  await win.webContents.executeJavaScript(
    `
    document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new Event('change', { bubbles: true }))
  `
  ).catch(() => {
  });
  return true;
}
class BrowserRegistrar {
  cfg;
  log;
  win = null;
  sessionPartition;
  aborted = false;
  emailSvc = null;
  consumedProvidedEmailLine = null;
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || ((msg) => console.log(msg));
    this.sessionPartition = `persist:reg-${cfg.taskId || Date.now()}`;
    this.log(`[Browser] New registration session created: ${this.sessionPartition}`);
    this.log(
      `[Browser] Method: ${cfg.useDDG ? "DuckDuckGo/Gmail" : cfg.useTempMailPlus ? "TempMail.Plus" : cfg.providedEmailData ? "Provided Email" : "MoEmail"}`
    );
    this.log(`[Browser] Proxy configured: ${cfg.proxyUrl ? cfg.proxyUrl : "none"}`);
  }
  abort() {
    this.aborted = true;
    this.destroyWindow();
  }
  checkAborted() {
    if (this.aborted) throw new Error("Registration cancelled");
  }
  destroyWindow() {
    if (this.win && !this.win.isDestroyed()) {
      try {
        this.win.close();
      } catch {
      }
    }
    this.win = null;
  }
  async destroy() {
    this.log(`[Browser] Destroying registration session: ${this.sessionPartition}`);
    this.destroyWindow();
    try {
      const ses = electron.session.fromPartition(this.sessionPartition);
      await ses.clearStorageData();
      await ses.clearCache();
      this.log("[Browser] Registration session storage/cache cleared");
    } catch (error) {
      this.log(
        `[Browser] Warning: failed to clear session storage/cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  async createWindow() {
    this.log(`[Browser] Creating Electron session/window for partition: ${this.sessionPartition}`);
    const ses = electron.session.fromPartition(this.sessionPartition);
    if (this.cfg.proxyUrl) {
      this.log(`[Browser] Applying proxy rules: ${this.cfg.proxyUrl}`);
      await ses.setProxy({ proxyRules: this.cfg.proxyUrl });
      this.log(`[Browser] Proxy applied: ${this.cfg.proxyUrl}`);
    } else {
      this.log("[Browser] No proxy configured; using direct/system network");
    }
    const cleanUA = ses.getUserAgent().replace(/Electron\/[\d.]+\s*/g, "").replace(/kiro-account-manager\/[\d.]+\s*/g, "").trim();
    ses.setUserAgent(cleanUA);
    const win = new electron.BrowserWindow({
      width: 1024,
      height: 768,
      show: true,
      title: "Kiro Registration",
      webPreferences: {
        session: ses,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    win.on("closed", () => {
      this.log("[Browser] Registration window closed");
    });
    win.webContents.on("destroyed", () => {
      this.log("[Browser] Registration webContents destroyed");
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      this.log(
        `[Browser] Load failed: ${errorCode} ${errorDescription} ${validatedURL.slice(0, 120)}`
      );
    });
    this.win = win;
    this.log("[Browser] Registration window created successfully");
    return win;
  }
  async createEmailAddress() {
    if (this.cfg.useDDG) {
      if (!this.cfg.ddgAuthToken || !this.cfg.ddgGmailEmail)
        throw new Error("DDG config incomplete");
      const gmailAccount = {
        email: this.cfg.ddgGmailEmail,
        accessToken: this.cfg.ddgGmailAccessToken || "",
        appPassword: this.cfg.ddgGmailAppPassword || void 0
      };
      const svc = new DuckDuckGoEmailService(this.cfg.ddgAuthToken, gmailAccount);
      const addr = await svc.create();
      if (!addr) throw new Error("DDG address creation failed");
      this.emailSvc = svc;
      return addr;
    }
    if (this.cfg.useTempMailPlus) {
      if (!this.cfg.tempMailPlusEmail || !this.cfg.tempMailPlusEpin || !this.cfg.tempMailPlusDomain) {
        throw new Error("TempMailPlus config incomplete");
      }
      const svc = new TempMailPlusService(
        this.cfg.tempMailPlusEmail,
        this.cfg.tempMailPlusEpin,
        this.cfg.tempMailPlusDomain
      );
      const addr = await svc.create();
      if (!addr) throw new Error("TempMailPlus address creation failed");
      this.emailSvc = svc;
      return addr;
    }
    if (this.cfg.providedEmailData) {
      const accounts = parseProvidedEmailLines(this.cfg.providedEmailData);
      if (accounts.length === 0) throw new Error("No valid provided email accounts");
      const account = accounts[0];
      const svc = new ProvidedEmailService(
        account,
        this.cfg.providedEmailApiKey || "",
        this.cfg.providedEmailApiBaseURL || "https://firstmail.ltd/api/v1"
      );
      const addr = await svc.create();
      if (!addr) throw new Error("Provided email address creation failed");
      this.emailSvc = svc;
      this.cfg.password = account.password;
      this.consumedProvidedEmailLine = `${account.email}:${account.password}`;
      return addr;
    }
    if (this.cfg.moEmailBaseURL) {
      const svc = new MoEmailService(this.cfg.moEmailBaseURL, this.cfg.moEmailAPIKey || "");
      const addr = await svc.create();
      if (!addr) throw new Error("MoEmail address creation failed");
      this.emailSvc = svc;
      return addr;
    }
    throw new Error("No email provider configured");
  }
  // ============ Authorization Code + PKCE flow (same as Kiro IDE) ============
  /** Generate PKCE code_verifier and code_challenge */
  generatePKCE() {
    const verifier = crypto$1.randomBytes(32).toString("base64url");
    const challenge = crypto$1.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }
  /**
   * Build the authorization URL that Kiro IDE uses.
   * The browser navigates here, user signs up/in, then redirects to callback.
   */
  async registerOidcClient(redirectUri) {
    const resp = await apiFetch(`${OIDC_BASE}/client/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Kiro IDE",
        clientType: "public",
        scopes: KIRO_SCOPES.split(","),
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: [redirectUri],
        issuerUrl: "https://view.awsapps.com/start"
      })
    });
    if (resp.status !== 200) {
      throw new Error(
        `OIDC client registration failed (${resp.status}): ${resp.body.slice(0, 200)}`
      );
    }
    const data = JSON.parse(resp.body);
    if (!data.clientId || !data.clientSecret) {
      throw new Error(`OIDC client registration missing credentials: ${resp.body.slice(0, 200)}`);
    }
    return { clientId: data.clientId, clientSecret: data.clientSecret };
  }
  buildAuthURL(clientId, codeChallenge, state, redirectUri) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scopes: KIRO_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `${OIDC_BASE}/authorize?${params.toString()}`;
  }
  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUri) {
    const resp = await apiFetch(`${OIDC_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        grantType: "authorization_code",
        code,
        redirectUri,
        codeVerifier: verifier
      })
    });
    if (resp.status !== 200) {
      throw new Error(`Token exchange failed (${resp.status}): ${resp.body.slice(0, 200)}`);
    }
    const data = JSON.parse(resp.body);
    if (!data.access_token && !data.accessToken) {
      throw new Error(`No access token in response: ${resp.body.slice(0, 200)}`);
    }
    return {
      accessToken: data.access_token || data.accessToken,
      refreshToken: data.refresh_token || data.refreshToken,
      expiresIn: data.expires_in || data.expiresIn
    };
  }
  /**
   * Wait for the browser to navigate to the callback URL and extract the auth code.
   * Uses a local redirect URI that we intercept via webRequest.
   */
  waitForAuthCode(win, redirectUri, state, timeoutMs = 3e5) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Authorization code wait timed out"));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.removeListener("did-navigate", onNav);
            win.webContents.removeListener("did-navigate-in-page", onNav);
            win.webContents.removeListener("did-fail-load", onFail);
          }
        } catch {
        }
      };
      const onNav = (_, url2) => {
        if (!url2.startsWith(redirectUri)) return;
        try {
          const parsed = new URL(url2);
          const code = parsed.searchParams.get("code");
          const returnedState = parsed.searchParams.get("state");
          if (code && returnedState === state) {
            cleanup();
            resolve(code);
          } else if (parsed.searchParams.get("error")) {
            cleanup();
            reject(
              new Error(
                `Auth error: ${parsed.searchParams.get("error_description") || parsed.searchParams.get("error")}`
              )
            );
          }
        } catch {
        }
      };
      const onFail = (_, _errorCode, _errorDesc, validatedURL) => {
        if (!validatedURL.startsWith(redirectUri)) return;
        try {
          const parsed = new URL(validatedURL);
          const code = parsed.searchParams.get("code");
          const returnedState = parsed.searchParams.get("state");
          if (code && returnedState === state) {
            cleanup();
            resolve(code);
          }
        } catch {
        }
      };
      win.webContents.on("did-navigate", onNav);
      win.webContents.on("did-navigate-in-page", onNav);
      win.webContents.on("did-fail-load", onFail);
    });
  }
  // ============ Browser automation steps ============
  /** Step 1: Accept cookie banner, then wait for email input. */
  async stepAcceptCookiesAndWaitForEmail(win) {
    this.log("[Browser] Waiting for page to load...");
    await waitForPageLoad(win, 0);
    if (!isWindowUsable(win)) throw new Error("Registration browser window closed during page load");
    this.log(`[Browser] Page: ${win.webContents.getURL()}`);
    const hasBanner = await win.webContents.executeJavaScript(`!!document.querySelector('button[data-id="awsccc-cb-btn-accept"]')`).catch(() => false);
    if (hasBanner) {
      await win.webContents.executeJavaScript(
        `
        const btn = document.querySelector('button[data-id="awsccc-cb-btn-accept"]');
        if (btn) btn.click();
      `
      ).catch(() => {
      });
      this.log("[Browser] Cookie banner accepted");
    }
    await failOnFatalRegistrationPageError(win, "before email input");
    this.log("[Browser] Waiting for email input...");
    const emailDeadline = Date.now() + 3e4;
    let emailAppeared = false;
    while (Date.now() < emailDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for email input");
      emailAppeared = await win.webContents.executeJavaScript(`!!document.querySelector('input[placeholder*="@"]')`).catch(() => false);
      if (emailAppeared) break;
      await sleep$1(500);
    }
    if (!emailAppeared) {
      await failOnFatalRegistrationPageError(win, "email input not found");
      const body = await win.webContents.executeJavaScript(`document.body.innerText.slice(0, 300)`).catch(() => "");
      throw new Error(`Email input not found after 30s. Page: ${body}`);
    }
    this.log("[Browser] Email input found");
  }
  /** Step 2: Fill email and click Continue. */
  async stepFillEmail(win, email) {
    await failOnFatalRegistrationPageError(win, "before email entry");
    this.log(`[Browser] Filling email: ${email}`);
    await typeInto(win, 'input[placeholder*="@"]', email);
    await randomDelay(500, 1e3);
    await clickWithCookieDismiss(win, 'button[data-testid="test-primary-button"]');
    this.log("[Browser] Clicked Continue after email");
    await waitForPageLoad(win, 0);
    const postEmailDeadline = Date.now() + 2500;
    while (Date.now() < postEmailDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "immediately after email continue");
      await sleep$1(250);
    }
    this.log(`[Browser] After email: ${win.webContents.getURL()}`);
    await failOnFatalRegistrationPageError(win, "after email continue");
  }
  /** Step 3: Handle signup — click "Create account" if present, fill name, click Continue. */
  async stepSignup(win, fullName) {
    const signupSettleDeadline = Date.now() + 1500 + Math.random() * 1500;
    while (Date.now() < signupSettleDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for signup page after email");
      await sleep$1(250);
    }
    const createClicked = await win.webContents.executeJavaScript(
      `
      (function() {
        const els = Array.from(document.querySelectorAll('a, button'));
        const btn = els.find(el => {
          const t = (el.textContent || '').trim();
          return /create.*(account|builder)/i.test(t) || /sign.?up/i.test(t);
        });
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `
    ).catch(() => false);
    if (createClicked) {
      this.log("[Browser] Clicked create account");
      await waitForPageLoad(win, 1500);
    }
    await failOnFatalRegistrationPageError(win, "after create-account click");
    this.log("[Browser] Waiting for name input...");
    const nameDeadline = Date.now() + 15e3;
    let nameAppeared = false;
    while (Date.now() < nameDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for name input");
      nameAppeared = await win.webContents.executeJavaScript(`!!document.querySelector('input[placeholder*=" "]')`).catch(() => false);
      if (nameAppeared) break;
      await sleep$1(500);
    }
    if (nameAppeared) {
      const isNameField = await win.webContents.executeJavaScript(
        `
        (function() {
          const el = document.querySelector('input[placeholder*=" "]');
          if (!el) return false;
          const ph = el.placeholder || '';
          return !ph.includes('@') && !/\\d/.test(ph);
        })()
      `
      ).catch(() => false);
      if (isNameField) {
        await typeInto(win, 'input[placeholder*=" "]', fullName);
        this.log(`[Browser] Name filled: ${fullName}`);
        await randomDelay(500, 1e3);
      }
    }
    await failOnFatalRegistrationPageError(win, "before sending OTP");
    if (this.emailSvc?.beforeSendCode) {
      this.log("[Browser] Capturing email baseline before sending OTP");
      await this.emailSvc.beforeSendCode();
    }
    await clickWithCookieDismiss(win, 'button[data-testid="signup-next-button"]');
    this.log("[Browser] Clicked Continue to send OTP");
    await waitForPageLoad(win, 1500);
    await failOnFatalRegistrationPageError(win, "after signup continue");
  }
  /** Step 4: Wait for OTP input, fill it, click Continue. */
  async stepFillOTP(win, otp) {
    await failOnFatalRegistrationPageError(win, "before OTP entry");
    this.log("[Browser] Waiting for OTP input...");
    const otpDeadline = Date.now() + 3e4;
    let otpAppeared = false;
    while (Date.now() < otpDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for OTP input");
      otpAppeared = await win.webContents.executeJavaScript(`!!document.querySelector('input[placeholder*="digit"]')`).catch(() => false);
      if (otpAppeared) break;
      await sleep$1(500);
    }
    if (!otpAppeared) {
      await failOnFatalRegistrationPageError(win, "OTP input not found");
      throw new Error("OTP input not found after 30s");
    }
    await win.webContents.executeJavaScript(
      `
      (function() {
        const el = document.querySelector('input[placeholder*="digit"]');
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `
    ).catch(() => {
    });
    this.log(`[Browser] Filling OTP: ${otp}`);
    await typeInto(win, 'input[placeholder*="digit"]', otp);
    await randomDelay(500, 1e3);
    await clickWithCookieDismiss(win, 'button[data-testid="email-verification-verify-button"]');
    this.log("[Browser] OTP submitted");
    await sleep$1(2e3);
    await failOnFatalRegistrationPageError(win, "after OTP submit");
  }
  /** Step 5: Fill password if required. */
  async stepFillPassword(win, password) {
    const pwdDeadline = Date.now() + 5e3;
    let hasPwd = false;
    while (Date.now() < pwdDeadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for password input");
      hasPwd = await win.webContents.executeJavaScript(`!!document.querySelector('input[type="password"]')`).catch(() => false);
      if (hasPwd) break;
      await sleep$1(500);
    }
    if (!hasPwd) {
      await failOnFatalRegistrationPageError(win, "password input not found");
      return;
    }
    await failOnFatalRegistrationPageError(win, "before password entry");
    this.log("[Browser] Filling password");
    const pwdCount = await win.webContents.executeJavaScript(
      `
      (function() {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        return inputs.filter(el => !!el.offsetParent).length;
      })()
    `
    ).catch(() => 0);
    this.log(`[Browser] Found ${pwdCount} password field(s)`);
    for (let i = 0; i < pwdCount; i++) {
      const fillOk = await win.webContents.executeJavaScript(
        `
        (function() {
          const inputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(el => !!el.offsetParent);
          if (${i} >= inputs.length) return false;
          const el = inputs[${i}];
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, ${JSON.stringify(password)});
          else el.value = ${JSON.stringify(password)};
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(password)} }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
          el.blur();
          return true;
        })()
      `
      ).catch(() => false);
      if (!fillOk) {
        if (i === 0) await typeInto(win, 'input[type="password"]', password);
      }
      if (i < pwdCount - 1) {
        await randomDelay(300, 600);
      }
    }
    await randomDelay(800, 1500);
    const clicked = await this.clickPasswordContinue(win);
    if (!clicked) {
      const pageInfo = await win.webContents.executeJavaScript(
        `
        (function() {
          const url = window.location.href;
          const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
            type: el.type,
            placeholder: el.placeholder || '',
            valueLength: el.value ? el.value.length : 0,
            visible: !!el.offsetParent
          }));
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]')).map(el => ({
            tag: el.tagName,
            type: el.type || '',
            text: (el.textContent || el.value || '').trim().slice(0, 80),
            id: el.id,
            classes: String(el.className).slice(0, 80),
            dataTestid: el.getAttribute('data-testid') || '',
            disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
            visible: !!el.offsetParent
          }));
          return { url: url.slice(0, 180), inputs, buttons: buttons.slice(0, 20), body: document.body.innerText.slice(0, 500) };
        })()
      `
      ).catch(() => ({ url: "unknown", buttons: [], inputs: [], body: "" }));
      this.log(`[Browser] Password continue not clicked; page state: ${JSON.stringify(pageInfo)}`);
      throw new Error("Password Continue button not found or disabled");
    }
    this.log("[Browser] Password submitted");
    await waitForPageLoad(win, 2e3);
    await failOnFatalRegistrationPageError(win, "after password submit");
  }
  async clickPasswordContinue(win) {
    const deadline = Date.now() + 3e4;
    while (Date.now() < deadline && isWindowUsable(win)) {
      await failOnFatalRegistrationPageError(win, "waiting for password continue button");
      const clicked = await win.webContents.executeJavaScript(
        `
        (function() {
          const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
          const visible = candidates.filter(el => !!el.offsetParent);
          const enabled = visible.filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
          const bySelector = enabled.find(el =>
            el.getAttribute('data-testid') === 'test-primary-button' ||
            el.getAttribute('data-testid') === 'signup-next-button' ||
            el.getAttribute('data-testid') === 'password-continue-button'
          );
          const byText = enabled.find(el => {
            const text = (el.textContent || el.value || '').trim().toLowerCase();
            return text === 'continue' || text === 'next' || text.includes('continue') || text.includes('create account') || text.includes('继续') || text.includes('下一步');
          });
          const btn = bySelector || byText || enabled[enabled.length - 1];
          if (!btn) return false;
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
          return true;
        })()
      `
      ).catch(() => false);
      if (clicked) {
        await sleep$1(400);
        await failOnFatalRegistrationPageError(win, "after password continue click");
        return true;
      }
      await sleep$1(1e3);
    }
    await failOnFatalRegistrationPageError(win, "password continue button not found");
    return false;
  }
  /** Try multiple selectors to find and click the Allow access button */
  async tryClickAllowAccess(win) {
    const SELECTORS = [
      'button[data-testid="allow-access-button"]',
      'button[data-testid="allow-access"]',
      'button[data-id="allow-access-button"]',
      'input[type="submit"][value*="Allow"]',
      'form button[type="submit"]',
      '[data-testid="submit-button"]'
    ];
    for (const selector of SELECTORS) {
      const found = await win.webContents.executeJavaScript(
        `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          return el ? true : false;
        })()
      `
      ).catch(() => false);
      if (!found) continue;
      this.log(`[Browser] Found button with selector: ${selector}`);
      await win.webContents.executeJavaScript(
        `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) el.click();
          return true;
        })()
      `
      ).catch(() => {
      });
      this.log("[Browser] Clicked Allow access");
      return true;
    }
    return false;
  }
  /** Try to find any button with Allow-related text */
  async tryClickAllowByText(win) {
    const found = await win.webContents.executeJavaScript(
      `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
        const allowBtn = buttons.find(el => {
          const t = (el.textContent || el.value || '').toLowerCase().trim();
          return t === 'allow access' || t === 'allow' || t.includes('allow access') || t === '同意' || t.includes('同意');
        });
        if (allowBtn) { allowBtn.click(); return true; }
        return false;
      })()
    `
    ).catch(() => false);
    if (found) {
      this.log("[Browser] Clicked Allow access button by text match");
      return true;
    }
    return false;
  }
  /** Step 6: Handle any remaining consent/allow-access pages before callback redirect. */
  async stepConfirmDevice(win) {
    try {
      this.log("[Browser] [9] Confirm device and allow access");
      const currentUrl = win.webContents.getURL();
      this.log(
        `[Browser] Current URL before waiting: ${currentUrl ? currentUrl.slice(0, 100) : "unknown"}`
      );
      let clicked = false;
      const deadline = Date.now() + 45e3;
      while (!clicked && Date.now() < deadline && isWindowUsable(win)) {
        clicked = await this.tryClickAllowAccess(win);
        if (!clicked) clicked = await this.tryClickAllowByText(win);
        if (!clicked) await sleep$1(1e3);
      }
      if (!clicked) {
        this.log("[Browser] Allow access button not found, dumping page state");
        const pageInfo = await win.webContents.executeJavaScript(
          `
          (function() {
            const url = window.location.href;
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'))
              .map(el => ({
                tag: el.tagName,
                type: el.type || '',
                text: (el.textContent || el.value || '').trim().slice(0, 40),
                id: el.id,
                classes: el.className.slice(0, 60),
                'data-testid': el.getAttribute('data-testid') || '',
                visible: !!el.offsetParent
              }));
            return { url: url.slice(0, 150), buttons: buttons.slice(0, 15) };
          })()
        `
        ).catch(() => ({ url: "unknown", buttons: [] }));
        this.log(`[Browser] Page state: ${JSON.stringify(pageInfo)}`);
        this.log("[Browser] Waiting 15s for auto-redirect...");
        await sleep$1(15e3);
      }
    } catch (err) {
      this.log(
        `[Browser] Error in stepConfirmDevice: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  // ============ Main flow ============
  async run() {
    console.log("[BrowserRegistrar] run() started");
    this.log("[Browser] Starting registration flow");
    let email;
    try {
      email = await this.createEmailAddress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[Browser] Email creation failed: ${msg}`);
      return { status: "failed", email: "", error: msg };
    }
    const fullName = this.cfg.fullName || randomFullName();
    const password = this.cfg.password || genPassword();
    this.log(
      `[Browser] Identity prepared: name=${fullName}, password=${this.cfg.password ? "provided" : "generated"}`
    );
    console.log(`[BrowserRegistrar] Email: ${email}`);
    this.log(`[Browser] Email: ${email}`);
    const { verifier, challenge } = this.generatePKCE();
    const state = crypto$1.randomBytes(16).toString("hex");
    let localPort = 59817;
    let resolveCode;
    let rejectCode;
    const codePromise = new Promise((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    const server = http.createServer((req, res) => {
      try {
        const url2 = new URL(req.url || "", `http://127.0.0.1:${localPort}`);
        const code = url2.searchParams.get("code");
        const returnedState = url2.searchParams.get("state");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization complete. This window will close automatically.</h2><script>window.close()<\/script></body></html>"
        );
        if (code && returnedState === state) {
          resolveCode(code);
        } else {
          rejectCode(new Error(`Auth callback missing code or state mismatch`));
        }
      } catch (e) {
        res.writeHead(500);
        res.end();
        rejectCode(e instanceof Error ? e : new Error(String(e)));
      }
    });
    await new Promise((res, rej) => {
      server.listen(localPort, "127.0.0.1", () => res());
      server.on("error", () => {
        localPort = 59818 + Math.floor(Math.random() * 100);
        server.listen(localPort, "127.0.0.1", () => res());
        server.on("error", rej);
      });
    });
    const redirectUri = `http://127.0.0.1:${localPort}/oauth/callback`;
    this.log("[Browser] [1] Registering OIDC client");
    const oidcClient = await this.registerOidcClient(redirectUri);
    const authURL = this.buildAuthURL(oidcClient.clientId, challenge, state, redirectUri);
    this.log(
      `[Browser] [1] Auth URL built (PKCE, client_id: ${oidcClient.clientId.slice(0, 8)}...)`
    );
    let win;
    try {
      win = await this.createWindow();
      console.log("[BrowserRegistrar] Window created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "failed", email, error: `Window creation failed: ${msg}` };
    }
    try {
      let resolvedAuthCode;
      const authCodePromise = Promise.race([
        codePromise,
        this.waitForAuthCode(win, redirectUri, state, 3e5)
      ]).then((code) => {
        resolvedAuthCode = code;
        return code;
      });
      this.log(`[Browser] [2] Loading auth URL (redirect: ${redirectUri})`);
      await win.loadURL(authURL).catch(() => {
      });
      this.checkAborted();
      await sleep$1(500);
      if (resolvedAuthCode) {
        this.log("[Browser] Authorization code received during initial navigation");
      } else {
        await this.stepAcceptCookiesAndWaitForEmail(win);
        this.checkAborted();
        await this.stepFillEmail(win, email);
        this.checkAborted();
        await failOnFatalRegistrationPageError(win, "after email");
        await this.stepSignup(win, fullName);
        this.checkAborted();
        this.log("[Browser] [6] Waiting for OTP email");
        if (!this.emailSvc) throw new Error("Email service not initialized");
        let otpSuccess = false;
        for (let attempt = 1; attempt <= 3 && !otpSuccess; attempt++) {
          if (attempt > 1) {
            this.log(`[Browser] Waiting for resend button...`);
            const resendEnabled = await waitForSelector(
              win,
              'button[data-testid="email-verification-resend-code-button"]:not([disabled])',
              9e4
            );
            if (resendEnabled) {
              await clickWithCookieDismiss(
                win,
                'button[data-testid="email-verification-resend-code-button"]:not([disabled])'
              );
              this.log("[Browser] Clicked resend code");
              await sleep$1(2e3);
            }
          }
          this.log(`[Browser] Waiting up to 30s for OTP (attempt ${attempt})`);
          const otp = await this.emailSvc.waitForCode(30, 3, () => this.aborted);
          this.log(`[Browser] Got OTP (attempt ${attempt}): ${otp}`);
          this.checkAborted();
          await this.stepFillOTP(win, otp);
          this.checkAborted();
          await failOnFatalRegistrationPageError(win, `after OTP attempt ${attempt}`);
          const hasError = await win.webContents.executeJavaScript(
            `
            !!document.querySelector('[data-testid="email-verification-invalid-code-error"]')
          `
          ).catch(() => false);
          if (hasError) {
            this.log(`[Browser] OTP rejected (attempt ${attempt}), will retry`);
          } else {
            otpSuccess = true;
          }
        }
        if (!otpSuccess) throw new Error("OTP verification failed after 3 attempts");
        await this.stepFillPassword(win, password);
        this.checkAborted();
        await failOnFatalRegistrationPageError(win, "after password step");
        this.log("[Browser] [9] Confirm device and allow access");
        await this.stepConfirmDevice(win);
        this.checkAborted();
        await failOnFatalRegistrationPageError(win, "after confirm device");
      }
      this.log("[Browser] [10] Waiting for authorization code...");
      const authCode = resolvedAuthCode || await authCodePromise;
      this.log(`[Browser] Got auth code: ${authCode.slice(0, 8)}...`);
      this.destroyWindow();
      this.log("[Browser] [11] Exchanging code for tokens");
      const tokenData = await this.exchangeCodeForTokens(
        oidcClient.clientId,
        oidcClient.clientSecret,
        authCode,
        verifier,
        redirectUri
      );
      this.log(`[Browser] Done! Email: ${email}`);
      return {
        status: "success",
        email,
        password,
        clientId: oidcClient.clientId,
        clientSecret: oidcClient.clientSecret,
        refreshToken: tokenData.refreshToken || "",
        accessToken: tokenData.accessToken || "",
        region: "us-east-1",
        provider: "BuilderId",
        consumedProvidedEmailLine: this.consumedProvidedEmailLine || void 0
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[BrowserRegistrar] Error: ${msg}`);
      this.log(`[Browser] Error: ${msg}`);
      if (this.win && !this.win.isDestroyed()) {
        const url2 = this.win.webContents.getURL();
        console.log(`[BrowserRegistrar] Failed at: ${url2}`);
        this.log(`[Browser] Failed at: ${url2}`);
      }
      return { status: "failed", email, error: msg };
    } finally {
      this.destroyWindow();
      try {
        server.close();
      } catch {
      }
    }
  }
}
const registrarPool = /* @__PURE__ */ new Map();
const browserRegistrarPool = /* @__PURE__ */ new Map();
const MANUAL_KEY = "__manual__";
function registerIPCHandlers(getMainWindow) {
  const sendLog = (msg, taskId) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("registration-log", { message: msg, taskId });
    }
  };
  electron.ipcMain.handle("registration-start-auto", async (_event, config) => {
    const taskId = config.taskId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const logPrefix = config.taskId ? `[#${config.taskId.slice(0, 12)}] ` : "";
    const cfg = newConfig(config);
    cfg.manualMode = false;
    const registrar = new Registrar(cfg, (msg) => sendLog(`${logPrefix}${msg}`, config.taskId));
    registrarPool.set(taskId, registrar);
    try {
      const result = await registrar.run();
      registrarPool.delete(taskId);
      if (!config.taskId) {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("registration-complete", result);
        }
      }
      return { success: true, result };
    } catch (err) {
      registrarPool.delete(taskId);
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
    }
  });
  electron.ipcMain.handle("registration-manual-phase1", async (_event, config) => {
    if (registrarPool.has(MANUAL_KEY)) {
      return { success: false, error: "已有手动注册流程正在进行" };
    }
    const cfg = newConfig(config);
    cfg.manualMode = true;
    const registrar = new Registrar(cfg, sendLog);
    registrarPool.set(MANUAL_KEY, registrar);
    const result = await registrar.runManualPhase1();
    if (!result.success) {
      await registrar.destroy();
      registrarPool.delete(MANUAL_KEY);
    }
    return result;
  });
  electron.ipcMain.handle("registration-manual-phase2", async (_event, email, fullName) => {
    const registrar = registrarPool.get(MANUAL_KEY);
    if (!registrar) {
      return { success: false, error: "无进行中的注册流程" };
    }
    const result = await registrar.runManualPhase2(email, fullName);
    if (!result.success) {
      await registrar.destroy();
      registrarPool.delete(MANUAL_KEY);
    }
    return result;
  });
  electron.ipcMain.handle("registration-manual-phase3", async (_event, otp) => {
    const registrar = registrarPool.get(MANUAL_KEY);
    if (!registrar) {
      return { success: false, error: "无进行中的注册流程" };
    }
    const result = await registrar.runManualPhase3(otp);
    await registrar.destroy();
    registrarPool.delete(MANUAL_KEY);
    return { success: true, result };
  });
  electron.ipcMain.handle("registration-cancel", async (_event, taskId) => {
    if (taskId) {
      const registrar = registrarPool.get(taskId);
      if (registrar) {
        registrar.abort();
        await registrar.destroy();
        registrarPool.delete(taskId);
      }
    } else {
      const tasks = Array.from(registrarPool.entries());
      for (const [id, registrar] of tasks) {
        registrar.abort();
        await registrar.destroy();
        registrarPool.delete(id);
      }
    }
    return { success: true };
  });
  electron.ipcMain.handle("registration-status", async () => {
    return { inProgress: registrarPool.size > 0 || browserRegistrarPool.size > 0, count: registrarPool.size + browserRegistrarPool.size };
  });
  electron.ipcMain.handle("registration-start-browser", async (_event, config) => {
    const taskId = config.taskId || `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const logPrefix = config.taskId ? `[#${config.taskId.slice(0, 12)}] ` : "";
    const registrar = new BrowserRegistrar(
      { ...config, taskId },
      (msg) => sendLog(`${logPrefix}${msg}`, config.taskId)
    );
    browserRegistrarPool.set(taskId, registrar);
    try {
      const result = await registrar.run();
      browserRegistrarPool.delete(taskId);
      if (!config.taskId) {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("registration-complete", result);
        }
      }
      return { success: true, result };
    } catch (err) {
      browserRegistrarPool.delete(taskId);
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
    } finally {
      await registrar.destroy();
    }
  });
  electron.ipcMain.handle("registration-cancel-browser", async (_event, taskId) => {
    if (taskId) {
      const registrar = browserRegistrarPool.get(taskId);
      if (registrar) {
        registrar.abort();
        await registrar.destroy();
        browserRegistrarPool.delete(taskId);
      }
    } else {
      for (const [id, registrar] of browserRegistrarPool.entries()) {
        registrar.abort();
        await registrar.destroy();
        browserRegistrarPool.delete(id);
      }
    }
    return { success: true };
  });
}
const DEFAULT_COLAB_URL = "https://colab.research.google.com/drive/1KGMyn4gYBF1qvJj6vnNFFoDRWUJYJw5a";
const DEFAULT_CELL_SELECTOR = "#cell-SyjPT6ZFWD0D";
function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("Proxy generation aborted");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizeCdpAddress(address) {
  const raw = address?.trim() || "127.0.0.1:9229";
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
  try {
    const url2 = new URL(withProtocol.replace(/\/$/, ""));
    if (url2.hostname === "0.0.0.0") url2.hostname = "127.0.0.1";
    return url2.toString().replace(/\/$/, "");
  } catch {
    return `http://${raw.replace(/^https?:\/\//, "").replace(/^0\.0\.0\.0(?=:|$)/, "127.0.0.1").replace(/\/$/, "")}`;
  }
}
function getCdpPort(cdpBase) {
  try {
    return Number(new URL(cdpBase).port || 80);
  } catch {
    return void 0;
  }
}
function getDefaultChromeUserDataDir(candidate) {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return void 0;
  const lower = candidate.toLowerCase();
  const isEdge = lower.includes("edge") || lower.includes("msedge");
  const isChromium = lower.includes("chromium");
  if (process.platform === "win32") {
    if (isEdge) return `${home}\\AppData\\Local\\Microsoft\\Edge\\User Data`;
    if (isChromium) return `${home}\\AppData\\Local\\Chromium\\User Data`;
    return `${home}\\AppData\\Local\\Google\\Chrome\\User Data`;
  }
  if (process.platform === "darwin") {
    if (isEdge) return `${home}/Library/Application Support/Microsoft Edge`;
    if (isChromium) return `${home}/Library/Application Support/Chromium`;
    return `${home}/Library/Application Support/Google/Chrome`;
  }
  if (isChromium) return void 0;
  if (isEdge) return `${home}/.config/microsoft-edge`;
  return `${home}/.config/google-chrome`;
}
function detectDisplay() {
  if (process.env.DISPLAY) return process.env.DISPLAY;
  try {
    const sockets = fs.readdirSync("/tmp/.X11-unix").filter((name) => /^X\d+$/.test(name)).map((name) => Number(name.slice(1))).filter((display) => Number.isFinite(display)).sort((a, b) => b - a);
    if (sockets.length > 0) return `:${sockets[0]}`;
  } catch {
  }
  return ":0";
}
function detectXauthority() {
  if (process.env.XAUTHORITY) return process.env.XAUTHORITY;
  const home = process.env.HOME || process.env.USERPROFILE;
  const candidates = [home ? `${home}/.Xauthority` : "", "/root/.Xauthority"].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}
function getChromeCandidates() {
  if (process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : "",
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : "",
      process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : "",
      "chrome.exe",
      "msedge.exe"
    ];
    return candidates.filter(Boolean);
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "google-chrome",
      "chromium"
    ];
  }
  return [
    "chromium",
    "/usr/bin/chromium",
    "chromium-browser",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "google-chrome",
    "google-chrome-stable",
    "microsoft-edge"
  ];
}
function spawnBrowser(candidate, args, env) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = child_process.spawn(candidate, args, { detached: true, stdio: "ignore", env });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`exited immediately (code ${code ?? "null"}, signal ${signal ?? "null"})`));
    });
    child.once("spawn", () => {
      child.unref();
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, 4e3);
    });
  });
}
async function launchDefaultChromeProfile(cdpBase) {
  const port = getCdpPort(cdpBase) || 9229;
  const candidates = getChromeCandidates();
  const errors = [];
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const xauthority = detectXauthority();
  const env = {
    ...process.env,
    DISPLAY: detectDisplay(),
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`,
    ...xauthority ? { XAUTHORITY: xauthority } : {}
  };
  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (!fs.existsSync(candidate)) {
        errors.push(`${candidate}: not found`);
        continue;
      }
    }
    const userDataDir = getDefaultChromeUserDataDir(candidate);
    const args = [
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check"
    ];
    if (process.platform === "linux") {
      args.push("--user-data-dir=/tmp/chrome-debug-profile");
      args.push("--no-sandbox");
    } else {
      args.push("--profile-directory=Default");
      if (userDataDir && fs.existsSync(userDataDir)) args.push(`--user-data-dir=${userDataDir}`);
    }
    try {
      logColab(`Starting Chromium command: ${candidate} ${args.join(" ")}`);
      await spawnBrowser(candidate, args, env);
      await sleep(5500);
      return;
    } catch (error) {
      errors.push(
        `${candidate} DISPLAY=${env.DISPLAY}${env.XAUTHORITY ? ` XAUTHORITY=${env.XAUTHORITY}` : ""}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  throw new Error(
    `Unable to start Chrome/Chromium with the default profile. Start it manually with --remote-debugging-port=${port}. Tried: ${errors.join("; ")}`
  );
}
async function waitForCdp(cdpBase) {
  let lastError = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await fetchJson(`${cdpBase}/json/list`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(1e3);
    }
  }
  throw new Error(
    `Chrome/Chromium was launched but CDP did not become ready at ${cdpBase}. ${lastError}`
  );
}
let activeColabLogSink;
function logColab(message) {
  const formatted = `[Colab] ${message}`;
  console.log(formatted);
  activeColabLogSink?.(formatted);
}
function clickScript(selector) {
  return `
    (() => {
      const findDeep = (root, selectors) => {
        for (const sel of selectors) {
          const direct = root.querySelector?.(sel);
          if (direct) return direct;
        }
        for (const el of Array.from(root.querySelectorAll?.('*') || [])) {
          if (el.shadowRoot) {
            const found = findDeep(el.shadowRoot, selectors);
            if (found) return found;
          }
        }
        return null;
      };
      const el = findDeep(document, [${JSON.stringify(selector)}]);
      if (!el) return false;
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      el.click?.();
      return true;
    })()
  `;
}
async function fetchJson(url2, init) {
  let res;
  try {
    res = await fetch(url2, init);
  } catch (error) {
    throw new Error(
      `Cannot connect to Chrome CDP at ${url2}. Start Chromium with --remote-debugging-address=127.0.0.1 --remote-debugging-port=9229 --user-data-dir=/tmp/chrome-debug-profile and keep the profile signed in to Colab. ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!res.ok) throw new Error(`CDP HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}
class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
  }
  wsUrl;
  ws;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  connect() {
    return new Promise((resolve, reject) => {
      const WebSocketCtor = globalThis.WebSocket;
      if (!WebSocketCtor) {
        reject(new Error("WebSocket is not available in this Node runtime"));
        return;
      }
      this.ws = new WebSocketCtor(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("Failed to connect to CDP WebSocket"));
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (!msg.id) return;
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "CDP command failed"));
        else waiter.resolve(msg.result);
      };
      this.ws.onclose = () => {
        for (const waiter of this.pending.values()) waiter.reject(new Error("CDP WebSocket closed"));
        this.pending.clear();
      };
    });
  }
  send(method, params) {
    if (!this.ws) return Promise.reject(new Error("CDP session is not connected"));
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return result.result?.value;
  }
  close() {
    try {
      this.ws?.close();
    } catch {
    }
  }
}
let chromiumLaunchPromise;
function isColabTarget(item) {
  if (item.type !== "page" || !item.url) return false;
  try {
    const hostname = new URL(item.url).hostname.toLowerCase();
    return hostname === "colab.research.google.com" || hostname === "colab.google.com";
  } catch {
    return item.url.includes("colab.research.google.com") || item.url.includes("colab.google.com");
  }
}
async function getOrLaunchChromiumTargets(cdpBase) {
  try {
    const targets = await fetchJson(`${cdpBase}/json/list`);
    logColab(`✓ Reusing running Chromium CDP session; found ${targets.length} target(s)`);
    return targets;
  } catch {
    if (!chromiumLaunchPromise) {
      logColab(`Launching dedicated Chromium profile for proxy generation at ${cdpBase}`);
      chromiumLaunchPromise = (async () => {
        await launchDefaultChromeProfile(cdpBase);
        await waitForCdp(cdpBase);
      })().finally(() => {
        chromiumLaunchPromise = void 0;
      });
    } else {
      logColab("Chromium launch already in progress; waiting for the existing launch attempt...");
    }
    try {
      await chromiumLaunchPromise;
      const targets = await fetchJson(`${cdpBase}/json/list`);
      logColab(`✓ Connected to newly launched Chromium CDP; found ${targets.length} target(s)`);
      return targets;
    } catch (error) {
      throw new Error(
        `Dedicated Chromium CDP did not become ready at ${cdpBase}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
async function findOrOpenColabTarget(cdpBase, notebookUrl) {
  let targets = await getOrLaunchChromiumTargets(cdpBase);
  let target = targets.find(isColabTarget);
  if (target) {
    logColab(`✓ Reusing Colab tab: ${target.title || target.url || target.id}`);
    return target;
  }
  target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (target) {
    logColab(`Navigating existing Chromium page to Colab notebook: ${notebookUrl}`);
    const session = new CdpSession(target.webSocketDebuggerUrl);
    try {
      await session.connect();
      await session.send("Page.enable");
      await session.send("Page.navigate", { url: notebookUrl });
    } finally {
      session.close();
    }
  } else {
    logColab(`Opening Colab notebook: ${notebookUrl}`);
    const encodedUrl = encodeURIComponent(notebookUrl);
    target = await fetchJson(`${cdpBase}/json/new?${encodedUrl}`, { method: "PUT" });
  }
  logColab("Waiting 5 seconds for tab to initialize...");
  await sleep(5e3);
  targets = await fetchJson(`${cdpBase}/json/list`);
  const openedTarget = targets.find(isColabTarget) || targets.find((item) => item.id === target?.id) || target;
  logColab(`✓ Opened Colab target: ${openedTarget.title || openedTarget.url || openedTarget.id}`);
  return openedTarget;
}
async function clickYesButton(session) {
  return await session.evaluate(`
    (() => {
      const clickElement = (el) => {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
        el.click?.();
      };
      const findYesButton = (root) => {
        const textButtons = root.querySelectorAll('md-text-button');
        for (const btn of textButtons) {
          if ((btn.textContent || '').trim() === 'Yes') {
            return btn.shadowRoot?.querySelector('button') || btn;
          }
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const found = findYesButton(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      const yesButton = findYesButton(document);
      if (yesButton) {
        clickElement(yesButton);
        return true;
      }
      const dialog = document.querySelector('mwc-dialog');
      const fallback = dialog?.querySelector('[slot="primaryAction"]');
      const fallbackButton = fallback?.shadowRoot?.querySelector('button') || fallback;
      if (fallbackButton) {
        clickElement(fallbackButton);
        return true;
      }
      return false;
    })()
  `);
}
async function clickRunButton(session) {
  logColab("Waiting for Colab run button...");
  const result = await session.evaluate(
    `
    new Promise((resolve) => {
      let done = false;
      const selectors = [
        '#run-button',
        'colab-run-button',
        '[aria-label*="Run"]',
        '[title*="Run"]',
        'paper-icon-button.command-run-focused',
        'paper-icon-button[command="run"]'
      ];
      const findDeep = (root) => {
        for (const selector of selectors) {
          const el = root.querySelector?.(selector);
          if (el) return el;
        }
        for (const el of Array.from(root.querySelectorAll?.('*') || [])) {
          if (el.shadowRoot) {
            const found = findDeep(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      const clickElement = (el) => {
        const rect = el.getBoundingClientRect?.();
        el.scrollIntoView?.({ block: 'center', inline: 'center' });
        el.focus?.();
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
          el.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect ? rect.left + rect.width / 2 : 0,
            clientY: rect ? rect.top + rect.height / 2 : 0
          }));
        });
        el.click?.();
      };
      const click = () => {
        if (done) return true;
        const runBtn = findDeep(document);
        if (!runBtn) return false;
        done = true;
        clickElement(runBtn);
        resolve({ clicked: true, debug: runBtn.outerHTML?.slice(0, 300) || runBtn.tagName || 'unknown' });
        return true;
      };
      if (click()) return;
      const observer = new MutationObserver(() => click());
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        if (done) return;
        observer.disconnect();
        const buttons = Array.from(document.querySelectorAll('button, paper-icon-button, colab-run-button, [role="button"]'))
          .map((el) => ({
            tag: el.tagName,
            id: el.id,
            aria: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            text: (el.textContent || '').trim().slice(0, 80)
          }))
          .slice(0, 30);
        resolve({ clicked: false, debug: JSON.stringify(buttons) });
      }, 30000);
    })
  `
  );
  if (!result.clicked) {
    logColab(`⚠️ Run button not found. Page buttons: ${result.debug}`);
    throw new Error("Timed out waiting for Colab run button");
  }
  logColab(`✓ Clicked Colab run button: ${result.debug.substring(0, 100)}`);
}
async function disconnectRuntime(session) {
  logColab("Checking runtime status before disconnect...");
  const statusText = await session.evaluate(`
    (() => {
      const statusEl = document.querySelector('#runtime-menu-button');
      return (statusEl?.textContent || '').toLowerCase();
    })()
  `);
  logColab(`Runtime status text: ${statusText || "(empty)"}`);
  if (statusText.includes("connect") && !statusText.includes("disconnect")) {
    logColab("Runtime appears disconnected; connecting first so powerwash option is available...");
    const menuClicked2 = await session.evaluate(clickScript("#runtime-menu-button"));
    logColab(`Runtime menu click for connect result: ${menuClicked2}`);
    await sleep(1e3);
    const connectClicked = await session.evaluate(clickScript('div[command="connect"]'));
    logColab(`Connect runtime menu item click result: ${connectClicked}`);
    logColab("Waiting 15 seconds for runtime connection...");
    await sleep(15e3);
  } else {
    logColab("Runtime appears connected or status is ambiguous; continuing to powerwash");
  }
  logColab("Opening Runtime menu for disconnect/delete runtime...");
  const menuClicked = await session.evaluate(clickScript("#runtime-menu-button"));
  logColab(`Runtime menu click result: ${menuClicked}`);
  if (!menuClicked) {
    logColab("⚠️ Failed to click runtime menu button");
    throw new Error("Failed to click runtime menu button");
  }
  await sleep(2500);
  const clickPowerwash = async (label) => {
    const result = await session.evaluate(`
      (() => {
        const clickElement = (el) => {
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
          el.click?.();
        };
        const selectors = [
          'div[command="powerwash-current-vm"]',
          'paper-item[command="powerwash-current-vm"]',
          '[command="powerwash-current-vm"]',
          'div[command="disconnect-and-delete-runtime"]',
          '[command="disconnect-and-delete-runtime"]',
          'div[command="disconnect"]',
          '[command="disconnect"]'
        ];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            clickElement(el);
            return { clicked: true, debug: selector + ' :: ' + (el.textContent || '').trim().slice(0, 120) };
          }
        }
        const items = Array.from(document.querySelectorAll('[role="menuitem"], paper-item, mwc-list-item, div[command]'));
        const item = items.find((el) => /disconnect and delete|delete runtime|disconnect|terminate/i.test(el.textContent || ''));
        if (item) {
          clickElement(item);
          return { clicked: true, debug: 'text-match :: ' + (item.textContent || '').trim().slice(0, 120) };
        }
        return { clicked: false, debug: items.map((el) => ({ command: el.getAttribute('command') || '', text: (el.textContent || '').trim().slice(0, 80) })).slice(0, 40).map((x) => x.command + ':' + x.text).join(' | ') };
      })()
    `);
    logColab(
      `${label} powerwash/disconnect click result: ${result.clicked} (${result.debug || "no debug"})`
    );
    return result.clicked;
  };
  logColab("Clicking powerwash-current-vm / disconnect option (1st attempt)...");
  const firstClicked = await clickPowerwash("First");
  await sleep(1500);
  logColab("Clicking powerwash-current-vm / disconnect option (2nd attempt)...");
  const secondClicked = await clickPowerwash("Second");
  await sleep(1500);
  if (!firstClicked && !secondClicked) {
    logColab("⚠️ Failed to find powerwash/disconnect runtime menu item");
    throw new Error("Failed to find powerwash-current-vm/disconnect runtime menu item");
  }
  logColab("Looking for confirmation Yes button...");
  const yesClicked = await clickYesButton(session);
  logColab(`Disconnect confirmation Yes click result: ${yesClicked}`);
  if (!yesClicked) {
    logColab("⚠️ Warning: Yes button not found; runtime may still be connected");
  }
  logColab("Waiting 3 seconds after confirmation...");
  await sleep(3e3);
  logColab("Runtime disconnect/delete sequence finished");
}
async function runFreshCell(session, cellSelector) {
  logColab(`Running fresh cell: ${cellSelector}`);
  const clicked = await session.evaluate(`
    (() => {
      const cell = document.querySelector(${JSON.stringify(cellSelector)});
      cell?.scrollIntoView({ block: 'center' });
      const runBtn = document.querySelector(${JSON.stringify(`${cellSelector} colab-run-button`)}) ||
        cell?.querySelector('colab-run-button, #run-button, [aria-label*="Run"], [title*="Run"]');
      if (!runBtn) return false;
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        runBtn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      runBtn.click?.();
      return true;
    })()
  `);
  logColab(`Fresh cell run click result: ${clicked ? "✓ Success" : "⚠️ Failed"}`);
}
async function resetRuntime(session, signal) {
  throwIfAborted(signal);
  logColab("Reset runtime sequence started");
  logColab("Step 5.1: Clicking Run button...");
  await clickRunButton(session);
  logColab("Run button clicked successfully");
  throwIfAborted(signal);
  logColab("Step 5.2: Waiting 10 seconds before disconnecting...");
  await sleep(1e4);
  throwIfAborted(signal);
  logColab("Step 5.3: Disconnecting and deleting runtime...");
  await disconnectRuntime(session);
  logColab("Runtime disconnected");
  throwIfAborted(signal);
  logColab("Step 5.4: Waiting 10 seconds after disconnect...");
  await sleep(1e4);
  throwIfAborted(signal);
  logColab("Step 5.5: Clicking Run button again...");
  await clickRunButton(session);
  logColab("Run button clicked again, runtime reset complete");
}
async function runCellAndExtractProxy(session, cellSelector, signal) {
  logColab(`Step 6.1: Waiting for proxy output in cell: ${cellSelector}`);
  logColab("Waiting 15 seconds for the freshly started Colab job before reading its output...");
  await sleep(15e3);
  throwIfAborted(signal);
  logColab("Will check every second; caller enforces a 180 second overall timeout...");
  for (let attempt = 1; attempt <= 120; attempt++) {
    throwIfAborted(signal);
    await sleep(1e3);
    throwIfAborted(signal);
    const result = await session.evaluate(`
      (() => {
        const configuredCell = document.querySelector(${JSON.stringify(cellSelector)});
        const cell = configuredCell || document.querySelector('colab-code-cell') || document;
        const selectors = ['.output-area', '.output_subarea', '.output_text', 'colab-output-area', '[data-mime-type]', 'pre'];
        let allText = '';
        for (const selector of selectors) {
          for (const el of cell.querySelectorAll(selector)) allText += el.textContent || '';
        }
        if (!allText) allText = cell.textContent || '';
        const patterns = [
          new RegExp('socks5://\\\\d{1,3}(?:\\\\.\\\\d{1,3}){3}:\\\\d+'),
          new RegExp('socks5:\\\\d{1,3}(?:\\\\.\\\\d{1,3}){3}:\\\\d+'),
          new RegExp('\\\\d{1,3}(?:\\\\.\\\\d{1,3}){3}:\\\\d+')
        ];
        for (const pattern of patterns) {
          const match = allText.match(pattern);
          if (match) return { found: true, proxy: match[0] };
        }
        return { found: false, debug: (configuredCell ? '' : 'Configured cell not found; using fallback. ') + allText.substring(0, 200) };
      })()
    `);
    if (result.found && result.proxy) {
      const proxy = result.proxy.replace(/^socks5:\/*/, "socks5://");
      try {
        const parsed = new URL(proxy);
        if (parsed.protocol !== "socks5:" || !parsed.hostname || !parsed.port) {
          throw new Error("missing SOCKS5 host or port");
        }
      } catch (error) {
        logColab(
          `⚠️ Ignoring malformed proxy output on attempt ${attempt}: ${result.proxy} (${error instanceof Error ? error.message : String(error)})`
        );
        continue;
      }
      logColab(`✓ Proxy extracted on attempt ${attempt}: ${proxy}`);
      return proxy;
    }
    if (attempt === 1 || attempt % 15 === 0) {
      logColab(`⏳ Proxy not found yet (attempt ${attempt}/120): ${result.debug || "no output"}`);
    }
    if (attempt === 45 || attempt === 90) {
      logColab(`🔄 Retrying cell run at attempt ${attempt}`);
      await runFreshCell(session, cellSelector);
      await sleep(15e3);
    }
  }
  throw new Error("Timeout extracting proxy from Colab output after 120 seconds");
}
async function generateColabProxy(config) {
  const previousLogSink = activeColabLogSink;
  activeColabLogSink = config.onLog;
  try {
    throwIfAborted(config.signal);
    logColab("=== Generate Colab proxy requested ===");
    logColab(`CDP Address: ${config.cdpAddress || "127.0.0.1:9229"}`);
    logColab(`Form URL: ${config.formUrl || DEFAULT_COLAB_URL}`);
    logColab(`Cell Selector: ${config.cellSelector || DEFAULT_CELL_SELECTOR}`);
    const cdpBase = normalizeCdpAddress(config.cdpAddress);
    const notebookUrl = config.formUrl?.trim() || DEFAULT_COLAB_URL;
    logColab("Step 1: Finding or opening Colab target...");
    throwIfAborted(config.signal);
    const target = await findOrOpenColabTarget(cdpBase, notebookUrl);
    if (!target?.webSocketDebuggerUrl) throw new Error("Colab CDP target has no WebSocket URL");
    logColab(`Target found: ${target.id}`);
    const session = new CdpSession(target.webSocketDebuggerUrl);
    logColab("Step 2: Connecting to Colab CDP WebSocket...");
    throwIfAborted(config.signal);
    await session.connect();
    logColab("WebSocket connected successfully");
    try {
      throwIfAborted(config.signal);
      logColab("Step 3: Enabling Runtime...");
      await session.send("Runtime.enable");
      logColab("Runtime enabled");
      const cellSelector = config.cellSelector?.trim() || DEFAULT_CELL_SELECTOR;
      logColab(`Step 4: Using cell selector: ${cellSelector}`);
      logColab(
        "Step 5: Resetting runtime (click Run, wait 10s, Runtime > Disconnect/delete runtime, wait 10s, click Run)..."
      );
      await resetRuntime(session, config.signal);
      logColab("Runtime reset complete");
      throwIfAborted(config.signal);
      logColab("Step 6: Running cell and extracting proxy...");
      const proxy = await runCellAndExtractProxy(session, cellSelector, config.signal);
      logColab(`=== Proxy generation successful: ${proxy} ===`);
      return proxy;
    } finally {
      logColab("Closing Colab CDP session");
      session.close();
      activeColabLogSink = previousLogSink;
    }
  } finally {
    activeColabLogSink = previousLogSink;
  }
}
let tray = null;
const menuIcons = /* @__PURE__ */ new Map();
function getTrayIconDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "resources", "托盘图标");
  }
  return path.join(__dirname, "../../resources/托盘图标");
}
const ICON_FILE_MAP = {
  // 应用图标
  "app": "icon.png",
  // 状态图标
  "status-running": "运行状态.png",
  "status-stopped": "停止状态.png",
  // 菜单图标
  "mail": "当前账户.png",
  "refresh": "刷新.png",
  "switchAccount": "切换.png",
  "copy": "复制.png",
  "window": "弹出窗口.png",
  "logout": "退出.png",
  "play": "播放.png",
  "stop": "停止状态.png",
  "check": "已勾选.png",
  "warning": "警告.png",
  "usage": "用量.png",
  "requests": "请求.png"
};
function loadIconFromFile(iconKey) {
  const cached = menuIcons.get(iconKey);
  if (cached) return cached;
  const fileName = ICON_FILE_MAP[iconKey];
  if (!fileName) {
    console.warn(`[Tray] Unknown icon key: ${iconKey}`);
    return electron.nativeImage.createEmpty();
  }
  const iconPath = path.join(getTrayIconDir(), fileName);
  try {
    const icon2 = electron.nativeImage.createFromPath(iconPath);
    const resized = icon2.resize({ width: 16, height: 16 });
    menuIcons.set(iconKey, resized);
    return resized;
  } catch (error) {
    console.error(`[Tray] Failed to load icon: ${iconPath}`, error);
    return electron.nativeImage.createEmpty();
  }
}
function getStatusIcon(running) {
  return loadIconFromFile(running ? "status-running" : "status-stopped");
}
function getMenuIcon(name) {
  return loadIconFromFile(name);
}
let currentAccount = null;
let accountList = [];
let currentLanguage = "zh";
let callbacks = null;
function getTrayIconPath() {
  if (process.platform === "win32") {
    if (electron.app.isPackaged) {
      return path.join(process.resourcesPath, "app.asar.unpacked", "resources", "icon.ico");
    }
    return path.join(__dirname, "../../resources/icon.ico");
  } else if (process.platform === "darwin") {
    if (electron.app.isPackaged) {
      return path.join(process.resourcesPath, "app.asar.unpacked", "resources", "icon.png");
    }
    return path.join(__dirname, "../../resources/icon.png");
  } else {
    if (electron.app.isPackaged) {
      return path.join(process.resourcesPath, "app.asar.unpacked", "resources", "icon.png");
    }
    return path.join(__dirname, "../../resources/icon.png");
  }
}
function buildTrayMenu() {
  const menuTemplate = [];
  const isEn = currentLanguage === "en";
  menuTemplate.push({
    label: `Kiro ${isEn ? "Account Manager" : "账号管理器"} v${electron.app.getVersion()}`,
    icon: getMenuIcon("app"),
    enabled: false
  });
  menuTemplate.push({ type: "separator" });
  if (callbacks) {
    const proxyStatus = callbacks.getProxyStatus();
    menuTemplate.push({
      label: proxyStatus.running ? isEn ? `Proxy Running (Port ${proxyStatus.port})` : `代理服务运行中 (端口 ${proxyStatus.port})` : isEn ? "Proxy Stopped" : "代理服务已停止",
      icon: getStatusIcon(proxyStatus.running),
      enabled: false
    });
    menuTemplate.push({
      label: proxyStatus.running ? isEn ? "Stop Proxy" : "停止代理服务" : isEn ? "Start Proxy" : "启动代理服务",
      icon: getMenuIcon(proxyStatus.running ? "stop" : "play"),
      click: async () => {
        await callbacks?.onToggleProxy();
        updateTrayMenu();
      }
    });
    menuTemplate.push({ type: "separator" });
  }
  const account = callbacks?.getCurrentAccount() || currentAccount;
  if (account) {
    menuTemplate.push({
      label: isEn ? "Current Account" : "当前账户",
      icon: getMenuIcon("mail"),
      enabled: false
    });
    menuTemplate.push({
      label: `   ${account.email}`,
      enabled: false
    });
    menuTemplate.push({
      label: isEn ? `   Identity: ${account.idp} | ${account.subscription || "Unknown"} | ${account.status === "active" ? "Active" : account.status}` : `   身份: ${account.idp} | ${account.subscription || "未知"} | ${account.status === "active" ? "活跃" : account.status}`,
      icon: getMenuIcon(account.status === "active" ? "check" : "warning"),
      enabled: false
    });
    if (account.usage) {
      menuTemplate.push({
        label: isEn ? `   Usage: ${account.usage.usedCredits} / ${account.usage.totalCredits} Credits` : `   用量: ${account.usage.usedCredits} / ${account.usage.totalCredits} Credits`,
        icon: getMenuIcon("usage"),
        enabled: false
      });
    }
    const proxyStats = callbacks?.getProxyStats() || { totalRequests: 0, successRequests: 0, failedRequests: 0 };
    const sessionStats = callbacks?.getSessionStats() || { totalRequests: 0, successRequests: 0, failedRequests: 0 };
    menuTemplate.push({
      label: isEn ? `   Total: ${proxyStats.totalRequests} (✓${proxyStats.successRequests} ✗${proxyStats.failedRequests})` : `   总计: ${proxyStats.totalRequests} (成功${proxyStats.successRequests} 失败${proxyStats.failedRequests})`,
      icon: getMenuIcon("requests"),
      enabled: false
    });
    menuTemplate.push({
      label: isEn ? `   Session: ${sessionStats.totalRequests} (✓${sessionStats.successRequests} ✗${sessionStats.failedRequests})` : `   本次: ${sessionStats.totalRequests} (成功${sessionStats.successRequests} 失败${sessionStats.failedRequests})`,
      icon: getMenuIcon("requests"),
      enabled: false
    });
    menuTemplate.push({ type: "separator" });
  } else {
    menuTemplate.push({
      label: isEn ? "No Active Account" : "暂无活跃账户",
      icon: getMenuIcon("mail"),
      enabled: false
    });
    menuTemplate.push({ type: "separator" });
  }
  menuTemplate.push({
    label: isEn ? "Refresh Account Info" : "刷新账户信息",
    icon: getMenuIcon("refresh"),
    click: async () => {
      await callbacks?.onRefreshAccount();
      updateTrayMenu();
    }
  });
  const accounts = callbacks?.getAccountList() || accountList;
  const activeAccounts = accounts.filter((a) => a.status === "active");
  menuTemplate.push({
    label: isEn ? `Switch to Next Account (${activeAccounts.length} available)` : `切换到下一个账户 (${activeAccounts.length} 个可用)`,
    icon: getMenuIcon("switchAccount"),
    enabled: activeAccounts.length > 1,
    click: async () => {
      await callbacks?.onSwitchAccount();
      updateTrayMenu();
    }
  });
  menuTemplate.push({ type: "separator" });
  menuTemplate.push({
    label: isEn ? "Copy Proxy Address" : "复制代理地址",
    icon: getMenuIcon("copy"),
    click: () => {
      const { clipboard } = require("electron");
      const proxyStatus = callbacks?.getProxyStatus();
      if (proxyStatus?.running) {
        clipboard.writeText(`http://127.0.0.1:${proxyStatus.port}`);
      }
    },
    enabled: callbacks?.getProxyStatus()?.running ?? false
  });
  menuTemplate.push({ type: "separator" });
  menuTemplate.push({
    label: isEn ? "Show Main Window" : "显示主窗口",
    icon: getMenuIcon("window"),
    click: () => {
      callbacks?.onShowWindow();
    }
  });
  menuTemplate.push({
    label: isEn ? "Exit" : "退出程序",
    icon: getMenuIcon("logout"),
    click: () => {
      callbacks?.onQuit();
    }
  });
  return electron.Menu.buildFromTemplate(menuTemplate);
}
function updateTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}
function updateCurrentAccount(account) {
  currentAccount = account;
  updateTrayMenu();
}
function updateAccountList(accounts) {
  accountList = accounts;
  updateTrayMenu();
}
function updateTrayLanguage(language) {
  currentLanguage = language;
  updateTrayMenu();
}
function setTrayTooltip(tooltip) {
  if (tray) {
    tray.setToolTip(tooltip);
  }
}
function createTray(cbs) {
  if (tray) {
    return tray;
  }
  callbacks = cbs;
  try {
    const iconPath = getTrayIconPath();
    let icon2 = electron.nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin") {
      icon2 = icon2.resize({ width: 16, height: 16 });
      icon2.setTemplateImage(true);
    } else if (process.platform === "win32") {
      icon2 = icon2.resize({ width: 16, height: 16 });
    }
    tray = new electron.Tray(icon2);
    tray.setToolTip(currentLanguage === "en" ? "Kiro Account Manager" : "Kiro 账号管理器");
    tray.setContextMenu(buildTrayMenu());
    tray.on("double-click", () => {
      callbacks?.onShowWindow();
    });
    if (process.platform !== "darwin") {
      tray.on("click", () => {
        callbacks?.onShowWindow();
      });
    }
    console.log("[Tray] System tray created successfully");
    return tray;
  } catch (error) {
    console.error("[Tray] Failed to create system tray:", error);
    return null;
  }
}
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    callbacks = null;
    console.log("[Tray] System tray destroyed");
  }
}
const defaultTraySettings = {
  enabled: true,
  closeAction: "ask",
  showNotifications: true,
  minimizeOnStart: false
};
electronUpdater.autoUpdater.autoDownload = false;
electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
function setupAutoUpdater() {
  electronUpdater.autoUpdater.on("error", (error) => {
    console.error("[AutoUpdater] Error:", error);
    mainWindow?.webContents.send("update-error", error.message);
  });
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for update...");
    mainWindow?.webContents.send("update-checking");
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });
  electronUpdater.autoUpdater.on("update-not-available", (info) => {
    console.log("[AutoUpdater] No update available, current:", info.version);
    mainWindow?.webContents.send("update-not-available", { version: info.version });
  });
  electronUpdater.autoUpdater.on("download-progress", (progress) => {
    console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
    mainWindow?.webContents.send("update-download-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    mainWindow?.webContents.send("update-downloaded", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });
}
const KIRO_API_BASE = "https://app.kiro.dev/service/KiroWebPortalService/operation";
const KIRO_REST_API_ENDPOINTS = {
  "us-east-1": "https://q.us-east-1.amazonaws.com",
  "eu-central-1": "https://q.eu-central-1.amazonaws.com"
};
function getRestApiBase(ssoRegion) {
  if (!ssoRegion) return KIRO_REST_API_ENDPOINTS["us-east-1"];
  if (KIRO_REST_API_ENDPOINTS[ssoRegion]) return KIRO_REST_API_ENDPOINTS[ssoRegion];
  if (ssoRegion.startsWith("eu-")) return KIRO_REST_API_ENDPOINTS["eu-central-1"];
  return KIRO_REST_API_ENDPOINTS["us-east-1"];
}
function getFallbackRestApiBase(ssoRegion) {
  const primary = getRestApiBase(ssoRegion);
  return primary === KIRO_REST_API_ENDPOINTS["eu-central-1"] ? KIRO_REST_API_ENDPOINTS["us-east-1"] : KIRO_REST_API_ENDPOINTS["eu-central-1"];
}
let currentUsageApiType = "rest";
function setUsageApiType(type) {
  currentUsageApiType = type;
  console.log(`[API] Usage API type set to: ${type}`);
}
function getUsageApiType() {
  return currentUsageApiType;
}
let useKProxyForApi = false;
function setUseKProxyForApi(enabled) {
  useKProxyForApi = enabled;
  setUseKProxyForApiInProxy(enabled);
  console.log(`[API] Use K-Proxy for API requests: ${enabled}`);
}
function getUseKProxyForApi() {
  return useKProxyForApi;
}
function isKProxyUrl(proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    const service = getKProxyService();
    const config = service?.getConfig();
    if (!config) return false;
    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0";
    return isLocalHost && Number(parsed.port || 80) === config.port;
  } catch {
    return false;
  }
}
function getNetworkAgent() {
  if (useKProxyForApi) {
    const kproxyService2 = getKProxyService();
    if (kproxyService2?.isRunning()) {
      const config = kproxyService2.getConfig();
      const proxyUrl = `http://${config.host}:${config.port}`;
      const agent = safeCreateProxyAgent(proxyUrl);
      if (agent) return agent;
    }
  }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (envProxy && !isKProxyUrl(envProxy)) {
    return new undici.ProxyAgent({ uri: envProxy, requestTls: { rejectUnauthorized: false } });
  }
  const systemProxy = getSystemProxy();
  if (systemProxy && !isKProxyUrl(systemProxy)) {
    return new undici.ProxyAgent({ uri: systemProxy, requestTls: { rejectUnauthorized: false } });
  }
  return void 0;
}
async function fetchWithAppProxy(url2, options, overrideProxyUrl) {
  if (overrideProxyUrl) {
    const accountAgent = safeCreateProxyAgent(overrideProxyUrl);
    if (accountAgent) {
      return await undici.fetch(url2, {
        ...options,
        dispatcher: accountAgent
      });
    }
  }
  const agent = getNetworkAgent();
  if (agent) {
    return await undici.fetch(url2, {
      ...options,
      dispatcher: agent
    });
  }
  return await fetch(url2, options);
}
function getKProxyAgent() {
  return getNetworkAgent();
}
const KIRO_AUTH_ENDPOINT = "https://prod.us-east-1.auth.desktop.kiro.dev";
function applyProxySettings(enabled, url2) {
  if (enabled && url2) {
    process.env.HTTP_PROXY = url2;
    process.env.HTTPS_PROXY = url2;
    process.env.http_proxy = url2;
    process.env.https_proxy = url2;
    console.log(`[Proxy] Enabled: ${url2}`);
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    console.log("[Proxy] Disabled");
  }
}
const pendingStoreWrites = /* @__PURE__ */ new Map();
let storeFlushTimer = null;
const STORE_FLUSH_INTERVAL = 5e3;
function debouncedStoreSet(key, value) {
  pendingStoreWrites.set(key, value);
  if (!storeFlushTimer) {
    storeFlushTimer = setTimeout(flushStoreWrites, STORE_FLUSH_INTERVAL);
  }
}
function flushStoreWrites() {
  storeFlushTimer = null;
  if (!store || pendingStoreWrites.size === 0) return;
  for (const [key, value] of pendingStoreWrites) {
    store.set(key, value);
  }
  pendingStoreWrites.clear();
}
let trayMenuTimer = null;
function debouncedUpdateTrayMenu() {
  if (trayMenuTimer) return;
  trayMenuTimer = setTimeout(() => {
    trayMenuTimer = null;
    updateTrayMenu();
  }, 3e3);
}
let proxyServer = null;
function isSuspendedAccountError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  return lower.includes("accountsuspended") || lower.includes("suspended") || lower.includes("locked") || lower.includes("temporarily is suspended") || lower.includes("security precaution") || lower.includes("423");
}
function getAccountProfileArn(acc) {
  return acc.profileArn || acc.credentials?.profileArn || acc.credentials?.profile_arn;
}
function getStoredAccountsForProxy(accountData) {
  if (!accountData?.accounts) return [];
  const seen = /* @__PURE__ */ new Set();
  return Object.values(accountData.accounts).filter(
    (acc) => acc.status === "active" && acc.credentials?.accessToken && !String(acc.lastError || "").toLowerCase().includes("suspended") && !String(acc.lastError || "").toLowerCase().includes("locked")
  ).filter((acc) => {
    const key = acc.credentials?.refreshToken || acc.email || acc.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((acc) => ({
    id: acc.id,
    email: acc.email,
    accessToken: acc.credentials.accessToken,
    refreshToken: acc.credentials?.refreshToken,
    profileArn: getAccountProfileArn(acc),
    expiresAt: acc.credentials?.expiresAt,
    machineId: acc.machineId,
    clientId: acc.credentials?.clientId,
    clientSecret: acc.credentials?.clientSecret,
    region: acc.credentials?.region || "us-east-1",
    authMethod: acc.credentials?.authMethod,
    provider: acc.credentials?.provider || acc.idp
  }));
}
let autoReplacementRunning = false;
let scheduledRegistrationTimer = null;
const COLAB_PROXY_TIMEOUT_MS = 18e4;
async function generateColabProxyWithTimeout(config) {
  let timeout;
  const controller = new AbortController();
  try {
    return await Promise.race([
      generateColabProxy({ ...config, signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Proxy generation timeout (${COLAB_PROXY_TIMEOUT_MS / 1e3} seconds)`));
        }, COLAB_PROXY_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
async function importRegisteredAccount(result) {
  await initStore();
  const now = Date.now();
  const accountData = store?.get("accountData") || { accounts: {} };
  const id = crypto.randomUUID();
  accountData.accounts = accountData.accounts || {};
  accountData.accounts[id] = {
    id,
    email: result.email,
    password: result.password,
    idp: "BuilderId",
    status: "active",
    credentials: {
      refreshToken: result.refreshToken || "",
      clientId: result.clientId || "",
      clientSecret: result.clientSecret || "",
      accessToken: result.accessToken || "",
      csrfToken: "",
      region: result.region || "us-east-1",
      authMethod: "IdC",
      provider: result.provider || "BuilderId",
      expiresAt: now + 36e5
    },
    subscription: { type: "Free", title: "Free Tier" },
    usage: { current: 0, limit: 0, percentUsed: 0, lastUpdated: now },
    tags: [],
    lastUsedAt: now
  };
  store?.set("accountData", accountData);
  lastSavedData = accountData;
  proxyServer?.getAccountPool().addAccount({
    id,
    email: result.email,
    accessToken: result.accessToken || "",
    refreshToken: result.refreshToken,
    clientId: result.clientId,
    clientSecret: result.clientSecret,
    region: result.region || "us-east-1",
    authMethod: "IdC",
    provider: result.provider || "BuilderId",
    expiresAt: now + 36e5
  });
  mainWindow?.webContents.send("accounts-data-updated", accountData);
}
async function runBrowserReplacementRegistration(reason, requireEnabled = true) {
  if (autoReplacementRunning) return;
  const savedConfig = store?.get("registrationAutoReplacement");
  if (requireEnabled && !savedConfig?.enabled) return;
  if (!savedConfig) return;
  const method = savedConfig.scheduledMethod || "browser-ddg";
  const isScheduled = reason.toLowerCase().includes("scheduled");
  const config = {
    ...savedConfig,
    useDDG: isScheduled ? method === "browser-ddg" : true,
    useTempMailPlus: isScheduled ? method === "browser-tempmail" : false,
    providedEmailData: isScheduled && method === "browser-provided-email" ? savedConfig.providedEmailData : void 0
  };
  if (isScheduled && (method === "browser-moemail" || method === "browser-provided-email")) {
    config.useDDG = false;
    config.useTempMailPlus = false;
  }
  if (config.useDDG && (!config.ddgAuthToken || !config.ddgGmailEmail)) {
    mainWindow?.webContents.send("registration-log", {
      message: "[AutoRegister] Browser (DDG) is selected but DDG Auth Token / Gmail Email is not configured."
    });
    return;
  }
  if (config.useTempMailPlus && (!config.tempMailPlusEmail || !config.tempMailPlusEpin || !config.tempMailPlusDomain)) {
    mainWindow?.webContents.send("registration-log", {
      message: "[AutoRegister] Browser (TempMail.Plus) is selected but TempMail.Plus is not configured."
    });
    return;
  }
  if (isScheduled && method === "browser-provided-email" && (!config.providedEmailData || !config.providedEmailApiKey)) {
    mainWindow?.webContents.send("registration-log", {
      message: "[AutoRegister] Browser (Email Provider) is selected but email accounts / FirstMail API Key are not configured."
    });
    return;
  }
  if (isScheduled && method === "browser-moemail" && !config.moEmailBaseURL) {
    mainWindow?.webContents.send("registration-log", {
      message: "[AutoRegister] Browser (MoEmail) is selected but MoEmail Base URL is not configured."
    });
    return;
  }
  autoReplacementRunning = true;
  try {
    const browserConfig = { ...config, taskId: `replace-${Date.now()}` };
    if (config.generateProxyEachTime) {
      mainWindow?.webContents.send("registration-log", {
        message: "[AutoReplace] Generating new proxy from Colab...",
        taskId: browserConfig.taskId
      });
      try {
        browserConfig.proxyUrl = await generateColabProxyWithTimeout({
          cdpAddress: config.proxyCdpAddress || "127.0.0.1:9229",
          formUrl: config.proxyFormUrl,
          onLog: (message) => mainWindow?.webContents.send("registration-log", {
            message: `[AutoReplace] ${message}`,
            taskId: browserConfig.taskId
          })
        });
        mainWindow?.webContents.send("registration-log", {
          message: `[AutoReplace] Proxy generated successfully: ${browserConfig.proxyUrl}`,
          taskId: browserConfig.taskId
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        mainWindow?.webContents.send("registration-log", {
          message: `[AutoReplace] Proxy generation failed: ${errorMsg}. Registration aborted.`,
          taskId: browserConfig.taskId
        });
        throw error;
      }
    }
    mainWindow?.webContents.send("registration-log", {
      message: `[AutoReplace] Registering replacement/new scheduled account. ${reason}`,
      taskId: browserConfig.taskId
    });
    const registrar = new BrowserRegistrar(browserConfig, (msg) => {
      mainWindow?.webContents.send("registration-log", {
        message: `[AutoReplace] ${msg}`,
        taskId: browserConfig.taskId
      });
    });
    try {
      const result = await registrar.run();
      if (result.status !== "success")
        throw new Error(result.error || "Replacement registration failed");
      await importRegisteredAccount(result);
      mainWindow?.webContents.send("registration-complete", result);
    } finally {
      await registrar.destroy();
    }
  } catch (error) {
    mainWindow?.webContents.send("registration-log", {
      message: `[AutoReplace] Failed: ${error instanceof Error ? error.message : String(error)}`
    });
  } finally {
    autoReplacementRunning = false;
  }
}
async function maybeReplaceSuspendedAccount(reason) {
  return runBrowserReplacementRegistration(reason, true);
}
function clearScheduledRegistrationTimer() {
  if (scheduledRegistrationTimer) {
    clearTimeout(scheduledRegistrationTimer);
    scheduledRegistrationTimer = null;
  }
}
function parseScheduledTime(value) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}
function isWithinScheduledTimePeriod(cfg) {
  const start = parseScheduledTime(cfg.scheduledStartTime);
  const end = parseScheduledTime(cfg.scheduledEndTime);
  if (start === null || end === null || start === end) return true;
  const now = /* @__PURE__ */ new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}
function getScheduledPeriodLabel(cfg) {
  const start = parseScheduledTime(cfg.scheduledStartTime);
  const end = parseScheduledTime(cfg.scheduledEndTime);
  if (start === null || end === null || start === end) return "all day";
  return `${cfg.scheduledStartTime}-${cfg.scheduledEndTime}`;
}
function scheduleNextRegistration() {
  clearScheduledRegistrationTimer();
  const cfg = store?.get("registrationAutoReplacement");
  if (!cfg?.scheduledEnabled) return;
  const intervalMin = Math.max(1, Number(cfg.scheduledIntervalMin || 30));
  scheduledRegistrationTimer = setTimeout(
    async () => {
      try {
        await initStore();
        const latest = store?.get("registrationAutoReplacement");
        if (latest?.scheduledEnabled) {
          const latestIntervalMin = Math.max(1, Number(latest.scheduledIntervalMin || intervalMin));
          if (isWithinScheduledTimePeriod(latest)) {
            await runBrowserReplacementRegistration(
              `Scheduled interval (${latestIntervalMin} min, period ${getScheduledPeriodLabel(latest)})`,
              false
            );
          } else {
            mainWindow?.webContents.send("registration-log", {
              message: `[AutoRegister] Skipped scheduled account; outside active period ${getScheduledPeriodLabel(latest)}`
            });
          }
        }
      } finally {
        scheduleNextRegistration();
      }
    },
    intervalMin * 60 * 1e3
  );
  mainWindow?.webContents.send("registration-log", {
    message: `[AutoRegister] Next scheduled account in ${intervalMin} minutes (${getScheduledPeriodLabel(cfg)})`
  });
}
function initProxyServer() {
  if (proxyServer) return proxyServer;
  proxyLogStore.initialize(electron.app.getPath("userData"));
  const savedConfig = store?.get("proxyConfig");
  const savedUsageApiType = store?.get("usageApiType");
  if (savedUsageApiType) {
    setUsageApiType(savedUsageApiType);
  }
  const savedUseKProxyForApi = store?.get("useKProxyForApi");
  if (savedUseKProxyForApi !== void 0) {
    setUseKProxyForApi(savedUseKProxyForApi);
  }
  const savedTotalCredits = store?.get("proxyTotalCredits") || 0;
  const savedInputTokens = store?.get("proxyInputTokens") || 0;
  const savedOutputTokens = store?.get("proxyOutputTokens") || 0;
  const savedTotalRequests = store?.get("proxyTotalRequests") || 0;
  const savedSuccessRequests = store?.get("proxySuccessRequests") || 0;
  const savedFailedRequests = store?.get("proxyFailedRequests") || 0;
  const defaultConfig = {
    enabled: false,
    port: 5580,
    host: "127.0.0.1",
    enableMultiAccount: true,
    selectedAccountIds: [],
    logRequests: true,
    maxConcurrent: 10,
    maxRetries: 3,
    retryDelayMs: 1e3,
    tokenRefreshBeforeExpiry: 300,
    // 5分钟提前刷新
    enableServerSideToolAutoContinue: false,
    clientDrivenToolExecution: true
  };
  const config = savedConfig ? { ...defaultConfig, ...savedConfig } : defaultConfig;
  if (config.payloadSizeLimitKB) {
    setPayloadSizeLimitKB(config.payloadSizeLimitKB);
  }
  proxyServer = new ProxyServer(config, {
    onRequest: (info) => {
      mainWindow?.webContents.send("proxy-request", info);
    },
    onResponse: (info) => {
      mainWindow?.webContents.send("proxy-response", info);
    },
    onError: (error) => {
      console.error("[ProxyServer] Error:", error);
      mainWindow?.webContents.send("proxy-error", error.message);
    },
    onStatusChange: (running, port) => {
      mainWindow?.webContents.send("proxy-status-change", { running, port });
    },
    // Token 刷新回调 - 复用已有的刷新逻辑
    onTokenRefresh: async (account) => {
      try {
        console.log(`[ProxyServer] Refreshing token for ${account.email || account.id}`);
        const refreshResult = await refreshTokenByMethod(
          account.refreshToken || "",
          account.clientId || "",
          account.clientSecret || "",
          account.region || "us-east-1",
          account.authMethod
        );
        if (refreshResult.success && refreshResult.accessToken) {
          return {
            success: true,
            accessToken: refreshResult.accessToken,
            refreshToken: refreshResult.refreshToken,
            expiresAt: Date.now() + (refreshResult.expiresIn || 3600) * 1e3
          };
        }
        return { success: false, error: refreshResult.error || "Token 刷新失败" };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },
    // 账号更新回调 - 通知渲染进程更新账号数据
    onAccountUpdate: (account) => {
      if (account.suspended) {
        const accountData = store?.get("accountData");
        const storedAccount = accountData?.accounts?.[account.id];
        if (accountData?.accounts && storedAccount) {
          delete accountData.accounts[account.id];
          store?.set("accountData", accountData);
          lastSavedData = accountData;
        }
        void maybeReplaceSuspendedAccount(account.email || account.id);
      }
      mainWindow?.webContents.send("proxy-account-update", {
        id: account.id,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
        suspended: account.suspended,
        isAvailable: account.isAvailable,
        status: account.suspended ? "error" : void 0,
        lastError: account.suspended ? "Account temporarily suspended or locked by AWS/Kiro" : void 0
      });
    },
    // Credits 更新回调 - 使用防抖持久化
    onCreditsUpdate: (totalCredits) => {
      debouncedStoreSet("proxyTotalCredits", totalCredits);
    },
    // Tokens 更新回调 - 使用防抖持久化
    onTokensUpdate: (inputTokens, outputTokens) => {
      debouncedStoreSet("proxyInputTokens", inputTokens);
      debouncedStoreSet("proxyOutputTokens", outputTokens);
    },
    // 请求统计更新回调 - 使用防抖持久化
    onRequestStatsUpdate: (totalRequests, successRequests, failedRequests) => {
      debouncedStoreSet("proxyTotalRequests", totalRequests);
      debouncedStoreSet("proxySuccessRequests", successRequests);
      debouncedStoreSet("proxyFailedRequests", failedRequests);
      debouncedUpdateTrayMenu();
    },
    // 账号池为空时懒加载 - 从 store 读取账号数据同步到 pool
    onPoolEmpty: async () => {
      await initStore();
      if (!store) return;
      const accountData = store.get("accountData");
      const proxyAccounts = getStoredAccountsForProxy(accountData);
      if (proxyAccounts.length > 0 && proxyServer) {
        const pool = proxyServer.getAccountPool();
        proxyAccounts.forEach((acc) => pool.addAccount(acc));
        console.log(`[ProxyServer] Lazy-synced ${proxyAccounts.length} accounts from store`);
      }
    }
  });
  proxyServer.setWebhookTrigger((event, payload) => {
    mainWindow?.webContents.send("proxy-webhook-trigger", { event, payload });
  });
  if (savedTotalCredits > 0) {
    proxyServer.setTotalCredits(savedTotalCredits);
  }
  if (savedInputTokens > 0 || savedOutputTokens > 0) {
    proxyServer.setTotalTokens(savedInputTokens, savedOutputTokens);
  }
  if (savedTotalRequests > 0 || savedSuccessRequests > 0 || savedFailedRequests > 0) {
    proxyServer.setRequestStats(savedTotalRequests, savedSuccessRequests, savedFailedRequests);
  }
  return proxyServer;
}
function getWindowsDefaultBrowser() {
  try {
    const progId = child_process.execSync(
      'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    if (progId.includes("ChromeHTML") || progId.includes("Google")) return "chrome";
    if (progId.includes("MSEdgeHTM") || progId.includes("Edge")) return "msedge";
    if (progId.includes("FirefoxURL") || progId.includes("Firefox")) return "firefox";
    if (progId.includes("BraveHTML") || progId.includes("Brave")) return "brave";
    if (progId.includes("Opera")) return "opera";
    return "unknown";
  } catch {
    return "unknown";
  }
}
function openBrowserInPrivateMode(url2) {
  const platform = process.platform;
  console.log(`[Browser] Opening in private mode on ${platform}: ${url2}`);
  try {
    if (platform === "win32") {
      const defaultBrowser = getWindowsDefaultBrowser();
      console.log(`[Browser] Detected default browser: ${defaultBrowser}`);
      let command = "";
      switch (defaultBrowser) {
        case "chrome":
          command = `start chrome --incognito "${url2}"`;
          break;
        case "msedge":
          command = `start msedge -inprivate "${url2}"`;
          break;
        case "firefox":
          command = `start firefox -private-window "${url2}"`;
          break;
        case "brave":
          command = `start brave --incognito "${url2}"`;
          break;
        case "opera":
          command = `start opera --private "${url2}"`;
          break;
        default:
          console.log("[Browser] Unknown default browser, trying common browsers...");
          child_process.exec(`start chrome --incognito "${url2}"`, (err) => {
            if (err) {
              child_process.exec(`start msedge -inprivate "${url2}"`, (err2) => {
                if (err2) {
                  child_process.exec(`start firefox -private-window "${url2}"`, (err3) => {
                    if (err3) {
                      console.log("[Browser] Fallback to default browser (non-private)");
                      electron.shell.openExternal(url2);
                    }
                  });
                }
              });
            }
          });
          return;
      }
      child_process.exec(command, (err) => {
        if (err) {
          console.log(`[Browser] Failed to open ${defaultBrowser}, fallback to default`);
          electron.shell.openExternal(url2);
        }
      });
    } else if (platform === "darwin") {
      child_process.exec(`open -na "Google Chrome" --args --incognito "${url2}"`, (err) => {
        if (err) {
          child_process.exec(`open -a Firefox --args -private-window "${url2}"`, (err2) => {
            if (err2) {
              console.log("[Browser] Fallback to default browser");
              electron.shell.openExternal(url2);
            }
          });
        }
      });
    } else {
      child_process.exec(`google-chrome --incognito "${url2}"`, (err) => {
        if (err) {
          child_process.exec(`chromium --incognito "${url2}"`, (err2) => {
            if (err2) {
              child_process.exec(`firefox -private-window "${url2}"`, (err3) => {
                if (err3) {
                  console.log("[Browser] Fallback to default browser");
                  electron.shell.openExternal(url2);
                }
              });
            }
          });
        }
      });
    }
  } catch (error) {
    console.error("[Browser] Error opening in private mode:", error);
    electron.shell.openExternal(url2);
  }
}
async function refreshOidcToken(refreshToken, clientId, clientSecret, region = "us-east-1", proxyUrl) {
  console.log(`[OIDC] Refreshing token with clientId: ${clientId.substring(0, 20)}...`);
  const url2 = `https://oidc.${region}.amazonaws.com/token`;
  const payload = {
    clientId,
    clientSecret,
    refreshToken,
    grantType: "refresh_token"
  };
  try {
    const response = await fetchWithAppProxy(
      url2,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      proxyUrl
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OIDC] Refresh failed: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    const data = await response.json();
    console.log(`[OIDC] Token refreshed successfully, expires in ${data.expiresIn}s`);
    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      // 可能不返回新的 refreshToken
      expiresIn: data.expiresIn
    };
  } catch (error) {
    console.error(`[OIDC] Refresh error:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function refreshSocialToken(refreshToken, proxyUrl) {
  console.log(`[Social] Refreshing token...`);
  const url2 = `${KIRO_AUTH_ENDPOINT}/refreshToken`;
  const machineId = getCurrentMachineId();
  try {
    const response = await fetchWithAppProxy(
      url2,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": getKiroUserAgent(machineId)
        },
        body: JSON.stringify({ refreshToken })
      },
      proxyUrl
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Social] Refresh failed: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    const data = await response.json();
    console.log(`[Social] Token refreshed successfully, expires in ${data.expiresIn}s`);
    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn
    };
  } catch (error) {
    console.error(`[Social] Refresh error:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function refreshTokenByMethod(token, clientId, clientSecret, region = "us-east-1", authMethod, proxyUrl) {
  if (authMethod === "social") {
    return refreshSocialToken(token, proxyUrl);
  }
  return refreshOidcToken(token, clientId, clientSecret, region, proxyUrl);
}
function generateInvocationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
const KIRO_VERSION = "0.6.18";
function getKiroUserAgent(machineId) {
  const suffix = machineId ? `KiroIDE-${KIRO_VERSION}-${machineId}` : `KiroIDE-${KIRO_VERSION}`;
  return `aws-sdk-js/1.0.18 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererstreaming#1.0.18 m/E ${suffix}`;
}
function getKiroAmzUserAgent(machineId) {
  const suffix = machineId ? `KiroIDE ${KIRO_VERSION} ${machineId}` : `KiroIDE-${KIRO_VERSION}`;
  return `aws-sdk-js/1.0.18 ${suffix}`;
}
function getCurrentMachineId() {
  const kproxyService2 = getKProxyService();
  if (!kproxyService2) return void 0;
  return kproxyService2.getDeviceId();
}
async function ssoDeviceAuth(bearerToken, region = "us-east-1") {
  const oidcBase = `https://oidc.${region}.amazonaws.com`;
  const portalBase = "https://portal.sso.us-east-1.amazonaws.com";
  const startUrl = "https://view.awsapps.com/start";
  const scopes = [
    "codewhisperer:analysis",
    "codewhisperer:completions",
    "codewhisperer:conversations",
    "codewhisperer:taskassist",
    "codewhisperer:transformations"
  ];
  let clientId, clientSecret;
  let deviceCode, userCode;
  let deviceSessionToken;
  let interval = 1;
  console.log("[SSO] Step 1: Registering OIDC client...");
  try {
    const regRes = await fetchWithAppProxy(`${oidcBase}/client/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Kiro Account Manager",
        clientType: "public",
        scopes,
        grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
        issuerUrl: startUrl
      })
    });
    if (!regRes.ok) throw new Error(`Register failed: ${regRes.status}`);
    const regData = await regRes.json();
    clientId = regData.clientId;
    clientSecret = regData.clientSecret;
    console.log(`[SSO] Client registered: ${clientId.substring(0, 30)}...`);
  } catch (e) {
    return { success: false, error: `注册客户端失败: ${e}` };
  }
  console.log("[SSO] Step 2: Starting device authorization...");
  try {
    const devRes = await fetchWithAppProxy(`${oidcBase}/device_authorization`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, startUrl })
    });
    if (!devRes.ok) throw new Error(`Device auth failed: ${devRes.status}`);
    const devData = await devRes.json();
    deviceCode = devData.deviceCode;
    userCode = devData.userCode;
    interval = devData.interval || 1;
    console.log(`[SSO] Device code obtained, user_code: ${userCode}`);
  } catch (e) {
    return { success: false, error: `设备授权失败: ${e}` };
  }
  console.log("[SSO] Step 3: Verifying bearer token...");
  try {
    const whoRes = await fetchWithAppProxy(`${portalBase}/token/whoAmI`, {
      method: "GET",
      headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" }
    });
    if (!whoRes.ok) throw new Error(`whoAmI failed: ${whoRes.status}`);
    console.log("[SSO] Bearer token verified");
  } catch (e) {
    return { success: false, error: `Token 验证失败: ${e}` };
  }
  console.log("[SSO] Step 4: Getting device session token...");
  try {
    const sessRes = await fetchWithAppProxy(`${portalBase}/session/device`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!sessRes.ok) throw new Error(`Device session failed: ${sessRes.status}`);
    const sessData = await sessRes.json();
    deviceSessionToken = sessData.token;
    console.log("[SSO] Device session token obtained");
  } catch (e) {
    return { success: false, error: `获取设备会话失败: ${e}` };
  }
  console.log("[SSO] Step 5: Accepting user code...");
  let deviceContext = null;
  try {
    const acceptRes = await fetchWithAppProxy(`${oidcBase}/device_authorization/accept_user_code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://view.awsapps.com/" },
      body: JSON.stringify({ userCode, userSessionId: deviceSessionToken })
    });
    if (!acceptRes.ok) throw new Error(`Accept user code failed: ${acceptRes.status}`);
    const acceptData = await acceptRes.json();
    deviceContext = acceptData.deviceContext || null;
    console.log("[SSO] User code accepted");
  } catch (e) {
    return { success: false, error: `接受用户代码失败: ${e}` };
  }
  if (deviceContext?.deviceContextId) {
    console.log("[SSO] Step 6: Approving authorization...");
    try {
      const approveRes = await fetchWithAppProxy(
        `${oidcBase}/device_authorization/associate_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Referer: "https://view.awsapps.com/" },
          body: JSON.stringify({
            deviceContext: {
              deviceContextId: deviceContext.deviceContextId,
              clientId: deviceContext.clientId || clientId,
              clientType: deviceContext.clientType || "public"
            },
            userSessionId: deviceSessionToken
          })
        }
      );
      if (!approveRes.ok) throw new Error(`Approve failed: ${approveRes.status}`);
      console.log("[SSO] Authorization approved");
    } catch (e) {
      return { success: false, error: `批准授权失败: ${e}` };
    }
  }
  console.log("[SSO] Step 7: Polling for token...");
  const startTime = Date.now();
  const timeout = 12e4;
  while (Date.now() - startTime < timeout) {
    await new Promise((r) => setTimeout(r, interval * 1e3));
    try {
      const tokenRes = await fetchWithAppProxy(`${oidcBase}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
          deviceCode
        })
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        console.log("[SSO] Token obtained successfully!");
        return {
          success: true,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          clientId,
          clientSecret,
          region,
          expiresIn: tokenData.expiresIn
        };
      }
      if (tokenRes.status === 400) {
        const errData = await tokenRes.json();
        if (errData.error === "authorization_pending") {
          continue;
        } else if (errData.error === "slow_down") {
          interval += 5;
        } else {
          return { success: false, error: `Token 获取失败: ${errData.error}` };
        }
      }
    } catch (e) {
      console.error("[SSO] Token poll error:", e);
    }
  }
  return { success: false, error: "授权超时，请重试" };
}
async function kiroApiRequest(operation, body, accessToken, idp = "BuilderId", accountMachineId, email) {
  const machineId = accountMachineId || getCurrentMachineId();
  const logTag = email || `token:${accessToken?.slice(-6) || "?"}`;
  console.log(
    `[Kiro API] ${operation} [${logTag}] ${idp} machineId=${machineId?.slice(0, 8) || "none"}`
  );
  const agent = getKProxyAgent();
  const headers = {
    accept: "application/cbor",
    "content-type": "application/cbor",
    "smithy-protocol": "rpc-v2-cbor",
    "amz-sdk-invocation-id": generateInvocationId(),
    "amz-sdk-request": "attempt=1; max=1",
    "x-amz-user-agent": getKiroAmzUserAgent(machineId),
    authorization: `Bearer ${accessToken}`,
    cookie: `Idp=${idp}; AccessToken=${accessToken}`
  };
  let response;
  if (agent) {
    response = await undici.fetch(`${KIRO_API_BASE}/${operation}`, {
      method: "POST",
      headers,
      body: Buffer.from(cborX.encode(body)),
      dispatcher: agent
    });
  } else {
    response = await fetchWithAppProxy(`${KIRO_API_BASE}/${operation}`, {
      method: "POST",
      headers,
      body: Buffer.from(cborX.encode(body))
    });
  }
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    const errorBuffer = await response.arrayBuffer();
    try {
      const errorData = cborX.decode(Buffer.from(errorBuffer));
      if (errorData.__type && errorData.message) {
        const errorType = errorData.__type.split("#").pop() || errorData.__type;
        errorMessage = `HTTP ${response.status}: ${errorType}: ${errorData.message}`;
      } else if (errorData.message) {
        errorMessage = `HTTP ${response.status}: ${errorData.message}`;
      }
      console.error(`[Kiro API] Error:`, errorData);
    } catch {
      const errorText = Buffer.from(errorBuffer).toString("utf-8");
      console.error(`[Kiro API] Error (raw): ${errorText}`);
    }
    throw new Error(errorMessage);
  }
  const arrayBuffer = await response.arrayBuffer();
  const result = cborX.decode(Buffer.from(arrayBuffer));
  const r = result;
  const resSummary = r.email ? `${r.email} [${r.status || "ok"}]` : `${response.status}`;
  console.log(`[Kiro API] ${operation} [${logTag}] → ${resSummary}`, result);
  return result;
}
function normalizeResetDate(value) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value === "number") {
    return new Date(value * 1e3).toISOString();
  }
  return value;
}
async function fetchRestApi(baseUrl, path2, accessToken, machineId) {
  const agent = getKProxyAgent();
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": getKiroUserAgent(machineId),
    "x-amz-user-agent": getKiroAmzUserAgent(machineId)
  };
  const url2 = `${baseUrl}${path2}`;
  if (agent) {
    return await undici.fetch(url2, {
      method: "GET",
      headers,
      dispatcher: agent
    });
  }
  return await fetchWithAppProxy(url2, { method: "GET", headers });
}
async function getUsageLimitsRest(accessToken, profileArn, accountMachineId, ssoRegion, email) {
  const machineId = accountMachineId || getCurrentMachineId();
  const logTag = email || `token:${accessToken?.slice(-6) || "?"}`;
  console.log(`[Kiro REST API] GetUsageLimits [${logTag}] region=${ssoRegion || "default"}`);
  const params = new URLSearchParams({
    origin: "AI_EDITOR",
    resourceType: "AGENTIC_REQUEST",
    isEmailRequired: "true"
  });
  const path2 = `/getUsageLimits?${params.toString()}`;
  const primaryBase = getRestApiBase(ssoRegion);
  const fallbackBase = getFallbackRestApiBase(ssoRegion);
  let response = await fetchRestApi(primaryBase, path2, accessToken, machineId);
  if (response.status === 403) {
    console.log(`[Kiro REST API] Primary 403, fallback → ${fallbackBase}`);
    response = await fetchRestApi(fallbackBase, path2, accessToken, machineId);
  }
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Kiro REST API] GetUsageLimits failed: ${response.status}`, errorText);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  const result = await response.json();
  console.log(`[Kiro REST API] GetUsageLimits [${logTag}] → ${response.status}`, result);
  return result;
}
async function getUsageAndLimits(accessToken, idp = "BuilderId", profileArn, accountMachineId, ssoRegion, email) {
  if (currentUsageApiType === "rest") {
    const result = await getUsageLimitsRest(
      accessToken,
      profileArn,
      accountMachineId,
      ssoRegion,
      email
    );
    return {
      usageBreakdownList: result.usageBreakdownList?.map((b) => ({
        resourceType: b.resourceType || b.type,
        displayName: b.displayName,
        displayNamePlural: b.displayNamePlural,
        currentUsage: b.currentUsage,
        currentUsageWithPrecision: b.currentUsageWithPrecision,
        usageLimit: b.usageLimit,
        usageLimitWithPrecision: b.usageLimitWithPrecision,
        currency: b.currency,
        unit: b.unit,
        overageRate: b.overageRate,
        overageCap: b.overageCap,
        type: b.type,
        // REST API 直接返回 freeTrialInfo，CBOR API 返回 freeTrialUsage
        freeTrialInfo: b.freeTrialInfo ? {
          freeTrialStatus: b.freeTrialInfo.freeTrialStatus,
          usageLimit: b.freeTrialInfo.usageLimit,
          usageLimitWithPrecision: b.freeTrialInfo.usageLimitWithPrecision,
          currentUsage: b.freeTrialInfo.currentUsage,
          currentUsageWithPrecision: b.freeTrialInfo.currentUsageWithPrecision,
          // REST API 返回数字时间戳，需要转换为 ISO 字符串
          freeTrialExpiry: typeof b.freeTrialInfo.freeTrialExpiry === "number" ? new Date(b.freeTrialInfo.freeTrialExpiry * 1e3).toISOString() : b.freeTrialInfo.freeTrialExpiry
        } : b.freeTrialUsage ? {
          freeTrialStatus: b.freeTrialUsage.freeTrialStatus,
          usageLimit: b.freeTrialUsage.usageLimit,
          usageLimitWithPrecision: b.freeTrialUsage.usageLimitWithPrecision,
          currentUsage: b.freeTrialUsage.currentUsage,
          currentUsageWithPrecision: b.freeTrialUsage.currentUsageWithPrecision,
          freeTrialExpiry: b.freeTrialUsage.freeTrialExpiry
        } : void 0,
        // 转换 bonuses 中的时间戳为 ISO 字符串
        bonuses: b.bonuses?.map((bonus) => ({
          ...bonus,
          expiresAt: typeof bonus.expiresAt === "number" ? new Date(bonus.expiresAt * 1e3).toISOString() : bonus.expiresAt
        }))
      })),
      // REST API 返回的 nextDateReset 是 Unix 时间戳（秒），需要转换为 ISO 字符串
      nextDateReset: normalizeResetDate(result.nextDateReset),
      subscriptionInfo: result.subscriptionInfo,
      overageConfiguration: result.overageConfiguration,
      userInfo: result.userInfo
    };
  } else {
    try {
      return await kiroApiRequest(
        "GetUserUsageAndLimits",
        { isEmailRequired: true, origin: "KIRO_IDE" },
        accessToken,
        idp,
        accountMachineId,
        email
      );
    } catch (cborError) {
      const errorMsg = cborError instanceof Error ? cborError.message : "";
      if (errorMsg.includes("401") || errorMsg.includes("403")) {
        console.log(`[API] CBOR API failed (${errorMsg}), falling back to REST API...`);
        const result = await getUsageLimitsRest(
          accessToken,
          profileArn,
          accountMachineId,
          ssoRegion,
          email
        );
        return {
          usageBreakdownList: result.usageBreakdownList?.map((b) => ({
            resourceType: b.resourceType || b.type,
            displayName: b.displayName,
            displayNamePlural: b.displayNamePlural,
            currentUsage: b.currentUsage,
            currentUsageWithPrecision: b.currentUsageWithPrecision,
            usageLimit: b.usageLimit,
            usageLimitWithPrecision: b.usageLimitWithPrecision,
            currency: b.currency,
            unit: b.unit,
            overageRate: b.overageRate,
            overageCap: b.overageCap,
            type: b.type,
            freeTrialInfo: b.freeTrialInfo ? {
              freeTrialStatus: b.freeTrialInfo.freeTrialStatus,
              usageLimit: b.freeTrialInfo.usageLimit,
              usageLimitWithPrecision: b.freeTrialInfo.usageLimitWithPrecision,
              currentUsage: b.freeTrialInfo.currentUsage,
              currentUsageWithPrecision: b.freeTrialInfo.currentUsageWithPrecision,
              freeTrialExpiry: typeof b.freeTrialInfo.freeTrialExpiry === "number" ? new Date(b.freeTrialInfo.freeTrialExpiry * 1e3).toISOString() : b.freeTrialInfo.freeTrialExpiry
            } : b.freeTrialUsage ? {
              freeTrialStatus: b.freeTrialUsage.freeTrialStatus,
              usageLimit: b.freeTrialUsage.usageLimit,
              usageLimitWithPrecision: b.freeTrialUsage.usageLimitWithPrecision,
              currentUsage: b.freeTrialUsage.currentUsage,
              currentUsageWithPrecision: b.freeTrialUsage.currentUsageWithPrecision,
              freeTrialExpiry: b.freeTrialUsage.freeTrialExpiry
            } : void 0,
            bonuses: b.bonuses?.map((bonus) => ({
              ...bonus,
              expiresAt: typeof bonus.expiresAt === "number" ? new Date(bonus.expiresAt * 1e3).toISOString() : bonus.expiresAt
            }))
          })),
          nextDateReset: normalizeResetDate(result.nextDateReset),
          subscriptionInfo: result.subscriptionInfo,
          overageConfiguration: result.overageConfiguration,
          userInfo: result.userInfo
        };
      }
      throw cborError;
    }
  }
}
async function getUserInfo(accessToken, idp = "BuilderId", accountMachineId, email) {
  return kiroApiRequest(
    "GetUserInfo",
    { origin: "KIRO_IDE" },
    accessToken,
    idp,
    accountMachineId,
    email
  );
}
const PROTOCOL_PREFIX = "kiro";
let store = null;
let lastSavedData = null;
async function initStore() {
  if (store) return;
  const Store = (await import("electron-store")).default;
  const fs2 = await import("fs/promises");
  const path2 = await import("path");
  const storeInstance = new Store({
    name: "kiro-accounts",
    encryptionKey: "kiro-account-manager-secret-key"
  });
  store = storeInstance;
  try {
    const backupPath = path2.join(path2.dirname(storeInstance.path), "kiro-accounts.backup.json");
    const mainData = storeInstance.get("accountData");
    if (!mainData) {
      try {
        const backupContent = await fs2.readFile(backupPath, "utf-8");
        const backupData = JSON.parse(backupContent);
        if (backupData && backupData.accounts) {
          console.log("[Store] Restoring data from backup...");
          storeInstance.set("accountData", backupData);
          console.log("[Store] Data restored from backup successfully");
        }
      } catch {
      }
    }
  } catch (error) {
    console.error("[Store] Error checking backup:", error);
  }
}
const BACKUP_THROTTLE_MS = 5 * 60 * 1e3;
let lastBackupTime = 0;
let pendingBackupData = null;
let pendingBackupTimer = null;
async function writeBackupNow() {
  if (!store || pendingBackupData == null) return;
  const data = pendingBackupData;
  pendingBackupData = null;
  try {
    const fs2 = await import("fs/promises");
    const path2 = await import("path");
    const backupPath = path2.join(path2.dirname(store.path), "kiro-accounts.backup.json");
    await fs2.writeFile(backupPath, JSON.stringify(data, null, 2), "utf-8");
    lastBackupTime = Date.now();
    console.log("[Backup] Data backup created");
  } catch (error) {
    console.error("[Backup] Failed to create backup:", error);
  }
}
async function createBackup(data) {
  if (!store) return;
  pendingBackupData = data;
  const delay = BACKUP_THROTTLE_MS - (Date.now() - lastBackupTime);
  if (delay <= 0) {
    await writeBackupNow();
  } else if (!pendingBackupTimer) {
    pendingBackupTimer = setTimeout(() => {
      pendingBackupTimer = null;
      void writeBackupNow();
    }, delay);
  }
}
async function flushBackupNow() {
  if (pendingBackupTimer) {
    clearTimeout(pendingBackupTimer);
    pendingBackupTimer = null;
  }
  if (pendingBackupData != null) {
    await writeBackupNow();
  }
}
let mainWindow = null;
let traySettings = { ...defaultTraySettings };
let isQuitting = false;
let showWindowShortcut = process.platform === "darwin" ? "Command+Shift+K" : "Ctrl+Shift+K";
async function loadShortcutSettings() {
  try {
    await initStore();
    const saved = store?.get("showWindowShortcut");
    if (saved) {
      showWindowShortcut = saved;
    }
  } catch (error) {
    console.error("[Shortcut] Failed to load shortcut settings:", error);
  }
}
async function saveShortcutSettings() {
  try {
    await initStore();
    store?.set("showWindowShortcut", showWindowShortcut);
  } catch (error) {
    console.error("[Shortcut] Failed to save shortcut settings:", error);
  }
}
function registerShowWindowShortcut() {
  electron.globalShortcut.unregisterAll();
  if (!showWindowShortcut) return;
  try {
    const success = electron.globalShortcut.register(showWindowShortcut, () => {
      if (mainWindow) {
        if (process.platform === "darwin" && electron.app.dock) {
          electron.app.dock.show();
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    if (success) {
      console.log(`[Shortcut] Registered: ${showWindowShortcut}`);
    } else {
      console.warn(`[Shortcut] Failed to register: ${showWindowShortcut}`);
    }
  } catch (error) {
    console.error("[Shortcut] Error registering shortcut:", error);
  }
}
let currentProxyAccount = null;
let allAccounts = [];
async function loadTraySettings() {
  try {
    await initStore();
    const saved = store?.get("traySettings");
    if (saved) {
      traySettings = { ...defaultTraySettings, ...saved };
    }
  } catch (error) {
    console.error("[Tray] Failed to load tray settings:", error);
  }
}
async function saveTraySettings() {
  try {
    await initStore();
    store?.set("traySettings", traySettings);
  } catch (error) {
    console.error("[Tray] Failed to save tray settings:", error);
  }
}
function initTray() {
  if (!traySettings.enabled) return;
  createTray({
    onShowWindow: () => {
      if (mainWindow) {
        if (process.platform === "darwin" && electron.app.dock) {
          electron.app.dock.show();
        }
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    onQuit: () => {
      isQuitting = true;
      electron.app.quit();
    },
    onRefreshAccount: async () => {
      mainWindow?.webContents.send("tray-refresh-account");
    },
    onSwitchAccount: async () => {
      mainWindow?.webContents.send("tray-switch-account");
    },
    onToggleProxy: async () => {
      const server = initProxyServer();
      if (server.isRunning()) {
        server.stop();
      } else {
        await server.start();
      }
      updateTrayMenu();
    },
    getProxyStatus: () => {
      const server = initProxyServer();
      return {
        running: server.isRunning(),
        port: server.getConfig().port
      };
    },
    getCurrentAccount: () => currentProxyAccount,
    getAccountList: () => allAccounts,
    getProxyStats: () => {
      const server = initProxyServer();
      const stats = server.getStats();
      return {
        totalRequests: stats.totalRequests,
        successRequests: stats.successRequests,
        failedRequests: stats.failedRequests
      };
    },
    getSessionStats: () => {
      const server = initProxyServer();
      return server.getSessionStats();
    }
  });
  setTrayTooltip(`Kiro 账号管理器 v${electron.app.getVersion()}`);
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    title: `Kiro 账号管理器 v${electron.app.getVersion()}`,
    width: 1200,
    // 刚好容纳 3 列卡片 (340*3 + 16*2 + 边距)
    height: 1100,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.setTitle(`Kiro 账号管理器 v${electron.app.getVersion()}`);
    mainWindow?.show();
    setTimeout(async () => {
      try {
        await initStore();
        if (!store) return;
        const savedProxyConfig = store.get("proxyConfig");
        if (!savedProxyConfig?.autoStart) return;
        console.log("[ProxyServer] Auto-starting proxy server...");
        const server = initProxyServer();
        server.updateConfig(savedProxyConfig);
        const syncAccountsToPool = () => {
          const accountData = store.get("accountData");
          const proxyAccounts = getStoredAccountsForProxy(accountData);
          if (proxyAccounts.length > 0) {
            const pool = server.getAccountPool();
            pool.clear();
            proxyAccounts.forEach((acc) => pool.addAccount(acc));
          }
          return proxyAccounts.length;
        };
        let syncedCount = syncAccountsToPool();
        if (syncedCount > 0) {
          console.log("[ProxyServer] Auto-synced", syncedCount, "accounts");
        } else {
          console.log("[ProxyServer] No accounts found on initial sync, will retry...");
          const retrySync = (attempt) => {
            setTimeout(() => {
              const count = syncAccountsToPool();
              if (count > 0) {
                console.log(`[ProxyServer] Retry #${attempt}: synced ${count} accounts`);
              } else if (attempt < 5) {
                retrySync(attempt + 1);
              } else {
                console.log(
                  "[ProxyServer] All retry attempts exhausted, no accounts available. Accounts will sync when UI loads."
                );
              }
            }, attempt * 2e3);
          };
          retrySync(1);
        }
        await server.start();
        console.log(
          "[ProxyServer] Auto-started successfully on port",
          savedProxyConfig.port || 5580
        );
      } catch (error) {
        console.error("[ProxyServer] Auto-start failed:", error);
      }
      try {
        const savedKProxyConfig = store?.get("kproxyConfig");
        if (savedKProxyConfig?.autoStart) {
          console.log("[KProxy] Auto-starting K-Proxy MITM...");
          const service = initKProxyService(savedKProxyConfig, {
            onRequest: (info) => {
              mainWindow?.webContents.send("kproxy-request", info);
            },
            onResponse: (info) => {
              mainWindow?.webContents.send("kproxy-response", info);
            },
            onError: (error) => {
              console.error("[KProxy] Error:", error);
              mainWindow?.webContents.send("kproxy-error", error.message);
            },
            onStatusChange: (running, port) => {
              mainWindow?.webContents.send("kproxy-status-change", { running, port });
            },
            onMitmIntercept: (host, modified) => {
              mainWindow?.webContents.send("kproxy-mitm", { host, modified });
            }
          });
          await service.initialize();
          await service.start();
          console.log("[KProxy] Auto-started successfully");
        }
      } catch (error) {
        console.error("[KProxy] Auto-start failed:", error);
      }
    }, 1e3);
  });
  mainWindow.on("close", (event) => {
    if (traySettings.enabled && !isQuitting) {
      if (traySettings.closeAction === "minimize") {
        event.preventDefault();
        mainWindow?.hide();
        if (process.platform === "darwin" && electron.app.dock) {
          electron.app.dock.hide();
        }
        return;
      } else if (traySettings.closeAction === "ask" && mainWindow) {
        event.preventDefault();
        mainWindow.webContents.send("show-close-confirm-dialog");
        return;
      }
    }
    if (lastSavedData && store) {
      try {
        console.log("[Window] Saving data before close...");
        store.set("accountData", lastSavedData);
        createBackup(lastSavedData).then(() => {
          console.log("[Window] Backup created");
        }).catch((err) => {
          console.error("[Window] Backup failed:", err);
        });
        console.log("[Window] Data saved successfully");
      } catch (error) {
        console.error("[Window] Failed to save data:", error);
      }
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function registerProtocol() {
  unregisterProtocol();
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      electron.app.setAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [path.join(process.argv[1])]);
    }
  } else {
    electron.app.setAsDefaultProtocolClient(PROTOCOL_PREFIX);
  }
  console.log(`[Protocol] Registered ${PROTOCOL_PREFIX}:// protocol`);
}
function unregisterProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      electron.app.removeAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [path.join(process.argv[1])]);
    }
  } else {
    electron.app.removeAsDefaultProtocolClient(PROTOCOL_PREFIX);
  }
  console.log(`[Protocol] Unregistered ${PROTOCOL_PREFIX}:// protocol`);
}
function handleProtocolUrl(url2) {
  if (!url2.startsWith(`${PROTOCOL_PREFIX}://`)) return;
  try {
    const urlObj = new URL(url2);
    const pathname = urlObj.pathname.replace(/^\/+/, "");
    if (pathname === "auth/callback" || urlObj.host === "auth") {
      const code = urlObj.searchParams.get("code");
      const state = urlObj.searchParams.get("state");
      if (code && state && mainWindow) {
        mainWindow.webContents.send("auth-callback", { code, state });
        mainWindow.focus();
      }
    }
  } catch (error) {
    console.error("Failed to parse protocol URL:", error);
  }
}
electron.app.whenReady().then(async () => {
  proxyLogStore.initialize(electron.app.getPath("userData"));
  interceptConsole();
  registerProtocol();
  await loadTraySettings();
  initTray();
  scheduleNextRegistration();
  if (!utils.is.dev) {
    setupAutoUpdater();
    setTimeout(() => {
      electronUpdater.autoUpdater.checkForUpdates().catch(console.error);
    }, 3e3);
  }
  utils.electronApp.setAppUserModelId("com.kiro.account-manager");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.on("open-external", (_event, url2, usePrivateMode) => {
    if (typeof url2 === "string" && (url2.startsWith("http://") || url2.startsWith("https://"))) {
      if (usePrivateMode) {
        openBrowserInPrivateMode(url2);
      } else {
        electron.shell.openExternal(url2);
      }
    }
  });
  registerIPCHandlers(() => mainWindow);
  electron.ipcMain.handle("get-tray-settings", () => {
    return traySettings;
  });
  electron.ipcMain.handle("get-show-window-shortcut", () => {
    return showWindowShortcut;
  });
  electron.ipcMain.handle("set-show-window-shortcut", async (_event, shortcut) => {
    try {
      showWindowShortcut = shortcut;
      await saveShortcutSettings();
      registerShowWindowShortcut();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("save-tray-settings", async (_event, settings) => {
    try {
      traySettings = { ...traySettings, ...settings };
      await saveTraySettings();
      if (settings.enabled !== void 0) {
        if (settings.enabled) {
          initTray();
        } else {
          destroyTray();
        }
      }
      return { success: true };
    } catch (error) {
      console.error("[Tray] Failed to save settings:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
  electron.ipcMain.on("update-tray-account", (_event, account) => {
    currentProxyAccount = account;
    updateCurrentAccount(account);
    if (account) {
      setTrayTooltip(`Kiro 账号管理器
当前账户: ${account.email}`);
    } else {
      setTrayTooltip(`Kiro 账号管理器 v${electron.app.getVersion()}`);
    }
  });
  electron.ipcMain.on("update-tray-account-list", (_event, accounts) => {
    allAccounts = accounts;
    updateAccountList(accounts);
  });
  electron.ipcMain.on("refresh-tray-menu", () => {
    updateTrayMenu();
  });
  electron.ipcMain.on("update-tray-language", (_event, language) => {
    updateTrayLanguage(language);
  });
  electron.ipcMain.on(
    "close-confirm-response",
    (_event, action, rememberChoice) => {
      if (action === "minimize") {
        mainWindow?.hide();
        if (process.platform === "darwin" && electron.app.dock) {
          electron.app.dock.hide();
        }
      } else if (action === "quit") {
        if (rememberChoice) {
          traySettings.closeAction = "quit";
          saveTraySettings();
        }
        isQuitting = true;
        electron.app.quit();
      }
      if (action === "minimize" && rememberChoice) {
        traySettings.closeAction = "minimize";
        saveTraySettings();
      }
    }
  );
  electron.ipcMain.handle(
    "registration-generate-colab-proxy",
    async (_event, config) => {
      try {
        console.log("[Registration] Manual Colab proxy generation requested");
        const proxyUrl = await generateColabProxyWithTimeout({
          ...config,
          onLog: (message) => mainWindow?.webContents.send("registration-log", {
            message
          })
        });
        console.log(`[Registration] Manual Colab proxy generated: ${proxyUrl}`);
        return { success: true, proxyUrl };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[Registration] Manual Colab proxy generation failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }
  );
  electron.ipcMain.handle("registration-get-auto-replacement-config", async () => {
    try {
      await initStore();
      return store?.get("registrationAutoReplacement") || {};
    } catch {
      return {};
    }
  });
  electron.ipcMain.handle(
    "registration-save-auto-replacement-config",
    async (_event, config) => {
      try {
        await initStore();
        const existing = store?.get("registrationAutoReplacement") || {};
        const merged = { ...existing, ...config };
        store?.set("registrationAutoReplacement", merged);
        scheduleNextRegistration();
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
  electron.ipcMain.handle("get-app-version", () => {
    return electron.app.getVersion();
  });
  electron.ipcMain.handle("check-for-updates", async () => {
    if (utils.is.dev) {
      return { hasUpdate: false, message: "开发环境不支持更新检查" };
    }
    try {
      const result = await electronUpdater.autoUpdater.checkForUpdates();
      return {
        hasUpdate: !!result?.updateInfo,
        version: result?.updateInfo?.version,
        releaseDate: result?.updateInfo?.releaseDate
      };
    } catch (error) {
      console.error("[AutoUpdater] Check failed:", error);
      return { hasUpdate: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("download-update", async () => {
    if (utils.is.dev) {
      return { success: false, message: "开发环境不支持更新" };
    }
    try {
      await electronUpdater.autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error("[AutoUpdater] Download failed:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("install-update", () => {
    electronUpdater.autoUpdater.quitAndInstall(false, true);
  });
  const GITHUB_REPO = "chaogei/Kiro-account-manager";
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  electron.ipcMain.handle("check-for-updates-manual", async () => {
    try {
      console.log("[Update] Manual check via GitHub API...");
      const currentVersion = electron.app.getVersion();
      const response = await fetchWithAppProxy(GITHUB_API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Kiro-Account-Manager"
        }
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("GitHub API 请求次数超限，请稍后再试");
        } else if (response.status === 404) {
          throw new Error("未找到发布版本");
        }
        throw new Error(`GitHub API 错误: ${response.status}`);
      }
      const release = await response.json();
      const latestVersion = release.tag_name.replace(/^v/, "");
      const compareVersions = (v1, v2) => {
        const parts1 = v1.split(".").map(Number);
        const parts2 = v2.split(".").map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
          const p1 = parts1[i] || 0;
          const p2 = parts2[i] || 0;
          if (p1 > p2) return 1;
          if (p1 < p2) return -1;
        }
        return 0;
      };
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
      console.log(
        `[Update] Current: ${currentVersion}, Latest: ${latestVersion}, HasUpdate: ${hasUpdate}`
      );
      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseNotes: release.body || "",
        releaseName: release.name || `v${latestVersion}`,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        assets: release.assets.map((a) => ({
          name: a.name,
          downloadUrl: a.browser_download_url,
          size: a.size
        }))
      };
    } catch (error) {
      console.error("[Update] Manual check failed:", error);
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : "检查更新失败"
      };
    }
  });
  electron.ipcMain.handle(
    "diagnose:run",
    async (_event, params) => {
      const { proxyUrl, targets } = params || {};
      const agent = proxyUrl ? safeCreateProxyAgent(proxyUrl) : void 0;
      const results = await Promise.all(
        (targets || []).map(async (t) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), t.timeoutMs ?? 8e3);
          const start = Date.now();
          try {
            const init = {
              method: "GET",
              signal: controller.signal,
              headers: { "User-Agent": "KiroAccountManager-Diagnose/1.0" }
            };
            if (agent) init.dispatcher = agent;
            const resp = await undici.fetch(t.url, init);
            const latencyMs = Date.now() - start;
            const expected = t.expectStatus;
            const ok = expected ? expected.includes(resp.status) : resp.status >= 200 && resp.status < 400;
            return {
              id: t.id,
              label: t.label,
              url: t.url,
              success: ok,
              httpStatus: resp.status,
              latencyMs,
              error: ok ? void 0 : `HTTP ${resp.status}`
            };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            return {
              id: t.id,
              label: t.label,
              url: t.url,
              success: false,
              latencyMs: Date.now() - start,
              error: controller.signal.aborted ? "超时" : errMsg
            };
          } finally {
            clearTimeout(timer);
          }
        })
      );
      return { results };
    }
  );
  electron.ipcMain.handle(
    "proxy-pool:validate",
    async (_event, params) => {
      const { url: url2, testUrl = "https://api.ipify.org?format=json", timeoutMs = 8e3 } = params || {};
      if (!url2) {
        return { success: false, error: "Missing proxy URL" };
      }
      const agent = safeCreateProxyAgent(url2);
      if (!agent) {
        return {
          success: false,
          error: "代理协议不支持（仅支持 http/https）或 URL 无效"
        };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      try {
        const resp = await undici.fetch(testUrl, {
          method: "GET",
          dispatcher: agent,
          signal: controller.signal,
          headers: { "User-Agent": "KiroAccountManager-ProxyValidator/1.0" }
        });
        const latencyMs = Date.now() - start;
        if (resp.status >= 200 && resp.status < 400) {
          let externalIp;
          try {
            const ct = resp.headers.get("content-type") || "";
            if (ct.includes("json")) {
              const body = await resp.json();
              externalIp = body.ip || body.query;
            } else {
              const text = await resp.text();
              const m = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
              if (m) externalIp = m[0];
            }
          } catch {
          }
          return { success: true, latencyMs, externalIp };
        }
        return { success: false, latencyMs, error: `HTTP ${resp.status}` };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isAbort = controller.signal.aborted;
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: isAbort ? `请求超时 (${timeoutMs}ms)` : errMsg
        };
      } finally {
        clearTimeout(timer);
      }
    }
  );
  electron.ipcMain.handle(
    "account-set-proxy-binding",
    async (_event, accountId, proxyUrl) => {
      try {
        if (!accountId) return { success: false };
        if (proxyServer) {
          const pool = proxyServer.getAccountPool();
          const acc = pool.getAccount(accountId);
          if (acc) {
            acc.proxyUrl = proxyUrl || void 0;
            console.log(
              `[ProxyServer] Account ${acc.email || accountId.slice(0, 8)} proxy ${proxyUrl ? `bound to ${proxyUrl.replace(/:([^:@/]+)@/, ":***@")}` : "unbound"}`
            );
          }
        }
        return { success: true };
      } catch (err) {
        console.error("[account-set-proxy-binding] error:", err);
        return { success: false };
      }
    }
  );
  electron.ipcMain.handle(
    "diagnose:http-probe",
    async (_event, params) => {
      const { url: url2, method = "GET", timeoutMs = 5e3 } = params || {};
      if (!url2) return { success: false, error: "Missing url" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      try {
        const resp = await fetchWithAppProxy(url2, {
          method,
          signal: controller.signal,
          headers: { "User-Agent": "KiroAccountManager-Diagnose/1.0" }
        });
        const latencyMs = Date.now() - start;
        return { success: resp.ok, latencyMs, status: resp.status };
      } catch (err) {
        const isAbort = controller.signal.aborted;
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: isAbort ? `Timeout (${timeoutMs}ms)` : err instanceof Error ? err.message : String(err)
        };
      } finally {
        clearTimeout(timer);
      }
    }
  );
  electron.ipcMain.handle("load-accounts", async () => {
    try {
      await initStore();
      return store.get("accountData", null);
    } catch (error) {
      console.error("Failed to load accounts:", error);
      return null;
    }
  });
  electron.ipcMain.handle("save-accounts", async (_event, data) => {
    try {
      await initStore();
      store.set("accountData", data);
      lastSavedData = data;
      await createBackup(data);
    } catch (error) {
      console.error("Failed to save accounts:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("refresh-account-token", async (_event, account) => {
    try {
      const { refreshToken, clientId, clientSecret, region, authMethod } = account.credentials || {};
      if (!refreshToken) {
        return { success: false, error: { message: "缺少 Refresh Token" } };
      }
      if (authMethod !== "social" && (!clientId || !clientSecret)) {
        return { success: false, error: { message: "缺少 OIDC 刷新凭证 (clientId/clientSecret)" } };
      }
      const boundProxyUrl = proxyServer ? proxyServer.getAccountPool().getAccount(account.id || "")?.proxyUrl : void 0;
      console.log(
        `[IPC] Refreshing token (authMethod: ${authMethod || "IdC"})...${boundProxyUrl ? " [via bound proxy]" : ""}`
      );
      const refreshResult = await refreshTokenByMethod(
        refreshToken,
        clientId || "",
        clientSecret || "",
        region || "us-east-1",
        authMethod,
        boundProxyUrl
      );
      if (!refreshResult.success || !refreshResult.accessToken) {
        return { success: false, error: { message: refreshResult.error || "Token 刷新失败" } };
      }
      return {
        success: true,
        data: {
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken || refreshToken,
          expiresIn: refreshResult.expiresIn ?? 3600
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      };
    }
  });
  electron.ipcMain.handle(
    "import-from-sso-token",
    async (_event, bearerToken, region = "us-east-1") => {
      console.log("[IPC] import-from-sso-token called");
      try {
        const ssoResult = await ssoDeviceAuth(bearerToken, region);
        if (!ssoResult.success || !ssoResult.accessToken) {
          return { success: false, error: { message: ssoResult.error || "SSO 授权失败" } };
        }
        let userInfo;
        let usageData;
        try {
          console.log("[SSO] Fetching user info and usage data...");
          const [userInfoResult, usageResult] = await Promise.all([
            getUserInfo(ssoResult.accessToken).catch((e) => {
              console.error("[SSO] getUserInfo failed:", e);
              return void 0;
            }),
            getUsageAndLimits(
              ssoResult.accessToken,
              "BuilderId",
              void 0,
              void 0,
              region
            ).catch((e) => {
              console.error("[SSO] getUsageAndLimits failed:", e);
              return void 0;
            })
          ]);
          userInfo = userInfoResult;
          usageData = usageResult;
          console.log("[SSO] userInfo:", userInfo?.email);
          console.log("[SSO] usageData:", usageData?.subscriptionInfo?.subscriptionTitle);
        } catch (e) {
          console.error("[IPC] API calls failed:", e);
        }
        const creditUsage = usageData?.usageBreakdownList?.find((b) => b.resourceType === "CREDIT");
        const subscriptionTitle = usageData?.subscriptionInfo?.subscriptionTitle || "KIRO";
        let subscriptionType = "Free";
        const titleUpper = subscriptionTitle.toUpperCase();
        if (titleUpper.includes("PRO+") || titleUpper.includes("PRO_PLUS") || titleUpper.includes("PROPLUS")) {
          subscriptionType = "Pro_Plus";
        } else if (titleUpper.includes("POWER")) {
          subscriptionType = "Enterprise";
        } else if (titleUpper.includes("PRO")) {
          subscriptionType = "Pro";
        } else if (titleUpper.includes("ENTERPRISE")) {
          subscriptionType = "Enterprise";
        } else if (titleUpper.includes("TEAMS")) {
          subscriptionType = "Teams";
        }
        const baseLimit = creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit ?? 0;
        const baseCurrent = creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage ?? 0;
        let freeTrialLimit = 0, freeTrialCurrent = 0, freeTrialExpiry;
        if (creditUsage?.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
          freeTrialLimit = creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit ?? 0;
          freeTrialCurrent = creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage ?? 0;
          freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry;
        }
        const bonuses = (creditUsage?.bonuses || []).map((b) => ({
          code: b.bonusCode || "",
          name: b.displayName || "",
          current: b.currentUsageWithPrecision ?? b.currentUsage ?? 0,
          limit: b.usageLimitWithPrecision ?? b.usageLimit ?? 0,
          expiresAt: b.expiresAt
        }));
        const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((s, b) => s + b.limit, 0);
        const totalCurrent = baseCurrent + freeTrialCurrent + bonuses.reduce((s, b) => s + b.current, 0);
        return {
          success: true,
          data: {
            accessToken: ssoResult.accessToken,
            refreshToken: ssoResult.refreshToken,
            clientId: ssoResult.clientId,
            clientSecret: ssoResult.clientSecret,
            region: ssoResult.region,
            expiresIn: ssoResult.expiresIn,
            email: usageData?.userInfo?.email || userInfo?.email,
            userId: usageData?.userInfo?.userId || userInfo?.userId,
            idp: userInfo?.idp || "BuilderId",
            status: userInfo?.status,
            subscriptionType,
            subscriptionTitle,
            subscription: {
              managementTarget: usageData?.subscriptionInfo?.subscriptionManagementTarget,
              upgradeCapability: usageData?.subscriptionInfo?.upgradeCapability,
              overageCapability: usageData?.subscriptionInfo?.overageCapability
            },
            usage: {
              current: totalCurrent,
              limit: totalLimit,
              baseLimit,
              baseCurrent,
              freeTrialLimit,
              freeTrialCurrent,
              freeTrialExpiry,
              bonuses,
              nextResetDate: usageData?.nextDateReset,
              resourceDetail: creditUsage ? {
                displayName: creditUsage.displayName,
                displayNamePlural: creditUsage.displayNamePlural,
                resourceType: creditUsage.resourceType,
                currency: creditUsage.currency,
                unit: creditUsage.unit,
                overageRate: creditUsage.overageRate,
                overageCap: creditUsage.overageCap,
                overageEnabled: usageData?.overageConfiguration?.overageStatus === "ENABLED" || usageData?.overageConfiguration?.overageEnabled === true
              } : void 0
            },
            daysRemaining: usageData?.nextDateReset ? Math.max(
              0,
              Math.ceil((new Date(usageData.nextDateReset).getTime() - Date.now()) / 864e5)
            ) : void 0
          }
        };
      } catch (error) {
        console.error("[IPC] import-from-sso-token error:", error);
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : "Unknown error" }
        };
      }
    }
  );
  electron.ipcMain.handle("check-account-status", async (_event, account) => {
    console.log(`[IPC] check-account-status [${account?.email || "unknown"}]`);
    const parseUsageResponse = (result, newCredentials, userInfo) => {
      console.log(`[Kiro API] Usage [${account?.email || userInfo?.email || "unknown"}]`, result);
      const creditUsage = result.usageBreakdownList?.find(
        (b) => b.resourceType === "CREDIT" || b.displayName === "Credits"
      );
      const baseLimit = creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit ?? 0;
      const baseCurrent = creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage ?? 0;
      let freeTrialLimit = 0;
      let freeTrialCurrent = 0;
      let freeTrialExpiry;
      if (creditUsage?.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
        freeTrialLimit = creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit ?? 0;
        freeTrialCurrent = creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage ?? 0;
        freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry;
      }
      const bonusesData = [];
      if (creditUsage?.bonuses) {
        for (const bonus of creditUsage.bonuses) {
          if (bonus.status === "ACTIVE") {
            bonusesData.push({
              code: bonus.bonusCode || "",
              name: bonus.displayName || "",
              current: bonus.currentUsageWithPrecision ?? bonus.currentUsage ?? 0,
              limit: bonus.usageLimitWithPrecision ?? bonus.usageLimit ?? 0,
              expiresAt: bonus.expiresAt
            });
          }
        }
      }
      const totalLimit = baseLimit + freeTrialLimit + bonusesData.reduce((sum, b) => sum + b.limit, 0);
      const totalUsed = baseCurrent + freeTrialCurrent + bonusesData.reduce((sum, b) => sum + b.current, 0);
      const nextResetDate = result.nextDateReset;
      const subscriptionTitle = result.subscriptionInfo?.subscriptionTitle ?? "Free";
      let subscriptionType = account.subscription?.type ?? "Free";
      if (subscriptionTitle.toUpperCase().includes("PRO")) {
        subscriptionType = "Pro";
      } else if (subscriptionTitle.toUpperCase().includes("ENTERPRISE")) {
        subscriptionType = "Enterprise";
      } else if (subscriptionTitle.toUpperCase().includes("TEAMS")) {
        subscriptionType = "Teams";
      }
      let expiresAt;
      let daysRemaining;
      if (result.nextDateReset) {
        expiresAt = new Date(result.nextDateReset).getTime();
        const now = Date.now();
        daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1e3 * 60 * 60 * 24)));
      }
      const resourceDetail = creditUsage ? {
        resourceType: creditUsage.resourceType,
        displayName: creditUsage.displayName,
        displayNamePlural: creditUsage.displayNamePlural,
        currency: creditUsage.currency,
        unit: creditUsage.unit,
        overageRate: creditUsage.overageRate,
        overageCap: creditUsage.overageCap,
        overageEnabled: result.overageConfiguration?.overageStatus === "ENABLED" || result.overageConfiguration?.overageEnabled === true
      } : void 0;
      return {
        success: true,
        data: {
          status: !userInfo?.status || userInfo.status === "Active" || userInfo.status === "Stale" ? "active" : "error",
          email: result.userInfo?.email,
          userId: result.userInfo?.userId,
          idp: userInfo?.idp,
          userStatus: userInfo?.status,
          featureFlags: userInfo?.featureFlags,
          subscriptionTitle,
          usage: {
            current: totalUsed,
            limit: totalLimit,
            percentUsed: totalLimit > 0 ? totalUsed / totalLimit : 0,
            lastUpdated: Date.now(),
            baseLimit,
            baseCurrent,
            freeTrialLimit,
            freeTrialCurrent,
            freeTrialExpiry,
            bonuses: bonusesData,
            nextResetDate,
            resourceDetail
          },
          subscription: {
            type: subscriptionType,
            title: subscriptionTitle,
            rawType: result.subscriptionInfo?.type,
            expiresAt,
            daysRemaining,
            upgradeCapability: result.subscriptionInfo?.upgradeCapability,
            overageCapability: result.subscriptionInfo?.overageCapability,
            managementTarget: result.subscriptionInfo?.subscriptionManagementTarget
          },
          // 如果刷新了 token，返回新的凭证
          newCredentials: newCredentials ? {
            accessToken: newCredentials.accessToken,
            refreshToken: newCredentials.refreshToken,
            expiresAt: newCredentials.expiresIn ? Date.now() + newCredentials.expiresIn * 1e3 : void 0
          } : void 0
        }
      };
    };
    try {
      const { accessToken, refreshToken, clientId, clientSecret, region, authMethod, provider } = account.credentials || {};
      let idp = "BuilderId";
      if (authMethod === "social") {
        idp = provider || account.idp || "BuilderId";
      } else if (provider) {
        idp = provider;
      }
      if (!accessToken) {
        console.log("[IPC] Missing accessToken");
        return { success: false, error: { message: "缺少 accessToken" } };
      }
      const accountMachineId = account?.machineId;
      const boundProxyUrl = proxyServer ? proxyServer.getAccountPool().getAccount(account.id || "")?.proxyUrl : void 0;
      try {
        const [userInfoResult, usageResult] = await Promise.all([
          getUserInfo(accessToken, idp, accountMachineId, account?.email).catch((err) => {
            if (isSuspendedAccountError(err)) {
              throw err;
            }
            return void 0;
          }),
          getUsageAndLimits(accessToken, idp, void 0, accountMachineId, region, account?.email)
        ]);
        return parseUsageResponse(usageResult, void 0, userInfoResult);
      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : "";
        if (isSuspendedAccountError(errorMsg)) {
          console.log("[IPC] Account suspended/banned");
          return {
            success: false,
            error: { message: errorMsg, isBanned: true }
          };
        }
        const canRefresh = refreshToken && (authMethod === "social" || clientId && clientSecret);
        if (errorMsg.includes("401") && canRefresh) {
          console.log(
            `[IPC] Token expired, attempting to refresh (authMethod: ${authMethod || "IdC"})...`
          );
          const refreshResult = await refreshTokenByMethod(
            refreshToken,
            clientId || "",
            clientSecret || "",
            region || "us-east-1",
            authMethod,
            boundProxyUrl
          );
          if (refreshResult.success && refreshResult.accessToken) {
            console.log("[IPC] Token refreshed, retrying API call...");
            const [userInfoResult, usageResult] = await Promise.all([
              getUserInfo(refreshResult.accessToken, idp, accountMachineId).catch((err) => {
                if (isSuspendedAccountError(err)) {
                  throw err;
                }
                return void 0;
              }),
              getUsageAndLimits(refreshResult.accessToken, idp, void 0, accountMachineId, region)
            ]);
            return parseUsageResponse(
              usageResult,
              {
                accessToken: refreshResult.accessToken,
                refreshToken: refreshResult.refreshToken,
                expiresIn: refreshResult.expiresIn
              },
              userInfoResult
            );
          } else {
            console.error("[IPC] Token refresh failed:", refreshResult.error);
            return {
              success: false,
              error: { message: `Token 过期且刷新失败: ${refreshResult.error}` }
            };
          }
        }
        throw apiError;
      }
    } catch (error) {
      console.error("check-account-status error:", error);
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      };
    }
  });
  electron.ipcMain.handle(
    "background-batch-refresh",
    async (_event, accounts, concurrency = 10, syncInfo = true) => {
      console.log(
        `[BackgroundRefresh] Starting batch refresh for ${accounts.length} accounts, concurrency: ${concurrency}, syncInfo: ${syncInfo}`
      );
      let completed = 0;
      let success = 0;
      let failed = 0;
      for (let i = 0; i < accounts.length; i += concurrency) {
        const batch = accounts.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(async (account) => {
            try {
              const {
                refreshToken,
                clientId,
                clientSecret,
                region,
                authMethod,
                accessToken,
                provider
              } = account.credentials;
              const needsTokenRefresh = account.needsTokenRefresh !== false;
              let idp = "BuilderId";
              if (authMethod === "social") {
                idp = provider || account.idp || "BuilderId";
              } else if (provider) {
                idp = provider;
              }
              let newAccessToken = accessToken;
              let newRefreshToken = refreshToken;
              let newExpiresIn;
              if (needsTokenRefresh) {
                if (!refreshToken) {
                  failed++;
                  completed++;
                  return;
                }
                const refreshResult = await refreshTokenByMethod(
                  refreshToken,
                  clientId || "",
                  clientSecret || "",
                  region || "us-east-1",
                  authMethod
                );
                if (!refreshResult.success) {
                  failed++;
                  completed++;
                  mainWindow?.webContents.send("background-refresh-result", {
                    id: account.id,
                    success: false,
                    error: refreshResult.error
                  });
                  return;
                }
                newAccessToken = refreshResult.accessToken || accessToken;
                newRefreshToken = refreshResult.refreshToken || refreshToken;
                newExpiresIn = refreshResult.expiresIn;
              }
              if (!newAccessToken) {
                failed++;
                completed++;
                return;
              }
              let parsedUsage;
              let userInfoData;
              let subscriptionData;
              let status = "active";
              let errorMessage;
              if (syncInfo) {
                try {
                  console.log(
                    `[BackgroundRefresh] Account ${account.id} machineId: ${account.machineId || "undefined"}`
                  );
                  const rawUsage = await getUsageAndLimits(
                    newAccessToken,
                    idp,
                    void 0,
                    account.machineId,
                    region
                  );
                  const creditUsage = rawUsage.usageBreakdownList?.find(
                    (b) => b.resourceType === "CREDIT"
                  );
                  const baseCurrent = creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage ?? 0;
                  const baseLimit = creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit ?? 0;
                  let freeTrialCurrent = 0;
                  let freeTrialLimit = 0;
                  let freeTrialExpiry;
                  if (creditUsage?.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
                    freeTrialCurrent = creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage ?? 0;
                    freeTrialLimit = creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit ?? 0;
                    freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry;
                  }
                  const bonuses = [];
                  if (creditUsage?.bonuses) {
                    for (const bonus of creditUsage.bonuses) {
                      if (bonus.status === "ACTIVE") {
                        bonuses.push({
                          code: bonus.bonusCode || "",
                          name: bonus.displayName || "",
                          current: bonus.currentUsageWithPrecision ?? bonus.currentUsage ?? 0,
                          limit: bonus.usageLimitWithPrecision ?? bonus.usageLimit ?? 0,
                          expiresAt: bonus.expiresAt
                        });
                      }
                    }
                  }
                  const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((sum, b) => sum + b.limit, 0);
                  const totalCurrent = baseCurrent + freeTrialCurrent + bonuses.reduce((sum, b) => sum + b.current, 0);
                  parsedUsage = {
                    current: totalCurrent,
                    limit: totalLimit,
                    baseCurrent,
                    baseLimit,
                    freeTrialCurrent,
                    freeTrialLimit,
                    freeTrialExpiry,
                    bonuses,
                    nextResetDate: rawUsage.nextDateReset,
                    resourceDetail: creditUsage ? {
                      displayName: creditUsage.displayName,
                      displayNamePlural: creditUsage.displayNamePlural,
                      resourceType: creditUsage.resourceType,
                      currency: creditUsage.currency,
                      unit: creditUsage.unit,
                      overageRate: creditUsage.overageRate,
                      overageCap: creditUsage.overageCap,
                      overageEnabled: rawUsage.overageConfiguration?.overageStatus === "ENABLED" || rawUsage.overageConfiguration?.overageEnabled === true
                    } : void 0
                  };
                  const subscriptionTitle = rawUsage.subscriptionInfo?.subscriptionTitle || "Free";
                  let subscriptionType = "Free";
                  const titleUpper = subscriptionTitle.toUpperCase();
                  if (titleUpper.includes("PRO+") || titleUpper.includes("PRO_PLUS") || titleUpper.includes("PROPLUS")) {
                    subscriptionType = "Pro_Plus";
                  } else if (titleUpper.includes("POWER")) {
                    subscriptionType = "Enterprise";
                  } else if (titleUpper.includes("PRO")) {
                    subscriptionType = "Pro";
                  } else if (titleUpper.includes("ENTERPRISE")) {
                    subscriptionType = "Enterprise";
                  } else if (titleUpper.includes("TEAMS")) {
                    subscriptionType = "Teams";
                  }
                  let daysRemaining;
                  let expiresAt;
                  if (rawUsage.nextDateReset) {
                    expiresAt = new Date(rawUsage.nextDateReset).getTime();
                    daysRemaining = Math.max(
                      0,
                      Math.ceil((expiresAt - Date.now()) / (1e3 * 60 * 60 * 24))
                    );
                  }
                  subscriptionData = {
                    type: subscriptionType,
                    title: subscriptionTitle,
                    daysRemaining,
                    expiresAt,
                    overageCapability: rawUsage.subscriptionInfo?.overageCapability,
                    upgradeCapability: rawUsage.subscriptionInfo?.upgradeCapability,
                    subscriptionManagementTarget: rawUsage.subscriptionInfo?.subscriptionManagementTarget
                  };
                } catch (apiError) {
                  const errMsg = apiError instanceof Error ? apiError.message : String(apiError);
                  console.log(`[BackgroundRefresh] Usage API error for ${account.id}:`, errMsg);
                  if (isSuspendedAccountError(errMsg)) {
                    status = "error";
                    errorMessage = errMsg;
                  }
                }
                try {
                  userInfoData = await getUserInfo(newAccessToken, idp, account.machineId);
                } catch (apiError) {
                  const errMsg = apiError instanceof Error ? apiError.message : String(apiError);
                  if (isSuspendedAccountError(errMsg)) {
                    status = "error";
                    errorMessage = errMsg;
                  }
                }
              }
              success++;
              completed++;
              mainWindow?.webContents.send("background-refresh-result", {
                id: account.id,
                success: true,
                data: {
                  accessToken: newAccessToken,
                  refreshToken: newRefreshToken,
                  expiresIn: newExpiresIn,
                  usage: parsedUsage,
                  subscription: subscriptionData,
                  userInfo: syncInfo ? userInfoData : void 0,
                  status,
                  errorMessage
                }
              });
            } catch (e) {
              failed++;
              completed++;
              mainWindow?.webContents.send("background-refresh-result", {
                id: account.id,
                success: false,
                error: e instanceof Error ? e.message : "Unknown error"
              });
            }
          })
        );
        mainWindow?.webContents.send("background-refresh-progress", {
          completed,
          total: accounts.length,
          success,
          failed
        });
        if (i + concurrency < accounts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      console.log(`[BackgroundRefresh] Completed: ${success} success, ${failed} failed`);
      return { success: true, completed, successCount: success, failedCount: failed };
    }
  );
  electron.ipcMain.handle(
    "background-batch-check",
    async (_event, accounts, concurrency = 10) => {
      console.log(
        `[BackgroundCheck] Starting batch check for ${accounts.length} accounts, concurrency: ${concurrency}`
      );
      let completed = 0;
      let success = 0;
      let failed = 0;
      for (let i = 0; i < accounts.length; i += concurrency) {
        const batch = accounts.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(async (account) => {
            try {
              const { accessToken, authMethod, provider } = account.credentials;
              if (!accessToken) {
                failed++;
                completed++;
                mainWindow?.webContents.send("background-check-result", {
                  id: account.id,
                  success: false,
                  error: "缺少 accessToken"
                });
                return;
              }
              let idp = account.idp || "BuilderId";
              if (authMethod === "social" && provider) {
                idp = provider;
              }
              const [usageRes, userInfoRes] = await Promise.allSettled([
                getUsageAndLimits(
                  accessToken,
                  idp,
                  void 0,
                  void 0,
                  account.credentials?.region,
                  account.email
                ),
                kiroApiRequest(
                  "GetUserInfo",
                  { origin: "KIRO_IDE" },
                  accessToken,
                  idp,
                  void 0,
                  account.email
                ).catch((err) => {
                  if (isSuspendedAccountError(err)) {
                    throw err;
                  }
                  return null;
                })
              ]);
              let usageData = null;
              let subscriptionData = null;
              let resourceDetail;
              let userInfoData = null;
              let status = "active";
              let errorMessage;
              if (usageRes.status === "fulfilled") {
                const rawUsage = usageRes.value;
                const creditUsage = rawUsage.usageBreakdownList?.find(
                  (b) => b.resourceType === "CREDIT" || b.displayName === "Credits"
                );
                const baseCurrent = creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage ?? 0;
                const baseLimit = creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit ?? 0;
                let freeTrialCurrent = 0;
                let freeTrialLimit = 0;
                let freeTrialExpiry;
                if (creditUsage?.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
                  freeTrialLimit = creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit ?? 0;
                  freeTrialCurrent = creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage ?? 0;
                  freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry;
                }
                const bonuses = [];
                if (creditUsage?.bonuses) {
                  for (const bonus of creditUsage.bonuses) {
                    if (bonus.status === "ACTIVE") {
                      bonuses.push({
                        code: bonus.bonusCode || "",
                        name: bonus.displayName || "",
                        current: bonus.currentUsageWithPrecision ?? bonus.currentUsage ?? 0,
                        limit: bonus.usageLimitWithPrecision ?? bonus.usageLimit ?? 0,
                        expiresAt: bonus.expiresAt
                      });
                    }
                  }
                }
                const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((sum, b) => sum + b.limit, 0);
                const totalCurrent = baseCurrent + freeTrialCurrent + bonuses.reduce((sum, b) => sum + b.current, 0);
                usageData = {
                  current: totalCurrent,
                  limit: totalLimit,
                  baseCurrent,
                  baseLimit,
                  freeTrialCurrent,
                  freeTrialLimit,
                  freeTrialExpiry,
                  bonuses,
                  nextResetDate: rawUsage.nextDateReset
                };
                if (creditUsage) {
                  resourceDetail = {
                    displayName: creditUsage.displayName,
                    displayNamePlural: creditUsage.displayNamePlural,
                    resourceType: creditUsage.resourceType,
                    currency: creditUsage.currency,
                    unit: creditUsage.unit,
                    overageRate: creditUsage.overageRate,
                    overageCap: creditUsage.overageCap,
                    overageEnabled: rawUsage.overageConfiguration?.overageStatus === "ENABLED" || rawUsage.overageConfiguration?.overageEnabled === true
                  };
                }
                const subscriptionTitle = rawUsage.subscriptionInfo?.subscriptionTitle ?? "Free";
                let subscriptionType = "Free";
                const titleUpper = subscriptionTitle.toUpperCase();
                if (titleUpper.includes("PRO+") || titleUpper.includes("PRO_PLUS") || titleUpper.includes("PROPLUS")) {
                  subscriptionType = "Pro_Plus";
                } else if (titleUpper.includes("POWER")) {
                  subscriptionType = "Enterprise";
                } else if (titleUpper.includes("PRO")) {
                  subscriptionType = "Pro";
                } else if (titleUpper.includes("ENTERPRISE")) {
                  subscriptionType = "Enterprise";
                } else if (titleUpper.includes("TEAMS")) {
                  subscriptionType = "Teams";
                }
                let daysRemaining;
                let expiresAt;
                if (rawUsage.nextDateReset) {
                  expiresAt = new Date(rawUsage.nextDateReset).getTime();
                  daysRemaining = Math.max(
                    0,
                    Math.ceil((expiresAt - Date.now()) / (1e3 * 60 * 60 * 24))
                  );
                }
                subscriptionData = {
                  type: subscriptionType,
                  title: subscriptionTitle,
                  daysRemaining,
                  expiresAt,
                  overageCapability: rawUsage.subscriptionInfo?.overageCapability,
                  upgradeCapability: rawUsage.subscriptionInfo?.upgradeCapability,
                  subscriptionManagementTarget: rawUsage.subscriptionInfo?.subscriptionManagementTarget
                };
              } else if (usageRes.status === "rejected") {
                const errorMsg = usageRes.reason?.message || String(usageRes.reason);
                console.log(`[BackgroundCheck] Usage API failed for ${account.email}:`, errorMsg);
                if (isSuspendedAccountError(errorMsg)) {
                  status = "error";
                  errorMessage = errorMsg;
                } else if (errorMsg.includes("401")) {
                  status = "expired";
                  errorMessage = "Token 已过期，请刷新";
                } else {
                  status = "error";
                  errorMessage = errorMsg;
                }
              }
              if (userInfoRes.status === "fulfilled" && userInfoRes.value) {
                const rawUserInfo = userInfoRes.value;
                userInfoData = {
                  email: rawUserInfo.email,
                  userId: rawUserInfo.userId,
                  status: rawUserInfo.status
                };
                if (rawUserInfo.status && rawUserInfo.status !== "Active" && rawUserInfo.status !== "Stale" && status !== "error") {
                  status = "error";
                  errorMessage = `用户状态异常: ${rawUserInfo.status}`;
                }
              } else if (userInfoRes.status === "rejected") {
                const errMsg = userInfoRes.reason?.message || String(userInfoRes.reason);
                if (isSuspendedAccountError(errMsg)) {
                  status = "error";
                  errorMessage = errMsg;
                }
              }
              success++;
              completed++;
              mainWindow?.webContents.send("background-check-result", {
                id: account.id,
                success: true,
                data: {
                  usage: usageData ? { ...usageData, resourceDetail } : null,
                  subscription: subscriptionData,
                  userInfo: userInfoData,
                  status,
                  errorMessage
                }
              });
            } catch (e) {
              failed++;
              completed++;
              mainWindow?.webContents.send("background-check-result", {
                id: account.id,
                success: false,
                error: e instanceof Error ? e.message : "Unknown error"
              });
            }
          })
        );
        mainWindow?.webContents.send("background-check-progress", {
          completed,
          total: accounts.length,
          success,
          failed
        });
        if (i + concurrency < accounts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      console.log(`[BackgroundCheck] Completed: ${success} success, ${failed} failed`);
      return { success: true, completed, successCount: success, failedCount: failed };
    }
  );
  electron.ipcMain.handle("export-to-file", async (_event, data, filename) => {
    try {
      const result = await electron.dialog.showSaveDialog(mainWindow, {
        title: "导出账号数据",
        defaultPath: filename,
        filters: [{ name: "JSON Files", extensions: ["json"] }]
      });
      if (!result.canceled && result.filePath) {
        await promises.writeFile(result.filePath, data, "utf-8");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to export:", error);
      return false;
    }
  });
  electron.ipcMain.handle("import-from-file", async () => {
    try {
      const result = await electron.dialog.showOpenDialog(mainWindow, {
        title: "导入账号数据",
        filters: [
          { name: "所有支持的格式", extensions: ["json", "csv", "txt"] },
          { name: "JSON Files", extensions: ["json"] },
          { name: "CSV Files", extensions: ["csv"] },
          { name: "TXT Files", extensions: ["txt"] }
        ],
        properties: ["openFile"]
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const content = await promises.readFile(filePath, "utf-8");
        const ext = filePath.split(".").pop()?.toLowerCase() || "json";
        return { content, format: ext };
      }
      return null;
    } catch (error) {
      console.error("Failed to import:", error);
      return null;
    }
  });
  electron.ipcMain.handle(
    "verify-account-credentials",
    async (_event, credentials) => {
      console.log("[IPC] verify-account-credentials called");
      try {
        const {
          refreshToken,
          clientId,
          clientSecret,
          region = "us-east-1",
          authMethod,
          provider
        } = credentials;
        const idp = provider && (provider === "Enterprise" || provider === "Github" || provider === "Google") ? provider : "BuilderId";
        if (!refreshToken) {
          return { success: false, error: "请填写 Refresh Token" };
        }
        if (authMethod !== "social" && (!clientId || !clientSecret)) {
          return { success: false, error: "请填写 Client ID 和 Client Secret" };
        }
        console.log(`[Verify] Step 1: Refreshing token (authMethod: ${authMethod || "IdC"})...`);
        const refreshResult = await refreshTokenByMethod(
          refreshToken,
          clientId,
          clientSecret,
          region,
          authMethod
        );
        if (!refreshResult.success || !refreshResult.accessToken) {
          return { success: false, error: `Token 刷新失败: ${refreshResult.error}` };
        }
        console.log("[Verify] Step 2: Getting user info...");
        const usageResult = await getUsageAndLimits(
          refreshResult.accessToken,
          idp,
          void 0,
          void 0,
          region
        );
        const email = usageResult.userInfo?.email || "";
        const userId = usageResult.userInfo?.userId || "";
        const subscriptionTitle = usageResult.subscriptionInfo?.subscriptionTitle || "Free";
        let subscriptionType = "Free";
        const titleUpper = subscriptionTitle.toUpperCase();
        if (titleUpper.includes("PRO+") || titleUpper.includes("PRO_PLUS") || titleUpper.includes("PROPLUS")) {
          subscriptionType = "Pro_Plus";
        } else if (titleUpper.includes("POWER")) {
          subscriptionType = "Enterprise";
        } else if (titleUpper.includes("PRO")) {
          subscriptionType = "Pro";
        } else if (titleUpper.includes("ENTERPRISE")) {
          subscriptionType = "Enterprise";
        } else if (titleUpper.includes("TEAMS")) {
          subscriptionType = "Teams";
        }
        const creditUsage = usageResult.usageBreakdownList?.find((b) => b.resourceType === "CREDIT");
        const baseLimit = creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit ?? 0;
        const baseCurrent = creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage ?? 0;
        let freeTrialLimit = 0;
        let freeTrialCurrent = 0;
        let freeTrialExpiry;
        if (creditUsage?.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
          freeTrialLimit = creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit ?? 0;
          freeTrialCurrent = creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage ?? 0;
          freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry;
        }
        const bonuses = [];
        if (creditUsage?.bonuses) {
          for (const bonus of creditUsage.bonuses) {
            if (bonus.status === "ACTIVE") {
              bonuses.push({
                code: bonus.bonusCode || "",
                name: bonus.displayName || "",
                current: bonus.currentUsageWithPrecision ?? bonus.currentUsage ?? 0,
                limit: bonus.usageLimitWithPrecision ?? bonus.usageLimit ?? 0,
                expiresAt: bonus.expiresAt
              });
            }
          }
        }
        const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((sum, b) => sum + b.limit, 0);
        const totalUsed = baseCurrent + freeTrialCurrent + bonuses.reduce((sum, b) => sum + b.current, 0);
        let daysRemaining;
        let expiresAt;
        const nextResetDate = usageResult.nextDateReset;
        if (nextResetDate) {
          expiresAt = new Date(nextResetDate).getTime();
          daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / (1e3 * 60 * 60 * 24)));
        }
        console.log("[Verify] Success! Email:", email);
        return {
          success: true,
          data: {
            email,
            userId,
            accessToken: refreshResult.accessToken,
            refreshToken: refreshResult.refreshToken || refreshToken,
            expiresIn: refreshResult.expiresIn,
            subscriptionType,
            subscriptionTitle,
            subscription: {
              rawType: usageResult.subscriptionInfo?.type,
              managementTarget: usageResult.subscriptionInfo?.subscriptionManagementTarget,
              upgradeCapability: usageResult.subscriptionInfo?.upgradeCapability,
              overageCapability: usageResult.subscriptionInfo?.overageCapability
            },
            usage: {
              current: totalUsed,
              limit: totalLimit,
              baseLimit,
              baseCurrent,
              freeTrialLimit,
              freeTrialCurrent,
              freeTrialExpiry,
              bonuses,
              nextResetDate,
              resourceDetail: creditUsage ? {
                displayName: creditUsage.displayName,
                displayNamePlural: creditUsage.displayNamePlural,
                resourceType: creditUsage.resourceType,
                currency: creditUsage.currency,
                unit: creditUsage.unit,
                overageRate: creditUsage.overageRate,
                overageCap: creditUsage.overageCap,
                overageEnabled: usageResult.overageConfiguration?.overageStatus === "ENABLED" || usageResult.overageConfiguration?.overageEnabled === true
              } : void 0
            },
            daysRemaining,
            expiresAt
          }
        };
      } catch (error) {
        console.error("[Verify] Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "验证失败" };
      }
    }
  );
  electron.ipcMain.handle("get-local-active-account", async () => {
    const os2 = await import("os");
    const path2 = await import("path");
    try {
      const ssoCache = path2.join(os2.homedir(), ".aws", "sso", "cache");
      const tokenPath = path2.join(ssoCache, "kiro-auth-token.json");
      const tokenContent = await promises.readFile(tokenPath, "utf-8");
      const tokenData = JSON.parse(tokenContent);
      if (!tokenData.refreshToken) {
        return { success: false, error: "本地缓存中没有 refreshToken" };
      }
      return {
        success: true,
        data: {
          refreshToken: tokenData.refreshToken,
          accessToken: tokenData.accessToken,
          authMethod: tokenData.authMethod,
          provider: tokenData.provider
        }
      };
    } catch {
      return { success: false, error: "无法读取本地 SSO 缓存" };
    }
  });
  electron.ipcMain.handle("load-kiro-credentials", async () => {
    const os2 = await import("os");
    const path2 = await import("path");
    const crypto2 = await import("crypto");
    const fs2 = await import("fs/promises");
    try {
      const ssoCache = path2.join(os2.homedir(), ".aws", "sso", "cache");
      const tokenPath = path2.join(ssoCache, "kiro-auth-token.json");
      console.log("[Kiro Credentials] Reading token from:", tokenPath);
      let tokenData;
      try {
        const tokenContent = await promises.readFile(tokenPath, "utf-8");
        tokenData = JSON.parse(tokenContent);
      } catch {
        return { success: false, error: "找不到 kiro-auth-token.json 文件，请先在 Kiro IDE 中登录" };
      }
      if (!tokenData.refreshToken) {
        return { success: false, error: "kiro-auth-token.json 中缺少 refreshToken" };
      }
      let clientIdHash = tokenData.clientIdHash;
      if (!clientIdHash) {
        const startUrl = "https://view.awsapps.com/start";
        clientIdHash = crypto2.createHash("sha1").update(JSON.stringify({ startUrl })).digest("hex");
        console.log("[Kiro Credentials] Calculated clientIdHash:", clientIdHash);
      }
      let clientRegPath = path2.join(ssoCache, `${clientIdHash}.json`);
      console.log("[Kiro Credentials] Trying client registration from:", clientRegPath);
      let clientData = null;
      try {
        const clientContent = await promises.readFile(clientRegPath, "utf-8");
        clientData = JSON.parse(clientContent);
      } catch {
        console.log("[Kiro Credentials] Client file not found, searching cache directory...");
        try {
          const files = await fs2.readdir(ssoCache);
          for (const file of files) {
            if (file.endsWith(".json") && file !== "kiro-auth-token.json") {
              try {
                const content = await promises.readFile(path2.join(ssoCache, file), "utf-8");
                const data = JSON.parse(content);
                if (data.clientId && data.clientSecret) {
                  clientData = data;
                  console.log("[Kiro Credentials] Found client registration in:", file);
                  break;
                }
              } catch {
              }
            }
          }
        } catch {
        }
      }
      const isSocialAuth = tokenData.authMethod === "social";
      if (!isSocialAuth && (!clientData || !clientData.clientId || !clientData.clientSecret)) {
        return { success: false, error: "找不到客户端注册文件，请确保已在 Kiro IDE 中完成登录" };
      }
      console.log(
        `[Kiro Credentials] Successfully loaded credentials (authMethod: ${tokenData.authMethod || "IdC"})`
      );
      return {
        success: true,
        data: {
          accessToken: tokenData.accessToken || "",
          refreshToken: tokenData.refreshToken,
          clientId: clientData?.clientId || "",
          clientSecret: clientData?.clientSecret || "",
          region: tokenData.region || "us-east-1",
          authMethod: tokenData.authMethod || "IdC",
          provider: tokenData.provider || "BuilderId"
        }
      };
    } catch (error) {
      console.error("[Kiro Credentials] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "未知错误" };
    }
  });
  electron.ipcMain.handle(
    "switch-account",
    async (_event, credentials) => {
      const os2 = await import("os");
      const path2 = await import("path");
      const crypto2 = await import("crypto");
      const { mkdir, writeFile: writeFile2 } = await import("fs/promises");
      try {
        const {
          refreshToken,
          clientId,
          clientSecret,
          region = "us-east-1",
          startUrl,
          authMethod = "IdC",
          provider = "BuilderId",
          profileArn
        } = credentials;
        let { accessToken } = credentials;
        if (refreshToken) {
          console.log(
            `[Switch Account] Refreshing token before switch (authMethod: ${authMethod})...`
          );
          const refreshResult = await refreshTokenByMethod(
            refreshToken,
            clientId,
            clientSecret,
            region,
            authMethod
          );
          if (refreshResult.success && refreshResult.accessToken) {
            accessToken = refreshResult.accessToken;
            console.log("[Switch Account] Token refreshed successfully");
          } else {
            console.warn(
              `[Switch Account] Token refresh failed: ${refreshResult.error}, using existing token`
            );
          }
        }
        const effectiveStartUrl = startUrl || "https://view.awsapps.com/start";
        const clientIdHash = crypto2.createHash("sha1").update(JSON.stringify({ startUrl: effectiveStartUrl })).digest("hex");
        const ssoCache = path2.join(os2.homedir(), ".aws", "sso", "cache");
        await mkdir(ssoCache, { recursive: true });
        const SOCIAL_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK";
        const BUILDER_ID_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX";
        const resolvedProfileArn = profileArn || (authMethod === "social" || provider === "Google" || provider === "Github" ? SOCIAL_PROFILE_ARN : BUILDER_ID_PROFILE_ARN);
        const tokenPath = path2.join(ssoCache, "kiro-auth-token.json");
        const tokenData = authMethod === "social" ? {
          // Social 登录格式：accessToken, refreshToken, profileArn, expiresAt, authMethod, provider
          accessToken,
          refreshToken,
          profileArn: resolvedProfileArn,
          expiresAt: new Date(Date.now() + 3600 * 1e3).toISOString(),
          authMethod,
          provider
        } : {
          // IdC 登录格式：accessToken, refreshToken, expiresAt, clientIdHash, authMethod, provider, region
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 3600 * 1e3).toISOString(),
          clientIdHash,
          authMethod,
          provider,
          region,
          profileArn: resolvedProfileArn
        };
        await writeFile2(tokenPath, JSON.stringify(tokenData, null, 2));
        console.log("[Switch Account] Token saved to:", tokenPath);
        if (authMethod !== "social" && clientId && clientSecret) {
          const clientRegPath = path2.join(ssoCache, `${clientIdHash}.json`);
          const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1e3).toISOString().replace("Z", "");
          const clientData = {
            clientId,
            clientSecret,
            expiresAt,
            scopes: [
              "codewhisperer:completions",
              "codewhisperer:analysis",
              "codewhisperer:conversations",
              "codewhisperer:transformations",
              "codewhisperer:taskassist"
            ]
          };
          await writeFile2(clientRegPath, JSON.stringify(clientData, null, 2));
          console.log("[Switch Account] Client registration saved to:", clientRegPath);
        }
        return { success: true };
      } catch (error) {
        console.error("[Switch Account] Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "切换失败" };
      }
    }
  );
  electron.ipcMain.handle(
    "switch-account-cli",
    async (_event, credentials) => {
      const os2 = await import("os");
      const path2 = await import("path");
      const { mkdir } = await import("fs/promises");
      try {
        const {
          refreshToken,
          clientId,
          clientSecret,
          region = "us-east-1",
          profileArn,
          provider,
          scopes
        } = credentials;
        let { accessToken } = credentials;
        if (refreshToken) {
          const authMethod = provider === "Google" || provider === "Github" ? "social" : void 0;
          console.log(`[Switch CLI] Refreshing token before switch (provider: ${provider})...`);
          const refreshResult = await refreshTokenByMethod(
            refreshToken,
            clientId || "",
            clientSecret || "",
            region,
            authMethod
          );
          if (refreshResult.success && refreshResult.accessToken) {
            accessToken = refreshResult.accessToken;
            console.log("[Switch CLI] Token refreshed successfully");
          } else {
            console.warn(
              `[Switch CLI] Token refresh failed: ${refreshResult.error}, using existing token`
            );
          }
        }
        const dataDir = process.platform === "win32" ? path2.join(os2.homedir(), "AppData", "Local", "kiro-cli") : path2.join(os2.homedir(), ".local", "share", "kiro-cli");
        await mkdir(dataDir, { recursive: true });
        const dbPath = path2.join(dataDir, "data.sqlite3");
        const isSocial = provider === "Google" || provider === "Github";
        const preferredTokenKey = isSocial ? "kirocli:social:token" : "kirocli:odic:token";
        const preferredRegKey = "kirocli:odic:device-registration";
        const SOCIAL_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK";
        const BUILDER_ID_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX";
        const resolvedProfileArn = profileArn || (isSocial ? SOCIAL_PROFILE_ARN : BUILDER_ID_PROFILE_ARN);
        const expiresAt = new Date(Date.now() + 3600 * 1e3).toISOString();
        const tokenData = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          region,
          profile_arn: resolvedProfileArn
        };
        if (scopes) tokenData.scopes = scopes;
        const { execFileSync } = await import("child_process");
        const sqlite3Bin = process.platform === "win32" ? "sqlite3.exe" : "sqlite3";
        const sqlStatements = [
          "CREATE TABLE IF NOT EXISTS auth_kv (key TEXT PRIMARY KEY, value TEXT);",
          `INSERT OR REPLACE INTO auth_kv (key, value) VALUES ('${preferredTokenKey}', '${JSON.stringify(tokenData).replace(/'/g, "''")}');`
        ];
        if (clientId && clientSecret && !isSocial) {
          const regData = { client_id: clientId, client_secret: clientSecret, region };
          sqlStatements.push(
            `INSERT OR REPLACE INTO auth_kv (key, value) VALUES ('${preferredRegKey}', '${JSON.stringify(regData).replace(/'/g, "''")}');`
          );
        }
        const cliTokenKeys = [
          "kirocli:social:token",
          "kirocli:odic:token",
          "codewhisperer:odic:token"
        ];
        for (const key of cliTokenKeys) {
          if (key !== preferredTokenKey) {
            sqlStatements.push(`DELETE FROM auth_kv WHERE key = '${key}';`);
          }
        }
        try {
          execFileSync(sqlite3Bin, [dbPath], {
            input: sqlStatements.join("\n"),
            timeout: 1e4,
            encoding: "utf-8"
          });
        } catch (sqlite3Error) {
          console.log(
            "[Switch CLI] sqlite3 command not available, trying Node.js built-in SQLite..."
          );
          try {
            const { DatabaseSync } = await import("node:sqlite");
            const db = new DatabaseSync(dbPath);
            try {
              for (const sql of sqlStatements) {
                db.exec(sql);
              }
            } finally {
              db.close();
            }
          } catch {
            throw new Error(
              `SQLite 操作失败: sqlite3 命令不可用 (${sqlite3Error.message})，且 Node.js 内置 SQLite 不支持。请确保系统安装了 sqlite3 命令行工具。`
            );
          }
        }
        console.log(`[Switch CLI] Token saved to SQLite key: ${preferredTokenKey}`);
        console.log(`[Switch CLI] Account switched successfully in ${dbPath}`);
        return { success: true, dbPath };
      } catch (error) {
        console.error("[Switch CLI] Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "CLI 切换失败" };
      }
    }
  );
  electron.ipcMain.handle("logout-account", async () => {
    const os2 = await import("os");
    const path2 = await import("path");
    const { readdir, unlink } = await import("fs/promises");
    try {
      const ssoCache = path2.join(os2.homedir(), ".aws", "sso", "cache");
      console.log("[Logout] Clearing SSO cache:", ssoCache);
      const files = await readdir(ssoCache).catch(() => []);
      for (const file of files) {
        const filePath = path2.join(ssoCache, file);
        await unlink(filePath).catch((e) => {
          console.warn("[Logout] Failed to delete file:", filePath, e);
        });
      }
      console.log("[Logout] SSO cache cleared, deleted", files.length, "files");
      return { success: true, deletedCount: files.length };
    } catch (error) {
      console.error("[Logout] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "退出失败" };
    }
  });
  let currentLoginState = null;
  electron.ipcMain.handle("start-builder-id-login", async (_event, region = "us-east-1") => {
    console.log("[Login] Starting Builder ID login...");
    const oidcBase = `https://oidc.${region}.amazonaws.com`;
    const startUrl = "https://view.awsapps.com/start";
    const scopes = [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations",
      "codewhisperer:transformations",
      "codewhisperer:taskassist"
    ];
    try {
      console.log("[Login] Step 1: Registering OIDC client...");
      const regRes = await fetchWithAppProxy(`${oidcBase}/client/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Kiro Account Manager",
          clientType: "public",
          scopes,
          grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
          issuerUrl: startUrl
        })
      });
      if (!regRes.ok) {
        const errText = await regRes.text();
        return { success: false, error: `注册客户端失败: ${errText}` };
      }
      const regData = await regRes.json();
      const clientId = regData.clientId;
      const clientSecret = regData.clientSecret;
      console.log("[Login] Client registered:", clientId.substring(0, 30) + "...");
      console.log("[Login] Step 2: Starting device authorization...");
      const authRes = await fetchWithAppProxy(`${oidcBase}/device_authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, startUrl })
      });
      if (!authRes.ok) {
        const errText = await authRes.text();
        return { success: false, error: `设备授权失败: ${errText}` };
      }
      const authData = await authRes.json();
      const {
        deviceCode,
        userCode,
        verificationUri,
        verificationUriComplete,
        interval = 5,
        expiresIn = 600
      } = authData;
      console.log("[Login] Device code obtained, user_code:", userCode);
      currentLoginState = {
        type: "builderid",
        clientId,
        clientSecret,
        deviceCode,
        userCode,
        verificationUri,
        interval,
        expiresAt: Date.now() + expiresIn * 1e3
      };
      return {
        success: true,
        userCode,
        verificationUri: verificationUriComplete || verificationUri,
        expiresIn,
        interval
      };
    } catch (error) {
      console.error("[Login] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "登录失败" };
    }
  });
  electron.ipcMain.handle("poll-builder-id-auth", async (_event, region = "us-east-1") => {
    console.log("[Login] Polling for authorization...");
    if (!currentLoginState || currentLoginState.type !== "builderid") {
      return { success: false, error: "没有进行中的登录" };
    }
    if (Date.now() > (currentLoginState.expiresAt || 0)) {
      currentLoginState = null;
      return { success: false, error: "授权已过期，请重新开始" };
    }
    const oidcBase = `https://oidc.${region}.amazonaws.com`;
    const { clientId, clientSecret, deviceCode } = currentLoginState;
    try {
      const tokenRes = await fetchWithAppProxy(`${oidcBase}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
          deviceCode
        })
      });
      if (tokenRes.status === 200) {
        const tokenData = await tokenRes.json();
        console.log("[Login] Authorization successful!");
        const result = {
          success: true,
          completed: true,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          clientId,
          clientSecret,
          region,
          expiresIn: tokenData.expiresIn
        };
        currentLoginState = null;
        return result;
      } else if (tokenRes.status === 400) {
        const errData = await tokenRes.json();
        const error = errData.error;
        if (error === "authorization_pending") {
          return { success: true, completed: false, status: "pending" };
        } else if (error === "slow_down") {
          if (currentLoginState) {
            currentLoginState.interval = (currentLoginState.interval || 5) + 5;
          }
          return { success: true, completed: false, status: "slow_down" };
        } else if (error === "expired_token") {
          currentLoginState = null;
          return { success: false, error: "设备码已过期" };
        } else if (error === "access_denied") {
          currentLoginState = null;
          return { success: false, error: "用户拒绝授权" };
        } else {
          currentLoginState = null;
          return { success: false, error: `授权错误: ${error}` };
        }
      } else {
        return { success: false, error: `未知响应: ${tokenRes.status}` };
      }
    } catch (error) {
      console.error("[Login] Poll error:", error);
      return { success: false, error: error instanceof Error ? error.message : "轮询失败" };
    }
  });
  electron.ipcMain.handle("cancel-builder-id-login", async () => {
    console.log("[Login] Cancelling Builder ID login...");
    currentLoginState = null;
    return { success: true };
  });
  let iamSsoServer = null;
  let iamSsoResult = null;
  electron.ipcMain.handle(
    "start-iam-sso-login",
    async (_event, startUrl, region = "us-east-1") => {
      console.log("[Login] Starting IAM Identity Center SSO login (Authorization Code flow)...");
      console.log("[Login] Start URL:", startUrl);
      if (!startUrl || !startUrl.startsWith("https://")) {
        return { success: false, error: "SSO Start URL 必须以 https:// 开头" };
      }
      const crypto2 = await import("crypto");
      const http2 = await import("http");
      const oidcBase = `https://oidc.${region}.amazonaws.com`;
      const scopes = [
        "codewhisperer:completions",
        "codewhisperer:analysis",
        "codewhisperer:conversations",
        "codewhisperer:transformations",
        "codewhisperer:taskassist"
      ];
      try {
        console.log("[Login] Step 1: Registering OIDC client...");
        const regRes = await fetchWithAppProxy(`${oidcBase}/client/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: "Kiro Account Manager",
            clientType: "public",
            scopes,
            grantTypes: ["authorization_code", "refresh_token"],
            redirectUris: ["http://127.0.0.1/oauth/callback"],
            issuerUrl: startUrl
          })
        });
        if (!regRes.ok) {
          const errText = await regRes.text();
          console.error("[Login] IAM SSO client registration failed:", regRes.status, errText);
          if (errText.includes("UnauthorizedException") || errText.includes("access denied")) {
            return {
              success: false,
              error: "授权失败：您的组织可能未配置 Amazon Q Developer 访问权限。请联系组织管理员在 IAM Identity Center 中启用相关权限。"
            };
          }
          return { success: false, error: `注册客户端失败: ${errText}` };
        }
        const regData = await regRes.json();
        const clientId = regData.clientId;
        const clientSecret = regData.clientSecret;
        console.log("[Login] Client registered:", clientId.substring(0, 30) + "...");
        const codeVerifier = crypto2.randomBytes(32).toString("base64url");
        const codeChallenge = crypto2.createHash("sha256").update(codeVerifier).digest("base64url");
        const state = crypto2.randomUUID();
        console.log("[Login] Step 2: Starting local OAuth callback server...");
        if (iamSsoServer) {
          iamSsoServer.close();
          iamSsoServer = null;
        }
        const port = await new Promise((resolve, reject) => {
          const server = http2.createServer();
          server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
              const p = addr.port;
              server.close(() => resolve(p));
            } else {
              reject(new Error("无法获取端口"));
            }
          });
        });
        const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
        console.log("[Login] Redirect URI:", redirectUri);
        iamSsoResult = null;
        iamSsoServer = http2.createServer(async (req, res) => {
          const url2 = new URL(req.url || "", `http://127.0.0.1:${port}`);
          if (url2.pathname === "/oauth/callback") {
            const code = url2.searchParams.get("code");
            const returnedState = url2.searchParams.get("state");
            const error = url2.searchParams.get("error");
            if (error) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<html><body><h1>授权失败</h1><p>您可以关闭此窗口。</p></body></html>");
              iamSsoResult = { completed: true, success: false, error: `授权失败: ${error}` };
              return;
            }
            if (returnedState !== state) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<html><body><h1>授权失败</h1><p>状态不匹配，请重试。</p></body></html>");
              iamSsoResult = { completed: true, success: false, error: "状态不匹配" };
              return;
            }
            if (code) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<html><body><h1>授权成功！</h1><p>正在获取令牌，请稍候...</p></body></html>");
              try {
                const tokenRes = await fetchWithAppProxy(`${oidcBase}/token`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    clientId,
                    clientSecret,
                    grantType: "authorization_code",
                    redirectUri,
                    code,
                    codeVerifier
                  })
                });
                if (!tokenRes.ok) {
                  const errText = await tokenRes.text();
                  console.error("[Login] Token exchange failed:", tokenRes.status, errText);
                  iamSsoResult = {
                    completed: true,
                    success: false,
                    error: `获取 Token 失败: ${errText}`
                  };
                } else {
                  const tokenData = await tokenRes.json();
                  console.log("[Login] IAM SSO Authorization successful!");
                  iamSsoResult = {
                    completed: true,
                    success: true,
                    accessToken: tokenData.accessToken,
                    refreshToken: tokenData.refreshToken,
                    clientId,
                    clientSecret,
                    region,
                    expiresIn: tokenData.expiresIn
                  };
                }
              } catch (tokenError) {
                console.error("[Login] Token exchange error:", tokenError);
                iamSsoResult = {
                  completed: true,
                  success: false,
                  error: tokenError instanceof Error ? tokenError.message : "获取 Token 失败"
                };
              }
            } else {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<html><body><h1>授权失败</h1><p>未收到授权码。</p></body></html>");
              iamSsoResult = { completed: true, success: false, error: "未收到授权码" };
            }
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
        });
        iamSsoServer.listen(port, "127.0.0.1", () => {
          console.log("[Login] OAuth callback server listening on port", port);
        });
        const authorizeParams = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scopes: scopes.join(","),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256"
        });
        const authorizeUrl = `${oidcBase}/authorize?${authorizeParams.toString()}`;
        console.log("[Login] Opening browser for authorization...");
        currentLoginState = {
          type: "iamsso",
          clientId,
          clientSecret,
          codeVerifier,
          redirectUri,
          region,
          startUrl,
          expiresAt: Date.now() + 6e5
        };
        return {
          success: true,
          authorizeUrl,
          expiresIn: 600
        };
      } catch (error) {
        console.error("[Login] Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "登录失败" };
      }
    }
  );
  electron.ipcMain.handle("poll-iam-sso-auth", async () => {
    if (!currentLoginState || currentLoginState.type !== "iamsso") {
      return { success: false, error: "没有进行中的 IAM SSO 登录" };
    }
    if (Date.now() > (currentLoginState.expiresAt || 0)) {
      if (iamSsoServer) {
        iamSsoServer.close();
        iamSsoServer = null;
      }
      iamSsoResult = null;
      currentLoginState = null;
      return { success: false, error: "授权已过期，请重新开始" };
    }
    if (iamSsoResult) {
      const result = { ...iamSsoResult };
      if (result.completed) {
        if (iamSsoServer) {
          iamSsoServer.close();
          iamSsoServer = null;
        }
        iamSsoResult = null;
        currentLoginState = null;
      }
      return result;
    }
    return { success: true, completed: false, status: "pending" };
  });
  electron.ipcMain.handle("cancel-iam-sso-login", async () => {
    console.log("[Login] Cancelling IAM SSO login...");
    if (iamSsoServer) {
      iamSsoServer.close();
      iamSsoServer = null;
    }
    iamSsoResult = null;
    currentLoginState = null;
    return { success: true };
  });
  electron.ipcMain.handle(
    "start-social-login",
    async (_event, provider, usePrivateMode) => {
      console.log(
        `[Login] Starting ${provider} Social Auth login... (privateMode: ${usePrivateMode})`
      );
      const crypto2 = await import("crypto");
      const codeVerifier = crypto2.randomBytes(64).toString("base64url").substring(0, 128);
      const codeChallenge = crypto2.createHash("sha256").update(codeVerifier).digest("base64url");
      const oauthState = crypto2.randomBytes(32).toString("base64url");
      const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";
      const loginUrl = new URL(`${KIRO_AUTH_ENDPOINT}/login`);
      loginUrl.searchParams.set("idp", provider);
      loginUrl.searchParams.set("redirect_uri", redirectUri);
      loginUrl.searchParams.set("code_challenge", codeChallenge);
      loginUrl.searchParams.set("code_challenge_method", "S256");
      loginUrl.searchParams.set("state", oauthState);
      currentLoginState = {
        type: "social",
        codeVerifier,
        codeChallenge,
        oauthState,
        provider
      };
      const urlStr = loginUrl.toString();
      console.log(`[Login] Opening browser for ${provider} login...`);
      if (usePrivateMode) {
        openBrowserInPrivateMode(urlStr);
      } else {
        electron.shell.openExternal(urlStr);
      }
      return {
        success: true,
        loginUrl: urlStr,
        state: oauthState
      };
    }
  );
  electron.ipcMain.handle("exchange-social-token", async (_event, code, state) => {
    console.log("[Login] Exchanging Social Auth token...");
    if (!currentLoginState || currentLoginState.type !== "social") {
      return { success: false, error: "没有进行中的社交登录" };
    }
    if (state !== currentLoginState.oauthState) {
      currentLoginState = null;
      return { success: false, error: "状态参数不匹配，可能存在安全风险" };
    }
    const { codeVerifier, provider } = currentLoginState;
    const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";
    try {
      const tokenRes = await fetchWithAppProxy(`${KIRO_AUTH_ENDPOINT}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri
        })
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        currentLoginState = null;
        return { success: false, error: `Token 交换失败: ${errText}` };
      }
      const tokenData = await tokenRes.json();
      console.log("[Login] Token exchange successful!");
      const result = {
        success: true,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        profileArn: tokenData.profileArn,
        expiresIn: tokenData.expiresIn,
        authMethod: "social",
        provider
      };
      currentLoginState = null;
      return result;
    } catch (error) {
      console.error("[Login] Token exchange error:", error);
      currentLoginState = null;
      return { success: false, error: error instanceof Error ? error.message : "Token 交换失败" };
    }
  });
  electron.ipcMain.handle("cancel-social-login", async () => {
    console.log("[Login] Cancelling Social Auth login...");
    currentLoginState = null;
    return { success: true };
  });
  electron.ipcMain.handle("set-proxy", async (_event, enabled, url2) => {
    console.log(`[IPC] set-proxy called: enabled=${enabled}, url=${url2}`);
    try {
      applyProxySettings(enabled, url2);
      if (mainWindow) {
        const session = mainWindow.webContents.session;
        if (enabled && url2) {
          await session.setProxy({ proxyRules: url2 });
        } else {
          await session.setProxy({ proxyRules: "" });
        }
      }
      return { success: true };
    } catch (error) {
      console.error("[Proxy] Failed to set proxy:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("get-kiro-settings", async () => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const kiroSettingsPath = path2.join(
        homeDir,
        "AppData",
        "Roaming",
        "Kiro",
        "User",
        "settings.json"
      );
      const kiroSteeringPath = path2.join(homeDir, ".kiro", "steering");
      const kiroMcpUserPath = path2.join(homeDir, ".kiro", "settings", "mcp.json");
      let settings = {};
      let mcpConfig = { mcpServers: {} };
      let steeringFiles = [];
      if (fs2.existsSync(kiroSettingsPath)) {
        const content = fs2.readFileSync(kiroSettingsPath, "utf-8");
        const cleanedContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1");
        const parsed = JSON.parse(cleanedContent);
        settings = {
          modelSelection: parsed["kiroAgent.modelSelection"],
          agentAutonomy: parsed["kiroAgent.agentAutonomy"],
          enableDebugLogs: parsed["kiroAgent.enableDebugLogs"],
          enableTabAutocomplete: parsed["kiroAgent.enableTabAutocomplete"],
          enableCodebaseIndexing: parsed["kiroAgent.enableCodebaseIndexing"],
          usageSummary: parsed["kiroAgent.usageSummary"],
          codeReferences: parsed["kiroAgent.codeReferences.referenceTracker"],
          configureMCP: parsed["kiroAgent.configureMCP"],
          trustedCommands: parsed["kiroAgent.trustedCommands"] || [],
          trustedTools: parsed["kiroAgent.trustedTools"] || {},
          commandDenylist: parsed["kiroAgent.commandDenylist"] || [],
          ignoreFiles: parsed["kiroAgent.ignoreFiles"] || [],
          mcpApprovedEnvVars: parsed["kiroAgent.mcpApprovedEnvVars"] || [],
          notificationsActionRequired: parsed["kiroAgent.notifications.agent.actionRequired"],
          notificationsFailure: parsed["kiroAgent.notifications.agent.failure"],
          notificationsSuccess: parsed["kiroAgent.notifications.agent.success"],
          notificationsBilling: parsed["kiroAgent.notifications.billing"]
        };
      }
      if (fs2.existsSync(kiroMcpUserPath)) {
        const mcpContent = fs2.readFileSync(kiroMcpUserPath, "utf-8");
        mcpConfig = JSON.parse(mcpContent);
      }
      if (fs2.existsSync(kiroSteeringPath)) {
        const files = fs2.readdirSync(kiroSteeringPath);
        steeringFiles = files.filter((f) => f.endsWith(".md"));
        console.log("[KiroSettings] Steering path:", kiroSteeringPath);
        console.log("[KiroSettings] Found steering files:", steeringFiles);
      } else {
        console.log("[KiroSettings] Steering path does not exist:", kiroSteeringPath);
      }
      return { settings, mcpConfig, steeringFiles };
    } catch (error) {
      console.error("[KiroSettings] Failed to get settings:", error);
      return { error: error instanceof Error ? error.message : "Failed to get settings" };
    }
  });
  electron.ipcMain.handle("get-kiro-available-models", async () => {
    try {
      if (!store) return { models: [] };
      const accountData = store.get("accountData");
      if (!accountData?.accounts) return { models: [] };
      const allAccounts2 = Object.values(accountData.accounts);
      const account = allAccounts2.find((acc) => acc.isActive && acc.credentials?.accessToken) || allAccounts2.find((acc) => acc.status === "active" && acc.credentials?.accessToken);
      if (!account) return { models: [] };
      const proxyAccount = {
        id: account.id,
        email: account.email,
        accessToken: account.credentials.accessToken,
        refreshToken: account.credentials?.refreshToken,
        profileArn: account.profileArn,
        expiresAt: account.credentials?.expiresAt,
        clientId: account.credentials?.clientId,
        clientSecret: account.credentials?.clientSecret,
        region: account.credentials?.region || "us-east-1",
        authMethod: account.credentials?.authMethod
      };
      const models = await fetchKiroModels(proxyAccount);
      return {
        models: models.map((m) => ({
          id: m.modelId,
          name: m.modelName,
          description: m.description
        }))
      };
    } catch (error) {
      console.error("[KiroSettings] Failed to fetch models:", error);
      return {
        models: [],
        error: error instanceof Error ? error.message : "Failed to fetch models"
      };
    }
  });
  electron.ipcMain.handle("save-kiro-settings", async (_event, settings) => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const kiroSettingsPath = path2.join(
        homeDir,
        "AppData",
        "Roaming",
        "Kiro",
        "User",
        "settings.json"
      );
      let existingSettings = {};
      if (fs2.existsSync(kiroSettingsPath)) {
        const content = fs2.readFileSync(kiroSettingsPath, "utf-8");
        const cleanedContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1");
        existingSettings = JSON.parse(cleanedContent);
      }
      const kiroSettings = {
        ...existingSettings,
        "kiroAgent.modelSelection": settings.modelSelection,
        "kiroAgent.agentAutonomy": settings.agentAutonomy,
        "kiroAgent.enableDebugLogs": settings.enableDebugLogs,
        "kiroAgent.enableTabAutocomplete": settings.enableTabAutocomplete,
        "kiroAgent.enableCodebaseIndexing": settings.enableCodebaseIndexing,
        "kiroAgent.usageSummary": settings.usageSummary,
        "kiroAgent.codeReferences.referenceTracker": settings.codeReferences,
        "kiroAgent.configureMCP": settings.configureMCP,
        "kiroAgent.trustedCommands": settings.trustedCommands,
        "kiroAgent.trustedTools": settings.trustedTools,
        "kiroAgent.commandDenylist": settings.commandDenylist,
        "kiroAgent.ignoreFiles": settings.ignoreFiles,
        "kiroAgent.mcpApprovedEnvVars": settings.mcpApprovedEnvVars,
        "kiroAgent.notifications.agent.actionRequired": settings.notificationsActionRequired,
        "kiroAgent.notifications.agent.failure": settings.notificationsFailure,
        "kiroAgent.notifications.agent.success": settings.notificationsSuccess,
        "kiroAgent.notifications.billing": settings.notificationsBilling
      };
      const dir = path2.dirname(kiroSettingsPath);
      if (!fs2.existsSync(dir)) {
        fs2.mkdirSync(dir, { recursive: true });
      }
      fs2.writeFileSync(kiroSettingsPath, JSON.stringify(kiroSettings, null, 4));
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to save settings:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save settings"
      };
    }
  });
  electron.ipcMain.handle("open-kiro-mcp-config", async (_event, type) => {
    try {
      const os2 = await import("os");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      let configPath;
      if (type === "user") {
        configPath = path2.join(homeDir, ".kiro", "settings", "mcp.json");
      } else {
        configPath = path2.join(process.cwd(), ".kiro", "settings", "mcp.json");
      }
      const fs2 = await import("fs");
      if (!fs2.existsSync(configPath)) {
        const dir = path2.dirname(configPath);
        if (!fs2.existsSync(dir)) {
          fs2.mkdirSync(dir, { recursive: true });
        }
        fs2.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
      }
      electron.shell.openPath(configPath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to open MCP config:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open MCP config"
      };
    }
  });
  electron.ipcMain.handle("open-kiro-steering-folder", async () => {
    try {
      const os2 = await import("os");
      const path2 = await import("path");
      const fs2 = await import("fs");
      const homeDir = os2.homedir();
      const steeringPath = path2.join(homeDir, ".kiro", "steering");
      if (!fs2.existsSync(steeringPath)) {
        fs2.mkdirSync(steeringPath, { recursive: true });
      }
      electron.shell.openPath(steeringPath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to open steering folder:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open steering folder"
      };
    }
  });
  electron.ipcMain.handle("open-kiro-settings-file", async () => {
    try {
      const os2 = await import("os");
      const path2 = await import("path");
      const fs2 = await import("fs");
      const homeDir = os2.homedir();
      const settingsPath = path2.join(homeDir, "AppData", "Roaming", "Kiro", "User", "settings.json");
      if (!fs2.existsSync(settingsPath)) {
        const dir = path2.dirname(settingsPath);
        if (!fs2.existsSync(dir)) {
          fs2.mkdirSync(dir, { recursive: true });
        }
        const defaultSettings = {
          "workbench.colorTheme": "Kiro Light",
          "kiroAgent.modelSelection": "claude-haiku-4.5"
        };
        fs2.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 4));
      }
      electron.shell.openPath(settingsPath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to open settings file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open settings file"
      };
    }
  });
  electron.ipcMain.handle("open-kiro-steering-file", async (_event, filename) => {
    try {
      const os2 = await import("os");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const filePath = path2.join(homeDir, ".kiro", "steering", filename);
      electron.shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to open steering file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open steering file"
      };
    }
  });
  electron.ipcMain.handle("create-kiro-default-rules", async () => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const steeringPath = path2.join(homeDir, ".kiro", "steering");
      const rulesPath = path2.join(steeringPath, "rules.md");
      if (!fs2.existsSync(steeringPath)) {
        fs2.mkdirSync(steeringPath, { recursive: true });
      }
      const defaultContent = `# Role: 高级软件开发助手
一、系统为Windows10
二、调式文件、测试脚本、test相关文件都放在test文件夹里面，md文件放在docs文件夹里面
# 核心原则


## 1. 沟通与协作
- **诚实优先**：在任何情况下都严禁猜测或伪装。当需求不明确、存在技术风险或遇到知识盲区时，必须停止工作，并立即向用户澄清。
- **技术攻坚**：面对技术难题时，首要目标是寻找并提出高质量的解决方案。只有在所有可行方案均被评估后，才能与用户探讨降级或替换方案。
- **批判性思维**：在执行任务时，如果发现当前需求存在技术限制、潜在风险或有更优的实现路径，必须主动向用户提出你的见解和改进建议。
- **语言要求**：思考和回答时总是使用中文进行回复。


## 2. 架构设计
- **模块化设计**：所有设计都必须遵循功能解耦、职责单一的原则。严格遵守SOLID和DRY原则。
- **前瞻性思维**：在设计时必须考虑未来的可扩展性和可维护性，确保解决方案能够融入项目的整体架构。
- **技术债务优先**：在进行重构或优化时，优先处理对系统稳定性和可维护性影响最大的技术债务和基础架构问题。


## 3. 代码与交付物质量标准
### 编写规范
- **架构视角**：始终从整体项目架构出发编写代码，确保代码片段能够无缝集成，而不是孤立的功能。
- **零技术债务**：严禁创建任何形式的技术债务，包括但不限于：临时文件、硬编码值、职责不清的模块或函数。
- **问题暴露**：禁止添加任何用于掩盖或绕过错误的fallback机制。代码应设计为快速失败（Fail-Fast），确保问题在第一时间被发现。


### 质量要求
- **可读性**：使用清晰、有意义的变量名和函数名。代码逻辑必须清晰易懂，并辅以必要的注释。
- **规范遵循**：严格遵循目标编程语言的社区最佳实践和官方编码规范。
- **健壮性**：必须包含充分的错误处理逻辑和边界条件检查。
- **性能意识**：在保证代码质量和可读性的前提下，对性能敏感部分进行合理优化，避免不必要的计算复杂度和资源消耗。


### 交付物规范
- **无文档**：除非用户明确要求，否则不要创建任何Markdown文档或其他形式的说明文档。
- **无测试**：除非用户明确要求，否则不要编写单元测试或集成测试代码。
- **无编译/运行**：禁止编译或执行任何代码。你的任务是生成高质量的代码和设计方案。


# 注意事项
- 除非特别说明否则不要创建新的文档、不要测试、不要编译、不要运行、不需要总结，除非用户主动要求


- 需求不明确时使向用户询问澄清，提供预定义选项
- 在有多个方案的时候，需要向用户询问，而不是自作主张
- 在有方案/策略需要更新时，需要向用户询问，而不是自作主张


- ACE为augmentContextEngine工具的缩写
- 如果要求查看文档请使用 Context7 MCP
- 如果需要进行WEB前端页面测试请使用 Playwright MCP
- 如果用户回复'继续' 则请按照最佳实践继续完成任务
`;
      fs2.writeFileSync(rulesPath, defaultContent, "utf-8");
      console.log("[KiroSettings] Created default rules.md at:", rulesPath);
      electron.shell.openPath(rulesPath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to create default rules:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create default rules"
      };
    }
  });
  electron.ipcMain.handle("read-kiro-steering-file", async (_event, filename) => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const filePath = path2.join(homeDir, ".kiro", "steering", filename);
      if (!fs2.existsSync(filePath)) {
        return { success: false, error: "文件不存在" };
      }
      const content = fs2.readFileSync(filePath, "utf-8");
      return { success: true, content };
    } catch (error) {
      console.error("[KiroSettings] Failed to read steering file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read file"
      };
    }
  });
  electron.ipcMain.handle("save-kiro-steering-file", async (_event, filename, content) => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const steeringPath = path2.join(homeDir, ".kiro", "steering");
      const filePath = path2.join(steeringPath, filename);
      if (!fs2.existsSync(steeringPath)) {
        fs2.mkdirSync(steeringPath, { recursive: true });
      }
      fs2.writeFileSync(filePath, content, "utf-8");
      console.log("[KiroSettings] Saved steering file:", filePath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to save steering file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save file"
      };
    }
  });
  electron.ipcMain.handle("proxy-start", async (_event, config) => {
    try {
      const server = initProxyServer();
      if (config) {
        server.updateConfig(config);
      }
      await server.start();
      updateTrayMenu();
      return { success: true, port: server.getConfig().port };
    } catch (error) {
      console.error("[ProxyServer] Start failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start proxy server"
      };
    }
  });
  electron.ipcMain.handle("proxy-stop", async () => {
    try {
      if (proxyServer) {
        await proxyServer.stop();
      }
      updateTrayMenu();
      return { success: true };
    } catch (error) {
      console.error("[ProxyServer] Stop failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop proxy server"
      };
    }
  });
  electron.ipcMain.handle("proxy-get-status", () => {
    if (!proxyServer) {
      const savedConfig = store?.get("proxyConfig");
      return { running: false, config: savedConfig || null, stats: null, sessionStats: null };
    }
    return {
      running: proxyServer.isRunning(),
      config: proxyServer.getConfig(),
      stats: proxyServer.getStats(),
      sessionStats: proxyServer.getSessionStats()
    };
  });
  electron.ipcMain.handle("proxy-reset-credits", () => {
    if (proxyServer) {
      proxyServer.resetTotalCredits();
    }
    if (store) {
      store.set("proxyTotalCredits", 0);
    }
    return { success: true };
  });
  electron.ipcMain.handle("proxy-reset-tokens", () => {
    if (proxyServer) {
      proxyServer.resetTotalTokens();
    }
    if (store) {
      store.set("proxyInputTokens", 0);
      store.set("proxyOutputTokens", 0);
    }
    return { success: true };
  });
  electron.ipcMain.handle("proxy-reset-request-stats", () => {
    if (proxyServer) {
      proxyServer.resetRequestStats();
    }
    if (store) {
      store.set("proxyTotalRequests", 0);
      store.set("proxySuccessRequests", 0);
      store.set("proxyFailedRequests", 0);
    }
    return { success: true };
  });
  electron.ipcMain.handle("proxy-get-logs", (_event, count) => {
    if (count) {
      return proxyLogStore.getLast(count);
    }
    return proxyLogStore.getAll();
  });
  electron.ipcMain.handle("proxy-clear-logs", () => {
    proxyLogStore.clear();
    return { success: true };
  });
  electron.ipcMain.handle("proxy-get-logs-count", () => {
    return proxyLogStore.count();
  });
  electron.ipcMain.handle("get-usage-api-type", () => {
    return currentUsageApiType;
  });
  electron.ipcMain.handle("set-usage-api-type", (_event, type) => {
    setUsageApiType(type);
    if (store) {
      store.set("usageApiType", type);
    }
    return { success: true, type };
  });
  electron.ipcMain.handle("get-use-kproxy-for-api", () => {
    return getUseKProxyForApi();
  });
  electron.ipcMain.handle("set-use-kproxy-for-api", (_event, enabled) => {
    setUseKProxyForApi(enabled);
    if (store) {
      store.set("useKProxyForApi", enabled);
    }
    return { success: true, enabled };
  });
  electron.ipcMain.handle("proxy-update-config", async (_event, config) => {
    try {
      const server = initProxyServer();
      server.updateConfig(config);
      const newConfig2 = server.getConfig();
      if (config.logStreamEvents !== void 0) {
        setLogStreamEvents(config.logStreamEvents);
      }
      if (config.payloadSizeLimitKB !== void 0) {
        setPayloadSizeLimitKB(config.payloadSizeLimitKB);
      }
      if (store) {
        store.set("proxyConfig", newConfig2);
      }
      return { success: true, config: newConfig2 };
    } catch (error) {
      console.error("[ProxyServer] Update config failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update config"
      };
    }
  });
  electron.ipcMain.handle("proxy-self-signed-cert-info", () => {
    try {
      if (!proxyServer) return { success: false, error: "Proxy server not initialized" };
      const info = proxyServer.getSelfSignedCertInfo();
      if (!info) return { success: false, error: "Failed to get self-signed cert info" };
      return { success: true, ...info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("proxy-self-signed-cert-regenerate", () => {
    try {
      if (!proxyServer) return { success: false, error: "Proxy server not initialized" };
      const info = proxyServer.regenerateSelfSignedCert();
      if (!info) return { success: false, error: "Failed to regenerate self-signed cert" };
      return { success: true, ...info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("proxy-needs-restart", () => {
    try {
      if (!proxyServer) return { needsRestart: false };
      return { needsRestart: proxyServer.needsRestart() };
    } catch {
      return { needsRestart: false };
    }
  });
  electron.ipcMain.handle("proxy-restart", async () => {
    try {
      if (!proxyServer) return { success: false, error: "Proxy server not initialized" };
      await proxyServer.restartServer();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("proxy-audit-log", () => {
    try {
      if (!proxyServer) return { entries: [] };
      return { entries: proxyServer.getAuditLog().slice(-200) };
    } catch {
      return { entries: [] };
    }
  });
  electron.ipcMain.handle("proxy-get-api-keys", () => {
    try {
      const server = initProxyServer();
      const config = server.getConfig();
      return { success: true, apiKeys: config.apiKeys || [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get API keys",
        apiKeys: []
      };
    }
  });
  electron.ipcMain.handle(
    "proxy-add-api-key",
    async (_event, apiKey) => {
      try {
        const crypto2 = await import("crypto");
        const server = initProxyServer();
        const config = server.getConfig();
        const apiKeys = config.apiKeys || [];
        const format = apiKey.format || "sk";
        let newKey = apiKey.key;
        if (!newKey) {
          const randomHex = crypto2.randomBytes(24).toString("hex");
          switch (format) {
            case "sk":
              newKey = `sk-${randomHex}`;
              break;
            case "simple":
              newKey = `PROXY_KEY_${randomHex.toUpperCase().substring(0, 32)}`;
              break;
            case "token":
              newKey = `KEY:${randomHex.substring(0, 16)}:TOKEN:${randomHex.substring(16, 32)}`;
              break;
            default:
              newKey = `sk-${randomHex}`;
          }
        }
        const newApiKey = {
          id: crypto2.randomUUID(),
          name: apiKey.name || `API Key ${apiKeys.length + 1}`,
          key: newKey,
          format,
          enabled: true,
          createdAt: Date.now(),
          creditsLimit: apiKey.creditsLimit,
          usage: {
            totalRequests: 0,
            totalCredits: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            daily: {}
          }
        };
        apiKeys.push(newApiKey);
        server.updateConfig({ apiKeys });
        if (store) {
          store.set("proxyConfig", server.getConfig());
        }
        return { success: true, apiKey: newApiKey };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add API key"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "proxy-update-api-key",
    (_event, id, updates) => {
      try {
        const server = initProxyServer();
        const config = server.getConfig();
        const apiKeys = config.apiKeys || [];
        const index = apiKeys.findIndex((k) => k.id === id);
        if (index === -1) {
          return { success: false, error: "API key not found" };
        }
        const { id: _, createdAt: __, usage: ___, ...allowedUpdates } = updates;
        apiKeys[index] = { ...apiKeys[index], ...allowedUpdates };
        server.updateConfig({ apiKeys });
        if (store) {
          store.set("proxyConfig", server.getConfig());
        }
        return { success: true, apiKey: apiKeys[index] };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update API key"
        };
      }
    }
  );
  electron.ipcMain.handle("proxy-delete-api-key", (_event, id) => {
    try {
      const server = initProxyServer();
      const config = server.getConfig();
      const apiKeys = config.apiKeys || [];
      const index = apiKeys.findIndex((k) => k.id === id);
      if (index === -1) {
        return { success: false, error: "API key not found" };
      }
      apiKeys.splice(index, 1);
      server.updateConfig({ apiKeys });
      if (store) {
        store.set("proxyConfig", server.getConfig());
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete API key"
      };
    }
  });
  electron.ipcMain.handle("proxy-reset-api-key-usage", (_event, id) => {
    try {
      const server = initProxyServer();
      const config = server.getConfig();
      const apiKeys = config.apiKeys || [];
      const apiKey = apiKeys.find((k) => k.id === id);
      if (!apiKey) {
        return { success: false, error: "API key not found" };
      }
      apiKey.usage = {
        totalRequests: 0,
        totalCredits: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        daily: {}
      };
      server.updateConfig({ apiKeys });
      if (store) {
        store.set("proxyConfig", server.getConfig());
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset usage"
      };
    }
  });
  electron.ipcMain.handle("proxy-add-account", (_event, account) => {
    try {
      const server = initProxyServer();
      server.getAccountPool().addAccount(account);
      return { success: true, accountCount: server.getAccountPool().size };
    } catch (error) {
      console.error("[ProxyServer] Add account failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add account"
      };
    }
  });
  electron.ipcMain.handle("proxy-remove-account", (_event, accountId) => {
    try {
      const server = initProxyServer();
      server.getAccountPool().removeAccount(accountId);
      return { success: true, accountCount: server.getAccountPool().size };
    } catch (error) {
      console.error("[ProxyServer] Remove account failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove account"
      };
    }
  });
  electron.ipcMain.handle("proxy-sync-accounts", (_event, accounts) => {
    try {
      const server = initProxyServer();
      const pool = server.getAccountPool();
      pool.clear();
      for (const account of accounts.filter((account2) => !account2.suspended)) {
        pool.addAccount(account);
      }
      return { success: true, accountCount: pool.size };
    } catch (error) {
      console.error("[ProxyServer] Sync accounts failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync accounts"
      };
    }
  });
  electron.ipcMain.handle("proxy-get-accounts", () => {
    if (!proxyServer) {
      return { accounts: [], availableCount: 0 };
    }
    const pool = proxyServer.getAccountPool();
    return {
      accounts: pool.getAllAccounts(),
      availableCount: pool.availableCount
    };
  });
  electron.ipcMain.handle("proxy-refresh-models", () => {
    if (!proxyServer) {
      return { success: false, error: "Proxy server not initialized" };
    }
    proxyServer.clearModelCache();
    return { success: true };
  });
  electron.ipcMain.handle("proxy-get-models", async () => {
    if (!proxyServer) {
      return { success: false, error: "Proxy server not initialized", models: [] };
    }
    try {
      const result = await proxyServer.getAvailableModels();
      return { success: true, ...result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get models",
        models: []
      };
    }
  });
  electron.ipcMain.handle(
    "proxy-configure-clients",
    async (_event, input) => {
      try {
        const server = initProxyServer();
        const config = server.getConfig();
        const apiKey = (config.apiKey || config.apiKeys?.find((key) => key.enabled)?.key || "").trim();
        if (!apiKey) {
          return {
            success: false,
            proxyOrigin: "",
            openaiBaseUrl: "",
            results: [],
            error: "请先在反代配置中设置或启用 API Key"
          };
        }
        return await configureProxyClients({
          clients: input.clients,
          host: config.host,
          port: config.port,
          tlsEnabled: config.tls?.enabled,
          apiKey,
          modelId: input.modelId,
          modelName: input.modelName,
          models: input.models
        });
      } catch (error) {
        return {
          success: false,
          proxyOrigin: "",
          openaiBaseUrl: "",
          results: [],
          error: error instanceof Error ? error.message : "Failed to configure clients"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "account-get-models",
    async (_event, accessToken, region, profileArn, machineId, provider, authMethod, accountId) => {
      try {
        const models = await fetchKiroModels({
          id: accountId || "model-list-request",
          accessToken,
          region: region || "us-east-1",
          profileArn,
          machineId,
          provider,
          authMethod
        });
        return {
          success: true,
          models: models.map((m) => ({
            id: m.modelId,
            name: m.modelName,
            description: m.description,
            inputTypes: m.supportedInputTypes,
            maxInputTokens: m.tokenLimits?.maxInputTokens,
            maxOutputTokens: m.tokenLimits?.maxOutputTokens,
            rateMultiplier: m.rateMultiplier,
            rateUnit: m.rateUnit
          }))
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get models",
          models: []
        };
      }
    }
  );
  electron.ipcMain.handle(
    "account-get-subscriptions",
    async (_event, accessToken, region, profileArn, machineId, provider, authMethod, accountId) => {
      try {
        const result = await fetchAvailableSubscriptions({
          id: accountId || "subscription-request",
          accessToken,
          region: region || "us-east-1",
          profileArn,
          machineId,
          provider,
          authMethod
        });
        if (result.subscriptionPlans) {
          return {
            success: true,
            plans: result.subscriptionPlans,
            disclaimer: result.disclaimer
          };
        }
        return { success: false, error: "No subscription plans returned", plans: [] };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get subscriptions",
          plans: []
        };
      }
    }
  );
  electron.ipcMain.handle(
    "account-get-subscription-url",
    async (_event, accessToken, subscriptionType, region, profileArn, machineId, provider, authMethod, accountId) => {
      try {
        const result = await fetchSubscriptionToken(
          {
            id: accountId || "subscription-request",
            accessToken,
            region: region || "us-east-1",
            profileArn,
            machineId,
            provider,
            authMethod
          },
          subscriptionType
        );
        if (result.encodedVerificationUrl) {
          return { success: true, url: result.encodedVerificationUrl, status: result.status };
        }
        return { success: false, error: result.message || "No subscription URL returned" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get subscription URL"
        };
      }
    }
  );
  electron.ipcMain.handle(
    "account-set-overage",
    async (_event, accessToken, overageStatus, region, profileArn, machineId, provider, authMethod, accountId) => {
      try {
        const result = await setUserPreference(
          {
            id: accountId || "subscription-request",
            accessToken,
            region: region || "us-east-1",
            profileArn,
            machineId,
            provider,
            authMethod
          },
          overageStatus
        );
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to set overage"
        };
      }
    }
  );
  electron.ipcMain.handle("open-subscription-window", async (_event, url2) => {
    try {
      openBrowserInPrivateMode(url2);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open URL"
      };
    }
  });
  const getProxyLogsPath = () => path.join(electron.app.getPath("userData"), "proxy-request-logs.json");
  const MAX_LOGS = 100;
  electron.ipcMain.handle(
    "proxy-save-logs",
    async (_event, logs) => {
      try {
        const logsPath = getProxyLogsPath();
        const trimmedLogs = logs.slice(0, MAX_LOGS);
        await promises.writeFile(logsPath, JSON.stringify(trimmedLogs, null, 2), "utf-8");
        return { success: true };
      } catch (error) {
        console.error("[ProxyLogs] Save failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to save logs"
        };
      }
    }
  );
  electron.ipcMain.handle("proxy-load-logs", async () => {
    try {
      const logsPath = getProxyLogsPath();
      const content = await promises.readFile(logsPath, "utf-8");
      const logs = JSON.parse(content);
      return { success: true, logs };
    } catch (error) {
      return { success: true, logs: [] };
    }
  });
  electron.ipcMain.handle("proxy-reset-pool", () => {
    try {
      if (proxyServer) {
        proxyServer.getAccountPool().reset();
      }
      return { success: true };
    } catch (error) {
      console.error("[ProxyServer] Reset pool failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset pool"
      };
    }
  });
  electron.ipcMain.handle("kproxy-init", async () => {
    try {
      const savedConfig = store?.get("kproxyConfig");
      const service = initKProxyService(savedConfig || {}, {
        onRequest: (info) => {
          mainWindow?.webContents.send("kproxy-request", info);
        },
        onResponse: (info) => {
          mainWindow?.webContents.send("kproxy-response", info);
        },
        onError: (error) => {
          console.error("[KProxy] Error:", error);
          mainWindow?.webContents.send("kproxy-error", error.message);
        },
        onStatusChange: (running, port) => {
          mainWindow?.webContents.send("kproxy-status-change", { running, port });
        },
        onMitmIntercept: (host, modified) => {
          mainWindow?.webContents.send("kproxy-mitm", { host, modified });
        }
      });
      const caInfo = await service.initialize();
      return {
        success: true,
        caInfo: {
          certPath: caInfo.certPath,
          fingerprint: caInfo.fingerprint,
          validFrom: caInfo.validFrom.toISOString(),
          validTo: caInfo.validTo.toISOString()
        }
      };
    } catch (error) {
      console.error("[KProxy] Init failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to init K-Proxy"
      };
    }
  });
  electron.ipcMain.handle("kproxy-start", async (_event, config) => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      if (config) {
        service.updateConfig(config);
      }
      await service.start();
      if (store) {
        store.set("kproxyConfig", service.getConfig());
      }
      return { success: true, port: service.getConfig().port };
    } catch (error) {
      console.error("[KProxy] Start failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start K-Proxy"
      };
    }
  });
  electron.ipcMain.handle("kproxy-stop", async () => {
    try {
      const service = getKProxyService();
      if (service) {
        await service.stop();
      }
      return { success: true };
    } catch (error) {
      console.error("[KProxy] Stop failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop K-Proxy"
      };
    }
  });
  electron.ipcMain.handle("kproxy-get-status", () => {
    const service = getKProxyService();
    if (!service) {
      const savedConfig = store?.get("kproxyConfig");
      return { running: false, config: savedConfig || null, stats: null, caInfo: null };
    }
    return {
      running: service.isRunning(),
      config: service.getConfig(),
      stats: service.getStats(),
      caInfo: service.getCACertInfo()
    };
  });
  electron.ipcMain.handle("kproxy-update-config", async (_event, config) => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      service.updateConfig(config);
      const newConfig2 = service.getConfig();
      if (store) {
        store.set("kproxyConfig", newConfig2);
      }
      return { success: true, config: newConfig2 };
    } catch (error) {
      console.error("[KProxy] Update config failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update config"
      };
    }
  });
  electron.ipcMain.handle("kproxy-set-device-id", (_event, deviceId) => {
    try {
      if (!isValidDeviceId(deviceId)) {
        return { success: false, error: "Invalid device ID format (must be 64 hex characters)" };
      }
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      service.setDeviceId(deviceId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set device ID"
      };
    }
  });
  electron.ipcMain.handle("kproxy-generate-device-id", () => {
    return { success: true, deviceId: generateDeviceId() };
  });
  electron.ipcMain.handle("kproxy-add-device-mapping", (_event, mapping) => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      service.addDeviceIdMapping(mapping);
      const mappings = service.getAllDeviceIdMappings();
      if (store) {
        store.set("kproxyDeviceMappings", mappings);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add mapping"
      };
    }
  });
  electron.ipcMain.handle("kproxy-get-device-mappings", () => {
    const service = getKProxyService();
    if (!service) {
      const savedMappings = store?.get("kproxyDeviceMappings");
      return { success: true, mappings: savedMappings || [] };
    }
    return { success: true, mappings: service.getAllDeviceIdMappings() };
  });
  electron.ipcMain.handle("kproxy-switch-to-account", (_event, accountId) => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      const switched = service.switchToAccount(accountId);
      return { success: switched, error: switched ? void 0 : "No device ID mapping for account" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to switch account"
      };
    }
  });
  electron.ipcMain.handle("kproxy-get-ca-cert", () => {
    const service = getKProxyService();
    if (!service) {
      return { success: false, error: "K-Proxy not initialized" };
    }
    const certPem = service.getCACertPem();
    const caInfo = service.getCACertInfo();
    if (!certPem || !caInfo) {
      return { success: false, error: "CA certificate not available" };
    }
    return {
      success: true,
      certPem,
      certPath: caInfo.certPath,
      fingerprint: caInfo.fingerprint
    };
  });
  electron.ipcMain.handle("kproxy-export-ca-cert", async (_event, exportPath) => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      const certPem = service.getCACertPem();
      if (!certPem) {
        return { success: false, error: "CA certificate not available" };
      }
      let targetPath = exportPath;
      if (!targetPath) {
        const result = await electron.dialog.showSaveDialog({
          title: "Export CA Certificate",
          defaultPath: "kproxy-ca.crt",
          filters: [{ name: "Certificate", extensions: ["crt", "pem"] }]
        });
        if (result.canceled || !result.filePath) {
          return { success: false, error: "Export cancelled" };
        }
        targetPath = result.filePath;
      }
      await promises.writeFile(targetPath, certPem, "utf-8");
      return { success: true, path: targetPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to export certificate"
      };
    }
  });
  electron.ipcMain.handle("kproxy-reset-stats", () => {
    const service = getKProxyService();
    if (service) {
      service.resetStats();
    }
    return { success: true };
  });
  electron.ipcMain.handle("kproxy-check-ca-cert-installed", async () => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, installed: false, error: "K-Proxy not initialized" };
      }
      const { execSync: execSync2 } = await import("child_process");
      const platform = process.platform;
      if (platform === "win32") {
        try {
          const output = execSync2('certutil -store -user Root "K-Proxy CA"', { encoding: "utf-8" });
          return { success: true, installed: output.includes("K-Proxy CA") };
        } catch {
          return { success: true, installed: false };
        }
      } else if (platform === "darwin") {
        try {
          execSync2(
            'security find-certificate -c "K-Proxy CA" ~/Library/Keychains/login.keychain-db',
            { encoding: "utf-8" }
          );
          return { success: true, installed: true };
        } catch {
          return { success: true, installed: false };
        }
      } else {
        const fs2 = await import("fs");
        const targetPath = "/usr/local/share/ca-certificates/kproxy-ca.crt";
        return { success: true, installed: fs2.existsSync(targetPath) };
      }
    } catch (error) {
      console.error("[KProxy] Check CA cert installed failed:", error);
      return {
        success: false,
        installed: false,
        error: error instanceof Error ? error.message : "Check failed"
      };
    }
  });
  electron.ipcMain.handle("kproxy-install-ca-cert", async () => {
    try {
      const service = getKProxyService();
      if (!service) {
        return { success: false, error: "K-Proxy not initialized" };
      }
      const caInfo = service.getCACertInfo();
      if (!caInfo) {
        return { success: false, error: "CA certificate not available" };
      }
      const { execSync: execSync2 } = await import("child_process");
      const platform = process.platform;
      if (platform === "win32") {
        try {
          execSync2(`certutil -addstore -user Root "${caInfo.certPath}"`, { encoding: "utf-8" });
          return { success: true, message: "CA certificate installed to Windows certificate store" };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg.includes("already in store") || errMsg.includes("已在存储中")) {
            return { success: true, message: "CA certificate already installed" };
          }
          throw error;
        }
      } else if (platform === "darwin") {
        execSync2(
          `security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "${caInfo.certPath}"`
        );
        return { success: true, message: "CA certificate installed to macOS Keychain" };
      } else {
        const fs2 = await import("fs");
        const targetPath = "/usr/local/share/ca-certificates/kproxy-ca.crt";
        fs2.copyFileSync(caInfo.certPath, targetPath);
        execSync2("sudo update-ca-certificates");
        return { success: true, message: "CA certificate installed to Linux CA store" };
      }
    } catch (error) {
      console.error("[KProxy] Install CA cert failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to install certificate"
      };
    }
  });
  electron.ipcMain.handle("kproxy-uninstall-ca-cert", async () => {
    try {
      const { execSync: execSync2 } = await import("child_process");
      const platform = process.platform;
      if (platform === "win32") {
        try {
          execSync2('certutil -delstore -user Root "K-Proxy CA"', { encoding: "utf-8" });
          return { success: true, message: "CA certificate removed from Windows certificate store" };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg.includes("not found") || errMsg.includes("找不到")) {
            return { success: true, message: "CA certificate not found in store" };
          }
          throw error;
        }
      } else if (platform === "darwin") {
        execSync2(
          'security delete-certificate -c "K-Proxy CA" ~/Library/Keychains/login.keychain-db'
        );
        return { success: true, message: "CA certificate removed from macOS Keychain" };
      } else {
        const fs2 = await import("fs");
        const targetPath = "/usr/local/share/ca-certificates/kproxy-ca.crt";
        if (fs2.existsSync(targetPath)) {
          fs2.unlinkSync(targetPath);
          execSync2("sudo update-ca-certificates --fresh");
        }
        return { success: true, message: "CA certificate removed from Linux CA store" };
      }
    } catch (error) {
      console.error("[KProxy] Uninstall CA cert failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to uninstall certificate"
      };
    }
  });
  electron.ipcMain.handle(
    "save-mcp-server",
    async (_event, name, config, oldName) => {
      try {
        const os2 = await import("os");
        const fs2 = await import("fs");
        const path2 = await import("path");
        const homeDir = os2.homedir();
        const mcpPath = path2.join(homeDir, ".kiro", "settings", "mcp.json");
        let mcpConfig = { mcpServers: {} };
        if (fs2.existsSync(mcpPath)) {
          const content = fs2.readFileSync(mcpPath, "utf-8");
          mcpConfig = JSON.parse(content);
        }
        if (oldName && oldName !== name) {
          delete mcpConfig.mcpServers[oldName];
        }
        mcpConfig.mcpServers[name] = config;
        const dir = path2.dirname(mcpPath);
        if (!fs2.existsSync(dir)) {
          fs2.mkdirSync(dir, { recursive: true });
        }
        fs2.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
        console.log("[KiroSettings] Saved MCP server:", name);
        return { success: true };
      } catch (error) {
        console.error("[KiroSettings] Failed to save MCP server:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to save MCP server"
        };
      }
    }
  );
  electron.ipcMain.handle("delete-mcp-server", async (_event, name) => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const mcpPath = path2.join(homeDir, ".kiro", "settings", "mcp.json");
      if (!fs2.existsSync(mcpPath)) {
        return { success: false, error: "配置文件不存在" };
      }
      const content = fs2.readFileSync(mcpPath, "utf-8");
      const mcpConfig = JSON.parse(content);
      if (!mcpConfig.mcpServers || !mcpConfig.mcpServers[name]) {
        return { success: false, error: "服务器不存在" };
      }
      delete mcpConfig.mcpServers[name];
      fs2.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
      console.log("[KiroSettings] Deleted MCP server:", name);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to delete MCP server:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete MCP server"
      };
    }
  });
  electron.ipcMain.handle("delete-kiro-steering-file", async (_event, filename) => {
    try {
      const os2 = await import("os");
      const fs2 = await import("fs");
      const path2 = await import("path");
      const homeDir = os2.homedir();
      const filePath = path2.join(homeDir, ".kiro", "steering", filename);
      if (!fs2.existsSync(filePath)) {
        return { success: false, error: "文件不存在" };
      }
      fs2.unlinkSync(filePath);
      console.log("[KiroSettings] Deleted steering file:", filePath);
      return { success: true };
    } catch (error) {
      console.error("[KiroSettings] Failed to delete steering file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete file"
      };
    }
  });
  electron.ipcMain.handle("machine-id:get-os-type", () => {
    return getOSType();
  });
  electron.ipcMain.handle("machine-id:get-current", async () => {
    console.log("[MachineId] Getting current machine ID...");
    return await getCurrentMachineId$1();
  });
  electron.ipcMain.handle("machine-id:set", async (_event, newMachineId) => {
    console.log("[MachineId] Setting new machine ID:", newMachineId.substring(0, 8) + "...");
    const result = await setMachineId(newMachineId);
    if (!result.success && result.requiresAdmin) {
      const shouldRestart = await showAdminRequiredDialog();
      if (shouldRestart) {
        await requestAdminRestart();
      }
    }
    return result;
  });
  electron.ipcMain.handle("machine-id:generate-random", () => {
    return generateRandomMachineId();
  });
  electron.ipcMain.handle("machine-id:check-admin", async () => {
    return await checkAdminPrivilege();
  });
  electron.ipcMain.handle("machine-id:request-admin-restart", async () => {
    const shouldRestart = await showAdminRequiredDialog();
    if (shouldRestart) {
      return await requestAdminRestart();
    }
    return false;
  });
  electron.ipcMain.handle("machine-id:backup-to-file", async (_event, machineId) => {
    const result = await electron.dialog.showSaveDialog(mainWindow, {
      title: "备份机器码",
      defaultPath: "machine-id-backup.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      return false;
    }
    return await backupMachineIdToFile(machineId, result.filePath);
  });
  electron.ipcMain.handle("machine-id:restore-from-file", async () => {
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      title: "恢复机器码",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: "用户取消" };
    }
    return await restoreMachineIdFromFile(result.filePaths[0]);
  });
  const originalHandleProtocolUrl = handleProtocolUrl;
  handleProtocolUrl = (url2) => {
    if (!url2.startsWith(`${PROTOCOL_PREFIX}://`)) return;
    try {
      const urlObj = new URL(url2);
      if (url2.includes("authenticate-success") || url2.includes("auth")) {
        const code = urlObj.searchParams.get("code");
        const state = urlObj.searchParams.get("state");
        const error = urlObj.searchParams.get("error");
        if (error) {
          console.log("[Login] Auth callback error:", error);
          if (mainWindow) {
            mainWindow.webContents.send("social-auth-callback", { error });
            mainWindow.focus();
          }
          return;
        }
        if (code && state && mainWindow) {
          console.log("[Login] Auth callback received, code:", code.substring(0, 20) + "...");
          mainWindow.webContents.send("social-auth-callback", { code, state });
          mainWindow.focus();
        }
        return;
      }
      originalHandleProtocolUrl(url2);
    } catch (error) {
      console.error("Failed to parse protocol URL:", error);
    }
  };
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      if (process.platform === "darwin" && electron.app.dock) {
        electron.app.dock.show();
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  await loadShortcutSettings();
  registerShowWindowShortcut();
});
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", (_event, commandLine) => {
    const url2 = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_PREFIX}://`));
    if (url2) {
      handleProtocolUrl(url2);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
electron.app.on("open-url", (_event, url2) => {
  handleProtocolUrl(url2);
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("will-quit", async (event) => {
  if (isQuitting) return;
  if (lastSavedData && store) {
    event.preventDefault();
    isQuitting = true;
    const forceQuitTimer = setTimeout(() => {
      console.log("[Exit] Force quit due to timeout");
      unregisterProtocol();
      electron.app.exit(0);
    }, 3e3);
    try {
      console.log("[Exit] Saving data before quit...");
      flushStoreWrites();
      store.set("accountData", lastSavedData);
      await createBackup(lastSavedData);
      await flushBackupNow();
      try {
        const { proxyLogStore: proxyLogStore2 } = await Promise.resolve().then(() => logger);
        await proxyLogStore2.flushSaveNow();
      } catch (err) {
        console.error("[Exit] Failed to flush proxy logs:", err);
      }
      console.log("[Exit] Data saved successfully");
    } catch (error) {
      console.error("[Exit] Failed to save data:", error);
    }
    clearTimeout(forceQuitTimer);
    unregisterProtocol();
    electron.app.exit(0);
  } else {
    unregisterProtocol();
  }
});
exports.getUsageApiType = getUsageApiType;
exports.getUseKProxyForApi = getUseKProxyForApi;
exports.setUsageApiType = setUsageApiType;
exports.setUseKProxyForApi = setUseKProxyForApi;
