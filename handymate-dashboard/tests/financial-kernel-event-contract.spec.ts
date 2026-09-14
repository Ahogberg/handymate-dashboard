/**
 * Financial Kernel — eventkontraktstest (Paket C0, 2026-09-13).
 *
 * ARCHITECTURE.md kräver att ett eventnamn står i dokumentet FÖRST och
 * kodas sedan. För automationsmotorns event har den regeln aldrig haft en
 * grind; granskningen av Financial Kernel (F14) konstaterade att en regel
 * som tre parallella agenter ska komma ihåg är den regel som eroderar först.
 * Detta test är grinden, i samma anda som schema-contract.spec.ts.
 *
 * Facit = tabellerna under "Financial Kernel — kontrakt" §FK.1 i
 * ARCHITECTURE.md. Testet failar när:
 *   1. katalogen i dokumentet bryter namnkonventionen, har dubbletter eller
 *      krockar med automationsmotorns namn i §4;
 *   2. lib/financial-kernel/events/catalog.ts inte speglar dokumentet exakt;
 *   3. kernel-ägd kod (FK.5) eller en migration som rör financial_events
 *      innehåller ett eventliknande strängliteral som inte står i katalogen;
 *   4. kernel-ägd kod anropar fireEvent() någon annanstans än i bryggan,
 *      eller bryggan skickar ett namn som inte är ett legacy-event i §4;
 *   5. blueprintens §7 (docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md)
 *      nämner ett namn som saknas i ARCHITECTURE.md — blueprinten föreslår,
 *      ARCHITECTURE.md bestämmer, och de får inte glida isär.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/financial-kernel-event-contract.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const ARCHITECTURE = path.join(ROOT, 'ARCHITECTURE.md')
const BLUEPRINT = path.join(ROOT, '..', 'docs', 'strategy', 'FINANCIAL_KERNEL_ARCHITECTURE.md')
const CATALOG_TS = path.join(ROOT, 'lib', 'financial-kernel', 'events', 'catalog.ts')
const BRIDGE_TS = path.join(ROOT, 'lib', 'financial-kernel', 'events', 'bridge-automation.ts')

/** Mappar som ARCHITECTURE.md §FK.5 ger kerneln. Allt här skannas. */
const KERNEL_DIRS = [
  'lib/financial-kernel',
  'lib/payments',
  'lib/ledger',
  'lib/reconciliation',
  'app/api/payments',
  'app/api/accounting',
  'app/api/reconciliation',
  'app/api/webhooks/payments',
]

/**
 * Ett strängliteral som ser ut som ett ekonomiskt event: minst ett
 * snake_case-prefix följt av ett particip ur listan. Listan är medvetet
 * bred — ett falskt positivt kostar en rad i NOT_EVENTS, ett falskt
 * negativt kostar ett odokumenterat event i produktion.
 */
const EVENT_LIKE = /'((?:[a-z]+_)+(?:created|issued|credited|adjusted|settled|initiated|authorized|started|failed|cancelled|refunded|disputed|allocated|reversed|imported|matched|unmatched|posted|locked|unlocked|detected|approved|transferred|written_off|charged|prepared|recorded|flipped|opened|closed|resolved|rejected|captured|expired|voided|received|paid|sent|completed))'/g

/**
 * Strängar som matchar mönstret men bevisligen inte är event. Varje rad
 * ska ha en motivering; en rad utan motivering är en genväg.
 */
const NOT_EVENTS = new Set<string>([
  'customer_settled', // V2 observation JSON boolean; not a published financial event
  'already_paid', // C5 command state, not a published event
  'to_paid', // legacy PaymentTransition returned by the C5 facade
  'to_customer_paid', // legacy PaymentTransition returned by the C5 facade
  'already_settled', // fält i PaymentDecision (lib/invoices/payment-decision.ts), legacy-projektion
  'customer_paid', // legacy fakturastatus, projektion — inte ett event
])

