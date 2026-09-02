/**
 * Facit för byggdagboken (2026-09-02, sprinten "ÄTA + byggdagbok-granskning",
 * Etapp D–E).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * project_log hade fem skrivvägar och tre var trasiga: voice/execute saknade
 * order_id (NOT NULL → 23502 varje gång), jobbuddy/actions skrev fem
 * påhittade kolumner (svalt, returnerade success), kundtidslinjen läste fyra
 * kolumner som inte finns (42703 svalt). Roten: sql/rot_rut_documents.sql
 * DEL 4 beskrev ett schema som aldrig matchade databasen, så
 * column-contract-facit kunde inte fånga det. Desktop-UI:t hade foton i
 * schemat men inget sätt att ladda upp, timmar-state utan input, ingen
 * låsning/attest/historik; PDF:en saknade foton/timmar; slutrapporten läste
 * aldrig dagboken.
 *
 * ═══ VAD FACIT LÅSER ═══
 *
 *   1. Enda `.from('project_log').insert(` i kodbasen bor i lib/diary/write.ts.
 *   2. Alla skrivvägar (voice, jobbuddy, Matte addWorkNote, samtals-
 *      godkännandet) går via createDiaryEntry med business_user_id.
 *   3. Kundtidslinjen läser LIVE-kolumnerna med business_id-filter.
 *   4. [logId]-routen: force-dynamic, loadDiaryContext, canEditDiaryRow,
 *      isDiaryRowLocked, 409 på låst rad.
 *   5. Låsregeln + SMHI-vädermappningen som enhetstester.
 *   6. PDF:en har foton, timmar, attest, LÅST och from/to.
 *   7. Desktop: DiaryTab monterad, LogModal borta, timmar-input + 5 väderval.
 *   8. Schemadokumentet DEL 4 = LIVE; v196 innehåller det GET:en läser.
 *   9. Slutrapporten läser project_log men aldrig sina egna log_report_-rader.
 *
 *   npx playwright test tests/byggdagboken.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { DIARY_LOCK_AFTER_DAYS, isDiaryRowLocked, lockReason } from '../lib/diary/locking'
import { DIARY_WEATHER, WEATHER_LABELS, WEATHER_EMOJI, smhiSymbolToWeather } from '../lib/diary/weather'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

function allaKodfiler(dir: string, ut: string[] = []): string[] {
  for (const namn of fs.readdirSync(dir)) {
    if (namn === 'node_modules' || namn === '.next' || namn.startsWith('.')) continue
    const full = path.join(dir, namn)
    const st = fs.statSync(full)
    if (st.isDirectory()) allaKodfiler(full, ut)
    else if (/\.(ts|tsx)$/.test(namn)) ut.push(full)
  }
  return ut
}

// ─── 1–2. En skrivväg ─────────────────────────────────────────────────────

test('enda .from(project_log).insert( i kodbasen bor i lib/diary/write.ts', () => {
  const filer = [...allaKodfiler(path.join(ROOT, 'app')), ...allaKodfiler(path.join(ROOT, 'lib'))]
  const traffar = filer.filter(f => {
    const src = fs.readFileSync(f, 'utf8')
    return /\.from\(\s*['"]project_log['"]\s*\)\s*\.insert\(/.test(src.replace(/\s+/g, ' '))
  }).map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
  expect(traffar).toEqual(['lib/diary/write.ts'])
})

test('voice/execute skriver dagbok via createDiaryEntry med business_user_id', () => {
  const src = kod('app/api/voice/execute/route.ts')
  expect(src).toContain("from '@/lib/diary/write'")
  expect(src).toContain('createDiaryEntry(')
  expect(src).toContain('business_user_id: currentUser.id')
  expect(src).not.toContain(".from('project_log')")
})

test('jobbuddy/actions skriver via createDiaryEntry utan fantomkolumner', () => {
  const src = kod('app/api/jobbuddy/actions/route.ts')
  expect(src).toContain('createDiaryEntry(')
  expect(src).not.toContain(".from('project_log')")
  // De fem påhittade kolumnerna som skrevs fram till 2026-09-02
  // (log_id/project_id/entry_type/title/content som insert-nycklar).
  for (const fantom of ['entry_type:', 'work_description:', 'log_date:', 'content:']) {
    expect(src, `fantomkolumnen ${fantom} får inte skrivas`).not.toContain(fantom)
  }
})

test('Mattes addWorkNote och samtalsgodkännandet går via createDiaryEntry', () => {
  const router = kod('app/api/agent/trigger/tool-router.ts')
  const addWorkNote = router.slice(router.indexOf('async function addWorkNote('))
  expect(addWorkNote).toContain('createDiaryEntry(')
  expect(kod('app/api/agent/trigger/tool-definitions.ts')).toMatch(/hours_worked:\s*\{\s*type:\s*"number"/)

  const approvals = kod('app/api/approvals/[id]/route.ts')
  const note = approvals.slice(approvals.indexOf("case 'project_log_note'"))
  expect(note.slice(0, 4000)).toContain('createDiaryEntry(')
})

// ─── 3. Kundtidslinjen ────────────────────────────────────────────────────

test('kundtidslinjen läser LIVE-kolumnerna i project_log med business_id', () => {
  const src = kod('app/api/customers/[id]/timeline/route.ts')
  const block = src.slice(src.indexOf(".from('project_log')"), src.indexOf(".from('project_log')") + 600)
  expect(block).toContain("'id, work_performed, description, order_id, date, created_at'")
  expect(block).toContain(".eq('business_id', businessId)")
  expect(block).toContain(".in('order_id', projectIds)")
  for (const fantom of ['log_date', 'work_description', 'project_id, ']) {
    expect(block).not.toContain(fantom)
  }
})

// ─── 4. [logId]-routen ────────────────────────────────────────────────────

test('[logId]-routen: force-dynamic, kontext, radbehörighet, låsregel, 409', () => {
  const src = kod('app/api/projects/[id]/logs/[logId]/route.ts')
  expect(src).toContain("export const dynamic = 'force-dynamic'")
  expect(src).toContain('loadDiaryContext(')
  expect(src).toContain('canEditDiaryRow(')
  expect(src).toContain('isDiaryRowLocked(')
  expect(src).toContain('status: 409')
  expect(src).toContain('Lägg till en tilläggsanteckning i stället')
  expect(src).toContain("action === 'attest'")
  expect(src).toContain("action === 'unlock'")
  expect(src).toContain("action === 'addendum'")
  expect(src).not.toContain('requirePermission')
})

test('loadDiaryContext använder getCurrentUser och projektet filtreras på företaget', () => {
  const src = kod('lib/diary/route-context.ts')
  expect(src).toContain('getCurrentUser(')
  expect(src).toContain("from('project')")
  expect(src).toContain(".eq('business_id', business.business_id)")
})

test('fotoroutens uppladdning vägrar låst rad och lagrar under företagets prefix', () => {
  const src = kod('app/api/projects/[id]/logs/[logId]/photos/route.ts')
  expect(src).toContain("export const dynamic = 'force-dynamic'")
  expect(src).toContain('status: 409')
  expect(src).toContain('diaryPhotoPath(')
  expect(src).toContain('DIARY_BUCKET')
  expect(src).toContain("action: 'photo_add'")
  expect(src).toContain("action: 'photo_remove'")
})

// ─── 5. Enhetstester ──────────────────────────────────────────────────────

test('låsregeln: attesterad, manuell, äldre än 7 dagar', () => {
  const idag = new Date(2026, 8, 2) // 2 sep 2026, lokal tid
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dagarSedan = (n: number) => { const d = new Date(idag); d.setDate(d.getDate() - n); return iso(d) }

  expect(DIARY_LOCK_AFTER_DAYS).toBe(7)
  expect(isDiaryRowLocked({ date: iso(idag), locked_at: null, attested_at: null }, idag)).toBe(false)
  expect(lockReason({ date: iso(idag), locked_at: null, attested_at: '2026-09-02T10:00:00Z' }, idag)).toBe('attested')
  expect(lockReason({ date: iso(idag), locked_at: '2026-09-02T10:00:00Z', attested_at: null }, idag)).toBe('manual')
  expect(lockReason({ date: dagarSedan(7), locked_at: null, attested_at: null }, idag)).toBeNull()
  expect(lockReason({ date: dagarSedan(8), locked_at: null, attested_at: null }, idag)).toBe('age')
  // attest vinner över ålder i etiketten
  expect(lockReason({ date: dagarSedan(30), locked_at: null, attested_at: '2026-08-10T10:00:00Z' }, idag)).toBe('attested')
})

test('SMHI-symbol → dagboksväder: nederbörd vinner över vind', () => {
  expect(smhiSymbolToWeather(1)).toBe('sunny')
  expect(smhiSymbolToWeather(6)).toBe('cloudy')
  expect(smhiSymbolToWeather(19)).toBe('rainy')
  expect(smhiSymbolToWeather(26)).toBe('snowy')
  expect(smhiSymbolToWeather(2, 12)).toBe('windy')
  expect(smhiSymbolToWeather(19, 12)).toBe('rainy')
  expect(smhiSymbolToWeather(0)).toBeNull()
  expect(smhiSymbolToWeather(28)).toBeNull()
  for (let s = 1; s <= 27; s++) {
    const w = smhiSymbolToWeather(s)
    expect(w, `symbol ${s}`).not.toBeNull()
    expect(DIARY_WEATHER).toContain(w)
  }
  expect(DIARY_WEATHER).toEqual(['sunny', 'cloudy', 'rainy', 'snowy', 'windy'])
  for (const w of DIARY_WEATHER) {
    expect(WEATHER_LABELS[w]).toBeTruthy()
    expect(WEATHER_EMOJI[w]).toBeTruthy()
  }
})

// ─── 6. PDF ───────────────────────────────────────────────────────────────

test('dagboks-PDF:en: from/to, foton, timmar, attest, LÅST, sidbrytning före ritning', () => {
  const src = kod('app/api/projects/[id]/logs/pdf/route.ts')
  expect(src).toContain("sp.get('from')")
  expect(src).toContain("sp.get('to')")
  expect(src).toContain('doc.addImage(')
  expect(src).toContain('.download(path)')
  expect(src).toContain('hours_worked')
  expect(src).toContain('attested_at')
  expect(src).toContain("'LÅST'")
  expect(src).toContain('ensureSpace(')
  expect(src).toContain("from '@/lib/diary/weather'")
  expect(src).toContain('loadDiaryContext(')
  expect(src).not.toMatch(/const WEATHER_LABELS/)
})

// ─── 7. Desktop ───────────────────────────────────────────────────────────

test('projektsidan monterar DiaryTab och LogModal är borta', () => {
  const src = kod('app/dashboard/projects/[id]/page.tsx')
  expect(src).toContain("import DiaryTab from '@/components/projects/diary/DiaryTab'")
  expect(src).toContain('<DiaryTab')
  expect(src).not.toContain('function LogModal')
  expect(src).not.toContain('fetchLogs')
  expect(src).not.toContain('handleSaveLog')
})

test('DiaryEntryModal har timmar-input och alla fem väderval', () => {
  const src = kod('components/projects/diary/DiaryEntryModal.tsx')
  expect(src).toContain('step={0.5}')
  expect(src).toContain('DIARY_WEATHER')
  expect(src).toContain('hours_worked')
  expect(src).toContain('ata_change_id')
  expect(src).toContain('DiaryPhotoUploader')
  // Kamera ELLER galleri — capture= skulle tvinga kameran på telefon.
  expect(kod('components/projects/diary/DiaryPhotoUploader.tsx')).not.toContain('capture=')
})

test('DiaryEntryCard visar etiketterna och åtgärderna följer låsningen', () => {
  const src = kod('components/projects/diary/DiaryEntryCard.tsx')
  expect(src).toContain('Attesterad')
  expect(src).toContain('Tilläggsanteckning')
  expect(src).toContain('Lås upp')
  expect(src).toContain('row.can_edit && !row.locked')
  expect(src).toContain('permissions.can_attest && !row.attested_at')
})

// ─── 8. Schema ────────────────────────────────────────────────────────────

test('rot_rut_documents DEL 4 beskriver LIVE-schemat', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql/rot_rut_documents.sql'), 'utf8')
  const del4 = sql.slice(sql.indexOf('DEL 4'))
  const tabell = del4.slice(del4.indexOf('CREATE TABLE IF NOT EXISTS project_log'), del4.indexOf(');'))
  expect(tabell).toContain('order_id TEXT NOT NULL')
  expect(tabell).toContain('work_performed TEXT')
  expect(tabell).toContain('date DATE NOT NULL')
  expect(tabell).not.toContain('log_date')
  expect(tabell).not.toContain('work_description')
  expect(tabell).not.toMatch(/^\s*project_id TEXT/m)
})

test('v196 innehåller dagbokskolumnerna, revisionstabellen och RLS', () => {
  expect(finns('sql/v196_byggdagboken.sql')).toBe(true)
  const sql = fs.readFileSync(path.join(ROOT, 'sql/v196_byggdagboken.sql'), 'utf8')
  for (const s of ['project_log_revision', 'attested_at', 'locked_at', 'ata_change_id', 'addendum', 'attested_by_user_id', 'is_business_member']) {
    expect(sql, s).toContain(s)
  }
  expect(sql).not.toMatch(/\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i)
})

// ─── 9. Slutrapporten ─────────────────────────────────────────────────────

test('slutrapporten läser project_log men aldrig sina egna log_report_-rader', () => {
  const src = kod('lib/job-report.ts')
  const block = src.slice(src.indexOf(".from('project_log')"), src.indexOf(".from('project_log')") + 400)
  expect(block).toContain(".eq('order_id', projectId)")
  expect(block).toContain(".eq('business_id', businessId)")
  expect(block).toContain(".not('id', 'like', 'log_report_%')")
  expect(src).toContain('deviations')
  expect(src).toContain('diaryHours')
})
