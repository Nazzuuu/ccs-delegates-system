<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'

const { delegates, loading, error, shortYear, loadDelegates } = useDelegates()
onMounted(() => loadDelegates(true))

// ── Filters ────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const filterYear  = ref('All')

const yearLevels = ['All', 'First Year', 'Second Year', 'Third Year', 'Fourth Year']

// Only Paid delegates
const paidDelegates = computed(() =>
  delegates.value.filter(d => d.status === 'Paid')
)

const filtered = computed(() =>
  paidDelegates.value.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      d.studentId.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchYear = filterYear.value === 'All' || d.yearLevel === filterYear.value
    return matchSearch && matchYear
  })
)

// ── Stats ──────────────────────────────────────────────────────────────────
const totalPaid     = computed(() => paidDelegates.value.length)
const totalAll      = computed(() => delegates.value.filter(d => d.status !== 'Backout').length)
const paidRate      = computed(() => totalAll.value === 0 ? 0 : Math.round((totalPaid.value / totalAll.value) * 100))

const byYear = computed(() => {
  const years = ['First Year', 'Second Year', 'Third Year', 'Fourth Year']
  return years.map(y => ({
    label: shortYear(y),
    paid: paidDelegates.value.filter(d => d.yearLevel === y).length,
    total: delegates.value.filter(d => d.yearLevel === y && d.status !== 'Backout').length,
  }))
})

// ── Pagination ──────────────────────────────────────────────────────────────
const PAGE_SIZE   = 15
const currentPage = ref(1)
const totalPages  = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated   = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

// ── Export CSV ──────────────────────────────────────────────────────────────
function exportCSV() {
  const rows = [
    ['#', 'Student ID', 'Name', 'Year Level', 'Status', 'Paid At'],
    ...filtered.value.map((d, i) => [
      i + 1,
      d.studentId,
      d.name,
      shortYear(d.yearLevel),
      d.status,
      d.paidAt ? new Date(d.paidAt).toLocaleString('en-PH') : '',
    ]),
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ccs-delegates-paid-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const statColors = ['text-blue-600', 'text-purple-600', 'text-orange-500', 'text-pink-600']
const barColors  = ['bg-blue-500', 'bg-purple-500', 'bg-orange-400', 'bg-pink-500']
</script>

<template>
  <div class="p-3 sm:p-6">
    <!-- Header -->
    <div class="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Reports</h2>
        <p class="text-gray-500 text-sm mt-1">CCS Delegates — Paid Summary Report</p>
      </div>
      <button @click="exportCSV"
        class="btn-secondary inline-flex items-center gap-2 text-sm px-4 py-2 self-start">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        Export CSV
      </button>
    </div>

    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">⚠ {{ error }}</div>

    <!-- Stats Dashboard -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <div class="card p-4">
        <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Delegates</p>
        <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{{ delegates.filter(d => d.status !== 'Backout').length }}</p>
      </div>
      <div class="card p-4 border-green-200 dark:border-green-900">
        <p class="text-xs text-sync-green font-medium uppercase tracking-wide">Total Paid</p>
        <p class="text-3xl font-bold text-sync-green mt-1">{{ totalPaid }}</p>
      </div>
      <div class="card p-4 border-red-200 dark:border-red-900">
        <p class="text-xs text-red-500 font-medium uppercase tracking-wide">Not Yet Paid</p>
        <p class="text-3xl font-bold text-red-500 mt-1">{{ delegates.filter(d => d.status === 'Not Paid').length }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Payment Rate</p>
        <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{{ paidRate }}%</p>
      </div>
    </div>

    <!-- Year Level Breakdown -->
    <div class="card p-4 mb-5">
      <h3 class="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Paid per Year Level</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div v-for="(y, i) in byYear" :key="y.label" class="flex flex-col gap-1.5">
          <div class="flex items-end justify-between">
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{{ y.label }}</span>
            <span :class="['text-sm font-bold', statColors[i]]">{{ y.paid }} / {{ y.total }}</span>
          </div>
          <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
            <div :class="['h-2 rounded-full transition-all', barColors[i]]"
              :style="`width:${y.total ? Math.round((y.paid/y.total)*100) : 0}%`">
            </div>
          </div>
          <span class="text-xs text-gray-400">{{ y.total ? Math.round((y.paid/y.total)*100) : 0 }}%</span>
        </div>
      </div>
    </div>

    <!-- Filter + Table -->
    <div class="card p-3 sm:p-4 mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div class="flex-1 relative">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search name or student ID..." class="input-search pl-9" />
        </div>
        <select v-model="filterYear" class="input-search sm:w-auto sm:min-w-[140px]">
          <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : shortYear(y) }}</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading...
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[540px]">
          <thead>
            <tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Student ID</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Status</th>
              <th class="table-th">Paid At</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in paginated" :key="d.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
              <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
              <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
              <td class="table-td">
                <span class="badge-paid">Paid</span>
              </td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">
                {{ d.paidAt ? new Date(d.paidAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }}
              </td>
            </tr>
            <tr v-if="paginated.length === 0">
              <td colspan="6" class="table-td text-center text-gray-400 py-10">No paid delegates found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">
          Showing {{ filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filtered.length) }} of {{ filtered.length }}
        </p>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="currentPage === 1"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Prev
          </button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            Next
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
