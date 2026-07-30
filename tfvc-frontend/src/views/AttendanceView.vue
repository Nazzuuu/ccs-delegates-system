<script setup lang="ts">
// CCS Attendance System — Strapi Backend (Railway)
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { login, logout, currentUser, isSuperAdmin } from '../composables/useAuth'
import {
  fetchAppUserByEmail, createAppUser, fetchAppUsers, deleteAppUser, type AppUser,
  fetchAttEvents,   createAttEvent,   updateAttEvent,   deleteAttEvent,   deleteAllAttEvents,  type AttEvent   as SAttEvent,
  fetchAttStudents, createAttStudent, updateAttStudent, deleteAttStudent, deleteAllAttStudents, bulkCreateAttStudents, type AttStudent,
  fetchAttRecords,  createAttRecord,  deleteAttRecord,  deleteAllAttRecords,  type AttRecord  as SAttRecord,
  fetchAttLogouts,  createAttLogout,  deleteAllAttLogouts, type AttLogout,
  fetchAttWinners,  createAttWinner,  deleteAttWinner,  deleteAllAttWinners,  type AttWinner,
  fetchAttSetting,  saveAttSetting,   type AttSetting,
  fetchAllDelegates, updateDelegate, toAttYearLevel, type StrapiDelegate,
} from '../api/strapi'

// Local interface aliases (kept for backward compat with template)
interface AttEvent  { id: string; name: string; type: string; date: string; venue: string; status: string }
interface Student   { id: string; studentId: string; name: string; yearLevel: string; dept: string; paidDay?: 'First Day' | 'Second Day' | null }
interface AttRecord { id: string; eventId: string; eventName: string; studentId: string; name: string; yearLevel: string; dept: string; date: string; timeIn: string }
interface LogoutRecord { id: string; eventId: string; eventName: string; studentId: string; name: string; yearLevel: string; dept: string; date: string; timeOut: string }
interface Winner    { id: string; studentId: string; name: string; yearLevel: string; eventId: string; eventName: string; drawDate: string }
interface RaffleEntry { studentId: string; name: string; yearLevel: string; dept: string; eventId?: string; eventName?: string }
interface AppSettings { acadYear: string; dept: string; allowDuplicate: boolean; raffleAttendeeOnly: boolean; activeEventId: string; loginMode: 'login' | 'logout' }
interface ToastItem  { id: number; msg: string; type: string }

const attAuth      = ref(false)
const authEmail    = ref('')
const authPassword = ref('')
const authShowPw   = ref(false)
const authError    = ref('')
const authLoading  = ref(false)
const authMode     = ref<'login'|'register'>('login')
const regName      = ref('')
const regEmail     = ref('')
const regPassword  = ref('')
const regConfirm   = ref('')
const regLoading   = ref(false)
const regError     = ref('')
const regSuccess   = ref('')
const ATT_SESSION  = 'ccs_att_session'

function loadAttSession() {
  const raw = localStorage.getItem(ATT_SESSION)
  if (raw) { try { const s = JSON.parse(raw); attAuth.value = !!s.email } catch {} }
}

async function handleAttLogin() {
  authError.value = ''
  if (!authEmail.value.trim() || !authPassword.value) { authError.value = 'Please enter email and password.'; return }
  authLoading.value = true
  const ok = await login(authEmail.value.trim(), authPassword.value)
  authLoading.value = false
  if (ok) {
    localStorage.setItem(ATT_SESSION, JSON.stringify({ email: authEmail.value.trim() }))
    attAuth.value = true
    activePage.value = 'dashboard'
    loadAll()
    startAutoRefresh()
  } else {
    authError.value = 'Invalid email or password.'
    authPassword.value = ''
  }
}

async function handleRegister() {
  regError.value = ''; regSuccess.value = ''
  if (!regName.value.trim() || !regEmail.value.trim() || !regPassword.value || !regConfirm.value) { regError.value = 'All fields are required.'; return }
  if (regPassword.value.length < 6) { regError.value = 'Password must be at least 6 characters.'; return }
  if (regPassword.value !== regConfirm.value) { regError.value = 'Passwords do not match.'; return }
  regLoading.value = true
  try {
    const existing = await fetchAppUserByEmail(regEmail.value.trim())
    if (existing) { regError.value = 'Email already registered.'; regLoading.value = false; return }
    await createAppUser({ email: regEmail.value.trim(), password: regPassword.value, isAdmin: false })
    regSuccess.value = 'Account created! You can now log in.'
    authMode.value = 'login'; authEmail.value = regEmail.value.trim()
    regName.value = regEmail.value = regPassword.value = regConfirm.value = ''
  } catch (e: any) { regError.value = e.message ?? 'Failed to create account.' }
  regLoading.value = false
}

function handleAttLogout() {
  logout(); attAuth.value = false
  localStorage.removeItem(ATT_SESSION)
  activePage.value = 'dashboard'
  authEmail.value = authPassword.value = ''
}

const confirmDialog = ref({ show: false, title: '', message: '', resolve: null as ((v: boolean) => void) | null })

function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise(resolve => {
    confirmDialog.value = { show: true, title, message, resolve }
  })
}
function onConfirmYes() { confirmDialog.value.resolve?.(true);  confirmDialog.value.show = false }
function onConfirmNo()  { confirmDialog.value.resolve?.(false); confirmDialog.value.show = false }

// ═══════════════ DARK MODE ═══════════════
const isDark = ref(false)
function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('ccs_dark', isDark.value ? '1' : '0')
  focusScanInput()
}
function loadDark() {
  isDark.value = localStorage.getItem('ccs_dark') === '1'
  document.documentElement.classList.toggle('dark', isDark.value)
}

// ═══════════════ WINNERS MODAL ═══════════════
const showWinnersModal = ref(false)
const confettiPieces = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  delay: Math.random() * 1.5,
  duration: 1.5 + Math.random() * 1.5,
  color: ['#22c55e','#3b82f6','#f59e0b','#a855f7','#ec4899','#06b6d4'][Math.floor(Math.random()*6)],
  size: 6 + Math.random() * 8
}))

type PageKey = 'dashboard'|'students'|'events'|'attendance'|'raffle'|'paid'|'reports'|'settings'
const activePage  = ref<PageKey>('dashboard')
const sidebarOpen = ref(true)
const isMobile    = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) {
    sidebarOpen.value = false
  }
}

const navItems: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: 'dashboard',  label: 'Dashboard',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>` },
  { key: 'students',   label: 'Students',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
  { key: 'events',     label: 'Events',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>` },
  { key: 'attendance', label: 'Attendance',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
  { key: 'raffle',     label: 'Raffle',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>` },
  { key: 'paid',       label: 'Paid',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
  { key: 'reports',    label: 'Reports',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
]

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function nowDate(): string { const date = new Date().toISOString().split('T')[0]; return date ?? '' }
function nowTime() { return new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const events     = ref<AttEvent[]>([])
const students   = ref<Student[]>([])
const attendance = ref<AttRecord[]>([])
const logouts    = ref<LogoutRecord[]>([])
const winners    = ref<Winner[]>([])
const settings   = ref<AppSettings>({ acadYear: '2025-2026', dept: 'College of Computer Studies', allowDuplicate: false, raffleAttendeeOnly: true, activeEventId: '', loginMode: 'login' })

function focusScanInput() {
  if (activePage.value !== 'attendance' || attTab.value !== 'scan') return
  nextTick(() => scanInputEl.value?.focus())
}

// ── Auto-refocus: whenever the attendance page is active, keep focus on scan input ──
// Clicking anywhere on the page (except interactive elements) refocuses the scan input
function handlePageClick(e: MouseEvent) {
  if (activePage.value !== 'attendance' || attTab.value !== 'scan') return
  const target = e.target as HTMLElement
  // Don't steal focus from intentional interactive elements
  const tag = target.tagName.toLowerCase()
  if (['input','select','textarea','button','a','label'].includes(tag)) return
  focusScanInput()
}

// ── Scan input auto-enter ─────────────────────────────────────────────────
// Auto-enter fires ONLY when:
//   1. The input has >= MIN_SCAN_LENGTH characters (full ID), AND
//   2. No new character has arrived for SCAN_SETTLE_MS (typing stopped)
// Manual entry of fewer characters always requires pressing Enter manually.
const MIN_SCAN_LENGTH = 7
const SCAN_SETTLE_MS  = 80
let scanLastKeypressTime: number | null = null
let scanIsManual = false
let scanAutoEnterTimer: ReturnType<typeof setTimeout> | null = null

function handleScanInput() {
  if (scanAutoEnterTimer) clearTimeout(scanAutoEnterTimer)
  scanLastKeypressTime = Date.now()

  const val = scanInput.value.trim()
  if (!val) { scanLastKeypressTime = null; return }

  // Only arm auto-enter if we have enough characters
  if (val.length >= MIN_SCAN_LENGTH) {
    scanAutoEnterTimer = setTimeout(() => {
      scanAutoEnterTimer = null
      scanLastKeypressTime = null
      if (scanInput.value.trim().length >= MIN_SCAN_LENGTH) {
        logAttendance()
      }
    }, SCAN_SETTLE_MS)
  }
  // If less than MIN_SCAN_LENGTH chars → do nothing, user must press Enter
}

const isLoading = ref(false)

async function loadAll(silent = false) {
  if (loadAllInProgress) return  // prevent overlapping fetches
  loadAllInProgress = true
  if (!silent) isLoading.value = true
  try {
    // Use allSettled so a slow/failing collection doesn't block the others from updating
    const [evtsR, stusR, recsR, logsR, winsR, cfgR] = await Promise.allSettled([
      fetchAttEvents(),
      fetchAttStudents(),
      fetchAttRecords(),
      fetchAttLogouts(),
      fetchAttWinners(),
      fetchAttSetting(),
    ])

    if (evtsR.status === 'fulfilled')
      events.value = evtsR.value.map(e => ({ id: e.id, name: e.name, type: e.type, date: e.date, venue: e.venue, status: e.status }))
    if (stusR.status === 'fulfilled')
      students.value = stusR.value.map(s => ({ id: s.id, studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept, paidDay: s.paidDay ?? null }))

    // ── Sync paidRows in real-time from the freshly fetched att-students ──
    // This makes paid checkbox changes on any device reflect everywhere within 1s
    if (stusR.status === 'fulfilled' && paidRows.value.length > 0) {
      const stuMap = new Map(stusR.value.map(s => [s.name.toUpperCase().trim(), s.paidDay ?? null]))
      paidRows.value = paidRows.value.map(r => ({
        ...r,
        status: stuMap.has(r.name.toUpperCase().trim())
          ? stuMap.get(r.name.toUpperCase().trim()) ?? null
          : r.status,
      }))
    }
    if (recsR.status === 'fulfilled')
      attendance.value = recsR.value.map(r => ({ id: r.id, eventId: r.eventId, eventName: r.eventName, studentId: r.studentId, name: r.name, yearLevel: r.yearLevel, dept: r.dept, date: r.date, timeIn: r.timeIn }))
    if (logsR.status === 'fulfilled')
      logouts.value = logsR.value.map(l => ({ id: l.id, eventId: l.eventId, eventName: l.eventName, studentId: l.studentId, name: l.name, yearLevel: l.yearLevel, dept: l.dept, date: l.date, timeOut: l.timeOut }))
    if (winsR.status === 'fulfilled')
      winners.value = winsR.value.map(w => ({ id: w.id, studentId: w.studentId, name: w.name, yearLevel: w.yearLevel, eventId: w.eventId, eventName: w.eventName, drawDate: w.drawDate }))
    if (cfgR.status === 'fulfilled') {
      settings.value   = { ...settings.value, ...cfgR.value }
      attEventId.value    = cfgR.value.activeEventId || ''
      raffleEventId.value = cfgR.value.activeEventId || ''
    }

    // If ALL failed, likely a network issue — show error only on non-silent load
    const allFailed = [evtsR, stusR, recsR, logsR, winsR, cfgR].every(r => r.status === 'rejected')
    if (allFailed && !silent) toast('Failed to load data from server.', 'error')
  } catch (e: any) {
    if (!silent) toast('Failed to load data from server: ' + (e.message ?? ''), 'error')
  } finally {
    loadAllInProgress = false
    if (!silent) isLoading.value = false
    if (!silent) focusScanInput()
  }
}

// ── Auto-refresh: silently poll Strapi every 5 seconds ──
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
const lastSynced = ref('')
let loadAllInProgress = false  // lock to prevent overlapping fetches

function startAutoRefresh() {
  if (autoRefreshTimer) return
  isLive.value = true
  autoRefreshTimer = setInterval(async () => {
    if (loadAllInProgress) return  // skip this tick if previous fetch is still running
    await loadAll(true)
    lastSynced.value = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }, 1000)
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null }
  isLive.value = false
}

// Live button = manual refresh trigger only; auto-refresh always stays running while logged in
function toggleLive() {
  loadAll(true)
}

const isLive = ref(false)
onUnmounted(() => {
  stopDrawTimer()
  stopAutoRefresh()
  if (scanAutoEnterTimer) clearTimeout(scanAutoEnterTimer)
  scanLastKeypressTime = null
  window.removeEventListener('resize', checkMobile)
})

const dashStats    = computed(() => ({ events: events.value.length, students: students.value.length, attendance: attendance.value.length, winners: winners.value.length }))
const recentEvents = computed(() => [...events.value].reverse().slice(0, 5))
const recentAtt    = computed(() => [...attendance.value].reverse().slice(0, 5))

// ── Dashboard new stats ────────────────────────────────────────────────────
// "Login" records = attendance where loginMode was 'login' (we tag by checking if a logout record also exists for same student+event+date)
// Simpler: total attendance records = logins. Logouts are tracked separately via logout mode records.
// Since logout deletes the login record, we count:
//   totalLogins  = all attendance records (each = a logged-in student)
//   totalLogouts = students who were logged in AND then logged out (no longer in attendance for that event today)
//   totalCompleted = students who have BOTH a login record at some point (we can't know deleted ones)
// Better approach: track logins = attendance.length, logouts = we store them separately if needed
// For now: Login count = current attendance records, Logout = students that appear in attendance but loginMode is logout context
// Practical definition used here:
//   Total Students = unique student IDs in students list
//   Total Logins   = unique student+event combos that have attendance record (logged in)
//   Total Logouts  = unique students across all events that do NOT have attendance today (have been scanned out - approximation)
//   Total Completed = students present in BOTH a login record and a corresponding logout (full cycle)
// Since logout deletes the login, we can only count from attendance records.
// Most useful stats given the data model:
const activeEventAttendance = computed(() =>
  attendance.value.filter(a => a.eventId === (settings.value.activeEventId || ''))
)

// ── Deduplicated student list (single source of truth for all dashboard stats) ──
// Removes duplicates by studentId (or name if no studentId), keeping first occurrence.
const uniqueStudents = computed(() => {
  const seen = new Set<string>()
  return students.value.filter(s => {
    const key = s.studentId?.trim() ? s.studentId.trim() : s.name.toUpperCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const dashTotalStudents  = computed(() => uniqueStudents.value.length)
const dashTotalLogins    = computed(() => {
  // unique students currently logged in for the active event today
  const s = new Set(activeEventAttendance.value.filter(a => a.date === nowDate()).map(a => a.studentId))
  return s.size
})
const dashTotalLogouts   = computed(() => {
  // unique students who have logged OUT for the active event today
  const activeLogouts = logouts.value.filter(l => l.eventId === (settings.value.activeEventId || '') && l.date === nowDate())
  return new Set(activeLogouts.map(l => l.studentId)).size
})
const dashTotalCompleted = computed(() => {
  // students who have BOTH a login AND logout record for the active event today
  const activeEventId = settings.value.activeEventId || ''
  const loggedInIds  = new Set(activeEventAttendance.value.filter(a => a.date === nowDate()).map(a => a.studentId))
  const loggedOutIds = new Set(logouts.value.filter(l => l.eventId === activeEventId && l.date === nowDate()).map(l => l.studentId))
  return [...loggedInIds].filter(id => loggedOutIds.has(id)).length
})

// ── 1st Day / 2nd Day stats ─────────────────────────────────────────────────
// Based on att-students[].paidDay field — use uniqueStudents to avoid double-counting
const dashTotalFirstDay  = computed(() => uniqueStudents.value.filter(s => s.paidDay === 'First Day').length)
const dashTotalSecondDay = computed(() => uniqueStudents.value.filter(s => s.paidDay === 'Second Day').length)

// Students who are tagged as 1st/2nd Day AND have a login record for active event today
const dashFirstDayLogins = computed(() => {
  const firstDayIds = new Set(uniqueStudents.value.filter(s => s.paidDay === 'First Day').map(s => s.studentId))
  return new Set(
    activeEventAttendance.value.filter(a => a.date === nowDate() && firstDayIds.has(a.studentId)).map(a => a.studentId)
  ).size
})
const dashSecondDayLogins = computed(() => {
  const secondDayIds = new Set(uniqueStudents.value.filter(s => s.paidDay === 'Second Day').map(s => s.studentId))
  return new Set(
    activeEventAttendance.value.filter(a => a.date === nowDate() && secondDayIds.has(a.studentId)).map(a => a.studentId)
  ).size
})

// ── Dashboard bar chart data ────────────────────────────────────────────────
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
function sameYear(a: string, b: string) {
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}
const dashChartData = computed(() => {
  return YEAR_LEVELS.map(year => {
    const total    = students.value.filter(s => sameYear(s.yearLevel, year)).length
    const loggedIn = new Set(
      activeEventAttendance.value
        .filter(a => sameYear(a.yearLevel, year) && a.date === nowDate())
        .map(a => a.studentId)
    ).size
    return { year, total, loggedIn }
  }).filter(b => b.total > 0)
})

// ── Dashboard modal ────────────────────────────────────────────────────────
type DashModalType = 'students' | 'logins' | 'logouts' | 'completed' | 'firstday' | 'secondday'
const dashModal = ref<{ show: boolean; type: DashModalType | null }>({ show: false, type: null })
const dashModalSearch = ref('')
const dashModalYear   = ref('')
const dashModalSort   = ref<'name' | 'id' | 'year'>('name')

function openDashModal(type: DashModalType) {
  dashModal.value = { show: true, type }
  dashModalSearch.value = ''
  dashModalYear.value   = ''
  dashModalSort.value   = 'name'
}
function closeDashModal() { dashModal.value = { show: false, type: null } }

interface DashRow { studentId: string; name: string; yearLevel: string; dept: string; status?: string; timeIn?: string; date?: string }

const dashModalRows = computed<DashRow[]>(() => {
  let rows: DashRow[] = []
  const q    = dashModalSearch.value.toLowerCase()
  const year = dashModalYear.value
  const type = dashModal.value.type

  if (type === 'students') {
    rows = students.value.map(s => ({ studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept }))
  } else if (type === 'logins') {
    // currently logged-in students for active event today
    const seen = new Set<string>()
    rows = activeEventAttendance.value
      .filter(a => a.date === nowDate())
      .filter(a => { if (seen.has(a.studentId)) return false; seen.add(a.studentId); return true })
      .map(a => ({ studentId: a.studentId, name: a.name, yearLevel: a.yearLevel, dept: a.dept, status: 'Logged In', timeIn: a.timeIn, date: a.date }))
  } else if (type === 'logouts') {
    // all attendance records across all events (historical)
    rows = attendance.value.map(a => ({
      studentId: a.studentId, name: a.name, yearLevel: a.yearLevel, dept: a.dept,
      status: 'Attended', timeIn: a.timeIn, date: a.date
    }))
  } else if (type === 'completed') {
    // students with attendance record for active event
    const seen = new Set<string>()
    rows = activeEventAttendance.value
      .filter(a => { if (seen.has(a.studentId)) return false; seen.add(a.studentId); return true })
      .map(a => ({ studentId: a.studentId, name: a.name, yearLevel: a.yearLevel, dept: a.dept, status: 'Completed', timeIn: a.timeIn, date: a.date }))
  } else if (type === 'firstday') {
    rows = students.value
      .filter(s => s.paidDay === 'First Day')
      .map(s => ({ studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept, status: 'First Day' }))
  } else if (type === 'secondday') {
    rows = students.value
      .filter(s => s.paidDay === 'Second Day')
      .map(s => ({ studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept, status: 'Second Day' }))
  }

  // filter
  if (q)    rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q))
  if (year) rows = rows.filter(r => sameYear(r.yearLevel, year))

  // sort
  if (dashModalSort.value === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (dashModalSort.value === 'id')   rows = [...rows].sort((a, b) => a.studentId.localeCompare(b.studentId))
  if (dashModalSort.value === 'year') rows = [...rows].sort((a, b) => a.yearLevel.localeCompare(b.yearLevel))

  return rows
})

const dashModalTitle = computed(() => {
  switch (dashModal.value.type) {
    case 'students':  return 'All Students'
    case 'logins':    return `Logged In Today — ${attEventInfo?.value?.name ?? 'Active Event'}`
    case 'logouts':   return 'All Attendance Records'
    case 'completed': return `Completed — ${attEventInfo?.value?.name ?? 'Active Event'}`
    case 'firstday':  return '1st Day Students'
    case 'secondday': return '2nd Day Students'
    default: return ''
  }
})

const evtSearch    = ref('')
const showEvtModal = ref(false)
const editEvtId    = ref<string|null>(null)
const evtForm = ref<{ name: string; type: string; date: string; venue: string; desc: string }>({ name: '', type: 'CCS Event', date: '', venue: '', desc: '' })
const filteredEvents = computed(() => events.value.filter(e => e.name.toLowerCase().includes(evtSearch.value.toLowerCase()) || e.type.toLowerCase().includes(evtSearch.value.toLowerCase())))

function openAddEvent() { editEvtId.value = null; evtForm.value = { name: '', type: 'CCS Event', date: nowDate(), venue: '', desc: '' }; showEvtModal.value = true }
function openEditEvent(e: AttEvent) { editEvtId.value = e.id; evtForm.value = { name: e.name, type: e.type, date: e.date, venue: e.venue, desc: '' }; showEvtModal.value = true }
function saveEvent() {
  if (!evtForm.value.name.trim() || !evtForm.value.date) { toast('Event name and date are required.', 'error'); return }
  if (editEvtId.value) {
    updateAttEvent(editEvtId.value, { name: evtForm.value.name, type: evtForm.value.type, date: evtForm.value.date, venue: evtForm.value.venue })
      .then(() => { loadAll(true); toast('Event updated successfully.', 'success') })
      .catch(e => toast(e.message, 'error'))
  } else {
    createAttEvent({ name: evtForm.value.name, type: evtForm.value.type, date: evtForm.value.date, venue: evtForm.value.venue, status: 'Active' })
      .then(created => {
        events.value = [...events.value, { id: created.id, name: created.name, type: created.type, date: created.date, venue: created.venue, status: created.status }]
        toast('Event added successfully.', 'success')
      })
      .catch(e => toast(e.message, 'error'))
  }
  showEvtModal.value = false
}
async function deleteEvent(id: string) {
  const ev = events.value.find(e => e.id === id)
  const ok = await showConfirm('Delete Event', `Are you sure you want to delete "${ev?.name}"? This cannot be undone.`)
  if (!ok) return
  try {
    await deleteAttEvent(id)
    events.value = events.value.filter(e => e.id !== id)
    toast('Event deleted.', 'info')
  } catch (e: any) { toast(e.message, 'error') }
}

const stuSearch     = ref('')
const stuYearFilter = ref('')
const stuDayFilter  = ref<'All' | 'First Day' | 'Second Day'>('All')
const showStuModal  = ref(false)
const editStuId     = ref<string|null>(null)
const stuForm = ref<{ studentId: string; name: string; yearLevel: string; dept: string }>({ studentId: '', name: '', yearLevel: '1st Year', dept: 'CCS' })
const showImportModal = ref(false)
const excelInputEl  = ref<HTMLInputElement|null>(null)
const currentStudentPage = ref(1)
const studentsPerPage = ref(8)

// Map from UPPERCASE NAME → day status.
// Name is the only field shared between delegates and att-students.
// Priority: paidRows (in-session) > students[].paidDay (Strapi) > localStorage (offline fallback)
const paidDayMap = computed(() => {
  const m = new Map<string, 'First Day' | 'Second Day'>()
  // 1. localStorage fallback
  const stored = loadPaidDayFromStorage()
  for (const [nameKey, day] of Object.entries(stored)) {
    m.set(nameKey, day as 'First Day' | 'Second Day')
  }
  // 2. students[] paidDay from Strapi (overrides localStorage)
  for (const s of students.value) {
    if (s.paidDay) m.set(paidDayKeyOf(s.name), s.paidDay)
  }
  // 3. paidRows in-session state (most recent, overrides all)
  for (const r of paidRows.value) {
    if (r.status) m.set(paidDayKeyOf(r.name), r.status)
    else m.delete(paidDayKeyOf(r.name))  // also clear if explicitly unchecked
  }
  return m
})

const filteredStudents = computed(() =>
  students.value.filter(s => {
    const q = stuSearch.value.toLowerCase()
    const matchSearch = !q || s.studentId.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    const matchYear   = !stuYearFilter.value || s.yearLevel.toLowerCase().trim() === stuYearFilter.value.toLowerCase().trim()
    const matchDay    = stuDayFilter.value === 'All' || paidDayMap.value.get(paidDayKeyOf(s.name)) === stuDayFilter.value
    return matchSearch && matchYear && matchDay
  })
)
const studentPageCount = computed(() => Math.max(1, Math.ceil(filteredStudents.value.length / studentsPerPage.value)))
const studentPageStart = computed(() => filteredStudents.value.length ? (currentStudentPage.value - 1) * studentsPerPage.value + 1 : 0)
const studentPageEnd   = computed(() => Math.min(filteredStudents.value.length, currentStudentPage.value * studentsPerPage.value))
const paginatedStudents = computed(() => filteredStudents.value.slice((currentStudentPage.value - 1) * studentsPerPage.value, currentStudentPage.value * studentsPerPage.value))

watch([stuSearch, stuYearFilter, stuDayFilter], () => { currentStudentPage.value = 1 })
watch(filteredStudents, () => {
  if (currentStudentPage.value > studentPageCount.value) {
    currentStudentPage.value = studentPageCount.value
  }
})

function studentPrevPage() {
  if (currentStudentPage.value > 1) currentStudentPage.value--
}
function studentNextPage() {
  if (currentStudentPage.value < studentPageCount.value) currentStudentPage.value++
}

// ── Generate Barcodes ─────────────────────────────────────────────────────
function generateBarcodes() {
  // Use all students with a valid studentId, sorted by name
  const list = students.value
    .filter(s => s.studentId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!list.length) {
    alert('No students with Student IDs found.')
    return
  }

  const win = window.open('', '_blank', 'width=1000,height=750')
  if (!win) { alert('Please allow popups for this site.'); return }

  const cards = list.map((s, i) => `
    <div class="card">
      <svg class="barcode" id="bc-${i}"></svg>
      <div class="name">${s.name}</div>
      <div class="meta">${s.dept}</div>
    </div>
  `).join('')

  const barcodeInits = list.map((s, i) => `
    JsBarcode("#bc-${i}", "${s.studentId}", {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 6,
      background: "transparent"
    });
  `).join('')

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Student Barcodes</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 16px; }
    .toolbar {
      display: flex; align-items: center; gap: 12px;
      background: #fff; padding: 10px 16px;
      border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;
      border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    .btn-print {
      background: #3b82f6; color: #fff; border: none; padding: 8px 20px;
      border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-print:hover { background: #2563eb; }
    .btn-close {
      background: #e5e7eb; color: #374151; border: none; padding: 8px 16px;
      border-radius: 6px; cursor: pointer; font-size: 14px;
    }
    .btn-close:hover { background: #d1d5db; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 12px 8px 10px; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .barcode { width: 100%; max-width: 180px; }
    .name {
      font-size: 11px; font-weight: 700; color: #1e40af;
      margin-top: 6px; text-transform: uppercase; letter-spacing: 0.02em;
      word-break: break-word; line-height: 1.3;
    }
    .meta { font-size: 10px; color: #6b7280; margin-top: 2px; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none; }
      .grid { gap: 8px; }
      .card { box-shadow: none; border-color: #ddd; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">&#x1F5A8; Print Barcodes</button>
    <button class="btn-close" onclick="window.close()">Close</button>
    <span style="color:#6b7280;font-size:13px;margin-left:auto;">${list.length} students</span>
  </div>
  <div class="grid">${cards}</div>
  <script>
    window.onload = function() {
      ${barcodeInits}
    };
  <\/script>
</body>
</html>`)
  win.document.close()
}

