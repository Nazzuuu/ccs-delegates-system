// src/api/strapi.ts
// Strapi v5 uses documentId (string) for PUT/DELETE, not the numeric id.

const BASE = 'http://localhost:1337/api'
const TOKEN = '6a7985326a8c160a29b5610e825f671b755be67b011269e1becb15cde7b756b78237eb21d1487011b795a49256ebf86ab72b7bf49c9a5cdb96fd96a03de76752600bca9804f3db1cf5919bbc08629d9dc7549abb31ff7a8b1304b27614a11e4af551c091f37a57752d6b5b6d2fabc6ac3dc13a61d65e5cf322526cfdd15ccc5a'

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
}

export interface StrapiDelegate {
  id: number
  documentId: string   // Strapi v5 — used for PUT/DELETE
  name: string
  yearLevel: string
  status: 'Paid' | 'Not Paid' | 'Backout'
  isPaid: boolean
  isReceived: boolean
}

function mapEntry(d: any): StrapiDelegate {
  return {
    id: d.id,
    documentId: d.documentId,
    name: d.name,
    yearLevel: d.yearLevel,
    status: d.status,
    isPaid: d.isPaid,
    isReceived: d.isReceived ?? false,
  }
}

/** Fetch ALL delegates from Strapi (handles pagination automatically). */
export async function fetchAllDelegates(): Promise<StrapiDelegate[]> {
  const PAGE = 100
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
    if (all.length >= json.meta.pagination.total) break
    page++
  }

  return all
}

/** Update a delegate using its documentId (Strapi v5). */
export async function updateDelegate(
  documentId: string,
  data: Partial<Pick<StrapiDelegate, 'status' | 'isPaid' | 'isReceived' | 'name' | 'yearLevel'>>
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
