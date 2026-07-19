<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { delegates, filtered, loading, error, searchQuery, filterStatus, filterYear, yearLevels, markPaid, markUnpaid, markBackout, loadDelegates } = useDelegates()

onMounted(() => loadDelegates())

const PAGE_SIZE = 10
const currentPage = ref(1)
watch([searchQuery, filterStatus, filterYear], () => { currentPage.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

const paidCount    = computed(() => delegates.value.filter(d => d.status === 'Paid').length)
const unpaidCount  = computed(() => delegates.value.filter(d => d.status === 'Not Paid').length)
const backoutCount = computed(() => delegates.value.filter(d => d.status === 'Backout').length)

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

// ── Confirm dialog state ──────────────────────────────────────────────────
type ActionType = 'paid' | 'undo' | 'backout'
const confirmOpen    = ref(false)
const confirmLoading = ref(false)
const pendingId      = ref<number | null>(null)
const pendingAction  = ref<ActionType>('paid')
const pendingName    = ref('')

const dialogConfig: Record<ActionType, { title: string; message: (n: string) => string; label: string; cls: string }> = {
  paid:    { title: 'Mark as Paid',    message: n => `Mark "${n}" as Paid?`,               label: 'Mark Paid',  cls: 'btn-success' },
  undo:    { title: 'Undo Payment',    message: n => `Revert "${n}" back to Not Paid?`,     label: 'Undo',       cls: 'btn-secondary' },
  backout: { title: 'Mark as Backout', message: n => `Mark "${n}" as Backout? They will be moved to the backout list.`, label: 'Backout', cls: 'btn-danger' },
}

function askConfirm(id: number, name: string, action: ActionType) {
  pendingId.value     = id
  pendingName.value   = name
  pendingAction.value = action
  confirmOpen.value   = true
}

async function handleConfirm() {
  if (pendingId.value === null) return
  confirmLoading.value = true
  try {
    if (pendingAction.value === 'paid')    await markPaid(pendingId.value)
    if (pendingAction.value === 'undo')    await markUnpaid(pendingId.value)
    if (pendingAction.value === 'backout') await markBackout(pendingId.value)
  } finally {
    confirmLoading.value = false
    confirmOpen.value    = false
    pendingId.value      = null
  }
}
</script>

<template>
  <div class="p-3 sm:p-6">
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Students</h2>
      <p class="text-gray-500 text-sm mt-1">CCS Delegates — Payment Management</p>
    </div>

    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      {{ error }} — Make sure Strapi is running on port 1337.
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div class="card p-3 sm:p-4"><p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p><p class="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1">{{ delegates.length }}</p></div>
      <div class="card p-3 sm:p-4 border-green-200 dark:border-green-900"><p class="text-xs text-sync-green font-medium uppercase tracking-wide">Paid</p><p class="text-2xl sm:text-3xl font-bold text-sync-green mt-1">{{ paidCount }}</p></div>
      <div class="card p-3 sm:p-4 border-red-200 dark:border-red-900"><p class="text-xs text-red-500 font-medium uppercase tracking-wide">Not Paid</p><p class="text-2xl sm:text-3xl font-bold text-red-500 mt-1">{{ unpaidCount }}</p></div>
      <div class="card p-3 sm:p-4"><p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Backout</p><p class="text-2xl sm:text-3xl font-bold text-gray-400 mt-1">{{ backoutCount }}</p></div>
    </div>

    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div class="flex-1 relative">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search name..." class="input-search pl-9"/>
        </div>
        <div class="flex gap-2">
          <select v-model="filterStatus" class="input-search flex-1 sm:flex-none sm:w-auto sm:min-w-[140px]">
            <option value="All">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Not Paid">Not Paid</option>
          </select>
          <select v-model="filterYear" class="input-search flex-1 sm:flex-none sm:w-auto sm:min-w-[140px]">
            <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : y }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
        Loading delegates...
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[560px]">
          <thead><tr>
            <th class="table-th w-10">#</th>
            <th class="table-th">Name</th>
            <th class="table-th">Year Level</th>
            <th class="table-th">Status</th>
            <th class="table-th text-center">Action</th>
          </tr></thead>
          <tbody>
            <tr v-for="(d, idx) in paginated" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
              <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * 10 + idx + 1 }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ d.yearLevel }}</td>
              <td class="table-td"><span :class="{'badge-paid': d.status==='Paid','badge-unpaid': d.status==='Not Paid','badge-backout': d.status==='Backout'}">{{ d.status }}</span></td>
              <td class="table-td text-center">
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                  <button v-if="d.status !== 'Paid'" @click="askConfirm(d.id, d.name, 'paid')" class="btn-success inline-flex items-center gap-1 text-xs px-2.5 py-1">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Paid
                  </button>
                  <button v-if="d.status === 'Paid'" @click="askConfirm(d.id, d.name, 'undo')" class="btn-secondary inline-flex items-center gap-1 text-xs px-2.5 py-1">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>Undo
                  </button>
                  <button v-if="d.status !== 'Backout'" @click="askConfirm(d.id, d.name, 'backout')" class="btn-danger inline-flex items-center gap-1 text-xs px-2.5 py-1">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>Backout
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="paginated.length === 0"><td colspan="5" class="table-td text-center text-gray-400 py-10">No delegates found.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">Showing {{ filtered.length === 0 ? 0 : (currentPage - 1) * 10 + 1 }}–{{ Math.min(currentPage * 10, filtered.length) }} of {{ filtered.length }}</p>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="currentPage === 1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">Next<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      :title="dialogConfig[pendingAction].title"
      :message="dialogConfig[pendingAction].message(pendingName)"
      :confirm-label="dialogConfig[pendingAction].label"
      :confirm-class="dialogConfig[pendingAction].cls"
      :loading="confirmLoading"
      @confirm="handleConfirm"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
