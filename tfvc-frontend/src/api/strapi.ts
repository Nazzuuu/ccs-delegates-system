// src/api/strapi.ts
// Strapi v5 uses documentId (string) for PUT/DELETE, not the numeric id.

const BASE = 'https://ccs-delegates-system-production.up.railway.app/api'
const TOKEN = 'b89257ecd966dd155d2459982e9aa6dfee03db74c16f054cfb75ddaa74a84e8190dcd47588d1028b5cf67cbf2bbe8a1a5e896ab231b253a0874009157a95a7a49e2e404eee30ea1519f48b7e6f3e9465feee5e6353e90557ca22252749130ab710742ea47c966c4f79048026bfc9d6c0f9a8d259b6d3ce7b2a543f951cddb435'

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
}

export interface StrapiDelegate {
  id: number
  documentId: string   // Strapi v5 — used for PUT/DELETE
  name: string
  studentId: string    // real student ID from the school system (e.g. 4251422)
  yearLevel: string
  status: 'Paid' | 'Not Paid' | 'Backout'
  isPaid: boolean
  isReceived: boolean
  paidAt?: string | null    // ISO datetime string set when delegate is marked Paid
  updatedAt?: string | null // Strapi auto-managed timestamp
}

function mapEntry(d: any): StrapiDelegate {
  // For Paid delegates that pre-date the paidAt field, fall back to updatedAt
  // so they still appear in Recently Paid when relevant.
  const paidAt = d.paidAt ?? (d.status === 'Paid' ? (d.updatedAt ?? null) : null)
  return {
    id: d.id,
    documentId: d.documentId,
    name: d.name,
    studentId: d.studentId ?? '',
    yearLevel: d.yearLevel,
    status: d.status,
    isPaid: d.isPaid,
    isReceived: d.isReceived ?? false,
    paidAt,
    updatedAt: d.updatedAt ?? null,
  }
}

/** Fetch ALL delegates from Strapi (handles pagination automatically). */
export async function fetchAllDelegates(): Promise<StrapiDelegate[]> {
  const PAGE = 500
  let page = 1
  const all: StrapiDelegate[] = []

  while (true) {
    const res = await fetch(
      `${BASE}/delegates?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=name:ASC`,
      { headers }
    )
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data.map(mapEntry))
    if (page >= json.meta.pagination.pageCount) break
    page++
  }

  return all
}

/** Update a delegate using its documentId (Strapi v5). */
export async function updateDelegate(
  documentId: string,
  data: Partial<Pick<StrapiDelegate, 'status' | 'isPaid' | 'isReceived' | 'name' | 'yearLevel' | 'studentId' | 'paidAt'>>
): Promise<void> {
  const res = await fetch(`${BASE}/delegates/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Update failed [${documentId}]: ${res.status} ${txt}`)
  }
}

/** Create a new delegate. Returns the created delegate with its documentId. */
export async function createDelegate(
  data: Omit<StrapiDelegate, 'id' | 'documentId'>
): Promise<StrapiDelegate> {
  const res = await fetch(`${BASE}/delegates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Create failed: ${res.status} ${txt}`)
  }
  const json = await res.json()
  return mapEntry(json.data)
}

/** Delete a delegate using its documentId (Strapi v5). */
export async function deleteDelegate(documentId: string): Promise<void> {
  const res = await fetch(`${BASE}/delegates/${documentId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Delete failed [${documentId}]: ${res.status} ${txt}`)
  }
}

/** Delete ALL delegates — fetches all records then deletes each one. */
export async function deleteAllDelegates(): Promise<void> {
  const all = await fetchAllDelegates()
  await Promise.all(all.map(d => deleteDelegate(d.documentId)))
}

export interface ImportRow {
  name: string
  yearLevel: string
  studentId?: string
}

export interface ImportResult {
  added: number
  skipped: string[]   // names that were skipped (already exist or invalid)
  failed: string[]    // names that failed due to API error
}

/**
 * Bulk-import delegates from a parsed row list.
 * Skips rows whose name already exists in the current delegates list (case-insensitive).
 * Runs imports concurrently in batches of 10 to avoid overloading Strapi.
 */