function openAddStudent() { editStuId.value = null; stuForm.value = { studentId: '', name: '', yearLevel: '1st Year', dept: 'CCS' }; showStuModal.value = true }
function openEditStudent(s: Student) { editStuId.value = s.id; stuForm.value = { studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept }; showStuModal.value = true }
function openImportDialog() { showImportModal.value = true }
function chooseImportFile() { excelInputEl.value?.click() }
// Normalize any year level string to canonical "Nth Year" format used in the app
const YEAR_NORMALIZE_MAP: Record<string, string> = {
  'first year':  '1st Year', '1st year': '1st Year', '1styear': '1st Year', '1': '1st Year',
  '1st':         '1st Year', 'year 1': '1st Year', 'yr 1': '1st Year', 'yr1': '1st Year',
  'second year': '2nd Year', '2nd year': '2nd Year', '2ndyear': '2nd Year', '2': '2nd Year',
  '2nd':         '2nd Year', 'year 2': '2nd Year', 'yr 2': '2nd Year', 'yr2': '2nd Year',
  'third year':  '3rd Year', '3rd year': '3rd Year', '3rdyear': '3rd Year', '3': '3rd Year',
  '3rd':         '3rd Year', 'year 3': '3rd Year', 'yr 3': '3rd Year', 'yr3': '3rd Year',
  'fourth year': '4th Year', '4th year': '4th Year', '4thyear': '4th Year', '4': '4th Year',
  '4th':         '4th Year', 'year 4': '4th Year', 'yr 4': '4th Year', 'yr4': '4th Year',
}
function normalizeYearLevel(raw: string): string {
  const key = raw.trim().toLowerCase()
  return YEAR_NORMALIZE_MAP[key] ?? raw.trim()
}

