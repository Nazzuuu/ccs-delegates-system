<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'

const { delegates, filtered, loading, error, searchQuery, filterStatus, filterYear, yearLevels, shortYear, loadDelegates } = useDelegates()

onMounted(() => loadDelegates(true))

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

// ── Card list modal ───────────────────────────────────────────────────────
type CardFilter = 'All' | 'Paid' | 'Not Paid' | 'Backout'
const showCardList   = ref(false)
const cardListLabel  = ref<CardFilter>('All')
const modalSearch    = ref('')
const modalYearFilter = ref('All')

// Reset filters when opening a new card
function openCardList(label: CardFilter) {
  cardListLabel.value   = label
  modalSearch.value     = ''
  modalYearFilter.value = 'All'
  showCardList.value    = true
}
function closeCardList() { showCardList.value = false }

// Base list filtered by the card status
const cardBaseItems = computed(() => {
  if (cardListLabel.value === 'All') return delegates.value
  return delegates.value.filter(d => d.status === cardListLabel.value)
})

// Further filtered by modal search + year
const cardListItems = computed(() =>
  cardBaseItems.value.filter(d => {
    const matchName = d.name.toLowerCase().includes(modalSearch.value.toLowerCase())
    const matchYear = modalYearFilter.value === 'All' ||
      d.yearLevel.toLowerCase().replace(/\s+/g, ' ').trim() ===
      modalYearFilter.value.toLowerCase().replace(/\s+/g, ' ').trim()
    return matchName && matchYear
  })
)
</script>

<template>
  <div class="p-3 sm:p-6">
    <!-- Header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Dashboard</h2>
      <p class="text-gray-500 text-sm mt-1">CCS Delegates — Paid &amp; Received</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      {{ error }} — Make sure Strapi is running on port 1337.
    </div>

    <!-- Stats — full card is clickable -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">

      <!-- Total -->
      <button @click="openCardList('All')"
        class="card p-3 sm:p-4 flex flex-col gap-2 text-left w-full hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer group">
        <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p>
        <p class="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">{{ delegates.length }}</p>
        <div class="flex items-center gap-1 text-xs text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors mt-auto">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          View List
        </div>
      </button>

      <!-- Paid -->
      <button @click="openCardList('Paid')"
        class="card p-3 sm:p-4 border-green-200 dark:border-green-900 flex flex-col gap-2 text-left w-full hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer group">
        <p class="text-xs text-sync-green font-medium uppercase tracking-wide">Paid</p>
        <p class="text-2xl sm:text-3xl font-bold text-sync-green">{{ paidCount }}</p>
        <div class="flex items-center gap-1 text-xs text-sync-green/50 group-hover:text-sync-green transition-colors mt-auto">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          View List
        </div>
      </button>

      <!-- Not Paid -->
      <button @click="openCardList('Not Paid')"
        class="card p-3 sm:p-4 border-red-200 dark:border-red-900 flex flex-col gap-2 text-left w-full hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all cursor-pointer group">
        <p class="text-xs text-red-500 font-medium uppercase tracking-wide">Not Paid</p>
        <p class="text-2xl sm:text-3xl font-bold text-red-500">{{ unpaidCount }}</p>
        <div class="flex items-center gap-1 text-xs text-red-300 group-hover:text-red-500 transition-colors mt-auto">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          View List
        </div>
      </button>

      <!-- Backout -->
      <button @click="openCardList('Backout')"
        class="card p-3 sm:p-4 flex flex-col gap-2 text-left w-full hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer group">
        <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Backout</p>
        <p class="text-2xl sm:text-3xl font-bold text-gray-400">{{ backoutCount }}</p>
        <div class="flex items-center gap-1 text-xs text-gray-300 group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors mt-auto">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          View List
        </div>
      </button>

    </div>

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
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading delegates...
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[440px]">
          <thead>
            <tr>
              <th class="table-th w-10">#</th>
              <th class="table-th">Student ID</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in paginated" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
              <td class="table-td text-gray-400 text-xs">{{ (currentPage - 1) * 10 + idx + 1 }}</td>
              <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
              <td class="table-td">
                <span :class="{'badge-paid': d.status==='Paid','badge-unpaid': d.status==='Not Paid','badge-backout': d.status==='Backout'}">{{ d.status }}</span>
              </td>
            </tr>
            <tr v-if="paginated.length === 0">
              <td colspan="5" class="table-td text-center text-gray-400 py-10">No delegates found.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">
          Showing {{ filtered.length === 0 ? 0 : (currentPage - 1) * 10 + 1 }}–{{ Math.min(currentPage * 10, filtered.length) }} of {{ filtered.length }}
        </p>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="currentPage === 1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg> Prev
          </button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            Next <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Card List Modal ───────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100"
                leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showCardList" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" @click.self="closeCardList">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">

          <!-- Modal header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <h3 class="text-base font-bold text-gray-800 dark:text-white">
                {{ cardListLabel === 'All' ? 'All Delegates' : cardListLabel + ' Delegates' }}
                <span class="ml-1.5 text-sm font-normal text-gray-400">({{ cardListItems.length }})</span>
              </h3>
            </div>
            <button @click="closeCardList" class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Search + Year filter -->
          <div class="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex gap-2">
            <div class="flex-1 relative">
              <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
              </span>
              <input v-model="modalSearch" type="text" placeholder="Search name..." class="input-search pl-9 w-full"/>
            </div>
            <select v-model="modalYearFilter" class="input-search w-auto min-w-[120px]">
              <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : shortYear(y) }}</option>
            </select>
          </div>

          <!-- List -->
          <div class="overflow-y-auto flex-1">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr>
                  <th class="table-th w-10">#</th>
                  <th class="table-th">Student ID</th>
                  <th class="table-th">Name</th>
                  <th class="table-th">Year</th>
                  <th class="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(d, idx) in cardListItems" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                  <td class="table-td text-gray-400 text-xs">{{ idx + 1 }}</td>
                  <td class="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{{ d.studentId || '—' }}</td>
                  <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
                  <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ shortYear(d.yearLevel) }}</td>
                  <td class="table-td">
                    <span :class="{'badge-paid': d.status==='Paid','badge-unpaid': d.status==='Not Paid','badge-backout': d.status==='Backout'}">{{ d.status }}</span>
                  </td>
                </tr>
                <tr v-if="cardListItems.length === 0">
                  <td colspan="5" class="table-td text-center text-gray-400 py-8">No delegates found.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end flex-shrink-0">
            <button @click="closeCardList" class="btn-secondary inline-flex items-center gap-1.5 text-sm px-4 py-2">Close</button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

</template>