export async function importDelegates(
  rows: ImportRow[],
  existing: StrapiDelegate[]
): Promise<ImportResult> {
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()))
  const result: ImportResult = { added: 0, skipped: [], failed: [] }

  // Valid year levels accepted from the file
  const validYears = new Set(['First Year', 'Second Year', 'Third Year', 'Fourth Year'])

  const toImport = rows.filter(r => {
    if (!r.name?.trim()) { result.skipped.push(r.name ?? '(empty)'); return false }
    if (existingNames.has(r.name.trim().toUpperCase().toLowerCase())) {
      result.skipped.push(r.name.trim()); return false
    }
    if (!validYears.has(r.yearLevel)) { result.skipped.push(r.name.trim()); return false }
    return true
  })

  // Process in batches of 10
  const BATCH = 10
  for (let i = 0; i < toImport.length; i += BATCH) {
    const batch = toImport.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async r => {
        try {
          await createDelegate({
            name: r.name.trim().toUpperCase(),
            yearLevel: r.yearLevel,
            studentId: r.studentId?.trim() ?? '',
            status: 'Not Paid',
            isPaid: false,
            isReceived: false,
          })
          result.added++
        } catch {
          result.failed.push(r.name.trim())
        }
      })
    )
  }

  return result
}

// ── App Users (accounts) ────────────────────────────────────────────────────

export interface AppUser {
  id: number
  documentId: string
  email: string
  password: string
  isAdmin: boolean
}

function mapAppUser(d: any): AppUser {
  return {
    id: d.id,
    documentId: d.documentId,
    email: d.email,
    password: d.password,
    isAdmin: d.isAdmin ?? false,
  }
}

/** Fetch all app-users. */
export async function fetchAppUsers(): Promise<AppUser[]> {
  const res = await fetch(`${BASE}/app-users?pagination[pageSize]=100&sort=email:ASC`, { headers })
  if (!res.ok) throw new Error(`Fetch accounts failed: ${res.status}`)
  const json = await res.json()
  return json.data.map(mapAppUser)
}

/** Find a single app-user by email (for login check). */
export async function fetchAppUserByEmail(email: string): Promise<AppUser | null> {
  const encoded = encodeURIComponent(email)
  const res = await fetch(
    `${BASE}/app-users?filters[email][$eq]=${encoded}&pagination[pageSize]=1`,
    { headers }
  )
  if (!res.ok) return null
  const json = await res.json()
  if (!json.data?.length) return null
  return mapAppUser(json.data[0])
}

/** Create a new app-user account. */
export async function createAppUser(data: {
  email: string
  password: string
  isAdmin?: boolean
}): Promise<AppUser> {
  const res = await fetch(`${BASE}/app-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: { ...data, isAdmin: data.isAdmin ?? false } }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Create account failed: ${res.status} ${txt}`)
  }
  const json = await res.json()
  return mapAppUser(json.data)
}

/** Delete an app-user by documentId. */
export async function deleteAppUser(documentId: string): Promise<void> {
  const res = await fetch(`${BASE}/app-users/${documentId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Delete account failed: ${res.status} ${txt}`)
  }
}


// ── Attendance System API ────────────────────────────────────────────────────

// ── att-event ────────────────────────────────────────────────────────────────
export interface AttEvent {
  id: string          // documentId from Strapi
  name: string
  type: string
  date: string
  venue: string
  status: string
}

function mapAttEvent(d: any): AttEvent {
  return {
    id: d.documentId,
    name: d.name ?? '',
    type: d.type ?? '',
    date: d.date ?? '',
    venue: d.venue ?? '',
    status: d.status ?? 'upcoming',
  }
}

export async function fetchAttEvents(): Promise<AttEvent[]> {
  const res = await fetch(`${BASE}/att-events?pagination[pageSize]=200&sort=date:DESC`, { headers })
  if (!res.ok) throw new Error(`fetchAttEvents failed: ${res.status}`)
  const json = await res.json()
  return json.data.map(mapAttEvent)
}