/**
 * Tar bort kommentarer så att en förklarande rad ("...går aldrig genom
 * fireEvent()") inte räknas som kod. Konservativt: blockkommentarer och
 * rader som BÖRJAR med // eller * — aldrig // mitt i en rad, för då skulle
 * en URL kunna gömma ett literal efter sig.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|sql)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Eventnamn ur en markdown-tabell: första kolumnen, `backticks`. */
function eventsFromTables(markdown: string): string[] {
  const out: string[] = []
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*`([a-z_]+)`\s*\|/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

function kernelSection(): string {
  const doc = fs.readFileSync(ARCHITECTURE, 'utf8')
  const start = doc.indexOf('## Financial Kernel — kontrakt')
  expect(start, 'ARCHITECTURE.md saknar avsnittet "Financial Kernel — kontrakt"').toBeGreaterThan(-1)
  return doc.slice(start)
}

function kernelCatalogFromDoc(): string[] {
  const section = kernelSection()
  const fk1 = section.slice(section.indexOf('### FK.1'), section.indexOf('### FK.2'))
  return eventsFromTables(fk1)
}

function reservedNamesFromDoc(): string[] {
  const section = kernelSection()
  const fk1 = section.slice(section.indexOf('### FK.1'), section.indexOf('### FK.2'))
  const para = fk1.slice(fk1.indexOf('**Reserverade namn'))
  return Array.from(para.matchAll(/`([a-z_]+)`/g)).map(m => m[1])
}

function legacyAutomationEvents(): string[] {
  const doc = fs.readFileSync(ARCHITECTURE, 'utf8')
  const start = doc.indexOf('## 4. Eventkontrakt')
  const end = doc.indexOf('## 5. Pipeline')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return eventsFromTables(doc.slice(start, end))
}

function catalogFromTs(): string[] {
  const src = fs.readFileSync(CATALOG_TS, 'utf8')
  const block = src.slice(src.indexOf('FINANCIAL_EVENT_TYPES = ['), src.indexOf('] as const'))
  // En post per rad: `'namn',`. Kommentarrader hoppas över.
  return block
    .split('\n')
    .map(line => /^\s*'([a-z_]+)',?\s*$/.exec(line)?.[1])
    .filter((n): n is string => !!n)
}

test('katalogen i ARCHITECTURE.md är välformad och krockar inte med automationsmotorns event', () => {
  const kernel = kernelCatalogFromDoc()
  expect(kernel.length, 'FK.1 ska innehålla eventtabeller').toBeGreaterThan(0)

  // substantiv_particip: minst två snake_case-led, bara gemener.
  for (const name of kernel) {
    expect(name, `"${name}" följer inte snake_case substantiv_particip`).toMatch(/^[a-z]+(_[a-z]+)+$/)
  }

  const dupes = kernel.filter((n, i) => kernel.indexOf(n) !== i)
  expect(dupes, 'dubbletter i FK.1').toEqual([])

  const legacy = new Set(legacyAutomationEvents())
  const collisions = kernel.filter(n => legacy.has(n))
  expect(collisions, 'kernel-event får inte dela namn med §4 (fireEvent-event)').toEqual([])

  const reserved = reservedNamesFromDoc()
  const promotedButStillReserved = reserved.filter(n => kernel.includes(n))
  expect(promotedButStillReserved, 'ett namn är antingen kanoniskt eller reserverat, inte båda').toEqual([])
})

test('lib/financial-kernel/events/catalog.ts speglar ARCHITECTURE.md exakt', () => {
  expect(fs.existsSync(CATALOG_TS), 'catalog.ts saknas').toBe(true)
  const fromDoc = [...kernelCatalogFromDoc()].sort()
  const fromTs = [...catalogFromTs()].sort()
  expect(fromTs).toEqual(fromDoc)
})

test('kernel-kod och financial_events-migrationer använder bara katalogens namn', () => {
  const catalog = new Set(kernelCatalogFromDoc())
  const legacy = new Set(legacyAutomationEvents())
  const reserved = new Set(reservedNamesFromDoc())

  const files: string[] = []
  for (const dir of KERNEL_DIRS) walk(path.join(ROOT, dir), files)
  const sqlDir = path.join(ROOT, 'sql')
  for (const file of fs.readdirSync(sqlDir)) {
    if (!file.endsWith('.sql')) continue
    const full = path.join(sqlDir, file)
    if (fs.readFileSync(full, 'utf8').includes('financial_events')) files.push(full)
  }

  const offenders: string[] = []
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'))
    const rel = path.relative(ROOT, file)
    const isBridge = path.resolve(file) === path.resolve(BRIDGE_TS)
    for (const m of Array.from(src.matchAll(EVENT_LIKE))) {
      const name = m[1]
      if (catalog.has(name) || NOT_EVENTS.has(name)) continue
      // V2 writes the separately documented value_events namespace, never financial_events or fireEvent.
      if (rel === 'sql/v243_value_money_events.sql' && name === 'payment_received') {
        expect(src).not.toMatch(/INSERT\s+INTO\s+(?:public\.)?financial_events|append_financial_event\s*\(|fireEvent\s*\(/i)
        expect(src).toContain('INSERT INTO public.value_events')
        continue
      }
      // Bryggan får — och bara den — nämna legacy-namn, för det är dess jobb.
      if (isBridge && legacy.has(name)) continue
      const why = reserved.has(name)
        ? 'reserverat namn — flytta upp det i FK.1-tabellen först'
        : legacy.has(name)
          ? 'legacy fireEvent-namn utanför bryggan'
          : 'saknas i ARCHITECTURE.md §FK.1'
      offenders.push(`${rel}: '${name}' (${why})`)
    }
  }
  expect(offenders, 'Eventnamn i kernel-kod som inte står i ARCHITECTURE.md §FK.1').toEqual([])
})

test('fireEvent() anropas i kernel-kod bara från bryggan, och bryggan skickar bara §4-namn', () => {
  const legacy = new Set(legacyAutomationEvents())
  const files: string[] = []
  for (const dir of KERNEL_DIRS) walk(path.join(ROOT, dir), files)

  const offenders: string[] = []
  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
    const src = stripComments(fs.readFileSync(file, 'utf8'))
    const rel = path.relative(ROOT, file)
    const isBridge = path.resolve(file) === path.resolve(BRIDGE_TS)
    const calls = Array.from(src.matchAll(/\bfireEvent\s*\(/g))
    if (calls.length === 0) continue
    if (!isBridge) {
      offenders.push(`${rel}: fireEvent() utanför events/bridge-automation.ts`)
      continue
    }
    for (const m of Array.from(src.matchAll(/\bfireEvent\s*\([^,]+,\s*'([a-z_]+)'/g))) {
      if (!legacy.has(m[1])) offenders.push(`${rel}: bryggan skickar '${m[1]}' som inte är ett §4-event`)
    }
    // Ett dynamiskt namn i bryggan går inte att granska — kräv literaler.
    for (const m of Array.from(src.matchAll(/\bfireEvent\s*\([^,]+,\s*([^'\s][^,]*),/g))) {
      offenders.push(`${rel}: bryggan skickar ett icke-literalt eventnamn (${m[1].trim()})`)
    }
  }
  expect(offenders).toEqual([])
})

test('blueprintens §7 glider inte ifrån ARCHITECTURE.md', () => {
  const blueprint = fs.readFileSync(BLUEPRINT, 'utf8')
  const start = blueprint.indexOf('### Proposed event families')
  const end = blueprint.indexOf('### Legacy event bridge')
  expect(start, 'blueprint §7 saknar "Proposed event families"').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const section = blueprint.slice(start, end)

  const proposed: string[] = []
  for (const block of Array.from(section.matchAll(/```text\n([\s\S]*?)```/g))) {
    for (const line of block[1].split('\n')) {
      const name = line.trim()
      if (/^[a-z]+(_[a-z]+)+$/.test(name)) proposed.push(name)
    }
  }
  expect(proposed.length).toBeGreaterThan(0)

  const canonical = new Set(kernelCatalogFromDoc())
  const drift = proposed.filter(n => !canonical.has(n))
  expect(drift, 'namn i blueprint §7 som saknas i ARCHITECTURE.md §FK.1').toEqual([])
})
