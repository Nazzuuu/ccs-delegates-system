// seed-non-delegates.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Seeds the non-delegates collection from existing Backout delegates.
// Safe to run multiple times — skips entries that already exist by name.
//
// Run:  node seed-non-delegates.mjs
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = 'b89257ecd966dd155d2459982e9aa6dfee03db74c16f054cfb75ddaa74a84e8190dcd47588d1028b5cf67cbf2bbe8a1a5e896ab231b253a0874009157a95a7a49e2e404eee30ea1519f48b7e6f3e9465feee5e6353e90557ca22252749130ab710742ea47c966c4f79048026bfc9d6c0f9a8d259b6d3ce7b2a543f951cddb435'
const BASE    = 'https://ccs-delegates-system-production.up.railway.app/api'
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

async function fetchAll(endpoint) {
  const PAGE = 500
  let page = 1
  const all = []
  while (true) {
    const res = await fetch(`${BASE}/${endpoint}?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=name:ASC`, { headers: HEADERS })
    if (!res.ok) throw new Error(`Fetch ${endpoint} failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    all.push(...json.data)
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

console.log('Fetching backout delegates...')
const delegates = await fetchAll('delegates')
const backouts = delegates.filter(d => d.status === 'Backout')
console.log(`Found ${backouts.length} backout delegates`)

console.log('Fetching existing non-delegates...')
const existing = await fetchAll('non-delegates')
const existingNames = new Set(existing.map(d => String(d.name ?? '').trim().toUpperCase()))
console.log(`Found ${existing.length} existing non-delegates`)

let added = 0, skipped = 0, failed = 0

for (const d of backouts) {
  const name = String(d.name ?? '').trim().toUpperCase()
  if (existingNames.has(name)) {
    console.log(`  SKIP (exists): ${name}`)
    skipped++
    continue
  }
  const res = await fetch(`${BASE}/non-delegates`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      data: {
        name,
        studentId: d.studentId ?? '',
        yearLevel: d.yearLevel,
        status: 'Backout',
      }
    })
  })
  if (res.ok) {
    console.log(`  ADDED: ${name}`)
    existingNames.add(name)
    added++
  } else {
    const txt = await res.text()
    console.log(`  FAILED: ${name} — ${res.status} ${txt}`)
    failed++
  }
}

console.log(`\nDone. Added: ${added}, Skipped: ${skipped}, Failed: ${failed}`)
