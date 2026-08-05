// Storage module for web server mode
// Provides account data persistence using electron-store compatible interface

import Store from 'electron-store'

const store = new Store({
  name: 'kiro-accounts',
  projectName: 'kiro-account-manager',
  cwd: process.env.KIRO_DATA_DIR || undefined
})

export async function loadAccounts() {
  try {
    const accountData = store.get('accountData')
    return accountData || { accounts: {} }
  } catch (error) {
    console.error('[Storage] Failed to load accounts:', error)
    throw error
  }
}

export async function saveAccounts(data) {
  try {
    store.set('accountData', data)
    console.log('[Storage] Accounts saved successfully')
  } catch (error) {
    console.error('[Storage] Failed to save accounts:', error)
    throw error
  }
}

export function getStore() {
  return store
}
