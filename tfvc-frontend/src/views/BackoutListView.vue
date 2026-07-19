<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDelegates } from '../composables/useDelegates'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { loading, error, yearLevels, backoutList, markUnpaid, loadDelegates } = useDelegates()
onMounted(() => loadDelegates())

const searchQuery = ref('')
const filterYear  = ref('All')
const PAGE_SIZE   = 10
const currentPage = ref(1)

watch([searchQuery, filterYear], () => { currentPage.value = 1 })

const filtered   = computed(() => backoutList.value.filter(d => {
  const matchSearch = d.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  const matchYear   = filterYear.value === 'All' || d.yearLevel === filterYear.value
  return matchSearch && matchYear
}))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

// ── Confirm ───────────────────────────────────────────────────────────────
const confirmOpen    = ref(false)
const confirmLoading = ref(false)
const pendingId      = ref<number | null>(null)
const pendingName    = ref('')

function askRestore(id: number, name: string) {
  pendingId.value   = id
  pendingName.value = name
  confirmOpen.value = true
}

async function handleConfirm() {
  if (pendingId.value === null) return
  confirmLoading.value = true
  try { await markUnpaid(pendingId.value) }
  finally { confirmLoading.value = false; confirmOpen.value = false; pendingId.value = null }
}
</script>

<template>
  <div class="p-3 sm:p-6">
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">List of Backout</h2>
      <p class="text-gray-500 text-sm mt-1">Delegates who backed out from the event</p>
    </div>

    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">⚠ {{ error }}</div>

    <div class="mb-4">
      <span class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
        Total Backout: <strong class="text-gray-800 dark:text-white">{{ backoutList.length }}</strong>
      </span>
    </div>

    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div class="flex-1 relative">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search name..." class="input-search pl-9"/>
        </div>
        <select v-model="filterYear" class="input-search sm:w-auto sm:min-w-[140px]">
          <option v-for="y in yearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : y }}</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
        Loading...
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[480px]">
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
              <td class="table-td"><span class="badge-backout">Backout</span></td>
              <td class="table-td text-center">
                <button @click="askRestore(d.id, d.name)" class="btn-warning inline-flex items-center gap-1 text-xs px-2.5 py-1">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Restore
                </button>
              </td>
            </tr>
            <tr v-if="paginated.length === 0"><td colspan="5" class="table-td text-center text-gray-400 py-10">No backout delegates found.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">Showing {{ filtered.length===0?0:(currentPage-1)*10+1 }}–{{ Math.min(currentPage*10,filtered.length) }} of {{ filtered.length }}</p>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="currentPage===1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Prev</button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage===totalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">Next<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      title="Restore Delegate"
      :message="`Restore '${pendingName}' back to Not Paid?`"
      confirm-label="Restore"
      confirm-class="btn-warning"
      :loading="confirmLoading"
      @confirm="handleConfirm"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
