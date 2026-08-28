# Blocked Accounts Auto-Update and Auto-Remove Fix

## Problem Summary

Previously, when accounts were detected as suspended/blocked, they were NOT automatically removed from the API Proxy pool, requiring manual "Sync Accounts" button clicks. This caused:

1. **Blocked accounts remained in the proxy pool** and continued receiving requests
2. **Manual intervention required** - users had to click "Sync Accounts" to remove them
3. **Auto-refresh skipped banned accounts** - once marked as banned, they were never checked again

## Root Causes

### 1. **ProxyPanel Auto-Sync Issue**
- **File**: `src/renderer/src/components/proxy/ProxyPanel.tsx:489-493`
- **Issue**: The `useEffect` had `syncAccounts` in dependencies, causing recreation loops
- **Fix**: Moved sync logic inline to avoid stale closures

### 2. **No Sync Trigger on Account Status Change**
- **Issue**: When accounts were marked as suspended, the proxy pool was not updated
- **Fix**: Added automatic sync triggers in 3 places:
  1. `App.tsx` - When receiving `proxy-account-update` event
  2. `accounts.ts` - In `updateAccountStatus()` when account becomes banned
  3. `accounts.ts` - In `handleBackgroundRefreshResult()` when refresh detects banned account

### 3. **Background Refresh Skipped Banned Accounts**
- **File**: `src/renderer/src/store/accounts.ts:2445`
- **Issue**: Auto-refresh explicitly skipped accounts with banned errors
- **Impact**: Once banned, accounts were never checked again
- **Note**: This is actually correct behavior - we don't want to keep hitting banned accounts. The fix is ensuring they're removed from the proxy pool immediately when detected.

## Changes Made

### 1. ProxyPanel.tsx (Line 488-543)
```typescript
// 账号变化时自动同步到代理池
useEffect(() => {
  if (!isRunning) return

  const syncAccountsToPool = async () => {
    // ... inline sync logic ...
    console.log('[ProxyPanel] Auto-synced accounts to pool:', result.accountCount)
  }

  syncAccountsToPool()
}, [accounts, isRunning, fetchStatus])
```
**Effect**: Accounts are now automatically synced whenever the account map changes

### 2. App.tsx (Line 192-268)
```typescript
if (update.suspended) {
  // ... update store ...
  
  // 立即同步账号池以移除该账号
  setTimeout(() => {
    // Fetch active accounts and sync to proxy pool
    window.api.proxySyncAccounts(proxyAccounts)
  }, 100)
}
```
**Effect**: When proxy server detects and reports a suspended account, it's immediately removed from the pool

### 3. accounts.ts - updateAccountStatus (Line 1279-1328)
```typescript
if (isBanned && !wasBanned) {
  // ... trigger webhook ...
  
  // 立即同步到反代池以移除被封禁的账号
  window.api.proxyGetStatus().then((proxyStatus) => {
    if (proxyStatus.running) {
      // Sync accounts to proxy pool
      window.api.proxySyncAccounts(proxyAccounts)
    }
  })
}
```
**Effect**: Any status update that results in a banned account triggers immediate sync

### 4. accounts.ts - handleBackgroundRefreshResult (Line 2521-2574)
```typescript
if (!success) {
  const isBanned = isBannedAccountError(error)
  // ... update store ...
  
  // 如果检测到账号被封禁，立即同步到反代池移除
  if (isBanned) {
    window.api.proxyGetStatus().then((proxyStatus) => {
      if (proxyStatus.running) {
        // Sync accounts to proxy pool
        window.api.proxySyncAccounts(proxyAccounts)
      }
    })
  }
}
```
**Effect**: Background refresh detecting banned accounts triggers immediate sync

## How It Works Now

### Automatic Detection & Removal Flow:

1. **During API Request**:
   - Proxy server detects 423/AccountSuspendedException
   - Calls `accountPool.markSuspended(accountId)` (removes from pool)
   - Sends `proxy-account-update` event to renderer
   - Renderer updates store and triggers sync (double insurance)

2. **During Auto-Refresh**:
   - Background refresh detects banned error
   - Updates account status in store
   - `handleBackgroundRefreshResult()` detects ban
   - Triggers immediate sync to proxy pool

3. **Manual Status Update**:
   - User or system calls `updateAccountStatus()`
   - Detects transition to banned state
   - Triggers immediate sync to proxy pool

4. **Account Map Changes**:
   - ProxyPanel's useEffect detects account changes
   - Automatically syncs to proxy pool if running
   - Ensures consistency between store and proxy pool

## Testing

1. **Start API Proxy service**
2. **Trigger account suspension** (use an account until it gets blocked)
3. **Observe logs**: Should see:
   ```
   [AccountPool] Account xxx marked as suspended and removed
   [Store] Account banned, syncing to proxy pool to remove it
   [ProxyPanel] Auto-synced accounts to pool: N
   ```
4. **Verify**: Account should be immediately removed from pool without manual "Sync Accounts" click

## Benefits

✅ **Automatic removal** - No manual intervention needed
✅ **Immediate sync** - Blocked accounts removed within 100ms
✅ **Multiple triggers** - Catches bans from all detection paths
✅ **Consistent state** - Store and proxy pool stay in sync
✅ **Better reliability** - No more requests to blocked accounts

## Notes

- The sync is debounced by executing after store updates settle (100ms delay)
- Sync only happens when proxy is running to avoid unnecessary operations
- The account pool's `addAccount()` already filters out suspended accounts
- The `isSuspendedAccount` check is consistent across all sync points
