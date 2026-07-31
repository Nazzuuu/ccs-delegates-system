// dedup-cleanup.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-time cleanup: removes duplicate delegates and att-students from Strapi.
//
// For DELEGATES:
//   • Groups by normalized name (uppercase, trimmed)
//   • Keeps the record with the "best" data:
//       1. Prefer Paid over Not Paid
//       2. Among equals, prefer the one with a non-empty studentId
//       3. Among equals, prefer the one with the lowest Strapi numeric id (oldest)
//   • Deletes all others in the group
//
// For ATT-STUDENTS:
//   • Groups by normalized name (same logic as above)
//   • Additionally deduplicates by studentId (when non-empty)
//   • Keeps the record with a non-empty studentId, or the oldest
//   • Deletes all others
//
// Run:  node dedup-cleanup.mjs
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = 'b89257ecd966dd155d2459982e9aa6dfee03db74c16f054cfb75ddaa74a84e8190dcd47588d1028b5cf67cbf2bbe8a1a5e896ab231b253a0874009157a95a7a49e2e404eee30ea1519f48b7e6f3e9465feee5e6353e90557ca22252749130ab710742ea47c966c4f79048026bfc9d6c0f9a8d259b6d3ce7b2a543f951cddb435'
const BASE    = 'https://ccs-delegates-system-production.up.railway.app/api'
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }
const BATCH   = 5   // concurrent deletes at a time

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAll(endpoint) {
  const PAGE = 500
  let page = 1
  const all = []
  while (true) {
    const res = await fetch(`${BASE}/${endpoint}?pagination[page]=${page}&pagination[pageSize]=${PAGE}&sort=id:ASC`, { headers: HEADERS })
    if (!res.ok) throw new Error(`Fetch ${endpoint} failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    all.push(...json.data)
    if (page >= json.meta.pagination.pageCount) break
    page++
  }
  return all
}

async function deleteRecord(endpoint, documentId) {
  const res = await fetch(`${BASE}/${endpoint}/${documentId}`, { method: 'DELETE', headers: HEADERS })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`DELETE ${endpoint}/${documentId} failed: ${res.status} ${txt}`)
  }
}

async function deleteBatch(endpoint, documentIds) {
  for (let i = 0; i < documentIds.length; i += BATCH) {
    const chunk = documentIds.slice(i, i + BATCH)
    await Promise.all(chunk.map(id => deleteRecord(endpoint, id).catch(e => console.error(`  ✗ ${e.message}`))))
    process.stdout.write(`\r  Deleted ${Math.min(i + BATCH, documentIds.length)}/${documentIds.length} …`)
  }
  if (documentIds.length > 0) console.log()
}

// ── 1. Dedup DELEGATES ────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════')
console.log(' DELEGATES deduplication')
console.log('══════════════════════════════════════════════')
console.log('Fetching all delegates …')
const delegates = await fetchAll('delegates')
console.log(`Found ${delegates.length} delegates`)

// Group by normalized name
const byName = new Map()
for (const d of delegates) {
  const key = String(d.name ?? '').trim().toUpperCase()
  if (!byName.has(key)) byName.set(key, [])
  byName.get(key).push(d)
}

const delegatesToDelete = []
let delegateDupGroups   = 0

for (const [name, group] of byName.entries()) {
  if (group.length <= 1) continue
  delegateDupGroups++

  // Scoring: higher = better record to keep
  function score(d) {
    let s = 0
    if (d.status === 'Paid')    s += 100  // paid record is most important
    if (d.studentId?.trim())    s += 10   // has a real student ID
    if (d.isReceived)           s += 5
    return s
  }

  // Sort descending by score, then ascending by id (keep oldest when equal)
  const sorted = [...group].sort((a, b) => {
    const diff = score(b) - score(a)
    return diff !== 0 ? diff : a.id - b.id
  })

  const [keep, ...dupes] = sorted
  console.log(`  Dup: "${name}" × ${group.length}  → keep id=${keep.id} (${keep.status}, sid=${keep.studentId || 'none'})`)
  dupes.forEach(d => delegatesToDelete.push(d.documentId))
}

if (delegatesToDelete.length === 0) {
  console.log('✅ No duplicate delegates found.')
} else {
  console.log(`\nDeleting ${delegatesToDelete.length} duplicate delegate(s) across ${delegateDupGroups} group(s) …`)
  await deleteBatch('delegates', delegatesToDelete)
  console.log(`✅ Delegates cleaned up. Deleted ${delegatesToDelete.length} records.`)
}

// ── 2. Dedup ATT-STUDENTS ─────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════')
console.log(' ATT-STUDENTS deduplication')
console.log('══════════════════════════════════════════════')
console.log('Fetching all att-students …')
const attStudents = await fetchAll('att-students')
console.log(`Found ${attStudents.length} att-students`)

// Group by normalized name
const attByName = new Map()
for (const s of attStudents) {
  const key = String(s.name ?? '').trim().toUpperCase()
  if (!attByName.has(key)) attByName.set(key, [])
  attByName.get(key).push(s)
}

const attToDelete = []
let attDupGroups  = 0

for (const [name, group] of attByName.entries()) {
  if (group.length <= 1) continue
  attDupGroups++

  function attScore(s) {
    let sc = 0
    if (s.studentId?.trim()) sc += 10   // prefer record with a student ID
    if (s.paidDay)            sc += 5   // has paid day tag
    return sc
  }

  const sorted = [...group].sort((a, b) => {
    const diff = attScore(b) - attScore(a)
    return diff !== 0 ? diff : a.id - b.id
  })

  const [keep, ...dupes] = sorted
  console.log(`  Dup: "${name}" × ${group.length}  → keep id=${keep.id} (sid=${keep.studentId || 'none'}, paidDay=${keep.paidDay || 'none'})`)
  dupes.forEach(s => attToDelete.push(s.documentId))
}

if (attToDelete.length === 0) {
  console.log('✅ No duplicate att-students found.')
} else {
  console.log(`\nDeleting ${attToDelete.length} duplicate att-student(s) across ${attDupGroups} group(s) …`)
  await deleteBatch('att-students', attToDelete)
  console.log(`✅ Att-students cleaned up. Deleted ${attToDelete.length} records.`)
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════')
console.log(` DONE`)
console.log(`   Delegate duplicates removed : ${delegatesToDelete.length}`)
console.log(`   Att-student duplicates removed: ${attToDelete.length}`)
console.log('══════════════════════════════════════════════\n')
