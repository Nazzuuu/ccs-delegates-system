// patch-student-ids.mjs
// Run: node patch-student-ids.mjs
// Reads the XLS file, builds a name→studentId map, then updates all delegates in Strapi.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('./tfvc-frontend/node_modules/xlsx')
import { readFileSync } from 'fs'

const TOKEN = 'b89257ecd966dd155d2459982e9aa6dfee03db74c16f054cfb75ddaa74a84e8190dcd47588d1028b5cf67cbf2bbe8a1a5e896ab231b253a0874009157a95a7a49e2e404eee30ea1519f48b7e6f3e9465feee5e6353e90557ca22252749130ab710742ea47c966c4f79048026bfc9d6c0f9a8d259b6d3ce7b2a543f951cddb435'
const BASE = 'https://ccs-delegates-system-production.up.railway.app/api'
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

// ── 1. Build name → studentId map from XLS ─────────────────────────────────
const XLS_PATH = 'C:/Users/nazzr/Downloads/CCS (1).xls'
const wb = XLSX.readFile(XLS_PATH)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

const nameToId = new Map()
for (let i = 8; i < rows.length; i++) {
  const r = rows[i]
  const studentNo = r[3]
  const lastName  = r[9]
  const firstName = r[11]
  if (!studentNo || !lastName || !firstName) continue
  const nameKey = (String(lastName).trim() + ', ' + String(firstName).trim()).toUpperCase().trim()
  if (!nameToId.has(nameKey)) {  // keep first occurrence on duplicates
    nameToId.set(nameKey, String(studentNo))
  }
}
console.log(`✅ Loaded ${nameToId.size} student IDs from XLS`)

// ── 2. Fetch all delegates from Strapi ────────────────────────────────────
async function fetchAll() {
  const PAGE = 500; let page = 1; const all = []
  while (true) {
    const res = await fetch(`${BASE}/delegates?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=name:ASC`, { headers })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const json = await res.json()
    all.push(...json.data)
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

// ── 3. Patch each delegate with its real studentId ───────────────────────
async function patchDelegate(documentId, studentId) {
  const res = await fetch(`${BASE}/delegates/${documentId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ data: { studentId } }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`PUT failed [${documentId}]: ${res.status} ${txt}`)
  }
}

console.log('Fetching all delegates from Strapi...')
const delegates = await fetchAll()
console.log(`Found ${delegates.length} delegates`)

let matched = 0, notFound = [], alreadySet = 0
const BATCH = 10

// Normalize delegate name: remove middle initial if present, uppercase
function normalizeName(name) {
  return name.trim().toUpperCase()
}

for (let i = 0; i < delegates.length; i += BATCH) {
  const batch = delegates.slice(i, i + BATCH)
  await Promise.all(batch.map(async d => {
    const nameFull = normalizeName(d.name)
    const sid = nameToId.get(nameFull)
    if (!sid) {
      // Try prefix match (delegate name may lack middle initial)
      // e.g. "ABRANTES, CHRISTINE JOY" matches "ABRANTES, CHRISTINE JOY B"
      let foundSid = null
      for (const [xlsName, xlsSid] of nameToId.entries()) {
        if (xlsName.startsWith(nameFull + ' ') || xlsName === nameFull) {
          foundSid = xlsSid; break
        }
      }
      if (!foundSid) {
        notFound.push(d.name)
        return
      }
      try { await patchDelegate(d.documentId, foundSid); matched++ }
      catch (e) { console.error(`  ✗ ${d.name}: ${e.message}`) }
    } else {
      if (d.studentId === sid) { alreadySet++; return }
      try { await patchDelegate(d.documentId, sid); matched++ }
      catch (e) { console.error(`  ✗ ${d.name}: ${e.message}`) }
    }
  }))
  process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, delegates.length)}/${delegates.length}`)
}

console.log(`\n\n✅ Done!`)
console.log(`  Patched:       ${matched}`)
console.log(`  Already set:   ${alreadySet}`)
console.log(`  Not found (${notFound.length}):`)
notFound.forEach(n => console.log(`    - ${n}`))
