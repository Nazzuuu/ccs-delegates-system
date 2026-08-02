<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const {
  delegates, filtered, loading, error,
  searchQuery, filterStatus, filterYear, yearLevels, shortYear,
  markPaid, markUnpaid, markBackout, backoutList,
  ndMarkPaid, ndMarkUndo,
  loadDelegates
} = useDelegates()

onMounted(() => loadDelegates(true))

// ── Active tab ────────────────────────────────────────────────────────────
const activeTab = ref<'delegates' | 'non-delegates'>('delegates')

// ── Delegates tab pagination ──────────────────────────────────────────────
const PAGE_SIZE   = 10
const currentPage = ref(1)
watch([searchQuery, filterStatus, filterYear], () => { currentPage.value = 1 })
watch(activeTab, () => { currentPage.value = 1; ndCurrentPage.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

const paidCount    = computed(() => delegates.value.filter(d => d.status === 'Paid').length)
const unpaidCount  = computed(() => delegates.value.filter(d => d.status === 'Not Paid').length)
const backoutCount = computed(() => delegates.value.filter(d => d.status === 'Backout').length)

let _pageChanging = false
function prevPage() {
  if (_pageChanging || currentPage.value <= 1) return
  _pageChanging = true; currentPage.value--
  setTimeout(() => { _pageChanging = false }, 300)
}
function nextPage() {
  if (_pageChanging || currentPage.value >= totalPages.value) return
  _pageChanging = true; currentPage.value++
  setTimeout(() => { _pageChanging = false }, 300)
}

// ── Confirm dialog ────────────────────────────────────────────────────────
type ActionType = 'paid' | 'undo' | 'backout'
const confirmOpen    = ref(false)
const confirmLoading = ref(false)
const pendingId      = ref<number | null>(null)
const pendingAction  = ref<ActionType>('paid')
const pendingName    = ref('')

const dialogConfig: Record<ActionType, { title: string; message: (n: string) => string; label: string; cls: string }> = {
  paid:    { title: 'Mark as Paid',    message: n => `Mark "${n}" as Paid?`,                                                    label: 'Mark Paid', cls: 'btn-success'   },
  undo:    { title: 'Undo Payment',    message: n => `Revert "${n}" back to Not Paid?`,                                         label: 'Undo',      cls: 'btn-secondary' },
  backout: { title: 'Mark as Backout', message: n => `Mark "${n}" as Backout? They will be moved to the backout list.`,         label: 'Backout',   cls: 'btn-danger'    },
}

function askConfirm(id: number, name: string, action: ActionType) {
  pendingId.value = id; pendingName.value = name; pendingAction.value = action; confirmOpen.value = true
}

async function handleConfirm() {
  if (pendingId.value === null) return
  confirmLoading.value = true
  try {
    if (pendingAction.value === 'paid')    await markPaid(pendingId.value)
    if (pendingAction.value === 'undo')    await markUnpaid(pendingId.value)
    if (pendingAction.value === 'backout') await markBackout(pendingId.value)
  } finally {
    confirmLoading.value = false; confirmOpen.value = false; pendingId.value = null
  }
}

// ── Non-Delegates tab ─────────────────────────────────────────────────────
const ndSearch      = ref('')
const ndFilterYear  = ref('All')
const ndCurrentPage = ref(1)
const ND_PAGE_SIZE  = 10

const ndList = computed(() => delegates.value.filter(d => d.isBackout))
const ndPaidCount    = computed(() => ndList.value.filter(d => d.ndPaid).length)
const ndNotPaidCount = computed(() => ndList.value.filter(d => !d.ndPaid).length)

watch([ndSearch, ndFilterYear], () => { ndCurrentPage.value = 1 })

const ndFiltered = computed(() =>
  ndList.value.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(ndSearch.value.toLowerCase())
    const matchYear   = ndFilterYear.value === 'All' ||
      d.yearLevel.toLowerCase().replace(/\s+/g, ' ').trim() ===
      ndFilterYear.value.toLowerCase().replace(/\s+/g, ' ').trim()
    return matchSearch && matchYear
  })
)

const ndTotalPages = computed(() => Math.max(1, Math.ceil(ndFiltered.value.length / ND_PAGE_SIZE)))
const ndPaginated  = computed(() =>
  ndFiltered.value.slice((ndCurrentPage.value - 1) * ND_PAGE_SIZE, ndCurrentPage.value * ND_PAGE_SIZE)
)

const ndActionLoading = ref<Set<number>>(new Set())

async function handleNdMarkPaid(id: number) {
  if (ndActionLoading.value.has(id)) return
  ndActionLoading.value = new Set([...ndActionLoading.value, id])
  try { await ndMarkPaid(id) }
  finally { ndActionLoading.value = new Set([...ndActionLoading.value].filter(x => x !== id)) }
}

async function handleNdMarkUndo(id: number) {
  if (ndActionLoading.value.has(id)) return
  ndActionLoading.value = new Set([...ndActionLoading.value, id])
  try { await ndMarkUndo(id) }
  finally { ndActionLoading.value = new Set([...ndActionLoading.value].filter(x => x !== id)) }
}

let _ndPageChanging = false
function ndPrevPage() {
  if (_ndPageChanging || ndCurrentPage.value <= 1) return
  _ndPageChanging = true; ndCurrentPage.value--
  setTimeout(() => { _ndPageChanging = false }, 300)
}
function ndNextPage() {
  if (_ndPageChanging || ndCurrentPage.value >= ndTotalPages.value) return
  _ndPageChanging = true; ndCurrentPage.value++
  setTimeout(() => { _ndPageChanging = false }, 300)
}
</script>


