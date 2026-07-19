<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import * as XLSX from 'xlsx'
import { useDelegates } from '../composables/useDelegates'
import { isSuperAdmin } from '../composables/useAuth'
import { importDelegates, type ImportRow } from '../api/strapi'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { delegates, loading, error, addDelegate, removeDelegate, yearLevels, loadDelegates } = useDelegates()
onMounted(() => loadDelegates())

const searchQuery = ref('')
const PAGE_SIZE   = 10
const currentPage = ref(1)
const showModal   = ref(false)
const newName     = ref('')
const newYear     = ref('First Year')
const addError    = ref('')

watch(searchQuery, () => { currentPage.value = 1 })

const filtered   = computed(() => delegates.value.filter(d => d.name.toLowerCase().includes(searchQuery.value.toLowerCase())))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated  = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }
function openModal() { newName.value = ''; newYear.value = 'First Year'; addError.value = ''; showModal.value = true }

// ── Add confirm ───────────────────────────────────────────────────────────
const addConfirmOpen    = ref(false)
const addConfirmLoading = ref(false)

function submitAdd() {
  if (!newName.value.trim()) { addError.value = 'Name is required.'; return }
  addError.value = ''
  addConfirmOpen.value = true
}

async function handleAddConfirm() {
  addConfirmLoading.value = true
  try { await addDelegate(newName.value.trim(), newYear.value); showModal.value = false; addConfirmOpen.value = false }
  catch (e: any) { addError.value = e.message ?? 'Failed to add.'; addConfirmOpen.value = false }
  finally { addConfirmLoading.value = false }
}

// ── Remove confirm ────────────────────────────────────────────────────────
const confirmOpen    = ref(false)
const confirmLoading = ref(false)
const pendingId      = ref<number | null>(null)
const pendingName    = ref('')

function askRemove(id: number, name: string) {
  pendingId.value   = id
  pendingName.value = name
  confirmOpen.value = true
}

async function handleConfirm() {
  if (pendingId.value === null) return
  confirmLoading.value = true
  try { await removeDelegate(pendingId.value) }
  finally { confirmLoading.value = false; confirmOpen.value = false; pendingId.value = null }
}

// ── File Import ───────────────────────────────────────────────────────────
type ImportStep = 'pick' | 'preview' | 'importing' | 'done'

const showImportModal  = ref(false)
const importStep       = ref<ImportStep>('pick')
const importFileInput  = ref<HTMLInputElement | null>(null)
const importFileName   = ref('')
const importParseError = ref('')
const importRows       = ref<ImportRow[]>([])
const importProgress   = ref(0)   // 0-100
const importResult     = ref<{ added: number; skipped: string[]; failed: string[] } | null>(null)

// Valid year level aliases from the file → canonical value
const YEAR_MAP: Record<string, string> = {
  'first year':  'First Year',  '1st year': 'First Year',  '1': 'First Year',
  'second year': 'Second Year', '2nd year': 'Second Year', '2': 'Second Year',
  'third year':  'Third Year',  '3rd year': 'Third Year',  '3': 'Third Year',
  'fourth year': 'Fourth Year', '4th year': 'Fourth Year', '4': 'Fourth Year',
}

function openImportModal() {
  importStep.value       = 'pick'
  importFileName.value   = ''
  importParseError.value = ''
  importRows.value       = []
  importProgress.value   = 0
  importResult.value     = null
  showImportModal.value  = true

  setTimeout(() => { if (importFileInput.value) importFileInput.value.value = '' }, 0)
}

function closeImportModal() {
  showImportModal.value = false
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importFileName.value   = file.name
  importParseError.value = ''
  importRows.value       = []

  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data     = ev.target?.result
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]
      
      const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      if (raw.length < 2) { importParseError.value = 'File is empty or has no data rows.'; return }

  
      const headers: string[] = raw[0].map((h: any) => String(h).toLowerCase().trim())
      const nameCol = headers.findIndex(h => h.includes('name'))
      const yearCol = headers.findIndex(h => h.includes('year'))

      if (nameCol === -1) { importParseError.value = 'Could not find a "name" column in the file.'; return }
      if (yearCol === -1) { importParseError.value = 'Could not find a "year" column in the file.'; return }

      const rows: ImportRow[] = []
      for (let i = 1; i < raw.length; i++) {
        const row  = raw[i]
        const name = String(row[nameCol] ?? '').trim()
        const rawYear = String(row[yearCol] ?? '').trim().toLowerCase()
        const year = YEAR_MAP[rawYear] ?? ''
        if (!name) continue
        rows.push({ name, yearLevel: year })
      }

      if (rows.length === 0) { importParseError.value = 'No valid data rows found after the header.'; return }
      importRows.value = rows
      importStep.value = 'preview'
    } catch (err: any) {
      importParseError.value = `Failed to parse file: ${err.message ?? err}`
    }
  }
  reader.readAsArrayBuffer(file)
}