function processImportFile(file: File) {
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const XLSX = (window as any).XLSX
      if (!XLSX) { toast('Excel library not loaded.', 'error'); return }
      const wb = XLSX.read(ev.target!.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      if (!rows.length) { toast('The file is empty.', 'error'); return }

      const header = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase())
      const hasStudentId = header.includes('studentid') || header.includes('student id') || header.some(h => h.includes('student') && h.includes('id'))
      const hasName = header.includes('name')
      const hasYear = header.includes('yearlevel') || header.includes('year level') || header.includes('year') || header.some(h => h.includes('year'))
      const hasDept = header.includes('dept') || header.includes('department') || header.some(h => h.includes('dept'))

      const isAttendanceImport = hasStudentId && (header.includes('timein') || header.includes('time in') || header.includes('date'))
      const isStudentImport = hasStudentId && hasName && hasYear && hasDept

      if (isAttendanceImport) {
        const records = [...attendance.value]
        let added = 0, skipped = 0

        const idx = (name: string[]) => name.map(n => n.toLowerCase()).findIndex(h => header.includes(h))
        const studentIdIdx = idx(['studentid', 'student id'])
        const nameIdx = idx(['name'])
        const yearIdx = idx(['yearlevel', 'year level', 'year'])
        const deptIdx = idx(['dept', 'department'])
        const eventIdx = idx(['event', 'eventname', 'event name'])
        const dateIdx = idx(['date'])
        const timeIdx = idx(['timein', 'time in', 'time'])

        rows.slice(1).forEach((row: any[]) => {
          const studentId = String(row[studentIdIdx] || '').trim()
          const name = String(row[nameIdx] || '').trim()
          const yearLevel = normalizeYearLevel(String(row[yearIdx] || '1st Year'))
          const dept = String(row[deptIdx] || 'CCS').trim()
          const eventName = String(row[eventIdx] || '').trim()
          const date = String(row[dateIdx] || nowDate()).trim()
          const timeIn = String(row[timeIdx] || '').trim()
          if (!studentId || !name || !eventName || !date || !timeIn) { skipped++; return }
          const event = events.value.find(e => e.name.toLowerCase() === eventName.toLowerCase())
          const eventId = event?.id || ''
          if (records.find(r => r.studentId === studentId && r.eventName.toLowerCase() === eventName.toLowerCase() && r.date === date && r.timeIn === timeIn)) { skipped++; return }
          records.push({ id: uid(), eventId, eventName, studentId, name, yearLevel, dept, date, timeIn })
          added++
        })

        // Push new records to Strapi in bulk
        const newRecs = records.filter(r => !attendance.value.find(a => a.id === r.id))
        Promise.all(newRecs.map(r => createAttRecord({ eventId: r.eventId, eventName: r.eventName, studentId: r.studentId, name: r.name, yearLevel: r.yearLevel, dept: r.dept, date: r.date, timeIn: r.timeIn })))
          .then(created => {
            attendance.value = [...attendance.value, ...created.map(c => ({ id: c.id, eventId: c.eventId, eventName: c.eventName, studentId: c.studentId, name: c.name, yearLevel: c.yearLevel, dept: c.dept, date: c.date, timeIn: c.timeIn }))]
          })
          .catch(e => toast('Some records failed to save: ' + e.message, 'error'))
        toast(`Imported ${added} attendance records. ${skipped} skipped.`, added ? 'success' : 'warning')
      } else if (isStudentImport) {
        const list = [...students.value]
        let added = 0, skipped = 0
        const studentIdIdx = header.findIndex(h => h === 'studentid' || h === 'student id' || h.includes('student') && h.includes('id'))
        const nameIdx = header.findIndex(h => h === 'name')
        const yearIdx = header.findIndex(h => h === 'yearlevel' || h === 'year level' || h === 'year' || h.includes('year'))
        const deptIdx = header.findIndex(h => h === 'dept' || h === 'department' || h.includes('dept'))

        rows.slice(1).forEach((row: any[]) => {
          const studentId = String(row[studentIdIdx] || '').trim()
          const name = String(row[nameIdx] || '').trim()
          // Only use fallback '1st Year' if the column itself is missing entirely (-1);
          // if the column exists but the cell is empty, keep it blank so it doesn't silently wrong-assign
          const rawYear = yearIdx >= 0 ? String(row[yearIdx] ?? '').trim() : ''
          const yearLevel = normalizeYearLevel(rawYear || '1st Year')
          const dept = deptIdx >= 0 ? String(row[deptIdx] || 'CCS').trim() : 'CCS'
          if (!studentId || !name) { skipped++; return }
          if (list.find(s => s.studentId === studentId)) { skipped++; return }
          if (list.find(s => s.name.toLowerCase() === name.toLowerCase())) { skipped++; return }
          list.push({ id: uid(), studentId, name, yearLevel, dept }); added++
        })
        bulkCreateAttStudents(list.filter(s => !students.value.find(x => x.id === s.id)).map(s => ({ studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept })))
          .then(res => {
            // Update local students state immediately rather than doing a full reload
            // (full silent reload can briefly show stale/empty data if Strapi is slow)
            loadAll(true)
            toast(`Imported ${res.added} students. ${skipped} skipped.${res.failed.length ? ' Some failed: ' + res.failed.join(', ') : ''}`, 'success')
          })
          .catch(e => toast(e.message, 'error'))
      } else {
        toast('File must include Student ID, Name, Year Level and Department for student import, or attendance columns for attendance import.', 'error')
      }
    } catch {
      toast('Failed to read file. Please use a valid CSV or Excel file.', 'error')
    } finally {
      showImportModal.value = false
    }
  }
  reader.readAsArrayBuffer(file)
}
function saveStudent() {
  if (!stuForm.value.studentId.trim() || !stuForm.value.name.trim()) { toast('Student ID and Name are required.', 'error'); return }
  if (editStuId.value) {
    updateAttStudent(editStuId.value, { studentId: stuForm.value.studentId, name: stuForm.value.name, yearLevel: stuForm.value.yearLevel, dept: stuForm.value.dept })
      .then(() => {
        const i = students.value.findIndex(s => s.id === editStuId.value)
        if (i !== -1) students.value[i] = { ...students.value[i], id: editStuId.value!, ...stuForm.value }
        toast('Student updated.', 'success')
      })
      .catch(e => toast(e.message, 'error'))
  } else {
    if (students.value.find(s => s.studentId === stuForm.value.studentId)) { toast('Student ID already exists.', 'error'); return }
    if (students.value.find(s => s.name.toLowerCase() === stuForm.value.name.trim().toLowerCase())) { toast(`"${stuForm.value.name.trim()}" already exists.`, 'error'); return }
    createAttStudent({ studentId: stuForm.value.studentId.trim(), name: stuForm.value.name.trim(), yearLevel: stuForm.value.yearLevel, dept: stuForm.value.dept })
      .then(created => {
        students.value = [...students.value, { id: created.id, studentId: created.studentId, name: created.name, yearLevel: created.yearLevel, dept: created.dept, paidDay: created.paidDay ?? null }]
        toast('Student added.', 'success')
      })
      .catch(e => toast(e.message, 'error'))
  }
  showStuModal.value = false
}
async function deleteStudent(id: string) {
  const s = students.value.find(x => x.id === id)
  const ok = await showConfirm('Delete Student', `Remove "${s?.name}" (${s?.studentId}) from the list?`)
  if (!ok) return
  try {
    await deleteAttStudent(id)
    students.value = students.value.filter(s => s.id !== id)
    toast('Student removed.', 'info')
  } catch (e: any) { toast(e.message, 'error') }
}
function triggerExcel() { excelInputEl.value?.click() }
function handleExcel(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  processImportFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

const attTab         = ref<'scan'|'records'>('scan')
const attEventId     = ref('')
const scanInput      = ref('')
const scanInputEl    = ref<HTMLInputElement|null>(null)
const scanStatus     = ref('')
const scanStatusType = ref<'success'|'error'|'warning'>('success')
const recSearch      = ref('')
const importDropActive = ref(false)

const attEventInfo = computed(() => events.value.find(e => e.id === attEventId.value))
const attendanceModeText = computed(() => settings.value.loginMode === 'logout' ? 'Logging out' : 'Logging in')
const attendanceActionLabel = computed(() => settings.value.loginMode === 'logout' ? 'Log out' : 'Log in')

function navigateTo(page: PageKey) {
  activePage.value = page
  if (isMobile.value) {
    sidebarOpen.value = false
  }
  if (page === 'attendance') {
    attTab.value = 'scan'
    nextTick(() => scanInputEl.value?.focus())
  }
}

function handleImportDragOver(e: DragEvent) {
  e.preventDefault()
  importDropActive.value = true
}
function handleImportDragLeave() {
  importDropActive.value = false
}
function handleImportDrop(e: DragEvent) {
  e.preventDefault()
  importDropActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processImportFile(file)
}
const todayLogs    = computed(() => {
  if (!attEventId.value) return []
  return attendance.value.filter(a => a.eventId === attEventId.value && a.date === nowDate()).reverse()
})
const filteredRecords = computed(() => {
  const q = recSearch.value.toLowerCase()
  return [...attendance.value].reverse().filter(a => !q || a.name.toLowerCase().includes(q) || a.studentId.toLowerCase().includes(q))
})

function logAttendance() {
  const sid = scanInput.value.trim()
  if (!sid) return
  if (!attEventId.value) { setScanStatus('Please select an event first.', 'error'); return }
  const student = students.value.find(s => s.studentId === sid)
  if (!student) { setScanStatus(`Student ID "${sid}" not found in the system.`, 'error'); scanInput.value = ''; scanInputEl.value?.focus(); return }
  const currentStudent = student as Student

  if (settings.value.loginMode === 'logout') {
    const existing = [...attendance.value].reverse().find(a => a.studentId === sid && a.eventId === attEventId.value && a.date === nowDate())
    if (!existing) {
      setScanStatus(`${currentStudent.name} has not logged in for this event today.`, 'warning')
      scanInput.value = ''
      scanInputEl.value?.focus()
      return
    }
    // Check if already logged out
    const alreadyOut = logouts.value.find(l => l.studentId === sid && l.eventId === attEventId.value && l.date === nowDate())
    if (alreadyOut) {
      setScanStatus(`${currentStudent.name} already logged out at ${alreadyOut.timeOut}.`, 'warning')
      scanInput.value = ''
      scanInputEl.value?.focus()
      return
    }
    // Record logout (keep attendance record intact)
    const ev = events.value.find(e => e.id === attEventId.value)
    const logoutRec: LogoutRecord = {
      id: uid(), eventId: attEventId.value, eventName: ev?.name ?? '—',
      studentId: currentStudent.studentId, name: currentStudent.name,
      yearLevel: currentStudent.yearLevel, dept: currentStudent.dept,
      date: nowDate(), timeOut: nowTime()
    }
    const newLogouts = [...logouts.value, logoutRec]
    logouts.value = newLogouts
    createAttLogout({ eventId: logoutRec.eventId, eventName: logoutRec.eventName, studentId: logoutRec.studentId, name: logoutRec.name, yearLevel: logoutRec.yearLevel, dept: logoutRec.dept, date: logoutRec.date, timeOut: logoutRec.timeOut })
      .then(saved => { logouts.value = [...logouts.value.filter(l => l !== logoutRec), { ...logoutRec, id: saved.id }] })
      .catch(e => toast('Failed to save logout: ' + e.message, 'error'))
    setScanStatus(`${currentStudent.name} logged out at ${logoutRec.timeOut}`, 'success')
    scanInput.value = ''
    scanInputEl.value?.focus()
    return
  }

  if (!settings.value.allowDuplicate) {
    const dup = attendance.value.find(a => a.studentId === sid && a.eventId === attEventId.value && a.date === nowDate())
    if (dup) { setScanStatus(`${currentStudent.name} is already logged in for this event (${dup.timeIn}).`, 'warning'); scanInput.value = ''; scanInputEl.value?.focus(); return }
  }

  const ev = events.value.find(e => e.id === attEventId.value)
  const eventName = ev?.name ?? '—'
  const rec: AttRecord = { id: uid(), eventId: attEventId.value, eventName, studentId: currentStudent.studentId, name: currentStudent.name, yearLevel: currentStudent.yearLevel, dept: currentStudent.dept, date: nowDate(), timeIn: nowTime() }
  attendance.value = [...attendance.value, rec]
  createAttRecord({ eventId: rec.eventId, eventName: rec.eventName, studentId: rec.studentId, name: rec.name, yearLevel: rec.yearLevel, dept: rec.dept, date: rec.date, timeIn: rec.timeIn })
    .then(saved => { attendance.value = [...attendance.value.filter(a => a !== rec), { ...rec, id: saved.id }] })
    .catch(e => toast('Failed to save attendance: ' + e.message, 'error'))
  setScanStatus(`${currentStudent.name} (${currentStudent.yearLevel}) logged in at ${rec.timeIn}`, 'success')
  scanInput.value = ''
  scanInputEl.value?.focus()
}
function setScanStatus(msg: string, type: 'success'|'error'|'warning') {
  scanStatus.value = msg; scanStatusType.value = type
  setTimeout(() => { scanStatus.value = '' }, 5000)
}
function exportAttendanceCSV() {
  if (!attendance.value.length) { toast('No records to export.', 'error'); return }
  const header = ['Student ID','Name','Year Level','Department','Event','Date','Time In']
  const rows = attendance.value.map(a => [a.studentId, a.name, a.yearLevel, a.dept, a.eventName, a.date, a.timeIn])
  const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `attendance_${nowDate()}.csv`; a.click()
  toast('Attendance exported!', 'success')
}

const raffleEventId  = ref('')
const raffleYearFilter = ref('')
const drawCount      = ref(5)
const latestWinners  = ref<Winner[]>([])
const showLatest     = ref(false)
const isDrawing      = ref(false)
const drawLabel      = ref('Ready to draw')
const drawTimer      = ref<number | null>(null)

const rafflePool = computed<RaffleEntry[]>(() => {
  if (!raffleEventId.value) return []
  const wonIds = new Set(winners.value.filter(w => w.eventId === raffleEventId.value).map(w => w.studentId))
  // Always use attendees of the selected event as the pool
  const attIds = [...new Set(attendance.value.filter(a => a.eventId === raffleEventId.value).map(a => a.studentId))]
  let pool: RaffleEntry[] = attIds
    .filter(id => !wonIds.has(id))
    .map(id => {
      const rec = attendance.value.find(a => a.studentId === id && a.eventId === raffleEventId.value)
      return rec ? { studentId: rec.studentId, name: rec.name, yearLevel: rec.yearLevel, dept: rec.dept, eventId: rec.eventId, eventName: rec.eventName } : null
    })
    .filter(Boolean) as RaffleEntry[]
  // Apply year filter if selected
  if (raffleYearFilter.value) {
    pool = pool.filter(e => sameYear(e.yearLevel, raffleYearFilter.value))
  }
  return pool
})

function stopDrawTimer() {
  if (drawTimer.value != null) {
    clearInterval(drawTimer.value)
    drawTimer.value = null
  }
}

function startDrawAnimation(pool: RaffleEntry[], count: number) {
  isDrawing.value = true
  latestWinners.value = []
  showLatest.value = false
  const first = pool[0]
  if (first) {
    drawLabel.value = `${first.name} · ${first.studentId}`
  } else {
    drawLabel.value = 'Drawing...'
  }
  stopDrawTimer()
  drawTimer.value = window.setInterval(() => {
    if (!pool.length) return
    const index = Math.floor(Math.random() * pool.length)
    const next = pool[index]
    if (!next) return
    drawLabel.value = `${next.name} · ${next.studentId}`
  }, 120)

  window.setTimeout(() => {
    stopDrawTimer()
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const left = shuffled[i]!
      const right = shuffled[j]!
      shuffled[i] = right
      shuffled[j] = left
    }
    const drawn = shuffled.slice(0, count)
    const ev = events.value.find(e => e.id === raffleEventId.value)
    const drawDate = new Date().toLocaleString('en-PH')
    const newW = drawn.map(d => ({ id: uid(), studentId: d.studentId, name: d.name, yearLevel: d.yearLevel, eventId: raffleEventId.value, eventName: ev?.name ?? '—', drawDate }))
    winners.value = [...winners.value, ...newW]
    Promise.all(newW.map(w => createAttWinner({ studentId: w.studentId, name: w.name, yearLevel: w.yearLevel, eventId: w.eventId, eventName: w.eventName, drawDate: w.drawDate })))
      .then(saved => { winners.value = [...winners.value.filter(w => !newW.includes(w)), ...saved.map((s, i) => ({ ...newW[i]!, id: s.id }))] })
      .catch(e => toast('Failed to save winners: ' + e.message, 'error'))
    latestWinners.value = newW
    showLatest.value = true
    showWinnersModal.value = true
    isDrawing.value = false
    drawLabel.value = 'Ready to draw'
    toast(`${newW.length} winner${newW.length !== 1 ? 's' : ''} drawn!`, 'success')
  }, 2600)
}

function doDraw() {
  if (!raffleEventId.value) { toast('Select an event first.', 'error'); return }
  const pool = rafflePool.value
  if (!pool.length) { toast('No eligible attendees in pool.', 'error'); return }
  const count = Math.min(drawCount.value, pool.length)
  startDrawAnimation(pool, count)
}

async function clearWinners() {
  const ok = await showConfirm('Clear Winners', raffleEventId.value ? 'Clear all winners for this event?' : 'Clear ALL raffle winners from every event?')
  if (!ok) return
  try {
    await deleteAllAttWinners(raffleEventId.value || undefined)
    winners.value = raffleEventId.value ? winners.value.filter(w => w.eventId !== raffleEventId.value) : []
    showLatest.value = false
    toast('Winners cleared.', 'info')
  } catch (e: any) { toast('Failed to clear winners: ' + e.message, 'error') }
}

const setForm = ref({ acadYear: '', dept: '', allowDuplicate: false, raffleAttendeeOnly: true, activeEventId: '', loginMode: 'login' as 'login' | 'logout' })

function loadSettingsForm() {
  setForm.value = { acadYear: settings.value.acadYear, dept: settings.value.dept, allowDuplicate: settings.value.allowDuplicate, raffleAttendeeOnly: settings.value.raffleAttendeeOnly, activeEventId: settings.value.activeEventId || '', loginMode: settings.value.loginMode || 'login' }
}
function saveSettings() {
  const s: AppSettings = { acadYear: setForm.value.acadYear, dept: setForm.value.dept, allowDuplicate: setForm.value.allowDuplicate, raffleAttendeeOnly: setForm.value.raffleAttendeeOnly, activeEventId: setForm.value.activeEventId, loginMode: setForm.value.loginMode }
  settings.value = s
  attEventId.value = s.activeEventId || ''
  raffleEventId.value = s.activeEventId || ''
  saveAttSetting(s)
    .then(() => toast('Settings saved!', 'success'))
    .catch(e => toast('Failed to save settings: ' + e.message, 'error'))
}
async function clearAllData() {
  const ok = await showConfirm('Clear All Data', 'This will permanently delete ALL events, students, attendance records, and raffle data. This action cannot be undone.')
  if (!ok) return
  try {
    // Snapshot current data before wiping — enables Restore Database
    saveBackup('all')
    // Delete all data types including events and students (as described in the confirmation dialog)
    await Promise.all([
      deleteAllAttRecords(),
      deleteAllAttLogouts(),
      deleteAllAttWinners(),
      deleteAllAttEvents(),
      deleteAllAttStudents(),
    ])
    // Reset local state immediately so the UI reflects the cleared state
    events.value     = []
    students.value   = []
    attendance.value = []
    logouts.value    = []
    winners.value    = []
    // Also clear paid data — paidRows and the localStorage paidDay map
    paidRows.value   = []
    localStorage.removeItem(PAID_DAY_KEY)
    loadBackupMeta()
    toast('All data cleared.', 'info')
  } catch (e: any) { toast('Failed to clear data: ' + e.message, 'error') }
}

async function clearAttendanceOnly() {
  const ok = await showConfirm('Clear Attendance Records', 'This will delete ALL attendance and logout records. Students and events will not be affected.')
  if (!ok) return
  try {
    // Snapshot attendance data before wiping — enables Restore Database
    saveBackup('attendance')
    await Promise.all([deleteAllAttRecords(), deleteAllAttLogouts()])
    attendance.value = []
    logouts.value    = []
    loadBackupMeta()
    toast('Attendance records cleared.', 'info')
  } catch (e: any) { toast('Failed to clear attendance: ' + e.message, 'error') }
}

// ═══════════════ BACKUP / RESTORE ═══════════════
const BACKUP_KEY = 'ccs_att_backup'

interface DatabaseBackup {
  savedAt: string
  clearedWhat: 'all' | 'attendance'
  events:     { id: string; name: string; type: string; date: string; venue: string; status: string }[]
  students:   { id: string; studentId: string; name: string; yearLevel: string; dept: string; paidDay?: 'First Day' | 'Second Day' | null }[]
  attendance: { id: string; eventId: string; eventName: string; studentId: string; name: string; yearLevel: string; dept: string; date: string; timeIn: string }[]
  logouts:    { id: string; eventId: string; eventName: string; studentId: string; name: string; yearLevel: string; dept: string; date: string; timeOut: string }[]
  winners:    { id: string; studentId: string; name: string; yearLevel: string; eventId: string; eventName: string; drawDate: string }[]
  settings:   AppSettings
}

const hasBackup   = ref(false)
const backupMeta  = ref<{ savedAt: string; clearedWhat: 'all' | 'attendance' } | null>(null)
const isRestoring = ref(false)

function saveBackup(clearedWhat: 'all' | 'attendance') {
  const backup: DatabaseBackup = {
    savedAt: new Date().toISOString(),
    clearedWhat,
    events:     JSON.parse(JSON.stringify(events.value)),
    students:   JSON.parse(JSON.stringify(students.value)),
    attendance: JSON.parse(JSON.stringify(attendance.value)),
    logouts:    JSON.parse(JSON.stringify(logouts.value)),
    winners:    JSON.parse(JSON.stringify(winners.value)),
    settings:   JSON.parse(JSON.stringify(settings.value)),
  }
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup))
    hasBackup.value = true
    backupMeta.value = { savedAt: backup.savedAt, clearedWhat: backup.clearedWhat }
  } catch {
    // localStorage full — silently continue, clear still proceeds
  }
}

function loadBackup(): DatabaseBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DatabaseBackup
  } catch { return null }
}

function clearBackup() {
  localStorage.removeItem(BACKUP_KEY)
  hasBackup.value = false
  backupMeta.value = null
}

function loadBackupMeta() {
  const raw = localStorage.getItem(BACKUP_KEY)
  if (!raw) { hasBackup.value = false; backupMeta.value = null; return }
  try {
    const b = JSON.parse(raw) as DatabaseBackup
    hasBackup.value = true
    backupMeta.value = { savedAt: b.savedAt, clearedWhat: b.clearedWhat }
  } catch { hasBackup.value = false; backupMeta.value = null }
}

function fmtBackupDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

