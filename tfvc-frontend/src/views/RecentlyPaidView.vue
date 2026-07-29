<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { delegates, loadDelegates } from '../composables/useDelegates'
import { useDelegates } from '../composables/useDelegates'

const { loading, error, shortYear } = useDelegates()

onMounted(() => loadDelegates(true))

// ── Filter / sort ──────────────────────────────────────────────────────────
const searchQuery  = ref('')
const filterPeriod = ref<'today' | 'yesterday' | 'last_week'>('today')
const filterYear   = ref('All')
const yearLevels   = ['All', 'First Year', 'Second Year', 'Third Year', 'Fourth Year']

const PAGE_SIZE   = 10
const currentPage = ref(1)

watch([searchQuery, filterPeriod, filterYear], () => { currentPage.value = 1 })

// ── Date helpers ───────────────────────────────────────────────────────────
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function isInPeriod(isoString: string | null): boolean {
  if (!isoString) return false
  const paidDate = new Date(isoString)
  const now      = new Date()

  if (filterPeriod.value === 'today') {
    return paidDate >= startOfDay(now) && paidDate <= endOfDay(now)
  }

  if (filterPeriod.value === 'yesterday') {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return paidDate >= startOfDay(yesterday) && paidDate <= endOfDay(yesterday)
  }

  if (filterPeriod.value === 'last_week') {
    // Last 7 days excluding today
    const startLW = new Date(now)
    startLW.setDate(startLW.getDate() - 7)
    startLW.setHours(0, 0, 0, 0)
    const endLW = endOfDay(now)
    return paidDate >= startLW && paidDate <= endLW
  }

  return false
}

// ── Computed list ──────────────────────────────────────────────────────────
const filtered = computed(() =>
  delegates.value
    .filter(d => {
      if (d.status !== 'Paid') return false
      if (!isInPeriod(d.paidAt)) return false
      const matchSearch = d.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        (d.studentId && d.studentId.toLowerCase().includes(searchQuery.value.toLowerCase()))
      const matchYear = filterYear.value === 'All' ||
        d.yearLevel.toLowerCase().trim() === filterYear.value.toLowerCase().trim()
      return matchSearch && matchYear
    })
    // Sort latest paid first
    .sort((a, b) => {
      const aTime = a.paidAt ? new Date(a.paidAt).getTime() : 0
      const bTime = b.paidAt ? new Date(b.paidAt).getTime() : 0
      return bTime - aTime
    })
)

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() =>
  filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE)
)

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

// ── Format time helper ─────────────────────────────────────────────────────
function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Period label ───────────────────────────────────────────────────────────
const periodLabel = computed(() => {
  if (filterPeriod.value === 'today')     return 'Today'
  if (filterPeriod.value === 'yesterday') return 'Yesterday'
  return 'Last 7 Days'
})
</script>

<template>
  <div class="p-3 sm:p-6">

    <!-- Header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Recently Paid</h2>
      <p class="text-gray-500 text-sm mt-1">Delegates who recently completed their payment.</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">
      ⚠ {{ error }}
    </div>

    <!-- Summary badge -->
    <div class="mb-4">
      <span class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <svg class="w-4 h-4 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        {{ periodLabel }}:&nbsp;<strong class="text-gray-800 dark:text-white">{{ filtered.length }}</strong>&nbsp;paid
      </span>
    </div>

    <!-- Filters row -->
    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">

        <!-- Search -->
        <div class="flex-1 min-w-0 relative">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search name or ID…"
            class="input-search pl-9 w-full"
          />
        </div>

        <!-- Period filter -->
        <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
          <button
            v-for="p in [
              { value: 'today',     label: 'Today'      },
              { value: 'yesterday', label: 'Yesterday'  },
              { value: 'last_week', label: 'Last Week'  },
            ]"
            :key="p.value"
            @click="filterPeriod = p.value as 'today' | 'yesterday' | 'last_week'"
            :class="[
              'px-3 py-2 text-xs sm:text-sm font-medium transition-colors',
              filterPeriod === p.value
                ? 'bg-sync-green text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            ]"
          >
            {{ p.label }}
          </button>
        </div>

        <!-- Year level filter -->
        <select v-model="filterYear" class="input-search sm:w-auto sm:min-w-[140px] flex-shrink-0">
          <option v-for="y in yearLevels" :key="y" :value="y">
            {{ y === 'All' ? 'All Years' : shortYear(y) }}
          </option>
        </select>

      </div>
    </div>

    <!-- Table card -->
    <div class="card overflow-hidden">

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading…
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[520px]">
          <thead>
            <tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Student ID</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Paid At</th>
              <th class="table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in paginated"
              :key="d.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
              <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">
                <div class="flex flex-col leading-tight">
                  <span>{{ formatDate(d.paidAt) }}</span>
                  <span class="text-gray-400">{{ formatTime(d.paidAt) }}</span>
                </div>
              </td>
              <td class="table-td">
                <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800">
                  Paid
                </span>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="paginated.length === 0">
              <td colspan="6" class="table-td text-center py-14">
                <div class="flex flex-col items-center gap-3 text-gray-400">
                  <svg class="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p class="text-sm">No recently paid delegates found for <strong class="text-gray-600 dark:text-gray-300">{{ periodLabel }}</strong>.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">
          Showing
          {{ filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filtered.length) }}
          of {{ filtered.length }}
        </p>
        <div class="flex items-center gap-2">
          <button
            @click="prevPage"
            :disabled="currentPage === 1"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Prev
          </button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button
            @click="nextPage"
            :disabled="currentPage === totalPages"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"
          >
            Next
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
