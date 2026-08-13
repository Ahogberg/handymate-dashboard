/**
 * In-memory-samlare... nej — JSON-LINES-fil på disk. Playwright ger varje
 * testfil (och i värsta fall varje worker) ett FRISKT modul-state, så ett
 * enkelt exporterat array-objekt hade bara samlat resultat inom en enskild
 * process/fil, inte över hela körningen (playwright.config.ts har
 * `workers: process.env.CI ? 1 : undefined` — dvs flera parallella workers
 * lokalt om Playwright väljer att sprida testfiler). Den enda mekanism som
 * garanterat överlever processgränser är disk: varje test skriver sin egen
 * rad via `fs.appendFileSync`, som är atomärt för såpass korta rader.
 *
 * golden-path.spec.ts (EN fil, test.describe.serial, alla stationer i SAMMA
 * fil/worker) och permission-check.spec.ts (separat fil/körning, EFTER
 * golden-path) skriver båda till samma jsonl-fil. scripts/build-golden-path-
 * report.mjs läser hela filen i efterhand och bygger markdown-rapporten.
 */

import * as fs from 'fs'
import * as path from 'path'

export type Verdict = 'PASS' | 'FAIL' | 'SKIP'

export interface ReportRow {
  station: string
  steg: string
  ui_bevis: string
  db_bevis: string
  verdict: Verdict
  detalj?: string
  timestamp: string
}

const REPORT_DIR = path.join(process.cwd(), 'test-results', 'golden-path')
const REPORT_FILE = path.join(REPORT_DIR, 'report.jsonl')

function ensureDir() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true })
}

/**
 * Nollställer rapportfilen. Anropas EN gång, i golden-path.spec.ts's
 * test.beforeAll (den sanna startpunkten för en körning) — INTE i
 * permission-check.spec.ts, som ska APPENDA till samma körnings rapport.
 */
export function resetReportFile(): void {
  ensureDir()
  fs.writeFileSync(REPORT_FILE, '')
}

export function pushResult(row: Omit<ReportRow, 'timestamp'>): void {
  ensureDir()
  const full: ReportRow = { ...row, timestamp: new Date().toISOString() }
  fs.appendFileSync(REPORT_FILE, JSON.stringify(full) + '\n')
  // eslint-disable-next-line no-console
  console.log(
    `[golden-path] ${full.verdict === 'PASS' ? '✅' : full.verdict === 'SKIP' ? '⏭' : '🔴'} ` +
      `${full.station} — ${full.steg}${full.detalj ? ' — ' + full.detalj : ''}`,
  )
}

export function reportFilePath(): string {
  return REPORT_FILE
}

export function readAllResults(): ReportRow[] {
  if (!fs.existsSync(REPORT_FILE)) return []
  return fs
    .readFileSync(REPORT_FILE, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReportRow)
}
