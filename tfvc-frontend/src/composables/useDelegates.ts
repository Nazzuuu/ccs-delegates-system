import { ref, computed } from 'vue'
import {
  fetchAllDelegates,
  updateDelegate,
  createDelegate,
  deleteDelegate,
  type StrapiDelegate,
} from '../api/strapi'

export type { StrapiDelegate as Delegate }

// ── Shared singleton state across all views ────────────────────────────────
export const delegates = ref<StrapiDelegate[]>([])
export const loading = ref(false)
export const error = ref<string | null>(null)

let loaded = false

/** Load all delegates from Strapi. Skips if already loaded; pass force=true to reload. */
export async function loadDelegates(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    delegates.value = await fetchAllDelegates()
    loaded = true
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load delegates'
  } finally {
    loading.value = false
  }
}

// ── Composable ──────────────────────────────────────────────────────────────
export function useDelegates() {
  const searchQuery = ref('')
  const filterStatus = ref<'All' | 'Paid' | 'Not Paid'>('All')
  const filterYear = ref('All')

  const yearLevels = ['All', 'First Year', 'Second Year', 'Third Year', 'Fourth Year']

  const filtered = computed(() =>
    delegates.value.filter(d => {
      const matchSearch = d.name.toLowerCase().includes(searchQuery.value.toLowerCase())
      const matchStatus = filterStatus.value === 'All' || d.status === filterStatus.value
      const matchYear = filterYear.value === 'All' || d.yearLevel === filterYear.value
      return matchSearch && matchStatus && matchYear && d.status !== 'Backout'
    })
  )

  const backoutList = computed(() =>
    delegates.value.filter(d => d.status === 'Backout')
  )

  // ── Mutations: optimistic local update + sync to Strapi via documentId ───

  async function markPaid(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    d.status = 'Paid'
    d.isPaid = true
    await updateDelegate(d.documentId, { status: 'Paid', isPaid: true })
  }

  async function markUnpaid(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    d.status = 'Not Paid'
    d.isPaid = false
    await updateDelegate(d.documentId, { status: 'Not Paid', isPaid: false })
  }

  async function markBackout(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    d.status = 'Backout'
    d.isPaid = false
    await updateDelegate(d.documentId, { status: 'Backout', isPaid: false })
  }

  async function markReceived(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    d.isReceived = true
    await updateDelegate(d.documentId, { isReceived: true })
  }

  async function markNotReceived(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    d.isReceived = false
    await updateDelegate(d.documentId, { isReceived: false })
  }

  async function addDelegate(name: string, yearLevel: string) {
    const created = await createDelegate({
      name: name.toUpperCase(),
      yearLevel,
      status: 'Not Paid',
      isPaid: false,
      isReceived: false,
    })
    delegates.value.push(created)
  }

  async function removeDelegate(id: number) {
    const d = delegates.value.find(x => x.id === id)
    if (!d) return
    await deleteDelegate(d.documentId)
    const idx = delegates.value.findIndex(x => x.id === id)
    if (idx !== -1) delegates.value.splice(idx, 1)
  }

  return {
    delegates,
    loading,
    error,
    filtered,
    backoutList,
    searchQuery,
    filterStatus,
    filterYear,
    yearLevels,
    loadDelegates,
    markPaid,
    markUnpaid,
    markBackout,
    markReceived,
    markNotReceived,
    addDelegate,
    removeDelegate,
  }
}
