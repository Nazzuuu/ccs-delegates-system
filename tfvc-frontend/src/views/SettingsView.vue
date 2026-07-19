<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { deleteAllDelegates, fetchAppUsers, createAppUser, deleteAppUser, type AppUser } from '../api/strapi'
import { delegates } from '../composables/useDelegates'
import { isSuperAdmin } from '../composables/useAuth'

// ── Clear database ───────────────────────────────────────────────────────────
const showConfirm = ref(false)
const isClearing  = ref(false)
const dbSuccess   = ref('')
const dbError     = ref('')

function openConfirm() { dbSuccess.value = ''; dbError.value = ''; showConfirm.value = true }

async function confirmClear() {
  isClearing.value = true; dbError.value = ''; dbSuccess.value = ''
  try {
    await deleteAllDelegates()
    delegates.value  = []
    dbSuccess.value  = 'Database cleared. All delegate records have been removed.'
  } catch (e: any) {
    dbError.value = e.message ?? 'Failed to clear database.'
  } finally {
    isClearing.value = false; showConfirm.value = false
  }
}

// ── Accounts (super-admin only) ───────────────────────────────────────────────
const accounts      = ref<AppUser[]>([])
const acctLoading   = ref(false)
const acctError     = ref('')
const acctSuccess   = ref('')

const newEmail      = ref('')
const newPassword   = ref('')
const showNewPass   = ref(false)
const isAddingAcct  = ref(false)

const deleteTarget   = ref<AppUser | null>(null)
const isDeletingAcct = ref(false)

async function loadAccounts() {
  if (!isSuperAdmin.value) return
  acctLoading.value = true; acctError.value = ''
  try { accounts.value = await fetchAppUsers() }
  catch (e: any) { acctError.value = e.message ?? 'Failed to load accounts.' }
  finally { acctLoading.value = false }
}

async function addAccount() {
  acctError.value = ''; acctSuccess.value = ''
  if (!newEmail.value.trim() || !newPassword.value) {
    acctError.value = 'Email and password are required.'; return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.value.trim())) {
    acctError.value = 'Enter a valid email address.'; return
  }
  if (newPassword.value.length < 6) {
    acctError.value = 'Password must be at least 6 characters.'; return
  }
  isAddingAcct.value = true
  try {
    const created = await createAppUser({ email: newEmail.value.trim(), password: newPassword.value })
    accounts.value.push(created)
    acctSuccess.value = `Account "${created.email}" created.`
    newEmail.value = ''; newPassword.value = ''
  } catch (e: any) {
    acctError.value = e.message ?? 'Failed to create account.'
  } finally {
    isAddingAcct.value = false
  }
}

async function confirmDeleteAccount() {
  if (!deleteTarget.value) return
  isDeletingAcct.value = true; acctError.value = ''; acctSuccess.value = ''
  try {
    await deleteAppUser(deleteTarget.value.documentId)
    accounts.value = accounts.value.filter(a => a.id !== deleteTarget.value!.id)
    acctSuccess.value = `Account "${deleteTarget.value.email}" deleted.`
  } catch (e: any) {
    acctError.value = e.message ?? 'Failed to delete account.'
  } finally {
    isDeletingAcct.value = false; deleteTarget.value = null
  }
}

onMounted(loadAccounts)
</script>