export async function createAttEvent(data: Omit<AttEvent, 'id'>): Promise<AttEvent> {
  const res = await fetch(`${BASE}/att-events`, {
    method: 'POST', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`createAttEvent failed: ${res.status}`)
  return mapAttEvent((await res.json()).data)
}

export async function updateAttEvent(id: string, data: Partial<Omit<AttEvent, 'id'>>): Promise<void> {
  const res = await fetch(`${BASE}/att-events/${id}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`updateAttEvent failed: ${res.status}`)
}

export async function deleteAttEvent(id: string): Promise<void> {
  const res = await fetch(`${BASE}/att-events/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`deleteAttEvent failed: ${res.status}`)
}

/** Delete ALL att-events — fetches all events then deletes each one. */
export async function deleteAllAttEvents(): Promise<void> {
  const all = await fetchAttEvents()
  await Promise.all(all.map(e => deleteAttEvent(e.id)))
}

// ── att-student ───────────────────────────────────────────────────────────────
export interface AttStudent {
  id: string          // documentId
  studentId: string
  name: string
  yearLevel: string
  dept: string
  paidDay?: 'First Day' | 'Second Day' | null
}

function mapAttStudent(d: any): AttStudent {
  return {
    id: d.documentId,
    studentId: d.studentId ?? '',
    name: d.name ?? '',
    yearLevel: d.yearLevel ?? '',
    dept: d.dept ?? '',
    paidDay: d.paidDay ?? null,
  }
}

export async function fetchAttStudents(): Promise<AttStudent[]> {
  const PAGE = 500
  let page = 1
  const all: AttStudent[] = []
  while (true) {
    const res = await fetch(`${BASE}/att-students?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=name:ASC`, { headers })
    if (!res.ok) throw new Error(`fetchAttStudents failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data.map(mapAttStudent))
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

export async function createAttStudent(data: Omit<AttStudent, 'id'>): Promise<AttStudent> {
  const res = await fetch(`${BASE}/att-students`, {
    method: 'POST', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`createAttStudent failed: ${res.status}`)
  return mapAttStudent((await res.json()).data)
}

export async function updateAttStudent(id: string, data: Partial<Omit<AttStudent, 'id'>>): Promise<void> {
  const res = await fetch(`${BASE}/att-students/${id}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`updateAttStudent failed: ${res.status}`)
}

export async function deleteAttStudent(id: string): Promise<void> {
  const res = await fetch(`${BASE}/att-students/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`deleteAttStudent failed: ${res.status}`)
}

/** Delete ALL att-students — fetches all records then deletes each one. */
export async function deleteAllAttStudents(): Promise<void> {
  const all = await fetchAttStudents()
  await Promise.all(all.map(s => deleteAttStudent(s.id)))
}

export async function bulkCreateAttStudents(rows: Omit<AttStudent, 'id'>[]): Promise<{ added: number; failed: string[] }> {
  const result = { added: 0, failed: [] as string[] }
  const BATCH = 10
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await Promise.all(batch.map(async r => {
      try { await createAttStudent(r); result.added++ }
      catch { result.failed.push(r.name) }
    }))
  }
  return result
}

// ── att-record ────────────────────────────────────────────────────────────────
export interface AttRecord {
  id: string          // documentId
  eventId: string
  eventName: string
  studentId: string
  name: string
  yearLevel: string
  dept: string
  date: string
  timeIn: string
}

function mapAttRecord(d: any): AttRecord {
  return {
    id: d.documentId,
    eventId: d.eventId ?? '',
    eventName: d.eventName ?? '',
    studentId: d.studentId ?? '',
    name: d.name ?? '',
    yearLevel: d.yearLevel ?? '',
    dept: d.dept ?? '',
    date: d.date ?? '',
    timeIn: d.timeIn ?? '',
  }
}

export async function fetchAttRecords(): Promise<AttRecord[]> {
  const PAGE = 500
  let page = 1
  const all: AttRecord[] = []
  while (true) {
    const res = await fetch(`${BASE}/att-records?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=createdAt:DESC`, { headers })
    if (!res.ok) throw new Error(`fetchAttRecords failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data.map(mapAttRecord))
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

export async function createAttRecord(data: Omit<AttRecord, 'id'>): Promise<AttRecord> {
  const res = await fetch(`${BASE}/att-records`, {
    method: 'POST', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`createAttRecord failed: ${res.status}`)
  return mapAttRecord((await res.json()).data)
}

export async function deleteAttRecord(id: string): Promise<void> {
  const res = await fetch(`${BASE}/att-records/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`deleteAttRecord failed: ${res.status}`)
}

export async function deleteAllAttRecords(): Promise<void> {
  const all = await fetchAttRecords()
  await Promise.all(all.map(r => deleteAttRecord(r.id)))
}

// ── att-logout ────────────────────────────────────────────────────────────────
export interface AttLogout {
  id: string          // documentId
  eventId: string
  eventName: string
  studentId: string
  name: string
  yearLevel: string
  dept: string
  date: string
  timeOut: string
}

function mapAttLogout(d: any): AttLogout {
  return {
    id: d.documentId,
    eventId: d.eventId ?? '',
    eventName: d.eventName ?? '',
    studentId: d.studentId ?? '',
    name: d.name ?? '',
    yearLevel: d.yearLevel ?? '',
    dept: d.dept ?? '',
    date: d.date ?? '',
    timeOut: d.timeOut ?? '',
  }
}

export async function fetchAttLogouts(): Promise<AttLogout[]> {
  const PAGE = 500
  let page = 1
  const all: AttLogout[] = []
  while (true) {
    const res = await fetch(`${BASE}/att-logouts?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=createdAt:DESC`, { headers })
    if (!res.ok) throw new Error(`fetchAttLogouts failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data.map(mapAttLogout))
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

export async function createAttLogout(data: Omit<AttLogout, 'id'>): Promise<AttLogout> {
  const res = await fetch(`${BASE}/att-logouts`, {
    method: 'POST', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`createAttLogout failed: ${res.status}`)
  return mapAttLogout((await res.json()).data)
}

export async function deleteAllAttLogouts(): Promise<void> {
  const all = await fetchAttLogouts()
  await Promise.all(all.map(r => {
    return fetch(`${BASE}/att-logouts/${r.id}`, { method: 'DELETE', headers })
  }))
}

// ── att-winner ────────────────────────────────────────────────────────────────
export interface AttWinner {
  id: string          // documentId
  studentId: string
  name: string
  yearLevel: string
  eventId: string
  eventName: string
  drawDate: string
}

function mapAttWinner(d: any): AttWinner {
  return {
    id: d.documentId,
    studentId: d.studentId ?? '',
    name: d.name ?? '',
    yearLevel: d.yearLevel ?? '',
    eventId: d.eventId ?? '',
    eventName: d.eventName ?? '',
    drawDate: d.drawDate ?? '',
  }
}

export async function fetchAttWinners(): Promise<AttWinner[]> {
  const PAGE = 500
  let page = 1
  const all: AttWinner[] = []
  while (true) {
    const res = await fetch(`${BASE}/att-winners?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=createdAt:DESC`, { headers })
    if (!res.ok) throw new Error(`fetchAttWinners failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data.map(mapAttWinner))
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

export async function createAttWinner(data: Omit<AttWinner, 'id'>): Promise<AttWinner> {
  const res = await fetch(`${BASE}/att-winners`, {
    method: 'POST', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`createAttWinner failed: ${res.status}`)
  return mapAttWinner((await res.json()).data)
}

export async function deleteAttWinner(id: string): Promise<void> {
  const res = await fetch(`${BASE}/att-winners/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`deleteAttWinner failed: ${res.status}`)
}

export async function deleteAllAttWinners(eventId?: string): Promise<void> {
  const all = await fetchAttWinners()
  const toDelete = eventId ? all.filter(w => w.eventId === eventId) : all
  await Promise.all(toDelete.map(w => deleteAttWinner(w.id)))
}

// ── att-setting (singleType) ──────────────────────────────────────────────────
export interface AttSetting {
  acadYear: string
  dept: string
  allowDuplicate: boolean
  raffleAttendeeOnly: boolean
  activeEventId: string
  loginMode: 'login' | 'logout'
}

function mapAttSetting(d: any): AttSetting {
  return {
    acadYear: d.acadYear ?? '2025-2026',
    dept: d.dept ?? 'College of Computer Studies',
    allowDuplicate: d.allowDuplicate ?? false,
    raffleAttendeeOnly: d.raffleAttendeeOnly ?? true,
    activeEventId: d.activeEventId ?? '',
    loginMode: d.loginMode === 'logout' ? 'logout' : 'login',
  }
}

export async function fetchAttSetting(): Promise<AttSetting> {
  const res = await fetch(`${BASE}/att-setting`, { headers })
  // 404 means not yet created — return defaults
  if (res.status === 404 || res.status === 500) {
    return { acadYear: '2025-2026', dept: 'College of Computer Studies', allowDuplicate: false, raffleAttendeeOnly: true, activeEventId: '', loginMode: 'login' }
  }
  if (!res.ok) throw new Error(`fetchAttSetting failed: ${res.status}`)
  const json = await res.json()
  return mapAttSetting(json.data)
}

export async function saveAttSetting(data: AttSetting): Promise<void> {
  // singleType uses PUT to create-or-update
  const res = await fetch(`${BASE}/att-setting`, {
    method: 'PUT', headers,
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(`saveAttSetting failed: ${res.status}`)
}

// ── Cross-system sync: delegate edit → attendance system ──────────────────────
export interface DelegateSyncPayload {
  oldStudentId: string
  oldName: string
  newStudentId: string
  newName: string
  newYearLevel: string  // delegates format: "Third Year"
}

/**
 * Convert delegates yearLevel ("First Year" / "Second Year" / etc.)
 * to the short form used by the attendance system ("1st Year" / "2nd Year" / etc.)
 */
function toAttYearLevel(delegateYear: string): string {
  const map: Record<string, string> = {
    'First Year':  '1st Year',
    'Second Year': '2nd Year',
    'Third Year':  '3rd Year',
    'Fourth Year': '4th Year',
  }
  return map[delegateYear] ?? delegateYear
}

/**
 * After editing a delegate's name/studentId/yearLevel in the CCS delegates system,
 * propagate those changes to ALL tables in the attendance system that store
 * denormalized student info: att-students, att-records, att-logouts, att-winners.
 *
 * Matching strategy — a record matches if:
 *   • studentId matches oldStudentId (when non-empty), OR
 *   • name matches oldName (case-insensitive)
 * Both checks run in parallel so records with mismatched IDs are still caught by name.
 *
 * Deduplication: if multiple att-student records match (e.g. from a previous partial sync),
 * only the first one is updated — the rest are deleted to prevent duplicates.
 */
export async function syncDelegateEdit(payload: DelegateSyncPayload): Promise<void> {
  const { oldStudentId, oldName, newStudentId, newName, newYearLevel } = payload

  // Convert yearLevel to the short form the attendance system stores
  const attYearLevel = toAttYearLevel(newYearLevel)

  function matches(id: string, n: string): boolean {
    const byId   = oldStudentId.trim() !== '' && id.trim() === oldStudentId.trim()
    const byName = n.toLowerCase().trim() === oldName.toLowerCase().trim()
    return byId || byName
  }

  // Run all four collection fetches in parallel
  const [attStudents, attRecords, attLogouts, attWinners] = await Promise.all([
    fetchAttStudents(),
    fetchAttRecords(),
    fetchAttLogouts(),
    fetchAttWinners(),
  ])

  // Filter matching records per collection
  const studentsToUpdate = attStudents.filter(s => matches(s.studentId, s.name))
  const recordsToUpdate  = attRecords.filter(r  => matches(r.studentId,  r.name))
  const logoutsToUpdate  = attLogouts.filter(l  => matches(l.studentId,  l.name))
  const winnersToUpdate  = attWinners.filter(w  => matches(w.studentId,  w.name))

  // ── Deduplicate att-students ──────────────────────────────────────────────
  // If more than one att-student matched (e.g. from a previous partial sync that
  // left a stale copy), update only the first and delete the rest.
  const [primaryStudent, ...duplicateStudents] = studentsToUpdate

  // Fire all updates in parallel
  await Promise.all([
    // Update the primary att-student record
    ...(primaryStudent
      ? [updateAttStudent(primaryStudent.id, {
          studentId: newStudentId,
          name:      newName,
          yearLevel: attYearLevel,
        })]
      : []
    ),
    // Delete any duplicate att-student records
    ...duplicateStudents.map(s => deleteAttStudent(s.id)),

    // att-records, att-logouts, att-winners: update all matching (no dedup needed)
    ...recordsToUpdate.map(r =>
      fetch(`${BASE}/att-records/${r.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ data: { studentId: newStudentId, name: newName, yearLevel: attYearLevel } }),
      })
    ),
    ...logoutsToUpdate.map(l =>
      fetch(`${BASE}/att-logouts/${l.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ data: { studentId: newStudentId, name: newName, yearLevel: attYearLevel } }),
      })
    ),
    ...winnersToUpdate.map(w =>
      fetch(`${BASE}/att-winners/${w.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ data: { studentId: newStudentId, name: newName, yearLevel: attYearLevel } }),
      })
    ),
  ])
}
