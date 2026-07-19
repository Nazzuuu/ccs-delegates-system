<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { delegates, loading, error, searchQuery, filterYear, yearLevels, markReceived, markNotReceived, loadDelegates } = useDelegates()

onMounted(() => loadDelegates())

const filterReceived = ref<'All' | 'Received' | 'Not Received'>('All')
const PAGE_SIZE = 10
const currentPage = ref(1)
watch([searchQuery, filterReceived, filterYear], () => { currentPage.value = 1 })

const paidDelegates = computed(() =>
  delegates.value.filter(d => {
    if (d.status !== 'Paid') return false
    const matchSearch = d.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchYear   = filterYear.value === 'All' || d.yearLevel === filterYear.value
    const matchRcv    = filterReceived.value === 'All'
      || (filterReceived.value === 'Received'     &&  d.isReceived)
      || (filterReceived.value === 'Not Received' && !d.isReceived)
    return matchSearch && matchYear && matchRcv
  })
)

const totalPages       = computed(() => Math.max(1, Math.ceil(paidDelegates.value.length / PAGE_SIZE)))
const paginated        = computed(() => paidDelegates.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))
const receivedCount    = computed(() => delegates.value.filter(d => d.status === 'Paid' &&  d.isReceived).length)
const notReceivedCount = computed(() => delegates.value.filter(d => d.status === 'Paid' && !d.isReceived).length)

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

// ── Confirm dialog ────────────────────────────────────────────────────────
const confirmOpen    = ref(false)
const confirmLoading = ref(false)
const pendingId      = ref<number | null>(null)
const pendingAction  = ref<'received' | 'not-received'>('received')
const pendingName    = ref('')

function askConfirm(id: number, name: string, action: 'received' | 'not-received') {
  pendingId.value     = id
  pendingName.value   = name
  pendingAction.value = action
  confirmOpen.value   = true
}

async function handleConfirm() {
  if (pendingId.value === null) return
  confirmLoading.value = true
  try {
    if (pendingAction.value === 'received')     await markReceived(pendingId.value)
    if (pendingAction.value === 'not-received') await markNotReceived(pendingId.value)
  } finally {
    confirmLoading.value = false
    confirmOpen.value    = false
    pendingId.value      = null
  }
}
</script>

<template>
  <div class="p-3 sm:p-6">

    <!-- Page header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Received</h2>
      <p class="text-gray-500 text-sm mt-1">CCS Delegates — T-shirt Claim Tracker</p>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      {{ error }} — Make sure Strapi is running on port 1337.
    </div>

    <!-- Stats row — full width on mobile, auto max on larger screens -->
    <div class="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6 sm:max-w-xs">
      <div class="card p-3 sm:p-4 border-green-200 dark:border-green-900">
        <p class="text-xs text-sync-green font-medium uppercase tracking-wide">Received</p>
        <p class="text-2xl sm:text-3xl font-bold text-sync-green mt-1">{{ receivedCount }}</p>
      </div>
      <div class="card p-3 sm:p-4 border-red-200 dark:border-red-900">
        <p class="text-xs text-red-500 font-medium uppercase tracking-wide">Not Received</p>
        <p class="text-2xl sm:text-3xl font-bold text-red-500 mt-1">{{ notReceivedCount }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <!-- Search -->
        <div class="flex-1 relative min-w-0">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search name..." class="input-search pl-9"/>
        </div>
        <!-- Selects — always side-by-side on all screen sizes -->
        <div class="flex gap-2 min-w-0">
          <select v-model="filterReceived" class="input-search flex-1 sm:flex-none sm:w-40">
            <option value="All">All</option>
            <option value="Received">Received</option>
            <option value="Not Received">Not Received</option>
          </select>
          <select v-model="filterYear" class="input-search flex-1 sm:flex-none sm:w-36">
            <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : y }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Table card -->
    <div class="card overflow-hidden">

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading delegates...
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[480px]">
          <thead>
            <tr>
              <!-- # hidden on small screens to save space -->
              <th class="table-th w-10 hidden sm:table-cell">#</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">T-shirt Status</th>
              <th class="table-th text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in paginated"
              :key="d.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <td class="table-td text-gray-400 text-xs hidden sm:table-cell">{{ (currentPage - 1) * 10 + idx + 1 }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ d.yearLevel }}</td>
              <td class="table-td">
                <span :class="d.isReceived ? 'badge-paid' : 'badge-unpaid'">
                  {{ d.isReceived ? 'Received' : 'Not Received' }}
                </span>
              </td>
              <td class="table-td text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <!-- Mark Received -->
                  <button
                    v-if="!d.isReceived"
                    @click="askConfirm(d.id, d.name, 'received')"
                    class="btn-success inline-flex items-center gap-1 text-xs px-2.5 py-1"
                  >
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    <!-- label hidden on xs to keep button compact -->
                    <span class="hidden sm:inline">Received</span>
                  </button>
                  <!-- Mark Not Received -->
                  <button
                    v-if="d.isReceived"
                    @click="askConfirm(d.id, d.name, 'not-received')"
                    class="btn-secondary inline-flex items-center gap-1 text-xs px-2.5 py-1"
                  >
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                    </svg>
                    <span class="hidden sm:inline">Not Received</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="paginated.length === 0">
              <td colspan="5" class="table-td text-center text-gray-400 py-10">No paid delegates found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      <div class="flex flex-col xs:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500 text-center xs:text-left">
          Showing
          {{ paidDelegates.length === 0 ? 0 : (currentPage - 1) * 10 + 1 }}–{{ Math.min(currentPage * 10, paidDelegates.length) }}
          of {{ paidDelegates.length }}
        </p>
        <div class="flex items-center gap-2 flex-shrink-0">
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

    <!-- Confirm dialog -->
    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingAction === 'received' ? 'Mark as Received' : 'Mark as Not Received'"
      :message="pendingAction === 'received'
        ? `Confirm that '${pendingName}' has claimed their t-shirt?`
        : `Revert '${pendingName}' back to Not Received?`"
      :confirm-label="pendingAction === 'received' ? 'Received' : 'Not Received'"
      :confirm-class="pendingAction === 'received' ? 'btn-success' : 'btn-secondary'"
      :loading="confirmLoading"
      @confirm="handleConfirm"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