async function restoreDatabase() {
  const backup = loadBackup()
  if (!backup) { toast('No backup found.', 'error'); return }

  const label = backup.clearedWhat === 'all'
    ? 'all data (events, students, attendance, logout records, winners)'
    : 'attendance and logout records'

  const ok = await showConfirm(
    'Restore Database',
    `This will re-upload the backup from ${fmtBackupDate(backup.savedAt)}, which contained ${label}. Existing records will not be duplicated. Continue?`
  )
  if (!ok) return

  isRestoring.value = true
  let restored = 0
  let failed = 0

  try {
    // ── 1. Restore events ─────────────────────────────────────────────────
    if (backup.clearedWhat === 'all' && backup.events.length) {
      const existing = await fetchAttEvents()
      const existingNames = new Set(existing.map(e => e.name.toLowerCase()))
      await Promise.all(
        backup.events
          .filter(e => !existingNames.has(e.name.toLowerCase()))
          .map(e =>
            createAttEvent({ name: e.name, type: e.type, date: e.date, venue: e.venue, status: e.status })
              .then(() => restored++).catch(() => failed++)
          )
      )
    }

    // ── 2. Restore students ───────────────────────────────────────────────
    if (backup.clearedWhat === 'all' && backup.students.length) {
      const existing = await fetchAttStudents()
      const existingIds   = new Set(existing.map(s => s.studentId))
      const existingNames = new Set(existing.map(s => s.name.toLowerCase()))
      const toCreate = backup.students.filter(
        s => !existingIds.has(s.studentId) && !existingNames.has(s.name.toLowerCase())
      )
      const BATCH = 10
      for (let i = 0; i < toCreate.length; i += BATCH) {
        await Promise.all(
          toCreate.slice(i, i + BATCH).map(s =>
            createAttStudent({ studentId: s.studentId, name: s.name, yearLevel: s.yearLevel, dept: s.dept, paidDay: s.paidDay })
              .then(() => restored++).catch(() => failed++)
          )
        )
      }
    }

    // ── 3. Restore attendance records ─────────────────────────────────────
    if (backup.attendance.length) {
      const existing = await fetchAttRecords()
      const existingKeys = new Set(
        existing.map(r => `${r.studentId}|${r.eventId}|${r.date}|${r.timeIn}`)
      )
      const toCreate = backup.attendance.filter(
        r => !existingKeys.has(`${r.studentId}|${r.eventId}|${r.date}|${r.timeIn}`)
      )
      const BATCH = 10
      for (let i = 0; i < toCreate.length; i += BATCH) {
        await Promise.all(
          toCreate.slice(i, i + BATCH).map(r =>
            createAttRecord({ eventId: r.eventId, eventName: r.eventName, studentId: r.studentId, name: r.name, yearLevel: r.yearLevel, dept: r.dept, date: r.date, timeIn: r.timeIn })
              .then(() => restored++).catch(() => failed++)
          )
        )
      }
    }

    // ── 4. Restore logout records ──────────────────────────────────────────
    if (backup.logouts.length) {
      const existing = await fetchAttLogouts()
      const existingKeys = new Set(
        existing.map(l => `${l.studentId}|${l.eventId}|${l.date}|${l.timeOut}`)
      )
      const toCreate = backup.logouts.filter(
        l => !existingKeys.has(`${l.studentId}|${l.eventId}|${l.date}|${l.timeOut}`)
      )
      const BATCH = 10
      for (let i = 0; i < toCreate.length; i += BATCH) {
        await Promise.all(
          toCreate.slice(i, i + BATCH).map(l =>
            createAttLogout({ eventId: l.eventId, eventName: l.eventName, studentId: l.studentId, name: l.name, yearLevel: l.yearLevel, dept: l.dept, date: l.date, timeOut: l.timeOut })
              .then(() => restored++).catch(() => failed++)
          )
        )
      }
    }

    // ── 5. Restore winners ────────────────────────────────────────────────
    if (backup.clearedWhat === 'all' && backup.winners.length) {
      const existing = await fetchAttWinners()
      const existingKeys = new Set(
        existing.map(w => `${w.studentId}|${w.eventId}|${w.drawDate}`)
      )
      const toCreate = backup.winners.filter(
        w => !existingKeys.has(`${w.studentId}|${w.eventId}|${w.drawDate}`)
      )
      const BATCH = 10
      for (let i = 0; i < toCreate.length; i += BATCH) {
        await Promise.all(
          toCreate.slice(i, i + BATCH).map(w =>
            createAttWinner({ studentId: w.studentId, name: w.name, yearLevel: w.yearLevel, eventId: w.eventId, eventName: w.eventName, drawDate: w.drawDate })
              .then(() => restored++).catch(() => failed++)
          )
        )
      }
    }

    // ── 6. Restore settings ───────────────────────────────────────────────
    if (backup.clearedWhat === 'all') {
      await saveAttSetting(backup.settings).catch(() => {})
    }

    await loadAll()

    if (failed === 0) {
      toast(`Restore complete! ${restored} record${restored !== 1 ? 's' : ''} re-uploaded.`, 'success')
    } else {
      toast(`Restore done. ${restored} restored, ${failed} failed.`, 'warning')
    }
  } catch (e: any) {
    toast('Restore failed: ' + (e.message ?? 'unknown error'), 'error')
  } finally {
    isRestoring.value = false
  }
}



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TOASTS 
const toasts = ref<ToastItem[]>([])
let toastId = 0
function toast(msg: string, type = 'info') {
  const id = ++toastId
  toasts.value.push({ id, msg, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3500)
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• WATCH & INIT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ── Att Accounts (super-admin only) ──────────────────────────────────────────
const attAccounts       = ref<AppUser[]>([])
const attAcctLoading    = ref(false)
const attAcctError      = ref('')
const attAcctSuccess    = ref('')
const attNewEmail       = ref('')
const attNewPassword    = ref('')
const attShowNewPass    = ref(false)
const attIsAdding       = ref(false)
const attDeleteTarget   = ref<AppUser | null>(null)
const attIsDeletingAcct = ref(false)

async function loadAttAccounts() {
  if (!isSuperAdmin.value) return
  attAcctLoading.value = true; attAcctError.value = ''
  try { attAccounts.value = await fetchAppUsers() }
  catch (e: any) { attAcctError.value = e.message ?? 'Failed to load accounts.' }
  finally { attAcctLoading.value = false }
}

async function addAttAccount() {
  attAcctError.value = ''; attAcctSuccess.value = ''
  if (!attNewEmail.value.trim() || !attNewPassword.value) {
    attAcctError.value = 'Email and password are required.'; return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attNewEmail.value.trim())) {
    attAcctError.value = 'Enter a valid email address.'; return
  }
  if (attNewPassword.value.length < 6) {
    attAcctError.value = 'Password must be at least 6 characters.'; return
  }
  attIsAdding.value = true
  try {
    const created = await createAppUser({ email: attNewEmail.value.trim(), password: attNewPassword.value })
    attAccounts.value.push(created)
    attAcctSuccess.value = `Account "${created.email}" created.`
    attNewEmail.value = ''; attNewPassword.value = ''
  } catch (e: any) {
    attAcctError.value = e.message ?? 'Failed to create account.'
  } finally {
    attIsAdding.value = false
  }
}

async function confirmDeleteAttAccount() {
  if (!attDeleteTarget.value) return
  attIsDeletingAcct.value = true; attAcctError.value = ''; attAcctSuccess.value = ''
  try {
    await deleteAppUser(attDeleteTarget.value.documentId)
    attAccounts.value = attAccounts.value.filter(a => a.id !== attDeleteTarget.value!.id)
    attAcctSuccess.value = `Account "${attDeleteTarget.value.email}" deleted.`
  } catch (e: any) {
    attAcctError.value = e.message ?? 'Failed to delete account.'
  } finally {
    attIsDeletingAcct.value = false; attDeleteTarget.value = null
  }
}

// ── Paid Day localStorage persistence (fallback while Strapi schema deploys) ──
const PAID_DAY_KEY = 'ccs_paid_day_map'

// Key is normalized uppercase name (the only field shared between delegates & att-students)
function paidDayKeyOf(name: string) { return name.toUpperCase().trim() }

function loadPaidDayFromStorage(): Record<string, 'First Day' | 'Second Day'> {
  try { return JSON.parse(localStorage.getItem(PAID_DAY_KEY) ?? '{}') } catch { return {} }
}

function savePaidDayToStorage(name: string, day: 'First Day' | 'Second Day' | null) {
  const m = loadPaidDayFromStorage()
  const key = paidDayKeyOf(name)
  if (day === null) delete m[key]
  else m[key] = day
  localStorage.setItem(PAID_DAY_KEY, JSON.stringify(m))
}

function getPaidDayFromStorage(name: string): 'First Day' | 'Second Day' | null {
  return loadPaidDayFromStorage()[paidDayKeyOf(name)] ?? null
}
interface PaidRow {
  id: number
  documentId: string
  studentId: string
  name: string
  yearLevel: string
  status: 'First Day' | 'Second Day' | null
}

const paidRows        = ref<PaidRow[]>([])
const paidPulling     = ref(false)
const paidPullMsg     = ref('')
const paidPullError   = ref('')
const paidProgress    = ref(0)
const paidSearch      = ref('')
const paidFilterDay   = ref<'All' | 'First Day' | 'Second Day' | 'No Tag'>('All')
const paidFilterYear  = ref('All')
const paidCurrentPage = ref(1)
const PAID_PAGE_SIZE  = 15
const paidYearLevels  = ['All', 'First Year', 'Second Year', 'Third Year', 'Fourth Year']

// ── Paid dashboard stats ───────────────────────────────────────────────────
const paidFirstDayCount  = computed(() => paidRows.value.filter(r => r.status === 'First Day').length)
const paidSecondDayCount = computed(() => paidRows.value.filter(r => r.status === 'Second Day').length)
const paidNoTagCount     = computed(() => paidRows.value.filter(r => !r.status).length)

// ── View list modal ────────────────────────────────────────────────────────
const paidViewListModal  = ref<'First Day' | 'Second Day' | null>(null)
const paidViewListRows   = computed(() =>
  paidViewListModal.value
    ? paidRows.value.filter(r => r.status === paidViewListModal.value)
    : []
)

// Display helper: convert Strapi year level to short form for UI
function shortYear(y: string): string {
  const m: Record<string, string> = {
    'First Year':  '1st Year',
    'Second Year': '2nd Year',
    'Third Year':  '3rd Year',
    'Fourth Year': '4th Year',
  }
  return m[y] ?? y
}

// ── Reports (Attendance) ───────────────────────────────────────────────────
// A student is "completed" if they have BOTH a login record AND a logout record
// for the same event (matched by studentId or name).
const rptFilterDay  = ref<'All' | 'First Day' | 'Second Day'>('All')
const rptFilterYear = ref('')
const rptSearch     = ref('')

const rptLoggedIn = computed(() => attendance.value.length)
const rptLoggedOut = computed(() => logouts.value.length)

const rptCompleted = computed(() => {
  // Build a set of studentIds that have a logout record
  const logoutIds = new Set(logouts.value.map(l => l.studentId.trim()))
  const logoutNames = new Set(logouts.value.map(l => l.name.trim().toUpperCase()))
  return attendance.value.filter(r =>
    logoutIds.has(r.studentId.trim()) || logoutNames.has(r.name.trim().toUpperCase())
  ).length
})

// 1st Day vs 2nd Day counts (from att-students paidDay field + paidDayMap)
const rpt1stDay = computed(() =>
  students.value.filter(s => paidDayMap.value.get(paidDayKeyOf(s.name)) === 'First Day').length
)
const rpt2ndDay = computed(() =>
  students.value.filter(s => paidDayMap.value.get(paidDayKeyOf(s.name)) === 'Second Day').length
)

// Detailed completed list: students who logged in AND logged out
const completedList = computed(() => {
  const logoutMap = new Map<string, LogoutRecord>()
  logouts.value.forEach(l => {
    // key by studentId; fallback to name
    const key = l.studentId.trim() || l.name.trim().toUpperCase()
    logoutMap.set(key, l)
  })
  return attendance.value
    .filter(r => {
      const key = r.studentId.trim() || r.name.trim().toUpperCase()
      return logoutMap.has(key)
    })
    .map(r => {
      const key = r.studentId.trim() || r.name.trim().toUpperCase()
      const logoutRec = logoutMap.get(key)!
      return {
        studentId:  r.studentId,
        name:       r.name,
        yearLevel:  r.yearLevel,
        dept:       r.dept,
        eventName:  r.eventName,
        date:       r.date,
        timeIn:     r.timeIn,
        timeOut:    logoutRec.timeOut,
        paidDay:    paidDayMap.value.get(paidDayKeyOf(r.name)) ?? null,
      }
    })
})

const completedFiltered = computed(() => {
  const q = rptSearch.value.toLowerCase()
  return completedList.value.filter(r => {
    const matchSearch = !q || r.studentId.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    const matchYear   = !rptFilterYear.value || r.yearLevel.toLowerCase().trim() === rptFilterYear.value.toLowerCase().trim()
    const matchDay    = rptFilterDay.value === 'All' || r.paidDay === rptFilterDay.value
    return matchSearch && matchYear && matchDay
  })
})

// Also build a simple loginOnly list for the full logged-in table
const loginList = computed(() => {
  const q = rptSearch.value.toLowerCase()
  return attendance.value
    .filter(r => {
      const matchSearch = !q || r.studentId.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      const matchYear   = !rptFilterYear.value || r.yearLevel.toLowerCase().trim() === rptFilterYear.value.toLowerCase().trim()
      const matchDay    = rptFilterDay.value === 'All' ||
        (paidDayMap.value.get(paidDayKeyOf(r.name)) ?? null) === rptFilterDay.value
      return matchSearch && matchYear && matchDay
    })
    .map(r => ({
      studentId: r.studentId,
      name:      r.name,
      yearLevel: r.yearLevel,
      dept:      r.dept,
      eventName: r.eventName,
      date:      r.date,
      timeIn:    r.timeIn,
      timeOut:   null as string | null,
      paidDay:   paidDayMap.value.get(paidDayKeyOf(r.name)) ?? null as 'First Day' | 'Second Day' | null,
    }))
})

// Year-level breakdown for reports
const rptByYear = computed(() => {
  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year']
  const total  = students.value.length
  return years.map(y => ({
    label:     y,
    total:     students.value.filter(s => s.yearLevel === y).length,
    loggedIn:  attendance.value.filter(r => r.yearLevel === y).length,
    completed: completedList.value.filter(r => r.yearLevel === y).length,
  }))
})

// Reports active tab: 'completed' | 'loggedin'
const rptTab = ref<'completed' | 'loggedin'>('completed')

// Pagination for reports table
const RPT_PAGE_SIZE = 15
const rptPage       = ref(1)
const rptList = computed(() => rptTab.value === 'completed' ? completedFiltered.value : loginList.value)
const rptTotalPages = computed(() => Math.max(1, Math.ceil(rptList.value.length / RPT_PAGE_SIZE)))
const rptPaginated  = computed(() => rptList.value.slice((rptPage.value - 1) * RPT_PAGE_SIZE, rptPage.value * RPT_PAGE_SIZE))

function rptPrevPage() { if (rptPage.value > 1) rptPage.value-- }
function rptNextPage() { if (rptPage.value < rptTotalPages.value) rptPage.value++ }

// Export XLSX for attendance reports (fixes #### column-too-narrow issue in Excel)
function rptExportCSV() {
  const XLSX = (window as any).XLSX
  if (!XLSX) { toast('Excel library not loaded.', 'error'); return }

  let rows: any[][]
  let colWidths: { wch: number }[]

  if (rptTab.value === 'completed') {
    rows = [
      ['#', 'Student ID', 'Name', 'Year Level', 'Dept', 'Event', 'Date', 'Time In', 'Time Out', 'Day'],
      ...completedFiltered.value.map((r, i) => [
        i + 1, r.studentId, r.name, r.yearLevel, r.dept, r.eventName, r.date, r.timeIn, r.timeOut ?? '', r.paidDay ?? '',
      ]),
    ]
    colWidths = [
      { wch: 5 },  // #
      { wch: 14 }, // Student ID
      { wch: 28 }, // Name
      { wch: 12 }, // Year Level
      { wch: 10 }, // Dept
      { wch: 30 }, // Event
      { wch: 14 }, // Date
      { wch: 12 }, // Time In
      { wch: 12 }, // Time Out
      { wch: 14 }, // Day
    ]
  } else {
    rows = [
      ['#', 'Student ID', 'Name', 'Year Level', 'Dept', 'Event', 'Date', 'Time In', 'Day'],
      ...loginList.value.map((r, i) => [
        i + 1, r.studentId, r.name, r.yearLevel, r.dept, r.eventName, r.date, r.timeIn,
        r.paidDay ?? '',
      ]),
    ]
    colWidths = [
      { wch: 5 },  // #
      { wch: 14 }, // Student ID
      { wch: 28 }, // Name
      { wch: 12 }, // Year Level
      { wch: 10 }, // Dept
      { wch: 30 }, // Event
      { wch: 14 }, // Date
      { wch: 12 }, // Time In
      { wch: 14 }, // Day
    ]
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')

  const filename = `attendance-report-${rptTab.value}-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

const paidFiltered = computed(() =>
  paidRows.value.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(paidSearch.value.toLowerCase())
    const matchDay    = paidFilterDay.value === 'All'
      || (paidFilterDay.value === 'No Tag' ? !r.status : r.status === paidFilterDay.value)
    const matchYear   = paidFilterYear.value === 'All' ||
      r.yearLevel.toLowerCase().trim() === paidFilterYear.value.toLowerCase().trim()
    return matchSearch && matchDay && matchYear
  })
)

watch([paidSearch, paidFilterDay, paidFilterYear], () => { paidCurrentPage.value = 1 })

const paidTotalPages = computed(() => Math.max(1, Math.ceil(paidFiltered.value.length / PAID_PAGE_SIZE)))
const paidPaginated  = computed(() =>
  paidFiltered.value.slice((paidCurrentPage.value - 1) * PAID_PAGE_SIZE, paidCurrentPage.value * PAID_PAGE_SIZE)
)

let _paidPageChanging = false
function paidPrevPage() {
  if (_paidPageChanging || paidCurrentPage.value <= 1) return
  _paidPageChanging = true; paidCurrentPage.value--
  setTimeout(() => { _paidPageChanging = false }, 200)
}
function paidNextPage() {
  if (_paidPageChanging || paidCurrentPage.value >= paidTotalPages.value) return
  _paidPageChanging = true; paidCurrentPage.value++
  setTimeout(() => { _paidPageChanging = false }, 200)
}

const paidUpdating = ref<Set<number>>(new Set())

async function setPaidDay(row: PaidRow, day: 'First Day' | 'Second Day') {
  if (paidUpdating.value.has(row.id)) return
  // Toggle: clicking the already-active day unchecks it (sets null)
  const newDay: 'First Day' | 'Second Day' | null = row.status === day ? null : day
  paidUpdating.value = new Set([...paidUpdating.value, row.id])
  try {
    // 1. Save to delegates (keep status as 'Paid')
    await updateDelegate(row.documentId, { status: 'Paid' })

    // 2. Always persist to localStorage immediately (works even before Strapi schema is deployed)
    savePaidDayToStorage(row.name, newDay)

    // 3. Try to save paidDay to att-student in Strapi (graceful — fails silently if field not yet deployed)
    // Match by studentId first (most reliable), then fall back to name (case-insensitive).
    // This prevents duplicate att-students when delegate names are uppercase but att-student names differ in case.
    let attStudent = students.value.find(
      s => row.studentId && s.studentId && s.studentId.trim() === row.studentId.trim()
    ) ?? students.value.find(
      s => s.name.toUpperCase().trim() === row.name.toUpperCase().trim()
    )
    try {
      if (!attStudent) {
        // Not yet in att-students — create it (paidDay may or may not be accepted by Strapi)
        const created = await createAttStudent({
          studentId: row.studentId,
          name:      row.name,
          yearLevel: normalizeYearLevel(row.yearLevel),
          dept:      'CCS',
          paidDay:   newDay,
        })
        const newStu = { id: created.id, studentId: created.studentId, name: created.name, yearLevel: created.yearLevel, dept: created.dept, paidDay: created.paidDay ?? newDay }
        students.value = [...students.value, newStu]
        attStudent = newStu
      } else {
        // Already exists — update paidDay field in Strapi
        await updateAttStudent(attStudent.id, { paidDay: newDay })
        students.value = students.value.map(s =>
          s.id === attStudent!.id ? { ...s, paidDay: newDay } : s
        )
      }
    } catch {
      // Strapi paidDay save failed (schema not yet deployed) — localStorage has it covered
      if (attStudent) {
        // Still update local state even if Strapi failed
        students.value = students.value.map(s =>
          s.id === attStudent!.id ? { ...s, paidDay: newDay } : s
        )
      }
    }

    // 4. Update local row status
    row.status = newDay
    if (newDay) toast(`${row.name} marked as ${newDay}.`, 'success')
    else        toast(`${row.name} day mark removed.`, 'success')
  } catch (err: any) {
    toast(`Failed to update ${row.name}: ${err?.message ?? 'unknown error'}`, 'error')
  } finally {
    const next = new Set(paidUpdating.value)
    next.delete(row.id)
    paidUpdating.value = next
  }
}

async function handlePaidPull() {
  paidPulling.value   = true
  paidPullMsg.value   = ''
  paidPullError.value = ''
  paidProgress.value  = 5

  try {
    paidPullMsg.value = 'Fetching paid delegates…'
    const allDelegates: StrapiDelegate[] = await fetchAllDelegates()
    const paid = allDelegates.filter(d => d.status === 'Paid')
    paidProgress.value = 30

    if (paid.length === 0) {
      paidPullError.value = 'No paid delegates found in the system.'
      return
    }

    // ── Build lookup sets for the current paid delegates ──────────────────
    // Key: documentId (unique Strapi ID) — used to identify each delegate precisely
    const paidDocIds    = new Set(paid.map(d => d.documentId))
    const paidStudentIds = new Set(paid.map(d => d.studentId?.trim()).filter(Boolean))
    const paidNames     = new Set(paid.map(d => d.name.toUpperCase().trim()))

    // ── Reconcile att-students: remove orphans, add missing ───────────────
    // Orphan = att-student whose studentId/name is NOT in any current paid delegate
    // Missing = paid delegate who has no matching att-student entry yet
    paidPullMsg.value = 'Reconciling attendance students…'
    const currentAttStudents = await fetchAttStudents()
    paidProgress.value = 50

    // Delete orphans (no longer paid / deleted from CCS)
    const orphans = currentAttStudents.filter(s => {
      const byId   = s.studentId?.trim() && paidStudentIds.has(s.studentId.trim())
      const byName = paidNames.has(s.name.toUpperCase().trim())
      return !byId && !byName
    })
    if (orphans.length > 0) {
      await Promise.all(orphans.map(s => deleteAttStudent(s.id)))
      const orphanIds = new Set(orphans.map(s => s.id))
      students.value = students.value.filter(s => !orphanIds.has(s.id))
    }

    // Add missing paid delegates to att-students
    const existingStudentIds = new Set(currentAttStudents.filter(s => s.studentId?.trim()).map(s => s.studentId.trim()))
    const existingNames      = new Set(currentAttStudents.map(s => s.name.toUpperCase().trim()))
    const toAdd = paid.filter(d => {
      if (d.studentId?.trim()) return !existingStudentIds.has(d.studentId.trim())
      return !existingNames.has(d.name.toUpperCase().trim())
    })
    if (toAdd.length > 0) {
      const BATCH = 10
      for (let i = 0; i < toAdd.length; i += BATCH) {
        const batch = toAdd.slice(i, i + BATCH)
        const created = await Promise.allSettled(
          batch.map(d => createAttStudent({
            studentId: d.studentId?.trim() || String(d.id),
            name: d.name,
            yearLevel: toAttYearLevel(d.yearLevel),
            dept: 'College of Computer Studies',
            paidDay: null,
          }))
        )
        created.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            students.value.push({
              id: r.value.id,
              studentId: r.value.studentId,
              name: r.value.name,
              yearLevel: r.value.yearLevel,
              dept: r.value.dept,
              paidDay: r.value.paidDay ?? null,
            })
          }
        })
      }
    }
    paidProgress.value = 80

    // ── Build paidRows from the paid list (no dedup — each delegate is unique by documentId) ──
    const built: PaidRow[] = paid.map(d => {
      const strapiDay = students.value.find(
        s => (d.studentId?.trim() && s.studentId && s.studentId.trim() === d.studentId.trim())
          || s.name.toUpperCase().trim() === d.name.toUpperCase().trim()
      )?.paidDay ?? null
      const localDay = getPaidDayFromStorage(d.name)
      return {
        id: d.id,
        documentId: d.documentId,
        studentId: d.studentId?.trim() || String(d.id),
        name: d.name,
        yearLevel: d.yearLevel,
        status: strapiDay ?? localDay,
      }
    })

    paidRows.value        = built
    paidProgress.value    = 100
    paidPullMsg.value     = `Pulled ${built.length} paid delegate${built.length !== 1 ? 's' : ''}.`
    paidCurrentPage.value = 1
  } catch (err: any) {
    paidPullError.value = err?.message ?? 'Failed to pull paid delegates.'
  } finally {
    paidPulling.value = false
    setTimeout(() => { paidProgress.value = 0; paidPullMsg.value = '' }, 3000)
  }
}

watch(raffleEventId, () => { raffleYearFilter.value = '' })

watch(activePage, async (p) => {
  if (p === 'settings') { loadSettingsForm(); loadAttAccounts(); loadBackupMeta() }
  if (p === 'attendance') {
    attTab.value = 'scan'
    await nextTick()
    scanInputEl.value?.focus()
  }
  if (p === 'paid' && paidRows.value.length === 0) { handlePaidPull() }
})

onMounted(() => {
  loadAttSession()
  loadDark()
  loadBackupMeta()
  checkMobile()
  window.addEventListener('resize', checkMobile)
  if (attAuth.value) {
    loadAll()
    startAutoRefresh()
  }
})
</script>


<template>
<div class="min-h-screen" @click="handlePageClick">

  <!-- ══ RAFFLE BORDER LIGHTS ══ -->
  <Transition name="border-lights">
    <div v-if="isDrawing" class="raffle-border-lights" aria-hidden="true">
      <div class="raffle-border-lights__top"></div>
      <div class="raffle-border-lights__bottom"></div>
      <div class="raffle-border-lights__left"></div>
      <div class="raffle-border-lights__right"></div>
    </div>
  </Transition>

  <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â• LOGIN SCREEN â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
  <div v-if="!attAuth" class="flex h-screen w-full overflow-hidden">

    <!-- Left dark panel â€” exact copy of CCS Delegates style -->
    <div class="hidden lg:flex w-1/2 bg-gray-950 flex-col justify-between p-10 relative overflow-hidden">
      <div class="absolute inset-0 opacity-5"
        style="background-image: radial-gradient(circle at 25% 25%, #22c55e 0%, transparent 50%), radial-gradient(circle at 75% 75%, #16a34a 0%, transparent 50%);" />

      <!-- Logo -->
      <div class="relative z-10 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sync-green flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-xs font-bold text-sync-green uppercase tracking-widest">CCS</p>
          <p class="text-sm font-bold text-white leading-none">Attendance System</p>
        </div>
      </div>

      <!-- Animated border-trace quote -->
      <div class="relative z-10">
        <div class="border-trace">
          <blockquote class="text-2xl font-semibold leading-snug text-shimmer">
            "Track attendance, run raffles, and manage CCS events - all in one place."
          </blockquote>
          <p class="text-gray-500 text-sm mt-3">— CCS Delegates Attendance System, AY 2025–2026</p>
        </div>
      </div>

      <!-- Shimmer brand -->
      <div class="relative z-10">
        <span class="text-shimmer-green text-3xl font-extrabold tracking-tight">CCS-ATTENDANCE</span>
        <p class="text-gray-600 text-xs mt-1">Events · Students · Raffle</p>
      </div>
    </div>

    <!-- Right form panel -->
    <div class="flex-1 flex items-center justify-center bg-white dark:bg-gray-950 px-8 relative">
      <!-- Back link top-right -->
      <div class="absolute top-5 right-6">
        <router-link to="/login" class="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          CCS Delegates Login
        </router-link>
      </div>

      <div class="w-full max-w-sm">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ authMode === 'login' ? 'Welcome back' : 'Create account' }}
          </h1>
          <p class="text-gray-500 text-sm mt-1">
            {{ authMode === 'login' ? 'Enter your credentials to access the system' : 'Register a new account to get started' }}
          </p>
        </div>

        <!-- Success alert -->
        <div v-if="regSuccess" class="mb-5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          {{ regSuccess }}
        </div>

        <!-- LOGIN FORM -->
        <form v-if="authMode === 'login'" @submit.prevent="handleAttLogin" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input v-model="authEmail" type="email" placeholder="name@example.com" autocomplete="email" class="input-search" :disabled="authLoading" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
            <div class="relative">
              <input v-model="authPassword" :type="authShowPw ? 'text' : 'password'" placeholder="Enter password" autocomplete="current-password" class="input-search pr-10" :disabled="authLoading" />
              <button type="button" @click="authShowPw = !authShowPw" tabindex="-1" class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg v-if="!authShowPw" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
              </button>
            </div>
          </div>
          <div v-if="authError" class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            {{ authError }}
          </div>
          <button type="submit" :disabled="authLoading" class="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            <svg v-if="authLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            {{ authLoading ? 'Signing in...' : 'Log in to Account' }}
          </button>
          <p class="text-center text-sm text-gray-500">Don't have an account? <button type="button" @click="authMode='register'; authError=''" class="text-sync-green font-medium hover:underline">Create one</button></p>
        </form>

        <!-- REGISTER FORM -->
        <form v-else @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
            <input v-model="regName" type="text" placeholder="Juan dela Cruz" class="input-search" :disabled="regLoading" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input v-model="regEmail" type="email" placeholder="name@example.com" class="input-search" :disabled="regLoading" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
            <input v-model="regPassword" type="password" placeholder="At least 6 characters" class="input-search" :disabled="regLoading" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm Password</label>
            <input v-model="regConfirm" type="password" placeholder="Re-enter password" class="input-search" :disabled="regLoading" />
          </div>
          <div v-if="regError" class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            {{ regError }}
          </div>
          <button type="submit" :disabled="regLoading" class="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            <svg v-if="regLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            {{ regLoading ? 'Creating...' : 'Create Account' }}
          </button>
          <p class="text-center text-sm text-gray-500">Already have an account? <button type="button" @click="authMode='login'; regError=''" class="text-sync-green font-medium hover:underline">Log in</button></p>
        </form>

        <p class="text-center text-gray-400 text-xs mt-8">CCS Attendance System &mdash; AY 2025â€“2026</p>
      </div>
    </div>
  </div>

  <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â• MAIN APP â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
  <div v-else class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

    <!-- Mobile overlay backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div
        v-if="isMobile && sidebarOpen"
        class="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- SIDEBAR -->
    <aside :class="[
        'flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 ease-in-out flex-shrink-0',
        isMobile
          ? 'fixed inset-y-0 left-0 z-40 w-60 ' + (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
          : (sidebarOpen ? 'w-60' : 'w-16')
      ]"
      @click.stop>
      <!-- Logo -->
      <div :class="['border-b border-gray-100 dark:border-gray-800 overflow-hidden flex-shrink-0', sidebarOpen ? 'px-5 py-5' : 'px-0 py-4 flex flex-col items-center']">
        <div v-if="sidebarOpen" class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-sync-green">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="leading-tight min-w-0">
            <p class="text-xs font-bold text-sync-green uppercase tracking-widest">CCS</p>
            <h1 class="text-sm font-bold text-gray-800 dark:text-white leading-none">Attendance System</h1>
          </div>
        </div>
        <div v-if="sidebarOpen" class="mt-3 pl-0.5">
          <span class="gradient-title text-xl">CCS-ATTENDANCE</span>
          <p class="text-gray-400 dark:text-gray-500 text-xs mt-0.5">Events &amp; Raffle Manager</p>
        </div>
        <div v-else class="w-9 h-9 rounded-lg flex items-center justify-center bg-sync-green">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
      </div>

      <!-- Nav -->
      <nav :class="['flex-1 py-4 overflow-y-auto overflow-x-hidden', sidebarOpen ? 'space-y-0.5 px-3' : 'space-y-1 px-2']">
        <button v-for="item in navItems" :key="item.key"
          @click="navigateTo(item.key)"
          :title="!sidebarOpen ? item.label : undefined"
          :class="['w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
            activePage === item.key
              ? 'bg-sync-green text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white']">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" v-html="item.icon"/>
          <span v-if="sidebarOpen" class="truncate">{{ item.label }}</span>
          <span v-if="!sidebarOpen" class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">{{ item.label }}</span>
        </button>
      </nav>

      <!-- Footer actions -->
      <div :class="['border-t border-gray-100 dark:border-gray-800 pt-3 pb-3 overflow-x-hidden', sidebarOpen ? 'px-3' : 'px-2 flex flex-col items-stretch']">
        <button @click="activePage = 'settings'" :title="!sidebarOpen ? 'Settings' : undefined"
          :class="['w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5']">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5V3m0 18v-1.5M4.5 12H3m18 0h-1.5M6.34 6.34l-1.06-1.06m12.72 12.72l-1.06-1.06M17.66 6.34l1.06-1.06M6.34 17.66l1.06 1.06M12 8a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
          <span v-if="sidebarOpen">Settings</span>
          <span v-if="!sidebarOpen" class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">Settings</span>
        </button>
        <button @click="handleAttLogout" :title="!sidebarOpen ? 'Logout' : undefined"
          :class="['w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400',
            sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5']">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span v-if="sidebarOpen">Logout</span>
          <span v-if="!sidebarOpen" class="absolute left-full ml-3 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-900 text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">Logout</span>
        </button>
      </div>
    </aside>

    <!-- MAIN AREA -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <!-- Topbar -->
      <header
        class="h-12 flex items-center justify-between px-3 sm:px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 gap-2 z-20"
        @click.stop>
        <div class="flex items-center gap-3">
          <button @click="sidebarOpen = !sidebarOpen" class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <h2 class="text-sm font-bold text-gray-800 dark:text-white capitalize hidden xs:block">{{ activePage }}</h2>
        </div>
        <div class="flex items-center gap-2">
          <button @click="toggleLive()"
            :class="['flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold border transition-all duration-200',
              isLive
                ? 'bg-green-500 border-green-500 text-white shadow-sm shadow-green-200 dark:shadow-green-900'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800']"
            :title="isLive ? `Auto-syncing every 2s. Last sync: ${lastSynced || 'pending...'}. Click to refresh now.` : 'Auto-sync offline. Click to refresh.'">
            <svg :class="['w-3.5 h-3.5', isLive ? 'animate-spin' : '']" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span v-if="isLive">Live</span>
            <span v-else>Offline</span>
          </button>
          <button @click="toggleDark()" class="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg v-if="!isDark" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            {{ isDark ? "Light" : "Dark" }}
          </button>
          <div class="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            <div class="leading-tight hidden sm:block max-w-[160px]">
              <p class="text-xs font-medium text-gray-800 dark:text-gray-100 leading-none truncate">{{ currentUser?.email ?? "—" }}</p>
            </div>
            <div class="w-7 h-7 rounded-full bg-sync-green flex items-center justify-center flex-shrink-0">
              <span class="text-white text-xs font-bold leading-none">{{ currentUser?.email?.charAt(0)?.toUpperCase() ?? "A" }}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
        <main class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 transition-colors duration-200 p-3 sm:p-5">

          <!-- â•â• DASHBOARD â•â• -->
          <!-- Dashboard -->
          <div v-if="activePage === 'dashboard'" class="space-y-6">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">CCS Attendance System — Overview
                <span v-if="attEventInfo" class="ml-2 text-sync-green font-semibold">· {{ attEventInfo.name }}</span>
              </p>
            </div>

            <!-- 4 stat cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

              <!-- Total Students -->
              <button @click="openDashModal('students')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-blue-500 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Total Students</p>
                <p class="text-4xl font-bold text-blue-600 dark:text-blue-400">{{ dashTotalStudents }}</p>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full group-hover:bg-blue-100 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

              <!-- Total Logins -->
              <button @click="openDashModal('logins')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-green-500 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Total Logins</p>
                <p class="text-4xl font-bold text-green-600 dark:text-green-400">{{ dashTotalLogins }}</p>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full group-hover:bg-green-100 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

              <!-- Total Logouts -->
              <button @click="openDashModal('logouts')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-red-500 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Total Logouts</p>
                <p class="text-4xl font-bold text-red-500 dark:text-red-400">{{ dashTotalLogouts }}</p>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full group-hover:bg-red-100 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

              <!-- Total Completed -->
              <button @click="openDashModal('completed')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-gray-400 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Total Completed</p>
                <p class="text-4xl font-bold text-gray-600 dark:text-gray-300">{{ dashTotalCompleted }}</p>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full group-hover:bg-gray-200 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

            </div>

            <!-- 1st Day / 2nd Day cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <!-- 1st Day -->
              <button @click="openDashModal('firstday')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-sky-500 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">1st Day</p>
                    <p class="text-4xl font-bold text-sky-600 dark:text-sky-400">{{ dashTotalFirstDay }}</p>
                    <p class="text-xs text-gray-400 mt-1">1ST DAY ATTENDEES</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Logged In</p>
                    <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ dashFirstDayLogins }}</p>
                    <p class="text-xs mt-1" :class="dashTotalFirstDay > 0 && dashFirstDayLogins >= dashTotalFirstDay ? 'text-green-500 font-semibold' : 'text-gray-400'">
                      {{ dashTotalFirstDay > 0 ? Math.round(dashFirstDayLogins / dashTotalFirstDay * 100) : 0 }}%
                      <span v-if="dashTotalFirstDay > 0 && dashFirstDayLogins >= dashTotalFirstDay" class="ml-1">✓ Complete</span>
                    </p>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-500 bg-sky-50 dark:bg-sky-900/30 px-2.5 py-1 rounded-full group-hover:bg-sky-100 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

              <!-- 2nd Day -->
              <button @click="openDashModal('secondday')"
                class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-violet-500 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer w-full">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">2nd Day</p>
                    <p class="text-4xl font-bold text-violet-600 dark:text-violet-400">{{ dashTotalSecondDay }}</p>
                    <p class="text-xs text-gray-400 mt-1">2ND DAY ATTENDEES</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Logged In</p>
                    <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ dashSecondDayLogins }}</p>
                    <p class="text-xs mt-1" :class="dashTotalSecondDay > 0 && dashSecondDayLogins >= dashTotalSecondDay ? 'text-green-500 font-semibold' : 'text-gray-400'">
                      {{ dashTotalSecondDay > 0 ? Math.round(dashSecondDayLogins / dashTotalSecondDay * 100) : 0 }}%
                      <span v-if="dashTotalSecondDay > 0 && dashSecondDayLogins >= dashTotalSecondDay" class="ml-1">✓ Complete</span>
                    </p>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-violet-500 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-1 rounded-full group-hover:bg-violet-100 transition-colors">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View list
                </span>
              </button>

            </div>

            <!-- Attendance bar chart -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div class="flex items-center justify-between mb-5">
                <div>
                  <h3 class="text-sm font-bold text-gray-800 dark:text-white">Attendance Overview</h3>
                  <p class="text-xs text-gray-400 mt-0.5">{{ attEventInfo?.name ?? 'No active event' }} — logged in today per year level</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-black text-sync-green">{{ dashTotalLogins }}<span class="text-sm font-normal text-gray-400"> / {{ dashTotalStudents }}</span></p>
                  <p class="text-xs text-gray-400">total logged in</p>
                </div>
              </div>

              <div class="space-y-4">
                <div v-for="bar in dashChartData" :key="bar.year">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{{ bar.year }}</span>
                    <span class="text-xs font-bold" :class="bar.loggedIn > 0 ? 'text-sync-green' : 'text-gray-400'">
                      {{ bar.loggedIn }} <span class="font-normal text-gray-400">/ {{ bar.total }}</span>
                    </span>
                  </div>
                  <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-6 overflow-hidden relative">
                    <!-- Background striped pattern for empty -->
                    <div class="absolute inset-0 opacity-30"
                      style="background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)">
                    </div>
                    <!-- Filled bar -->
                    <div
                      class="h-full rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-2"
                      :class="bar.loggedIn > 0 ? 'bg-sync-green' : 'bg-transparent'"
                      :style="{ width: bar.total > 0 && bar.loggedIn > 0 ? Math.max((bar.loggedIn / bar.total * 100), 8) + '%' : '0%' }">
                      <span v-if="bar.loggedIn > 0" class="text-white text-[10px] font-bold">
                        {{ Math.round(bar.loggedIn / bar.total * 100) }}%
                      </span>
                    </div>
                  </div>
                </div>

                <div v-if="!dashChartData.length" class="py-8 text-center text-gray-400 text-sm">
                  No student data. Add students first.
                </div>
              </div>

              <!-- Bottom summary row -->
              <div v-if="dashChartData.length" class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p class="text-lg font-bold text-sync-green">{{ dashTotalLogins }}</p>
                  <p class="text-xs text-gray-400">Logged In</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-orange-500">{{ dashTotalStudents - dashTotalLogins }}</p>
                  <p class="text-xs text-gray-400">Not Yet</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-blue-500">
                    {{ dashTotalStudents > 0 ? Math.round(dashTotalLogins / dashTotalStudents * 100) : 0 }}%
                  </p>
                  <p class="text-xs text-gray-400">Attendance Rate</p>
                </div>
              </div>
            </div>

            <!-- Active event info bar -->
            <div v-if="!settings.activeEventId" class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-5 py-3 text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              No active event set. Go to <button @click="activePage='settings'" class="font-semibold underline ml-1">Settings</button> to set one.
            </div>
          </div>

          <!-- â•â• STUDENTS â•â• -->
          <div v-else-if="activePage === 'students'" class="space-y-4">
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p class="text-xs uppercase tracking-[0.24em] text-sync-green font-semibold mb-2">Students</p>
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">CCS Delegates — Student Records</h1>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage student info, filter by year, and prepare attendees for raffle draws.</p>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <input v-model="stuSearch" type="text" placeholder="Search students..." class="input-search flex-1 min-w-[180px]" />
              <select v-model="stuDayFilter" class="input-search w-40">
                <option value="All">All Days</option>
                <option value="First Day">First Day</option>
                <option value="Second Day">Second Day</option>
              </select>
              <select v-model="stuYearFilter" class="input-search w-40">
                <option value="">All Years</option>
                <option value="1st Year">1st Year</option><option value="2nd Year">2nd Year</option><option value="3rd Year">3rd Year</option><option value="4th Year">4th Year</option>
              </select>
              <button @click="openImportDialog" class="btn-secondary flex items-center gap-2 text-sm">
                <span class="w-6 h-6 rounded-full bg-sync-green/10 text-sync-green flex items-center justify-center text-base font-bold">+</span>
                Import CSV
              </button>
              <button @click="generateBarcodes" class="btn-secondary flex items-center gap-2 text-sm">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h3v3H3zM3 10.5h3v3H3zM3 17h3v3H3zM8 4h2v2H8zM8 7h2v1H8zM11 4h1v3h-1zM13 4h1v3h-1zM10 10.5h1v3h-1zM12 10.5h3v1h-3zM15 12h1v1.5h-1zM8 17h2v1H8zM11 17h1v1H11zM13 17h3v3h-3zM8 19h2v1H8z"/>
                </svg>
                Generate Barcodes
              </button>
              <button @click="openAddStudent" class="btn-primary flex items-center gap-2 text-sm w-full sm:w-auto justify-center">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Add Student
              </button>
              <input ref="excelInputEl" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleExcel" />
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">Import CSV can handle attendance-style columns like Student ID, Name, Year Level, Department.</p>
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div v-if="!filteredStudents.length" class="py-12 text-center text-gray-400 text-sm">No students found.</div>
              <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th class="px-4 py-3 text-left">Student ID</th>
                    <th class="px-4 py-3 text-left">Name</th>
                    <th class="px-4 py-3 text-left">Year</th>
                    <th class="px-4 py-3 text-left">Dept</th>
                    <th class="px-4 py-3 text-left">Status</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="s in paginatedStudents" :key="s.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{{ s.studentId }}</td>
                    <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ s.name }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ shortYear(s.yearLevel) }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ s.dept }}</td>
                    <td class="px-4 py-3">
                      <span v-if="paidDayMap.get(paidDayKeyOf(s.name)) === 'First Day'"
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        First Day
                      </span>
                      <span v-else-if="paidDayMap.get(paidDayKeyOf(s.name)) === 'Second Day'"
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Second Day
                      </span>
                      <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                    </td>
                    <td class="px-4 py-3 text-right flex justify-end gap-2">
                      <button @click="openEditStudent(s)" type="button" title="Edit student" class="icon-btn text-blue-600 dark:text-blue-400">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z"/><path d="M4 20h4l10-10a2.828 2.828 0 00-4-4L4 16v4z"/></svg>
                    </button>
                      <button @click="deleteStudent(s.id)" type="button" title="Delete student" class="icon-btn text-red-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6v12a2 2 0 002 2h4a2 2 0 002-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            <!-- Pagination -->
            <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
              <p class="text-xs text-gray-500">
                Showing {{ filteredStudents.length === 0 ? 0 : studentPageStart }}–{{ studentPageEnd }} of {{ filteredStudents.length }}
              </p>
              <div class="flex items-center gap-2">
                <button @click="studentPrevPage" :disabled="currentStudentPage === 1"
                  class="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  Prev
                </button>
                <span class="text-xs text-gray-500 px-1">{{ currentStudentPage }} / {{ studentPageCount }}</span>
                <button @click="studentNextPage" :disabled="currentStudentPage === studentPageCount"
                  class="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- â•â• EVENTS â•â• -->
          <div v-else-if="activePage === 'events'" class="space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <input v-model="evtSearch" type="text" placeholder="Search event" class="input-search flex-1 min-w-[180px]" />
              <button @click="openAddEvent" class="btn-primary flex items-center gap-2 text-sm">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Add Event
              </button>
            </div>
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div v-if="!filteredEvents.length" class="py-12 text-center text-gray-400 text-sm">No events found.</div>
              <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[540px] text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th class="px-4 py-3 text-left">Name</th>
                    <th class="px-4 py-3 text-left">Type</th>
                    <th class="px-4 py-3 text-left">Date</th>
                    <th class="px-4 py-3 text-left">Venue</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="e in filteredEvents" :key="e.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ e.name }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ e.type }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ fmtDate(e.date) }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ e.venue || '—' }}</td>
                    <td class="px-4 py-3 text-right flex justify-end gap-2">
                      <button @click="openEditEvent(e)" type="button" title="Edit event" class="icon-btn text-blue-600 dark:text-blue-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z"/><path d="M4 20h4l10-10a2.828 2.828 0 00-4-4L4 16v4z"/></svg>
                  </button>
                      <button @click="deleteEvent(e.id)" type="button" title="Delete event" class="icon-btn text-red-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6v12a2 2 0 002 2h4a2 2 0 002-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <!-- â•â• ATTENDANCE â•â• -->
          <!-- Attendance -->
          <div v-else-if="activePage === 'attendance'" class="space-y-5">
            <!-- Page header -->
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Live Attendance
              </h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {{ settings.loginMode === 'logout' ? 'Scan student IDs to log out attendance for the active event.' : 'Scan student IDs to record attendance in real time.' }}
              </p>
              <div class="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] font-semibold text-gray-500 dark:text-gray-400">
                <span class="inline-flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1">
                <span :class="['w-2 h-2 rounded-full', settings.loginMode === 'logout' ? 'bg-red-500' : 'bg-green-500']"></span>
                  {{ attendanceModeText }}
                </span>
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700">
              <button @click="attTab='scan'; focusScanInput()" :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors', attTab==='scan' ? 'border-sync-green text-sync-green' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300']">Scan / Log</button>
              <button @click="attTab='records'" :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors', attTab==='records' ? 'border-sync-green text-sync-green' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300']">Records</button>
            </div>

            <!-- Scan tab -->
            <div v-if="attTab==='scan'" class="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 items-start">
              <!-- Left column: Active Event + Scanner -->
              <div class="space-y-4">
                <!-- Active Event card -->
                <!-- Active Event card (auto from settings) -->
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                  <div class="flex items-center justify-between gap-3 mb-1">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 font-medium uppercase tracking-wider">Active Event</p>
                        <p class="text-base font-bold text-gray-900 dark:text-white">
                          {{ attEventInfo?.name || "No active event — set in Settings" }}
                        </p>
                      </div>
                    </div>
                    <button @click="activePage = 'settings'" type="button" title="Change event" class="icon-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z"/>
                        <path d="M4 20h4l10-10a2.828 2.828 0 00-4-4L4 16v4z"/>
                      </svg>
                    </button>
                  </div>
                  <p v-if="!attEventId" class="mt-2 text-xs text-orange-500">Go to Settings to set an active event before scanning.</p>
                </div>

                <!-- Scanner Input card -->
                <div :class="['bg-white dark:bg-gray-900 rounded-xl border-2 p-5 transition-colors', attEventId ? 'border-blue-500/20 dark:border-blue-500/20' : 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10']">
                  <div class="flex items-center gap-3 mb-4">
                    <div :class="['w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', attEventId ? 'bg-gray-100 dark:bg-gray-800' : 'bg-orange-100 dark:bg-orange-900/40']">
                      <svg v-if="attEventId" class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
                      <svg v-else class="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    </div>
                    <div>
                      <p class="text-base font-bold text-gray-900 dark:text-white">Scanner Input</p>
                      <p class="text-xs" :class="attEventId ? 'text-gray-500' : 'text-orange-500 font-medium'">
                        {{ attEventId ? 'Awaiting input from barcode scanner' : 'No active event — scanning is disabled' }}
                      </p>
                    </div>
                  </div>

                  <!-- No-event warning banner -->
                  <div v-if="!attEventId" class="mb-4 flex items-start gap-3 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg px-4 py-3">
                    <svg class="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                    <div>
                      <p class="text-sm font-semibold text-orange-700 dark:text-orange-400">Scanning is locked</p>
                      <p class="text-xs text-orange-600 dark:text-orange-300 mt-0.5">
                        You must set an active event before scanning IDs. Records logged without an event will not appear in the Live Feed or be linked to any event.
                      </p>
                      <button @click="activePage = 'settings'" class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300 underline underline-offset-2 hover:text-orange-900 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Go to Settings to set an active event
                      </button>
                    </div>
                  </div>

                  <input ref="scanInputEl" v-model="scanInput" type="text"
                    :placeholder="attEventId ? 'Scan barcode now...' : 'Set an active event first...'"
                    :class="['w-full px-4 py-3 rounded-lg border-2 text-sm text-center placeholder:text-center transition-colors focus:outline-none',
                      attEventId
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 focus:border-sync-green'
                        : 'border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-900/20 text-gray-400 dark:text-gray-500 placeholder-orange-300 dark:placeholder-orange-700 cursor-not-allowed opacity-60'
                    ]"
                    @keyup.enter="logAttendance"
                    @input="handleScanInput"
                    @blur="(e) => { const rt = (e as FocusEvent).relatedTarget as HTMLElement | null; if (!rt || !['button','a'].includes(rt.tagName.toLowerCase())) focusScanInput() }"
                    :disabled="!attEventId" />
                  <div class="flex items-center justify-between mt-3">
                    <div class="flex items-center gap-2 text-xs" :class="attEventId ? 'text-gray-500' : 'text-orange-500 font-medium'">
                      <span :class="['w-2 h-2 rounded-full', attEventId ? 'bg-green-500' : 'bg-orange-400 animate-pulse']"></span>
                      {{ attEventId ? "Ready to scan" : "No active event set" }}
                    </div>
                    <button @click="logAttendance" :disabled="!attEventId" class="btn-primary px-5 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                      {{ attendanceActionLabel }}
                    </button>
                  </div>
                  <div v-if="scanStatus" :class="['mt-3 rounded-lg px-4 py-3 text-sm font-medium', scanStatusType==='success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : scanStatusType==='warning' ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300']">{{ scanStatus }}</div>
                </div>
              </div>

              <!-- Right column: Live Feed -->
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Live Feed</h3>
                  </div>
                  <span class="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    REAL-TIME
                  </span>
                </div>
                <p class="px-5 py-2 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">Chronological list of the most recent scans.</p>
                <div v-if="!todayLogs.length" class="py-12 text-center text-gray-400 text-sm">No scans yet today.</div>
                <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[360px] text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th class="px-4 py-3 text-left">Time</th>
                      <th class="px-4 py-3 text-left">Student</th>
                      <th class="px-4 py-3 text-left">ID Number</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="a in todayLogs" :key="a.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td class="px-4 py-3 text-xs text-gray-500 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        {{ a.timeIn }}
                      </td>
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ a.name }}</td>
                      <td class="px-4 py-3 font-mono text-xs text-gray-500">{{ a.studentId }}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            <!-- Records tab -->
            <div v-else class="space-y-4">
              <div class="flex flex-wrap items-center gap-3">
                <input v-model="recSearch" type="text" placeholder="Search records..." class="input-search flex-1 min-w-[180px]" />
                <button @click="exportAttendanceCSV" class="btn-secondary flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Export CSV
                </button>
              </div>
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div v-if="!filteredRecords.length" class="py-12 text-center text-gray-400 text-sm">No records found.</div>
                <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[500px] text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th class="px-4 py-3 text-left">Student ID</th>
                      <th class="px-4 py-3 text-left">Name</th>
                      <th class="px-4 py-3 text-left">Event</th>
                      <th class="px-4 py-3 text-left">Date</th>
                      <th class="px-4 py-3 text-left">Time In</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="a in filteredRecords" :key="a.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td class="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{{ a.studentId }}</td>
                      <td class="px-4 py-3 text-gray-800 dark:text-gray-200">{{ a.name }}</td>
                      <td class="px-4 py-3 text-gray-500">{{ a.eventName }}</td>
                      <td class="px-4 py-3 text-gray-500">{{ fmtDate(a.date) }}</td>
                      <td class="px-4 py-3 text-gray-500">{{ a.timeIn }}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="activePage === 'raffle'" class="space-y-5">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Raffle</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Draw winners from event attendees.</p>
            </div>
            <div class="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden">
              <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <p class="text-xs uppercase tracking-[0.32em] text-gray-500 dark:text-gray-400 font-semibold">Raffle board</p>
                </div>
                <div class="flex flex-wrap items-end gap-3 w-full sm:w-auto">
                  <div class="min-w-[140px] flex-1 sm:flex-none sm:min-w-[180px]">
                    <label class="block text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400 mb-2">Event</label>
                    <select v-model="raffleEventId" class="input-search w-full bg-white dark:bg-gray-900">
                      <option value="">— Select event —</option>
                      <option v-for="event in events" :key="event.id" :value="event.id">{{ event.name }}</option>
                    </select>
                  </div>
                  <div class="min-w-[110px] flex-1 sm:flex-none sm:min-w-[140px]">
                    <label class="block text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400 mb-2">Year</label>
                    <select v-model="raffleYearFilter" class="input-search w-full bg-white dark:bg-gray-900">
                      <option value="">— All years —</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                  <div class="w-20 sm:w-24">
                    <label class="block text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400 mb-2">Draw</label>
                    <input v-model.number="drawCount" type="number" min="1" max="50" class="input-search w-full text-sm" />
                  </div>
                </div>
              </div>

              <div class="px-6 py-12 text-center">
                <p class="text-4xl md:text-5xl font-black gradient-title">START</p>
                <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">Press draw to start</p>
                <div class="mx-auto mt-8 max-w-3xl rounded-[32px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 shadow-sm">
                  <p class="text-xs uppercase tracking-[0.24em] text-gray-400 dark:text-gray-500 mb-2">Now selecting</p>
                  <p class="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">{{ drawLabel }}</p>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ raffleEventId ? (isDrawing ? 'Choosing winner from pool...' : 'Drawing ' + Math.min(drawCount, rafflePool.length) + ' from ' + rafflePool.length + ' eligible candidate' + (rafflePool.length !== 1 ? 's' : '')) : 'Select an event to begin' }}</p>
                </div>
                <div class="mt-8 sm:mt-10 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
                  <button @click="doDraw" :disabled="isDrawing || !raffleEventId" class="btn-primary px-8 py-3 sm:py-4 text-base font-semibold rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto">
                    {{ isDrawing ? 'Drawing...' : 'DRAW' }}
                  </button>
                  <button @click="clearWinners" :disabled="isDrawing" class="btn-secondary px-6 py-3 sm:py-4 text-base rounded-2xl w-full sm:w-auto">Clear Winners</button>
                </div>
              </div>
            </div>

            <div v-if="showLatest && latestWinners.length" class="bg-white dark:bg-gray-900 rounded-xl border border-sync-green/40 p-5">
              <h3 class="text-sm font-bold text-sync-green mb-3">🎉 Latest Draw Results</h3>
              <ul class="space-y-2">
                <li v-for="(w, i) in latestWinners" :key="w.id" class="flex items-center gap-3 p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <span class="w-7 h-7 rounded-full bg-sync-green text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{{ i+1 }}</span>
                  <div>
                    <p class="text-sm font-semibold text-gray-800 dark:text-white">{{ w.name }}</p>
                    <p class="text-xs text-gray-500">{{ w.studentId }} · {{ shortYear(w.yearLevel) }}</p>
                  </div>
                </li>
              </ul>
            </div>

            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div class="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">All Winners</h3>
              </div>
              <div v-if="!winners.length" class="py-10 text-center text-gray-400 text-sm">No winners yet.</div>
              <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[480px] text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th class="px-4 py-3 text-left">Name</th>
                    <th class="px-4 py-3 text-left">Student ID</th>
                    <th class="px-4 py-3 text-left">Event</th>
                    <th class="px-4 py-3 text-left">Draw Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="w in winners" :key="w.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ w.name }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-gray-500">{{ w.studentId }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ w.eventName }}</td>
                    <td class="px-4 py-3 text-gray-500 text-xs">{{ w.drawDate }}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <!-- ══ PAID ══ -->
          <div v-else-if="activePage === 'paid'" class="space-y-5">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Paid</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Already paid delegates from the CCS Delegates system.</p>
            </div>

            <!-- Pull button + progress -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-3">
              <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  @click="handlePaidPull"
                  :disabled="paidPulling"
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sync-green hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-fit"
                >
                  <svg v-if="paidPulling" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/>
                  </svg>
                  {{ paidPulling ? 'Pulling…' : 'Pull' }}
                </button>
                <div v-if="paidPulling" class="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs">
                  <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-sync-green rounded-full transition-all duration-300" :style="{ width: paidProgress + '%' }" />
                  </div>
                  <span class="text-xs text-gray-500 w-8 text-right">{{ paidProgress }}%</span>
                </div>
                <p v-if="paidPullMsg && !paidPulling" class="text-sm text-sync-green font-medium">✓ {{ paidPullMsg }}</p>
              </div>
              <div v-if="paidPullError" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
                {{ paidPullError }}
              </div>
            </div>

            <!-- Paid day dashboard stats -->
            <div class="grid grid-cols-3 gap-2 sm:gap-4">
              <!-- 1st Day -->
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-900 p-2 sm:p-4 flex flex-col gap-0.5 sm:gap-1">
                <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-blue-500">1st Day</p>
                <p class="text-xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{{ paidFirstDayCount }}</p>
                <button
                  @click="paidViewListModal = 'First Day'"
                  class="mt-1 inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors w-fit"
                >
                  <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View List
                </button>
              </div>
              <!-- 2nd Day -->
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-emerald-200 dark:border-emerald-900 p-2 sm:p-4 flex flex-col gap-0.5 sm:gap-1">
                <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-emerald-500">2nd Day</p>
                <p class="text-xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{{ paidSecondDayCount }}</p>
                <button
                  @click="paidViewListModal = 'Second Day'"
                  class="mt-1 inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-emerald-500 hover:text-emerald-700 font-medium transition-colors w-fit"
                >
                  <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View List
                </button>
              </div>
              <!-- No tag -->
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-2 sm:p-4 flex flex-col gap-0.5 sm:gap-1">
                <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-gray-400">No Tag</p>
                <p class="text-xl sm:text-3xl font-bold text-gray-400">{{ paidNoTagCount }}</p>
                <p class="text-[10px] sm:text-xs text-gray-300 dark:text-gray-600 mt-0.5 sm:mt-1">Not yet assigned</p>
              </div>
            </div>

            <!-- Filters -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div class="relative sm:max-w-xs w-full">
                  <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
                    </svg>
                  </span>
                  <input v-model="paidSearch" type="text" placeholder="Search name…" class="input-search pl-9" />
                </div>
                <select v-model="paidFilterYear" class="input-search sm:w-auto sm:min-w-[150px]">
                  <option v-for="y in paidYearLevels" :key="y" :value="y">{{ y === 'All' ? 'All Years' : shortYear(y) }}</option>
                </select>
                <select v-model="paidFilterDay" class="input-search sm:w-auto sm:min-w-[140px]">
                  <option value="All">All Days</option>
                  <option value="First Day">1st Day</option>
                  <option value="Second Day">2nd Day</option>
                  <option value="No Tag">No Tag</option>
                </select>
              </div>
            </div>

            <!-- Table -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div v-if="paidPulling && paidRows.length === 0" class="flex items-center justify-center py-16 text-gray-400">
                <svg class="animate-spin h-5 w-5 mr-3 text-sync-green" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Loading paid delegates…
              </div>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[780px]">
                  <thead>
                    <tr class="border-b border-gray-100 dark:border-gray-800">
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-10">#</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Student ID</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Year Level</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr
                      v-for="(r, idx) in paidPaginated"
                      :key="r.id"
                      class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      <td class="px-4 py-3 text-gray-400 text-xs">{{ (paidCurrentPage - 1) * PAID_PAGE_SIZE + idx + 1 }}</td>
                      <td class="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{{ r.studentId }}</td>
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ r.name }}</td>
                      <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{{ shortYear(r.yearLevel) }}</td>
                      <!-- Status badge -->
                      <td class="px-4 py-3">
                        <span v-if="r.status === 'First Day'"
                          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          First Day
                        </span>
                        <span v-else-if="r.status === 'Second Day'"
                          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Second Day
                        </span>
                        <span v-else class="text-xs text-gray-400 dark:text-gray-600">—</span>
                      </td>
                      <!-- Action: checkbox-style toggles -->
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          <!-- First Day checkbox -->
                          <label
                            :class="['flex items-center gap-1.5 cursor-pointer select-none group', paidUpdating.has(r.id) ? 'opacity-50 pointer-events-none' : '']"
                            @click.prevent="setPaidDay(r, 'First Day')"
                          >
                            <span :class="[
                              'w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                              r.status === 'First Day'
                                ? 'bg-blue-500 border-blue-500'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
                            ]">
                              <svg v-if="paidUpdating.has(r.id)" class="animate-spin w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              <svg v-else-if="r.status === 'First Day'" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                              </svg>
                            </span>
                            <span :class="['text-xs font-medium', r.status === 'First Day' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400']">
                              1st Day
                            </span>
                          </label>
                          <!-- Second Day checkbox -->
                          <label
                            :class="['flex items-center gap-1.5 cursor-pointer select-none group', paidUpdating.has(r.id) ? 'opacity-50 pointer-events-none' : '']"
                            @click.prevent="setPaidDay(r, 'Second Day')"
                          >
                            <span :class="[
                              'w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                              r.status === 'Second Day'
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-emerald-400'
                            ]">
                              <svg v-if="paidUpdating.has(r.id)" class="animate-spin w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              <svg v-else-if="r.status === 'Second Day'" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                              </svg>
                            </span>
                            <span :class="['text-xs font-medium', r.status === 'Second Day' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400']">
                              2nd Day
                            </span>
                          </label>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="paidPaginated.length === 0">
                      <td colspan="6" class="px-4 py-12 text-center text-gray-400">
                        <div class="flex flex-col items-center gap-2">
                          <svg class="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                          <p>{{ paidRows.length === 0 ? 'Click "Pull" to load paid delegates.' : 'No results match your filters.' }}</p>
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
                  {{ paidFiltered.length === 0 ? 0 : (paidCurrentPage - 1) * PAID_PAGE_SIZE + 1 }}–{{ Math.min(paidCurrentPage * PAID_PAGE_SIZE, paidFiltered.length) }}
                  of {{ paidFiltered.length }}
                </p>
                <div class="flex items-center gap-2">
                  <button @click="paidPrevPage" :disabled="paidCurrentPage === 1"
                    class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                    </svg>
                    Prev
                  </button>
                  <span class="text-xs text-gray-500 px-1">{{ paidCurrentPage }} / {{ paidTotalPages }}</span>
                  <button @click="paidNextPage" :disabled="paidCurrentPage === paidTotalPages"
                    class="btn-secondary inline-flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-40">
                    Next
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- View List Modal -->
            <Teleport to="body">
              <Transition name="fade">
                <div
                  v-if="paidViewListModal"
                  class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                  @click.self="paidViewListModal = null"
                >
                  <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] sm:max-h-[80vh] flex flex-col mx-auto">
                    <!-- Modal Header -->
                    <div class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-800">
                      <div class="flex items-center gap-3">
                        <span
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          :class="paidViewListModal === 'First Day'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                          {{ paidViewListModal === 'First Day' ? '1st Day' : '2nd Day' }}
                        </span>
                        <h2 class="text-base font-bold text-gray-900 dark:text-white">
                          {{ paidViewListModal === 'First Day' ? '1st Day' : '2nd Day' }} Delegates
                        </h2>
                        <span class="text-xs text-gray-400 font-medium">({{ paidViewListRows.length }})</span>
                      </div>
                      <button
                        @click="paidViewListModal = null"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Close"
                      >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                    <!-- Modal Body -->
                    <div class="overflow-y-auto flex-1">
                      <div class="overflow-x-auto">
                      <div v-if="paidViewListRows.length === 0" class="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                        <svg class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                        <p class="text-sm">No delegates found</p>
                      </div>
                      <table v-else class="w-full">
                        <thead class="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                          <tr>
                            <th class="px-3 sm:px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
                            <th class="px-3 sm:px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Student ID</th>
                            <th class="px-3 sm:px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                            <th class="px-3 sm:px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Year Level</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                          <tr
                            v-for="(r, i) in paidViewListRows"
                            :key="r.id"
                            class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <td class="px-3 sm:px-5 py-2.5 sm:py-3 text-xs text-gray-400">{{ i + 1 }}</td>
                            <td class="px-3 sm:px-5 py-2.5 sm:py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{{ r.studentId }}</td>
                            <td class="px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 dark:text-white">{{ r.name }}</td>
                            <td class="px-3 sm:px-5 py-2.5 sm:py-3 text-xs text-gray-500 dark:text-gray-400">{{ shortYear(r.yearLevel) }}</td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                    <!-- Modal Footer -->
                    <div class="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                      <button
                        @click="paidViewListModal = null"
                        class="btn-secondary text-sm px-4 py-2"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </Transition>
            </Teleport>

          </div>
          <!-- â•â• SETTINGS â•â• -->
          <!-- Settings -->
          <!-- â•â• REPORTS â•â• -->
          <div v-else-if="activePage === 'reports'" class="space-y-5">

            <!-- Header -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-[0.24em] text-sync-green font-semibold mb-1">Reports</p>
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Attendance Report</h1>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Total logged in, logged out, and completed attendance.</p>
                </div>
                <button @click="rptExportCSV"
                  class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors self-start sm:self-auto font-medium">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Export XLSX
                </button>
              </div>
            </div>

            <!-- Stats Dashboard -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Students</p>
                <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{{ students.length }}</p>
              </div>
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-900 p-4">
                <p class="text-xs text-blue-500 font-medium uppercase tracking-wide">Total Logged In</p>
                <p class="text-3xl font-bold text-blue-500 mt-1">{{ rptLoggedIn }}</p>
              </div>
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-orange-200 dark:border-orange-900 p-4">
                <p class="text-xs text-orange-500 font-medium uppercase tracking-wide">Total Logged Out</p>
                <p class="text-3xl font-bold text-orange-500 mt-1">{{ rptLoggedOut }}</p>
              </div>
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-green-200 dark:border-green-900 p-4">
                <p class="text-xs text-sync-green font-medium uppercase tracking-wide">Completed</p>
                <p class="text-3xl font-bold text-sync-green mt-1">{{ rptCompleted }}</p>
                <p class="text-xs text-gray-400 mt-0.5">Logged in &amp; out</p>
              </div>
            </div>

            <!-- Day Breakdown -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-900 p-5">
                <div class="flex items-end justify-between mb-1">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-widest text-blue-500">1ST DAY</p>
                    <p class="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{{ rpt1stDay }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">1st Day Attendees</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-gray-400 font-medium">LOGGED IN</p>
                    <p class="text-2xl font-bold text-blue-500">{{ attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'First Day').length }}</p>
                    <p class="text-xs text-gray-400">{{ rpt1stDay ? Math.round(attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'First Day').length / rpt1stDay * 100) : 0 }}%</p>
                  </div>
                </div>
                <div class="w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-1.5 mt-3">
                  <div class="bg-blue-500 h-1.5 rounded-full transition-all"
                    :style="`width:${rpt1stDay ? Math.round(attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'First Day').length / rpt1stDay * 100) : 0}%`">
                  </div>
                </div>
              </div>
              <div class="bg-white dark:bg-gray-900 rounded-xl border border-purple-200 dark:border-purple-900 p-5">
                <div class="flex items-end justify-between mb-1">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-widest text-purple-500">2ND DAY</p>
                    <p class="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{{ rpt2ndDay }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">2nd Day Attendees</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-gray-400 font-medium">LOGGED IN</p>
                    <p class="text-2xl font-bold text-purple-500">{{ attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'Second Day').length }}</p>
                    <p class="text-xs text-gray-400">{{ rpt2ndDay ? Math.round(attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'Second Day').length / rpt2ndDay * 100) : 0 }}%</p>
                  </div>
                </div>
                <div class="w-full bg-purple-100 dark:bg-purple-900/30 rounded-full h-1.5 mt-3">
                  <div class="bg-purple-500 h-1.5 rounded-full transition-all"
                    :style="`width:${rpt2ndDay ? Math.round(attendance.filter(r => (paidDayMap.get(paidDayKeyOf(r.name)) ?? null) === 'Second Day').length / rpt2ndDay * 100) : 0}%`">
                  </div>
                </div>
              </div>
            </div>

            <!-- Year Level Breakdown -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 class="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Attendance by Year Level</h3>
              <div class="space-y-4">
                <div v-for="y in rptByYear" :key="y.label">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ y.label }}</span>
                    <div class="flex gap-4 text-xs">
                      <span class="text-blue-500 font-semibold">{{ y.loggedIn }} logged in</span>
                      <span class="text-sync-green font-semibold">{{ y.completed }} completed</span>
                      <span class="text-gray-400">/ {{ y.total }}</span>
                    </div>
                  </div>
                  <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 relative overflow-hidden">
                    <div class="bg-blue-400 h-2 rounded-full transition-all absolute inset-y-0 left-0"
                      :style="`width:${y.total ? Math.round(y.loggedIn/y.total*100) : 0}%`"></div>
                    <div class="bg-sync-green h-2 rounded-full transition-all absolute inset-y-0 left-0"
                      :style="`width:${y.total ? Math.round(y.completed/y.total*100) : 0}%`"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Filters + Tabs -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
                <button @click="rptTab = 'completed'; rptPage = 1"
                  :class="['px-4 py-1.5 text-xs font-semibold transition-colors', rptTab === 'completed' ? 'bg-sync-green text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800']">
                  Completed
                </button>
                <button @click="rptTab = 'loggedin'; rptPage = 1"
                  :class="['px-4 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200 dark:border-gray-700', rptTab === 'loggedin' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800']">
                  Logged In
                </button>
              </div>
              <div class="flex-1 relative min-w-[180px]">
                <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
                </span>
                <input v-model="rptSearch" type="text" placeholder="Search student..." class="input-search pl-9 w-full" @input="rptPage = 1" />
              </div>
              <select v-model="rptFilterYear" class="input-search w-36" @change="rptPage = 1">
                <option value="">All Years</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
              <select v-model="rptFilterDay" class="input-search w-36" @change="rptPage = 1">
                <option value="All">All Days</option>
                <option value="First Day">1st Day</option>
                <option value="Second Day">2nd Day</option>
              </select>
            </div>

            <!-- Table -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div v-if="rptPaginated.length === 0" class="py-12 text-center text-gray-400 text-sm">No records found.</div>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[640px] text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th class="px-4 py-3 text-left">#</th>
                      <th class="px-4 py-3 text-left">Student ID</th>
                      <th class="px-4 py-3 text-left">Name</th>
                      <th class="px-4 py-3 text-left">Year</th>
                      <th class="px-4 py-3 text-left">Dept</th>
                      <th class="px-4 py-3 text-left">Event</th>
                      <th class="px-4 py-3 text-left">Date</th>
                      <th class="px-4 py-3 text-left">Time In</th>
                      <th v-if="rptTab === 'completed'" class="px-4 py-3 text-left">Time Out</th>
                      <th class="px-4 py-3 text-left">Day</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="(r, idx) in rptPaginated" :key="idx"
                      class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td class="px-4 py-3 text-xs text-gray-400">{{ (rptPage - 1) * RPT_PAGE_SIZE + idx + 1 }}</td>
                      <td class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{{ r.studentId }}</td>
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ r.name }}</td>
                      <td class="px-4 py-3 text-xs text-gray-500">{{ r.yearLevel }}</td>
                      <td class="px-4 py-3 text-xs text-gray-500">{{ r.dept }}</td>
                      <td class="px-4 py-3 text-xs text-gray-500">{{ r.eventName }}</td>
                      <td class="px-4 py-3 text-xs text-gray-500">{{ r.date }}</td>
                      <td class="px-4 py-3 text-xs text-blue-500 font-medium">{{ r.timeIn }}</td>
                      <td v-if="rptTab === 'completed'" class="px-4 py-3 text-xs text-orange-500 font-medium">{{ r.timeOut }}</td>
                      <td class="px-4 py-3">
                        <span v-if="r.paidDay === 'First Day'"
                          class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          1st Day
                        </span>
                        <span v-else-if="r.paidDay === 'Second Day'"
                          class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          2nd Day
                        </span>
                        <span v-else class="text-xs text-gray-300 dark:text-gray-600">â€”</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- Pagination -->
              <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <p class="text-xs text-gray-500">
                  Showing {{ rptList.length === 0 ? 0 : (rptPage - 1) * RPT_PAGE_SIZE + 1 }}â€“{{ Math.min(rptPage * RPT_PAGE_SIZE, rptList.length) }} of {{ rptList.length }}
                </p>
                <div class="flex items-center gap-2">
                  <button @click="rptPrevPage" :disabled="rptPage === 1"
                    class="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    Prev
                  </button>
                  <span class="text-xs text-gray-500 px-1">{{ rptPage }} / {{ rptTotalPages }}</span>
                  <button @click="rptNextPage" :disabled="rptPage === rptTotalPages"
                    class="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Next
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            </div>

          </div>
          <div v-else-if="activePage === 'settings'" class="space-y-6">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">System configuration and maintenance</p>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <!-- Row 1 Left: Active Event -->
                            <!-- Active Event card -->
                            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                              <div class="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <svg class="w-4 h-4 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                <h3 class="text-sm font-bold text-gray-800 dark:text-white">Active Event</h3>
                              </div>
                              <p class="text-xs text-gray-500 dark:text-gray-400">Set the current active event. Attendance scanning and raffle will automatically use this event.</p>
                              <div>
                                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Select Active Event</label>
                                <select v-model="setForm.activeEventId" class="input-search w-full">
                                  <option value="">— No active event —</option>
                                  <option v-for="e in events" :key="e.id" :value="e.id">{{ e.name }} ({{ fmtDate(e.date) }})</option>
                                </select>
                              </div>
                              <div v-if="setForm.activeEventId" class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-300">
                                <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                Active: <strong class="ml-1">{{ events.find(e => e.id === setForm.activeEventId)?.name }}</strong>
                              </div>
                            </div>
              <!-- Row 1 Right: Attendance Mode -->
                            <!-- Attendance Mode card -->
                            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                              <div class="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                                <h3 class="text-sm font-bold text-gray-800 dark:text-white">Attendance Mode</h3>
                              </div>
                              <p class="text-xs text-gray-500 dark:text-gray-400">Choose whether the system should show login or logout mode on the attendance screen.</p>
                              <div class="grid grid-cols-2 gap-3">
                                <label class="cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  <input type="radio" v-model="setForm.loginMode" value="login" class="accent-sync-green" />
                                  Login
                                </label>
                                <label class="cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  <input type="radio" v-model="setForm.loginMode" value="logout" class="accent-sync-green" />
                                  Logout
                                </label>
                              </div>
                              <button @click="saveSettings" class="btn-primary text-sm w-full">Save Settings</button>
                            </div>
              <!-- Row 2 Left: Account Management -->
                            <!-- Account Management card -->
                            <div v-if="isSuperAdmin" class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                              <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                                <svg class="w-4 h-4 text-sync-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                <h3 class="text-sm font-bold text-gray-800 dark:text-white">Account Management</h3>
                              </div>
                              <!-- Alerts -->
                              <div class="px-5 pt-4">
                                <div v-if="attAcctSuccess" class="mb-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                                  <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                  {{ attAcctSuccess }}
                                </div>
                                <div v-if="attAcctError" class="mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                                  <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                                  {{ attAcctError }}
                                </div>
                              </div>
                              <!-- Add account form -->
                              <div class="px-5 pb-4 pt-1">
                                <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Add New Account</p>
                                <div class="flex flex-col gap-2">
                                  <input v-model="attNewEmail" type="email" placeholder="Email address" class="input-search" />
                                  <div class="flex gap-2">
                                    <div class="relative flex-1">
                                      <input v-model="attNewPassword" :type="attShowNewPass ? 'text' : 'password'" placeholder="Password (min 6 chars)" class="input-search pr-8 w-full" />
                                      <button type="button" @click="attShowNewPass = !attShowNewPass" tabindex="-1" class="absolute inset-y-0 right-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                        <svg v-if="!attShowNewPass" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                        <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                                      </button>
                                    </div>
                                    <button @click="addAttAccount" :disabled="attIsAdding" class="btn-primary inline-flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-60 flex-shrink-0">
                                      <svg v-if="attIsAdding" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                      <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                                      Add
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <!-- Accounts list -->
                              <div class="border-t border-gray-100 dark:border-gray-800">
                                <div v-if="attAcctLoading" class="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
                                  <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                  Loading accounts...
                                </div>
                                <div v-else>
                                  <!-- Super admin row -->
                                  <div class="flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800/60">
                                    <div class="flex items-center gap-3">
                                      <div class="w-7 h-7 rounded-full bg-sync-green flex items-center justify-center flex-shrink-0">
                                        <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                      </div>
                                      <div>
                                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ currentUser?.email }}</p>
                                        <p class="text-xs text-gray-400">Super Admin</p>
                                      </div>
                                    </div>
                                    <span class="text-xs font-semibold text-sync-green bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Admin</span>
                                  </div>
                                  <!-- Dynamic accounts -->
                                  <div v-for="acct in attAccounts" :key="acct.id" class="flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                                    <div class="flex items-center gap-3">
                                      <div class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                        <svg class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                      </div>
                                      <div>
                                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ acct.email }}</p>
                                        <p class="text-xs text-gray-400">User</p>
                                      </div>
                                    </div>
                                    <button @click="attDeleteTarget = acct" class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                  </div>
                                  <div v-if="attAccounts.length === 0" class="px-5 py-4 text-xs text-gray-400 text-center">No additional accounts yet.</div>
                                </div>
                              </div>
                            </div>
              <!-- Row 2 Right: Danger Zone -->
                            <div v-if="isSuperAdmin" class="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900/40 p-5 space-y-3">
                              <div class="flex items-center gap-2 border-b border-red-100 dark:border-red-900/40 pb-3">
                                <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                                <h3 class="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
                              </div>
                              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-red-100 dark:border-red-900/30">
                                <div>
                                  <p class="text-sm font-medium text-gray-800 dark:text-white">Clear Attendance Records</p>
                                  <p class="text-xs text-orange-500 dark:text-orange-400 mt-0.5">Delete all attendance logs only. Students and events stay intact.</p>
                                </div>
                                <button @click="clearAttendanceOnly" class="sm:flex-shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors w-full sm:w-auto">
                                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  Clear Attendance
                                </button>
                              </div>
                              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                                <div>
                                  <p class="text-sm font-medium text-gray-800 dark:text-white">Clear All Data</p>
                                  <p class="text-xs text-red-500 dark:text-red-400 mt-0.5">Permanently delete all events, students, attendance records, and raffle data. <span class="font-semibold">This action cannot be undone.</span></p>
                                </div>
                                <button @click="clearAllData" class="sm:flex-shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors w-full sm:w-auto">
                                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  Clear Database
                                </button>
                              </div>
                            </div>

              <!-- Row 3: Restore Database (full width, only when backup exists) -->
              <div v-if="hasBackup" class="xl:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-emerald-200 dark:border-emerald-900/50 p-5">
                <div class="flex items-center gap-2 border-b border-emerald-100 dark:border-emerald-900/40 pb-3 mb-4">
                  <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  <h3 class="text-sm font-bold text-emerald-700 dark:text-emerald-400">Restore Database</h3>
                  <span class="ml-auto inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Backup available
                  </span>
                </div>

                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div class="space-y-1">
                    <p class="text-sm font-medium text-gray-800 dark:text-white">
                      Restore from last backup
                      <span v-if="backupMeta?.clearedWhat === 'all'" class="ml-1.5 text-xs font-semibold text-orange-500">(Full clear)</span>
                      <span v-else class="ml-1.5 text-xs font-semibold text-blue-500">(Attendance only)</span>
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      Saved on
                      <span class="font-semibold text-gray-700 dark:text-gray-300">{{ backupMeta ? fmtBackupDate(backupMeta.savedAt) : '—' }}</span>
                    </p>
                    <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Records will be re-uploaded to Strapi. Existing data won't be duplicated.
                    </p>
                  </div>
                  <div class="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                    <button
                      @click="restoreDatabase"
                      :disabled="isRestoring"
                      class="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors w-full sm:w-auto"
                    >
                      <svg v-if="isRestoring" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      {{ isRestoring ? 'Restoring...' : 'Restore Now' }}
                    </button>
                    <button
                      @click="clearBackup"
                      :disabled="isRestoring"
                      class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 text-sm font-medium transition-colors w-full sm:w-auto"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                      Discard Backup
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </main>
      </div>
    </div>

    <!-- â•â• STUDENT MODAL â•â• -->
    <!-- Dashboard Detail Modal -->
    <div v-if="dashModal.show" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4" @click.self="closeDashModal">
      <div class="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh]">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 class="text-base font-bold text-gray-900 dark:text-white">{{ dashModalTitle }}</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ dashModalRows.length }} record{{ dashModalRows.length !== 1 ? 's' : '' }}</p>
          </div>
          <button @click="closeDashModal" class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="flex flex-wrap gap-2 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <input v-model="dashModalSearch" type="text" placeholder="Search name or ID..." class="input-search w-full sm:flex-1 sm:min-w-[160px] text-sm" />
          <div class="flex gap-2 w-full sm:w-auto">
            <select v-model="dashModalYear" class="input-search flex-1 sm:w-36 text-sm"><option value="">All Years</option><option value="1st Year">1st Year</option><option value="2nd Year">2nd Year</option><option value="3rd Year">3rd Year</option><option value="4th Year">4th Year</option></select>
            <select v-model="dashModalSort" class="input-search flex-1 sm:w-36 text-sm"><option value="name">Sort by Name</option><option value="id">Sort by ID</option><option value="year">Sort by Year</option></select>
          </div>
        </div>
        <div class="overflow-y-auto flex-1">
          <div v-if="!dashModalRows.length" class="py-12 text-center text-gray-400 text-sm">No records found.</div>
          <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[500px] text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10"><tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dept</th>
              <th v-if="dashModal.type !== 'students'" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th v-if="dashModal.type !== 'students' && dashModal.type !== 'firstday' && dashModal.type !== 'secondday'" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in dashModalRows" :key="row.studentId + (row.timeIn ?? '')" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{{ row.studentId }}</td>
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{{ row.name }}</td>
                <td class="px-4 py-3 text-gray-500 text-xs">{{ shortYear(row.yearLevel) }}</td>
                <td class="px-4 py-3 text-gray-500 text-xs">{{ row.dept }}</td>
                <td v-if="dashModal.type !== 'students'" class="px-4 py-3"><span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', row.status === 'Logged In' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : row.status === 'Completed' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : row.status === 'First Day' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : row.status === 'Second Day' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400']">{{ row.status }}</span></td>
                <td v-if="dashModal.type !== 'students' && dashModal.type !== 'firstday' && dashModal.type !== 'secondday'" class="px-4 py-3 text-xs text-gray-400">{{ row.date }} {{ row.timeIn }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showImportModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4">
      <div class="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <div class="space-y-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">Import Student / Attendance File</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Upload a CSV or Excel file with student records or attendance rows.</p>
        </div>
        <div class="space-y-3">
          <p class="text-sm text-gray-700 dark:text-gray-200">For student import, the file should include Student ID, Name, Year Level, and Department.</p>
        </div>
        <div class="rounded-3xl border-2 transition-all duration-150 cursor-pointer p-6 text-center"
            :class="importDropActive ? 'border-sync-green bg-green-50/40' : 'border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'"
            @click="chooseImportFile"
            @dragover.prevent="handleImportDragOver"
            @dragenter.prevent="handleImportDragOver"
            @dragleave.prevent="handleImportDragLeave"
            @drop.prevent="handleImportDrop">
            <div class="flex flex-col items-center justify-center gap-3">
              <div class="w-14 h-14 rounded-full bg-sync-green/10 text-sync-green flex items-center justify-center text-2xl font-bold">+</div>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">Drag and drop a file here or click to select</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">.csv, .xlsx, .xls</p>
            </div>
        </div>
        <div class="flex gap-3 pt-1">
          <button @click="chooseImportFile" class="btn-primary flex-1 text-sm">Select file</button>
          <button @click="showImportModal=false" class="btn-secondary flex-1 text-sm">Cancel</button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">If you cancel the file picker, you can reopen this dialog from the Students page.</p>
      </div>
    </div>

    <div v-if="showStuModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4">
      <div class="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <div class="space-y-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ editStuId ? 'Edit Student' : 'Add Student' }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Use this form to add or update student records. Give each student a unique ID so attendance tracking and raffle selection work correctly.</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Student ID</label>
          <input v-model="stuForm.studentId" type="text" class="input-search w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name</label>
          <input v-model="stuForm.name" type="text" class="input-search w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Year Level</label>
          <select v-model="stuForm.yearLevel" class="input-search w-full">
            <option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label>
          <input v-model="stuForm.dept" type="text" class="input-search w-full" />
        </div>
        <div class="flex gap-3 pt-1">
          <button @click="saveStudent" class="btn-primary flex-1 text-sm">{{ editStuId ? 'Update' : 'Add' }}</button>
          <button @click="showStuModal=false" class="btn-secondary flex-1 text-sm">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ══ EVENT MODAL ══ -->
    <div v-if="showEvtModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4">
      <div class="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ editEvtId ? 'Edit Event' : 'Add Event' }}</h2>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Event Name</label>
          <input v-model="evtForm.name" type="text" class="input-search w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <input v-model="evtForm.type" type="text" class="input-search w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input v-model="evtForm.date" type="date" class="input-search w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Venue</label>
          <input v-model="evtForm.venue" type="text" class="input-search w-full" />
        </div>
        <div class="flex gap-3 pt-1">
          <button @click="saveEvent" class="btn-primary flex-1 text-sm">{{ editEvtId ? 'Update' : 'Add' }}</button>
          <button @click="showEvtModal=false" class="btn-secondary flex-1 text-sm">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ══ CONFIRM DIALOG ══ -->
    <div v-if="confirmDialog.show" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4">
      <div class="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-5 sm:p-6 space-y-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ confirmDialog.title }}</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ confirmDialog.message }}</p>
        <div class="flex gap-3 pt-1">
          <button @click="onConfirmYes" class="btn-primary flex-1 text-sm">Yes, confirm</button>
          <button @click="onConfirmNo" class="btn-secondary flex-1 text-sm">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ══ TOASTS ══ -->
    <div class="fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-[60] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-1.5rem)] sm:max-w-xs">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id"
          :class="['px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto max-w-xs',
            t.type==='success' ? 'bg-green-600 text-white' : t.type==='error' ? 'bg-red-600 text-white' : t.type==='warning' ? 'bg-yellow-500 text-white' : 'bg-gray-800 text-white']">
          {{ t.msg }}
        </div>
      </transition-group>
    </div>

    <!-- ══ DELETE ACCOUNT CONFIRM MODAL ══ -->
    <Teleport to="body">
      <div v-if="attDeleteTarget" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" @click.self="attDeleteTarget = null">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-800">
          <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-800 dark:text-white">Delete Account</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">This cannot be undone</p>
            </div>
          </div>
          <div class="px-6 py-5">
            <p class="text-sm text-gray-700 dark:text-gray-300">Delete account <span class="font-bold text-gray-900 dark:text-white">{{ attDeleteTarget?.email }}</span>? They will no longer be able to log in.</p>
          </div>
          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
            <button @click="attDeleteTarget = null" :disabled="attIsDeletingAcct" class="btn-secondary text-xs px-4 py-2">Cancel</button>
            <button @click="confirmDeleteAttAccount" :disabled="attIsDeletingAcct" class="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60 transition-colors">
              <svg v-if="attIsDeletingAcct" class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              {{ attIsDeletingAcct ? 'Deleting...' : 'Yes, Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>


    <!-- ══ WINNERS MODAL ══ -->
    <div v-if="showWinnersModal" @click.self="showWinnersModal=false"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md px-4 overflow-hidden">
      <!-- Confetti -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <div v-for="p in confettiPieces" :key="p.id"
          class="confetti-piece"
          :style="`left:${p.x}%;top:-10px;width:${p.size}px;height:${p.size}px;background:${p.color};border-radius:2px;animation-delay:${p.delay}s;animation-duration:${p.duration}s;opacity:0.9;`">
        </div>
      </div>
      <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <!-- Trophy header -->
        <div class="flex flex-col items-center pt-8 pb-4 bg-gradient-to-b from-blue-50 to-white dark:from-gray-800 dark:to-gray-900">
          <div class="w-16 h-16 rounded-full bg-yellow-400 flex items-center justify-center shadow-lg mb-3">
            <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H9v2h6v-2h-2v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ latestWinners.length }} WINNERS</h2>
        </div>
        <!-- Numbered list -->
        <div class="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="(w, i) in latestWinners" :key="w.id"
            class="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <span class="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-400 flex-shrink-0">{{ i+1 }}</span>
            <div class="min-w-0">
              <p class="text-xs font-bold text-sync-green">{{ w.studentId }}</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ w.name }}</p>
              <p class="text-xs text-gray-400">{{ shortYear(w.yearLevel) }}</p>
            </div>
          </div>
        </div>
        <p @click="showWinnersModal=false" class="text-center text-xs text-gray-400 py-3 cursor-pointer hover:text-gray-600">Click anywhere to dismiss</p>
      </div>
    </div>

  </div>
  </template>

  <style scoped>
  .toast-enter-active, .toast-leave-active { transition: all .25s ease; }
  .toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px); }
    .confetti-piece {
      position: absolute;
      animation-name: confetti-fall;
      animation-timing-function: ease-out;
      animation-fill-mode: forwards;
    }
    @keyframes confetti-fall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      50% { opacity: 0.95; }
      100% { transform: translateY(120vh) rotate(360deg); opacity: 0; }
    }

  /* ══ RAFFLE BORDER LIGHTS ══ */
  .raffle-border-lights {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
  }

  /* Four edge bars — top, bottom, left, right */
  .raffle-border-lights__top,
  .raffle-border-lights__bottom,
  .raffle-border-lights__left,
  .raffle-border-lights__right {
    position: absolute;
    background: transparent;
  }

  /* Top bar */
  .raffle-border-lights__top {
    top: 0; left: 0; right: 0;
    height: 4px;
    animation: glow-top 0.4s ease-in-out infinite alternate;
  }
  /* Bottom bar */
  .raffle-border-lights__bottom {
    bottom: 0; left: 0; right: 0;
    height: 4px;
    animation: glow-bottom 0.4s ease-in-out infinite alternate;
    animation-delay: 0.1s;
  }
  /* Left bar */
  .raffle-border-lights__left {
    top: 0; bottom: 0; left: 0;
    width: 4px;
    animation: glow-left 0.4s ease-in-out infinite alternate;
    animation-delay: 0.2s;
  }
  /* Right bar */
  .raffle-border-lights__right {
    top: 0; bottom: 0; right: 0;
    width: 4px;
    animation: glow-right 0.4s ease-in-out infinite alternate;
    animation-delay: 0.3s;
  }

  /* Color cycling for each edge — each one has a slightly different phase */
  @keyframes glow-top {
    0%   { background: rgba(34,197,94,0.5);   box-shadow: 0 0 8px 3px rgba(34,197,94,0.25); }
    20%  { background: rgba(234,179,8,0.5);   box-shadow: 0 0 8px 3px rgba(234,179,8,0.25); }
    40%  { background: rgba(239,68,68,0.5);   box-shadow: 0 0 8px 3px rgba(239,68,68,0.25); }
    60%  { background: rgba(168,85,247,0.5);  box-shadow: 0 0 8px 3px rgba(168,85,247,0.25); }
    80%  { background: rgba(59,130,246,0.5);  box-shadow: 0 0 8px 3px rgba(59,130,246,0.25); }
    100% { background: rgba(6,182,212,0.5);   box-shadow: 0 0 8px 3px rgba(6,182,212,0.25); }
  }
  @keyframes glow-bottom {
    0%   { background: rgba(59,130,246,0.5);  box-shadow: 0 0 8px 3px rgba(59,130,246,0.25); }
    20%  { background: rgba(168,85,247,0.5);  box-shadow: 0 0 8px 3px rgba(168,85,247,0.25); }
    40%  { background: rgba(34,197,94,0.5);   box-shadow: 0 0 8px 3px rgba(34,197,94,0.25); }
    60%  { background: rgba(239,68,68,0.5);   box-shadow: 0 0 8px 3px rgba(239,68,68,0.25); }
    80%  { background: rgba(234,179,8,0.5);   box-shadow: 0 0 8px 3px rgba(234,179,8,0.25); }
    100% { background: rgba(34,197,94,0.5);   box-shadow: 0 0 8px 3px rgba(34,197,94,0.25); }
  }
  @keyframes glow-left {
    0%   { background: rgba(239,68,68,0.5);   box-shadow: 0 0 8px 3px rgba(239,68,68,0.25); }
    20%  { background: rgba(6,182,212,0.5);   box-shadow: 0 0 8px 3px rgba(6,182,212,0.25); }
    40%  { background: rgba(234,179,8,0.5);   box-shadow: 0 0 8px 3px rgba(234,179,8,0.25); }
    60%  { background: rgba(34,197,94,0.5);   box-shadow: 0 0 8px 3px rgba(34,197,94,0.25); }
    80%  { background: rgba(168,85,247,0.5);  box-shadow: 0 0 8px 3px rgba(168,85,247,0.25); }
    100% { background: rgba(239,68,68,0.5);   box-shadow: 0 0 8px 3px rgba(239,68,68,0.25); }
  }
@keyframes glow-right {
  0%   { background: rgba(168,85,247,0.5);  box-shadow: 0 0 8px 3px rgba(168,85,247,0.25); }
  20%  { background: rgba(34,197,94,0.5);   box-shadow: 0 0 8px 3px rgba(34,197,94,0.25); }
  40%  { background: rgba(59,130,246,0.5);  box-shadow: 0 0 8px 3px rgba(59,130,246,0.25); }
  60%  { background: rgba(6,182,212,0.5);   box-shadow: 0 0 8px 3px rgba(6,182,212,0.25); }
  80%  { background: rgba(239,68,68,0.5);   box-shadow: 0 0 8px 3px rgba(239,68,68,0.25); }
  100% { background: rgba(234,179,8,0.5);   box-shadow: 0 0 8px 3px rgba(234,179,8,0.25); }
}

/* Transition for appearing/disappearing */
.border-lights-enter-active { transition: opacity 0.2s ease; }
.border-lights-leave-active { transition: opacity 0.5s ease; }
.border-lights-enter-from,
.border-lights-leave-to    { opacity: 0; }
</style>