async function runImport() {
  importStep.value    = 'importing'
  importProgress.value = 0

//......
  const timer = setInterval(() => {
    if (importProgress.value < 85) importProgress.value += 5
  }, 200)

  try {
    const result = await importDelegates(importRows.value, delegates.value)
    importResult.value   = result
    importProgress.value = 100
    importStep.value     = 'done'

    await loadDelegates(true)
  } finally {
    clearInterval(timer)
  }
}


const previewValid   = computed(() => importRows.value.filter(r => r.yearLevel !== '').length)
const previewInvalid = computed(() => importRows.value.filter(r => r.yearLevel === '').length)
</script>

<template>
  <div class="p-3 sm:p-6">
    <!-- Header -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Import Students</h2>
      <p class="text-gray-500 text-sm mt-1">Manage the full delegates list</p>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">
      ⚠ {{ error }}
    </div>

    <!-- Toolbar -->
    <div class="card p-3 sm:p-4 mb-3 sm:mb-4">
      <div class="flex gap-2 sm:gap-3">
        <div class="flex-1 relative min-w-0">
          <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search name..." class="input-search pl-9"/>
        </div>
        <!-- Import CSV button -->
        <button @click="openImportModal" class="btn-secondary inline-flex items-center gap-1.5 flex-shrink-0 text-sm font-medium">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4"/>
          </svg>
          <span class="hidden sm:inline">Import CSV</span>
          <span class="sm:hidden">Import</span>
        </button>
        <!-- Add Student button -->
        <button @click="openModal" class="btn-primary inline-flex items-center gap-1.5 flex-shrink-0">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span class="hidden sm:inline">Add Student</span>
          <span class="sm:hidden">Add</span>
        </button>
      </div>
    </div>

    <!-- Table card -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <svg class="animate-spin h-6 w-6 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading...
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[480px]">
          <thead>
            <tr>
              <th class="table-th w-10 hidden sm:table-cell">#</th>
              <th class="table-th">Name</th>
              <th class="table-th">Year Level</th>
              <th class="table-th">Status</th>
              <th class="table-th text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in paginated" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
              <td class="table-td text-gray-400 text-xs hidden sm:table-cell">{{ (currentPage-1)*10+idx+1 }}</td>
              <td class="table-td font-medium text-gray-800 dark:text-gray-100">{{ d.name }}</td>
              <td class="table-td text-xs text-gray-500 dark:text-gray-400">{{ d.yearLevel }}</td>
              <td class="table-td">
                <span :class="{'badge-paid':d.status==='Paid','badge-unpaid':d.status==='Not Paid','badge-backout':d.status==='Backout'}">{{ d.status }}</span>
              </td>
              <td class="table-td text-center">
                <button v-if="isSuperAdmin" @click="askRemove(d.id, d.name)" class="btn-danger inline-flex items-center gap-1 text-xs px-2.5 py-1">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  Remove
                </button>
                <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
              </td>
            </tr>
            <tr v-if="paginated.length === 0">
              <td colspan="5" class="table-td text-center text-gray-400 py-10">No students found.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-col xs:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <p class="text-xs text-gray-500">Showing {{ filtered.length===0?0:(currentPage-1)*10+1 }}–{{ Math.min(currentPage*10,filtered.length) }} of {{ filtered.length }}</p>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button @click="prevPage" :disabled="currentPage===1" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg> Prev
          </button>
          <span class="text-xs text-gray-500 px-1">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage===totalPages" class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
            Next <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Import CSV/Excel Modal ──────────────────────────────────────── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div v-if="showImportModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="importStep !== 'importing' && closeImportModal()">
          <div class="card w-full max-w-md mx-4 shadow-2xl overflow-hidden">

            <!-- Header -->
            <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                  <svg class="w-4 h-4 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4"/>
                  </svg>
                </div>
                <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Import Students</h3>
              </div>
              <button v-if="importStep !== 'importing'" @click="closeImportModal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Step: pick file -->
            <div v-if="importStep === 'pick'" class="px-5 py-5 space-y-4">
              <p class="text-sm text-gray-600 dark:text-gray-300">
                Upload a <strong>.csv</strong> or <strong>.xlsx / .xls</strong> file. The file must have at least two columns:
              </p>
              <ul class="text-xs text-gray-500 dark:text-gray-400 space-y-1 pl-4 list-disc">
                <li><span class="font-mono font-semibold text-gray-700 dark:text-gray-200">name</span> — full name (e.g. DELA CRUZ, JUAN)</li>
                <li><span class="font-mono font-semibold text-gray-700 dark:text-gray-200">yearLevel</span> — First Year / Second Year / Third Year / Fourth Year</li>
              </ul>
              <!-- File drop zone -->
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl px-4 py-8 cursor-pointer hover:border-sync-green hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors group">
                <svg class="w-8 h-8 text-gray-400 group-hover:text-sync-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span v-if="!importFileName" class="text-sm text-gray-500 dark:text-gray-400 group-hover:text-sync-green transition-colors">Click to choose a file</span>
                <span v-else class="text-sm font-medium text-sync-green truncate max-w-xs">{{ importFileName }}</span>
                <span class="text-xs text-gray-400">.csv, .xls, .xlsx</span>
                <input ref="importFileInput" type="file" accept=".csv,.xls,.xlsx" class="hidden" @change="onFileChange"/>
              </label>
              <p v-if="importParseError" class="text-xs text-red-500 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                {{ importParseError }}
              </p>
              <div class="flex justify-end">
                <button @click="closeImportModal" class="btn-secondary text-xs px-4 py-1.5">Cancel</button>
              </div>
            </div>

            <!-- Step: preview -->
            <div v-else-if="importStep === 'preview'" class="px-5 py-5 space-y-4">
              <div class="flex items-center gap-3">
                <div class="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-center">
                  <p class="text-xl font-bold text-sync-green">{{ previewValid }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ready to import</p>
                </div>
                <div v-if="previewInvalid > 0" class="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-center">
                  <p class="text-xl font-bold text-amber-500">{{ previewInvalid }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Unknown year level</p>
                </div>
              </div>
              <!-- Preview table: first 5 rows -->
              <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table class="w-full text-xs">
                  <thead><tr>
                    <th class="table-th py-2">Name</th>
                    <th class="table-th py-2">Year Level</th>
                    <th class="table-th py-2 text-center">Status</th>
                  </tr></thead>
                  <tbody>
                    <tr v-for="(r, i) in importRows.slice(0, 5)" :key="i" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td class="px-3 py-1.5 text-gray-700 dark:text-gray-300">{{ r.name }}</td>
                      <td class="px-3 py-1.5 text-gray-500 dark:text-gray-400">{{ r.yearLevel || '—' }}</td>
                      <td class="px-3 py-1.5 text-center">
                        <span v-if="r.yearLevel" class="badge-paid text-xs">Valid</span>
                        <span v-else class="badge-unpaid text-xs">Skip</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="importRows.length > 5" class="text-xs text-gray-400 text-center">…and {{ importRows.length - 5 }} more rows</p>
              <div class="flex gap-2 justify-end">
                <button @click="importStep = 'pick'" class="btn-secondary text-xs px-4 py-1.5">Back</button>
                <button @click="runImport" :disabled="previewValid === 0" class="btn-primary inline-flex items-center gap-1.5 text-xs px-4 py-1.5 disabled:opacity-50">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4"/>
                  </svg>
                  Import {{ previewValid }} students
                </button>
              </div>
            </div>

            <!-- Step: importing (progress) -->
            <div v-else-if="importStep === 'importing'" class="px-5 py-8 flex flex-col items-center gap-4">
              <svg class="animate-spin w-10 h-10 text-sync-green" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Importing students…</p>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div class="bg-sync-green h-2 rounded-full transition-all duration-300" :style="{ width: importProgress + '%' }"></div>
              </div>
              <p class="text-xs text-gray-400">{{ importProgress }}%</p>
            </div>

            <!-- Step: done -->
            <div v-else-if="importStep === 'done' && importResult" class="px-5 py-5 space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-800 dark:text-white">Import complete</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ importResult.added }} added
                    <span v-if="importResult.skipped.length">, {{ importResult.skipped.length }} skipped</span>
                    <span v-if="importResult.failed.length">, <span class="text-red-500">{{ importResult.failed.length }} failed</span></span>
                  </p>
                </div>
              </div>
              <div v-if="importResult.failed.length" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                <p class="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Failed entries:</p>
                <p class="text-xs text-red-500">{{ importResult.failed.join(', ') }}</p>
              </div>
              <div class="flex justify-end">
                <button @click="closeImportModal" class="btn-primary text-xs px-5 py-1.5">Done</button>
              </div>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Add student modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            Add New Student
          </h3>
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name</label>
              <input v-model="newName" type="text" placeholder="e.g. DELA CRUZ, JUAN" class="input-search" @keyup.enter="submitAdd"/>
              <p v-if="addError" class="text-red-500 text-xs mt-1">{{ addError }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Year Level</label>
              <select v-model="newYear" class="input-search">
                <option v-for="y in yearLevels.filter(y=>y!=='All')" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3 mt-5">
            <button @click="showModal=false" class="btn-secondary flex-1">Cancel</button>
            <button @click="submitAdd" class="btn-primary flex-1 inline-flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Add
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add student confirm -->
    <ConfirmDialog
      :open="addConfirmOpen"
      title="Add Student"
      :message="`Add '${newName}' (${newYear}) to the delegates list?`"
      confirm-label="Add Student"
      confirm-class="btn-primary"
      :loading="addConfirmLoading"
      @confirm="handleAddConfirm"
      @cancel="addConfirmOpen = false"
    />

    <!-- Remove student confirm -->
    <ConfirmDialog
      :open="confirmOpen"
      title="Remove Student"
      :message="`Remove '${pendingName}' from the delegates list? This cannot be undone.`"
      confirm-label="Remove"
      confirm-class="btn-danger"
      :loading="confirmLoading"
      @confirm="handleConfirm"
      @cancel="confirmOpen = false"
    />
  </div>
</template>>