<template>
  <div class="p-3 sm:p-6 max-w-2xl space-y-6 sm:space-y-8">

    <!-- Header -->
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Settings</h2>
      <p class="text-gray-500 text-sm mt-1">System configuration and maintenance</p>
    </div>

    <!-- ── Accounts Section (super-admin only) ──────────────── -->
    <div v-if="isSuperAdmin" class="card overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <svg class="w-4 h-4 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Account Management</h3>
      </div>

      <!-- Acct alerts -->
      <div class="px-5 pt-4">
        <div v-if="acctSuccess" class="mb-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          {{ acctSuccess }}
        </div>
        <div v-if="acctError" class="mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          {{ acctError }}
        </div>
      </div>

      <!-- Add account form (super-admin only) -->
      <div class="px-5 pb-4 pt-1">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Add New Account</p>
        <div class="flex flex-col gap-2">
          <input v-model="newEmail" type="email" placeholder="Email address" class="input-search"/>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input v-model="newPassword" :type="showNewPass ? 'text' : 'password'" placeholder="Password" class="input-search pr-8 w-full"/>
              <button type="button" @click="showNewPass = !showNewPass" tabindex="-1"
                class="absolute inset-y-0 right-2.5 flex items-center text-gray-400 hover:text-gray-600">
                <svg v-if="!showNewPass" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
            <button @click="addAccount" :disabled="isAddingAcct"
              class="btn-success inline-flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-60 flex-shrink-0">
              <svg v-if="isAddingAcct" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Add
            </button>
          </div>
        </div>
      </div>

      <!-- Accounts list -->
      <div class="border-t border-gray-100 dark:border-gray-800">
        <div v-if="acctLoading" class="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading accounts...
        </div>
        <div v-else>
          <!-- Super-admin row (always shown, not deletable) -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800/60">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-sync-green flex items-center justify-center flex-shrink-0">
                <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100">nazzrodin01@gmail.com</p>
                <p class="text-xs text-gray-400">Super Admin — hardcoded</p>
              </div>
            </div>
            <span class="text-xs font-semibold text-sync-green bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <!-- Dynamic accounts -->
          <div v-for="acct in accounts" :key="acct.id"
            class="flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <svg class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ acct.email }}</p>
                <p class="text-xs text-gray-400">{{ acct.isAdmin ? 'Admin' : 'User' }}</p>
              </div>
            </div>
            <button @click="deleteTarget = acct"
              class="text-red-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
          <div v-if="accounts.length === 0" class="px-5 py-4 text-xs text-gray-400 text-center">
            No additional accounts yet.
          </div>
        </div>
      </div>
    </div>

    <!-- ── Danger Zone ───────────────────────────────────────── -->
    <div class="card overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Danger Zone</h3>
      </div>
      <div v-if="dbSuccess" class="mx-5 mt-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        {{ dbSuccess }}
      </div>
      <div v-if="dbError" class="mx-5 mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        {{ dbError }}
      </div>
      <div class="px-5 py-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-gray-800 dark:text-gray-100">Clear Database</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Permanently delete all delegate records. This action <span class="font-semibold text-red-500">cannot be undone</span>.</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Current records: <span class="font-semibold text-gray-600 dark:text-gray-300">{{ delegates.length }}</span> delegates</p>
        </div>
        <button @click="openConfirm" class="btn-danger inline-flex items-center gap-1.5 text-xs px-3 py-2 sm:flex-shrink-0 self-start">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Clear Database
        </button>
      </div>
    </div>

    <!-- ── Modals ─────────────────────────────────────────────── -->
    <Teleport to="body">

      <!-- Clear DB confirm -->
      <div v-if="showConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showConfirm = false">
        <div class="card w-full max-w-md mx-4 shadow-xl">
          <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Clear Database</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">This action is irreversible</p>
            </div>
          </div>
          <div class="px-6 py-5">
            <p class="text-sm text-gray-700 dark:text-gray-300">You are about to permanently delete <span class="font-bold text-red-500">all {{ delegates.length }} delegate records</span>. Are you sure?</p>
          </div>
          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
            <button @click="showConfirm = false" class="btn-secondary text-xs px-4 py-2" :disabled="isClearing">Cancel</button>
            <button @click="confirmClear" :disabled="isClearing" class="btn-danger inline-flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-60">
              <svg v-if="isClearing" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              {{ isClearing ? 'Clearing...' : 'Yes, Clear All' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Delete account confirm -->
      <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="deleteTarget = null">
        <div class="card w-full max-w-md mx-4 shadow-xl">
          <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Delete Account</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">This cannot be undone</p>
            </div>
          </div>
          <div class="px-6 py-5">
            <p class="text-sm text-gray-700 dark:text-gray-300">Delete account <span class="font-bold text-gray-900 dark:text-white">{{ deleteTarget?.email }}</span>? They will no longer be able to log in.</p>
          </div>
          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
            <button @click="deleteTarget = null" class="btn-secondary text-xs px-4 py-2" :disabled="isDeletingAcct">Cancel</button>
            <button @click="confirmDeleteAccount" :disabled="isDeletingAcct" class="btn-danger inline-flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-60">
              <svg v-if="isDeletingAcct" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              {{ isDeletingAcct ? 'Deleting...' : 'Yes, Delete' }}
            </button>
          </div>
        </div>
      </div>

    </Teleport>
  </div>
</template>
