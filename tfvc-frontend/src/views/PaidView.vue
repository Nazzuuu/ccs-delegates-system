<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  fetchAllDelegates,
  fetchAttRecords,
  fetchAttEvents,
  createAttStudent,
  fetchAttStudents,
  type StrapiDelegate,
  type AttRecord,
  type AttEvent,
  type AttStudent,
} from '../api/strapi'
import { useDelegates } from '../composables/useDelegates'

const { shortYear } = useDelegates()

// ── Local types ──────────────────────────────────────────────────────────────
interface PaidRow {
  id: number
  documentId: string
  name: string
  yearLevel: string
  status: 'First Day' | 'Second Day'
}

// ── State ────────────────────────────────────────────────────────────────────
const rows       = ref<PaidRow[]>([])
const loading    = ref(false)
const pulling    = ref(false)
const pullMsg    = ref('')
const pullError  = ref('')
const progress   = ref(0)

const searchQuery  = ref('')
const filterDay    = ref<'All' | 'First Day' | 'Second Day'>('All')
const filterYear   = ref('All')

const yearLevels = ['All', 'First Year', 'Second Year', 'Third Year', 'Fourth Year']

const PAGE_SIZE  = 15
const currentPage = ref(1)

// ── Filtering ────────────────────────────────────────────────────────────────
const filtered = computed(() =>
  rows.value.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchDay    = filterDay.value === 'All' || r.status === filterDay.value
    const matchYear   = filterYear.value === 'All' ||
      r.yearLevel.toLowerCase().trim() === filterYear.value.toLowerCase().trim()
    return matchSearch && matchDay && matchYear
  })
)

watch([searchQuery, filterDay, filterYear], () => { currentPage.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() =>
  filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE)
)

let _pageChanging = false
function prevPage() {
  if (_pageChanging || currentPage.value <= 1) return
  _pageChanging = true; currentPage.value--
  setTimeout(() => { _pageChanging = false }, 200)
}
function nextPage() {
  if (_pageChanging || currentPage.value >= totalPages.value) return
  _pageChanging = true; currentPage.value++
  setTimeout(() => { _pageChanging = false }, 200)
}

// ── Pull paid from Strapi delegates ──────────────────────────────────────────
async function handlePull() {
  pulling.value  = true
  pullMsg.value  = ''
  pullError.value = ''
  progress.value = 5

  try {
    // 1. Fetch all delegates — keep only Paid ones
    pullMsg.value  = 'Fetching paid delegates…'
    const delegates: StrapiDelegate[] = await fetchAllDelegates()
    const paid = delegates.filter(d => d.status === 'Paid')
    progress.value = 30

    if (paid.length === 0) {
      pullError.value = 'No paid delegates found in the system.'
      return
    }

    // 2. Fetch events sorted by date to determine "First Day" vs "Second Day"
    pullMsg.value = 'Fetching events…'
    const events: AttEvent[] = await fetchAttEvents()
    const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))
    // Map: eventId → day number (1-indexed)
    const eventDayMap = new Map<string, number>()
    sortedEvents.forEach((ev, idx) => eventDayMap.set(ev.id, idx + 1))
    progress.value = 50

    // 3. Fetch attendance records to determine which day each delegate attended
    pullMsg.value = 'Fetching attendance records…'
    const records: AttRecord[] = await fetchAttRecords()
    progress.value = 70

    // 4. Build PaidRow list — determine day status per paid delegate
    const built: PaidRow[] = paid.map(d => {
      // Match by name (delegates table uses name; att-records also has name)
      const delegateRecords = records.filter(
        r => r.name.toLowerCase().trim() === d.name.toLowerCase().trim()
      )

      let dayStatus: 'First Day' | 'Second Day' = 'First Day'

      if (delegateRecords.length > 0) {
        let minDay = Infinity
        for (const rec of delegateRecords) {
          const dayNum = eventDayMap.get(rec.eventId)
          if (dayNum !== undefined && dayNum < minDay) minDay = dayNum
        }
        if (minDay !== Infinity) {
          dayStatus = minDay <= 1 ? 'First Day' : 'Second Day'
        }
      }

      return {
        id:         d.id,
        documentId: d.documentId,
        name:       d.name,
        yearLevel:  d.yearLevel,
        status:     dayStatus,
      }
    })

    rows.value    = built
    progress.value = 100
    pullMsg.value  = `Pulled ${built.length} paid delegate${built.length !== 1 ? 's' : ''}.`
    currentPage.value = 1

  } catch (err: any) {
    pullError.value = err?.message ?? 'Failed to pull paid delegates. Check your connection.'
  } finally {
    pulling.value = false
    setTimeout(() => { progress.value = 0; pullMsg.value = '' }, 3000)
  }
}

// Load on mount
onMounted(() => handlePull())
</script>

<template>
  <div class="p-3 sm:p-6">

    <!-- Header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Paid</h2>
      <p class="text-gray-500 text-sm mt-1">Already paid delegates from the CCS Delegates system.</p>
    </div>

    <!-- Pull button + progress -->
    <div class="card p-3 sm:p-4 mb-3 sm:mb-4 flex flex-col gap-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          @click="handlePull"
          :disabled="pulling"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sync-green hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-fit"
        >
          <!-- Spinner while pulling -->
          <svg v-if="pulling" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <!-- Download icon when idle -->
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/>
          </svg>
          {{ pulling ? 'Pulling…' : 'Pull' }}
        </button>

        <!-- Progress bar -->
        <div v-if="pulling" class="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs">
          <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-sync-green rounded-full transition-all duration-300"
              :style="{ width: progress + '%' }"
            />
          </div>
          <span class="text-xs text-gray-500 w-8 text-right">{{ progress }}%</span>
        </div>

        <!-- Status message -->
        <p v-if="pullMsg && !pulling" class="text-sm text-sync-green font-medium">
          ✓ {{ pullMsg }}
        </p>
      </div>

      <!-- Error -->
      <div v-if="pullError" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        {{ pullError }}
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <!-- Search (short) -->
        <div class="relative sm:max-w-xs w-full">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search…" class="input-search pl-9" />
        </div>

        <!-- Day filter (First Day / Second Day) — left side of Year -->
        <select v-model="filterDay" class="input-search sm:w-auto sm:min-w-[150px]">
          <option value="All">All Days</option>
          <option value="First Day">First Day</option>
          <option value="Second Day">Second Day</option>
        </select>

        <!-- Year Level filter -->
        <select v-model="filterYear" class="input-search sm:w-auto sm:min-w-[150px]">
          <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Year' : shortYear(y) }}</option>
        </select>
      </div>
    </div>

    <!-- Table card -->
    <div class="card overflow-hidden">
      <!-- Loading skeleton -->
      <div v-if="loading || (pulling && rows.length === 0)" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading paid delegates…
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[560px]">
          <thead>
            <tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Department</th>
              <th class="table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, idx) in paginated"
              :key="r.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ r.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(r.yearLevel) }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">CCS</td>
              <td class="table-td">
                <span
                  :class="r.status === 'First Day'
                    ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'"
                >
                  {{ r.status }}
                </span>
              </td>
            </tr>
            <tr v-if="paginated.length === 0">
              <td colspan="5" class="table-td text-center text-gray-400 py-12">
                <div class="flex flex-col items-center gap-2">
                  <svg class="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                  <p>{{ rows.length === 0 ? 'Click "Pull" to load paid delegates.' : 'No results match your filters.' }}</p>
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
          <button @click="prevPage" :disabled="currentPage === 1"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Prev
          </button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages"
            class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
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
