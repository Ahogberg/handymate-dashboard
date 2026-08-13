#!/usr/bin/env node
/**
 * Läser test-results/golden-path/report.jsonl (skriven av
 * fixtures/report.ts under körningen) och:
 *  1. Skriver docs/reality-week/pass1-<datum>.md — station-för-station,
 *     UI-bevis + DB-bevis + verdict, samma statuskoder som REALITY-WEEK.md
 *     redan definierar.
 *  2. Uppdaterar docs/REALITY-WEEK.md:s Pass 1-tabell (station 1-7) OCH
 *     Pass 2:s A9-rad i det befintliga dokumentet — det är redan designat
 *     som "bokföringen", så det är rätt plats att skriva tillbaka till.
 *
 * Körs manuellt EFTER en playwright-körning:
 *   node tests/e2e-golden-path/scripts/build-golden-path-report.mjs
 *
 * Statuskoder (docs/REALITY-WEEK.md, exakt legend):
 *   ☐ ej körd · ✅ PASS · 🔴 AVVIKELSE (länka fix-commit) ·
 *   🔧 FIXAD & omtestad · ⏭ hoppad (motivera)
 * Skriptet sätter aldrig 🔧 (det kräver en mänsklig fix-commit-länk) —
 * bara ✅ / 🔴 / ⏭, plus ☐ om stationen aldrig kördes alls.
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.join(process.cwd())
const REPORT_FILE = path.join(ROOT, 'test-results', 'golden-path', 'report.jsonl')
const REALITY_WEEK_MD = path.join(ROOT, 'docs', 'REALITY-WEEK.md')
const OUT_DIR = path.join(ROOT, 'docs', 'reality-week')

const PASS1_STATIONS = [
  { key: '1', kort: 'Konto & inloggning' },
  { key: '2', kort: 'Onboarding (inkl. nya intern timkostnad-fältet)' },
  { key: '3', kort: 'Första kunden' },
  { key: '4', kort: 'Offert skapas & skickas' },
  { key: '5', kort: 'Offerten öppnas (tracking på tre ytor)' },
  { key: '6', kort: 'Kunden accepterar → projekt + snapshot + deal won' },
  { key: '7', kort: 'Projektsteget flyttar sig självt' },
]
const A9_ROW = { key: 'A9', kort: 'Anställd utan ekonomibehörighet (403 → ytor göms)' }

function readReport() {
  if (!fs.existsSync(REPORT_FILE)) {
    console.error(`Ingen rapportfil hittad: ${REPORT_FILE}. Kör playwright-testerna först.`)
    process.exit(1)
  }
  return fs
    .readFileSync(REPORT_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l))
}

function aggregateVerdict(rows) {
  if (rows.length === 0) return { symbol: '☐', label: 'ej körd' }
  if (rows.some((r) => r.verdict === 'FAIL')) return { symbol: '🔴', label: 'AVVIKELSE' }
  if (rows.every((r) => r.verdict === 'SKIP')) return { symbol: '⏭', label: 'hoppad' }
  return { symbol: '✅', label: 'PASS' }
}

function summarizeNote(rows) {
  if (rows.length === 0) return ''
  const parts = rows.map((r) => {
    const bevis = [r.ui_bevis, r.db_bevis].filter(Boolean).join(' — ')
    const detalj = r.detalj ? ` (${r.detalj})` : ''
    return `${r.steg}: ${bevis}${detalj}`.trim()
  })
  return parts.join(' • ').slice(0, 400) // korta av — full detalj finns i pass1-md
}

function escapeMd(s) {
  return s.replace(/\|/g, '\\|')
}

function buildPassMarkdown(dateStr, allRows, stationAgg) {
  const lines = []
  lines.push(`# Golden Path — Pass 1-rapport (${dateStr})`)
  lines.push('')
  lines.push('Genererad av tests/e2e-golden-path/scripts/build-golden-path-report.mjs')
  lines.push('ur test-results/golden-path/report.jsonl. Se docs/REALITY-WEEK.md för')
  lines.push('statuskod-legend och det övergripande protokollet.')
  lines.push('')
  lines.push('| Station | Kort | Status | UI-bevis | DB-bevis | Detalj |')
  lines.push('|---|---|---|---|---|---|')
  for (const st of PASS1_STATIONS) {
    const rows = allRows.filter((r) => r.station === st.key)
    const { symbol } = stationAgg[st.key]
    if (rows.length === 0) {
      lines.push(`| ${st.key} | ${escapeMd(st.kort)} | ${symbol} | | | ej körd |`)
      continue
    }
    for (const r of rows) {
      const verdictSymbol = r.verdict === 'FAIL' ? '🔴' : r.verdict === 'SKIP' ? '⏭' : '✅'
      lines.push(
        `| ${st.key} | ${escapeMd(st.kort)} | ${verdictSymbol} | ${escapeMd(r.ui_bevis || '')} | ${escapeMd(
          r.db_bevis || '',
        )} | ${escapeMd(r.detalj || '')} |`,
      )
    }
  }
  lines.push('')
  lines.push('## A9 — Behörighetstestet (permission-check.spec.ts)')
  lines.push('')
  lines.push('| Steg | Status | UI-bevis | DB-bevis | Detalj |')
  lines.push('|---|---|---|---|---|')
  const a9Rows = allRows.filter((r) => r.station === 'A9')
  for (const r of a9Rows) {
    const verdictSymbol = r.verdict === 'FAIL' ? '🔴' : r.verdict === 'SKIP' ? '⏭' : '✅'
    lines.push(`| ${escapeMd(r.steg)} | ${verdictSymbol} | ${escapeMd(r.ui_bevis || '')} | ${escapeMd(r.db_bevis || '')} | ${escapeMd(r.detalj || '')} |`)
  }
  lines.push('')
  lines.push('## Städning')
  lines.push('')
  const cleanupRows = allRows.filter((r) => r.station === 'Städning')
  if (cleanupRows.length === 0) {
    lines.push('Inga städrader loggade (harnesset kraschade troligen innan afterAll hann köra).')
  } else {
    for (const r of cleanupRows) {
      lines.push(`- **${r.steg}**: ${r.verdict}${r.detalj ? ' — ' + r.detalj : ''}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function updateRealityWeekMd(stationAgg, a9Agg, notes, a9Note, pass1FilePath) {
  if (!fs.existsSync(REALITY_WEEK_MD)) {
    console.error(`docs/REALITY-WEEK.md hittades inte på ${REALITY_WEEK_MD} — hoppar över uppdateringen.`)
    return false
  }
  let content = fs.readFileSync(REALITY_WEEK_MD, 'utf8')
  const relPassPath = path.relative(ROOT, pass1FilePath).replace(/\\/g, '/')

  for (const st of PASS1_STATIONS) {
    const { symbol } = stationAgg[st.key]
    const note = (notes[st.key] || '').replace(/\|/g, '\\|')
    // Matchar: | 1 | Konto & inloggning | <valfri status> | <valfri anteckning> |
    const rowRegex = new RegExp(
      `(\\|\\s*${st.key}\\s*\\|\\s*${st.kort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|)\\s*[^|]*\\|[^|]*\\|`,
    )
    if (!rowRegex.test(content)) {
      console.warn(`Kunde inte hitta rad för station ${st.key} ("${st.kort}") i REALITY-WEEK.md — hoppar.`)
      continue
    }
    const noteWithLink = note ? `${note} (se ${relPassPath})` : `se ${relPassPath}`
    content = content.replace(rowRegex, `$1 ${symbol} | ${noteWithLink} |`)
  }

  const a9RowRegex = new RegExp(
    `(\\|\\s*A9\\s*\\|\\s*${A9_ROW.kort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|)\\s*[^|]*\\|[^|]*\\|`,
  )
  if (a9RowRegex.test(content)) {
    const note = (a9Note || '').replace(/\|/g, '\\|')
    const noteWithLink = note ? `${note} (se ${relPassPath})` : `se ${relPassPath}`
    content = content.replace(a9RowRegex, `$1 ${a9Agg.symbol} | ${noteWithLink} |`)
  } else {
    console.warn('Kunde inte hitta A9-raden i REALITY-WEEK.md Pass 2-tabellen — hoppar.')
  }

  fs.writeFileSync(REALITY_WEEK_MD, content)
  return true
}

function main() {
  const allRows = readReport()
  const dateStr = new Date().toISOString().slice(0, 10)

  const stationAgg = {}
  const notes = {}
  for (const st of PASS1_STATIONS) {
    const rows = allRows.filter((r) => r.station === st.key)
    stationAgg[st.key] = aggregateVerdict(rows)
    notes[st.key] = summarizeNote(rows)
  }
  const a9Rows = allRows.filter((r) => r.station === 'A9')
  const a9Agg = aggregateVerdict(a9Rows)
  const a9Note = summarizeNote(a9Rows)

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const pass1FilePath = path.join(OUT_DIR, `pass1-${dateStr}.md`)
  fs.writeFileSync(pass1FilePath, buildPassMarkdown(dateStr, allRows, stationAgg))
  console.log(`Skrev ${path.relative(ROOT, pass1FilePath)}`)

  const updated = updateRealityWeekMd(stationAgg, a9Agg, notes, a9Note, pass1FilePath)
  if (updated) console.log('Uppdaterade docs/REALITY-WEEK.md (Pass 1-tabellen + A9-raden).')

  const cleanupRows = allRows.filter((r) => r.station === 'Städning')
  const cleanupFailures = cleanupRows.filter((r) => r.verdict === 'FAIL')
  if (cleanupFailures.length > 0) {
    console.error('\n⚠️  STÄDNING MISSLYCKADES DELVIS — kvarlämnade rader:')
    for (const r of cleanupFailures) console.error(`  - ${r.steg}: ${r.detalj}`)
    process.exitCode = 1
  }
}

main()