<template>
  <div class="p-3 sm:p-6">

    <!-- Header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Students</h2>
      <p class="text-gray-500 text-sm mt-1">CCS Delegates — Payment Management</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
      <button
        @click="activeTab = 'delegates'"
        :class="activeTab === 'delegates'
          ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all"
      >Delegates</button>
      <button
        @click="activeTab = 'non-delegates'"
        :class="activeTab === 'non-delegates'
          ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all"
      >
        Non-Delegates
        <span v-if="backoutList.length" class="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-yellow-500 text-white">{{ backoutList.length }}</span>
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      {{ error }} — Make sure Strapi is running on port 1337.
    </div>

    <!-- ══ DELEGATES TAB — no stats, list + actions only ══════════════════ -->
    <template v-if="activeTab === 'delegates'">

      <!-- Search & Filters -->
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
              <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : shortYear(y) }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="card overflow-hidden">
        <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
          <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Loading delegates...
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[560px]">
            <thead><tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Student ID</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Status</th>
              <th class="table-th text-center">Action</th>
            </tr></thead>
            <tbody>
              <tr v-for="(d, idx) in paginated" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
                <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
                <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
                <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
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
              <tr v-if="paginated.length === 0"><td colspan="6" class="table-td text-center text-gray-400 py-10">No delegates found.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <p class="text-xs text-gray-500">Showing {{ filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filtered.length) }} of {{ filtered.length }}</p>
          <div class="flex items-center gap-2">
            <button @click="prevPage" :disabled="currentPage === 1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>
            <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
            <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">Next<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>
      </div>

    </template>
    <!-- ══ END DELEGATES TAB ══════════════════════════════════════════════ -->

    <!-- ══ NON-DELEGATES TAB — stats + list ══════════════════════════════ -->
    <template v-if="activeTab === 'non-delegates'">

      <!-- Stats (dashboard) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div class="card p-3 sm:p-4"><p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p><p class="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1">{{ ndList.length }}</p></div>
        <div class="card p-3 sm:p-4 border-green-200 dark:border-green-900"><p class="text-xs text-sync-green font-medium uppercase tracking-wide">Paid</p><p class="text-2xl sm:text-3xl font-bold text-sync-green mt-1">{{ ndPaidCount }}</p></div>
        <div class="card p-3 sm:p-4 border-red-200 dark:border-red-900"><p class="text-xs text-red-500 font-medium uppercase tracking-wide">Not Paid</p><p class="text-2xl sm:text-3xl font-bold text-red-500 mt-1">{{ ndNotPaidCount }}</p></div>
      </div>

      <!-- Filters -->
      <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div class="flex-1 relative">
            <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            </span>
            <input v-model="ndSearch" type="text" placeholder="Search name..." class="input-search pl-9"/>
          </div>
          <select v-model="ndFilterYear" class="input-search sm:w-auto sm:min-w-[140px]">
            <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : shortYear(y) }}</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="card overflow-hidden">
        <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
          <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Loading...
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[560px]">
            <thead><tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Student ID</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Status</th>
              <th class="table-th text-center">Action</th>
            </tr></thead>
            <tbody>
              <tr v-for="(d, idx) in ndPaginated" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <td class="table-td text-gray-400 text-xs">{{ (ndCurrentPage - 1) * ND_PAGE_SIZE + idx + 1 }}</td>
                <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
                <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
                <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
                <td class="table-td">
                  <span :class="d.ndPaid ? 'badge-paid' : 'badge-backout'">{{ d.ndPaid ? 'Paid' : 'Backout' }}</span>
                </td>
                <td class="table-td text-center">
                  <div class="flex items-center justify-center gap-1.5 flex-wrap">
                    <button v-if="!d.ndPaid" @click="handleNdMarkPaid(d.id)" :disabled="ndActionLoading.has(d.id)" class="btn-success inline-flex items-center gap-1 text-xs px-2.5 py-1 disabled:opacity-50">
                      <svg v-if="ndActionLoading.has(d.id)" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                      Paid
                    </button>
                    <button v-if="d.ndPaid" @click="handleNdMarkUndo(d.id)" :disabled="ndActionLoading.has(d.id)" class="btn-secondary inline-flex items-center gap-1 text-xs px-2.5 py-1 disabled:opacity-50">
                      <svg v-if="ndActionLoading.has(d.id)" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                      Undo
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="ndPaginated.length === 0">
                <td colspan="6" class="table-td text-center text-gray-400 py-10">
                  {{ ndList.length === 0 ? 'No non-delegates found.' : 'No results match your filters.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <p class="text-xs text-gray-500">Showing {{ ndFiltered.length === 0 ? 0 : (ndCurrentPage - 1) * ND_PAGE_SIZE + 1 }}–{{ Math.min(ndCurrentPage * ND_PAGE_SIZE, ndFiltered.length) }} of {{ ndFiltered.length }}</p>
          <div class="flex items-center gap-2">
            <button @click="ndPrevPage" :disabled="ndCurrentPage === 1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>
            <span class="text-xs text-gray-500 px-1">{{ ndCurrentPage }} / {{ ndTotalPages }}</span>
            <button @click="ndNextPage" :disabled="ndCurrentPage === ndTotalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">Next<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>
      </div>

    </template>
    <!-- ══ END NON-DELEGATES TAB ══════════════════════════════════════════ -->

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
