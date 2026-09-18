/**
 * Eventkontraktet är kod — facit (Spår 4, 2026-09-18).
 *
 * ═══ VILKET VERKLIGT FEL DETTA STÄNGER ═══
 *
 * `fireEvent(supabase, eventName: string, ...)` tog en fri sträng. Ett namn
 * som inte matchade någon regels `trigger_config.event_name` dog TYST — ingen
 * regel kördes, inget fel loggades. Samtidigt drev ARCHITECTURE.md §4 ifrån
 * koden åt båda håll: fem dokumenterade event avfyrades aldrig (varav
 * `invoice_sent` stod som ✅) och tio faktiskt avfyrade event saknades i
 * dokumentet. Dokumentets egen KRITISKA REGEL ("nya event läggs till i listan
 * FÖRST") hade ingen grind.
 *
 * Grinden är det här testet. Det håller TRE saker sanna samtidigt:
 *   1. varje `fireEvent(...)` i app/ och lib/ skickar ett namn som står i
 *      `EVENT_NAMES` OCH i ARCHITECTURE.md §4;
 *   2. varje namn i `EVENT_NAMES` avfyras minst en gång i koden och står i §4
 *      (och §4 innehåller inget extra namn) — ett dött namn i kontraktet är
 *      ett löfte som inte hålls;
 *   3. loopspärren `sms_sent` + `send_sms` finns kvar och används i motorn.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/event-kontrakt.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { EVENT_NAMES, isEventName, skaparEventLoop, type EventName } from '@/lib/events/names'

const ROOT = path.resolve(__dirname, '..')
const ARCHITECTURE = path.join(ROOT, 'ARCHITECTURE.md')
const ENGINE = path.join(ROOT, 'lib', 'automation-engine.ts')
const SCAN_DIRS = ['app', 'lib']

/** Filer som INTE är avfyrningsställen: kontraktsfilen och motorn själv. */
const UNDANTAG = new Set([
  path.join('lib', 'events', 'names.ts'),
  path.join('lib', 'automation-engine.ts'),
])

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/**
 * Tar bort kommentarer så att en förklarande rad ("...fireEvent('lead_created')
 * nedan behålls") inte räknas som ett avfyrningsställe. Konservativt: rader som
 * BÖRJAR med // eller *, samt blockkommentarer.
 */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

/**
 * Alla `fireEvent(<klient>, '<namn>'` i app/ och lib/. Fungerar oavsett om
 * fireEvent importerats statiskt eller via `await import(...)` — vi skannar
 * anropet, inte importen.
 */
function avfyrningsstallen(): { fil: string; namn: string }[] {
  const funna: { fil: string; namn: string }[] = []
  for (const dir of SCAN_DIRS) {
    for (const fil of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, fil)
      if (UNDANTAG.has(rel)) continue
      const src = utanKommentarer(fs.readFileSync(fil, 'utf8'))
      for (const m of Array.from(src.matchAll(/\bfireEvent\s*\(\s*[^,]+,\s*'([^']+)'/g))) {
        funna.push({ fil: rel, namn: m[1] })
      }
    }
  }
  return funna
}

/** Icke-literala eventnamn — en variabel går inte att granska mot dokumentet. */
function ickeLiteralaAnrop(): string[] {
  const offenders: string[] = []
  for (const dir of SCAN_DIRS) {
    for (const fil of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, fil)
      if (UNDANTAG.has(rel)) continue
      const src = utanKommentarer(fs.readFileSync(fil, 'utf8'))
      for (const m of Array.from(src.matchAll(/\bfireEvent\s*\(\s*[^,]+,\s*([^'\s)][^,]*),/g))) {
        offenders.push(`${rel}: fireEvent med icke-literalt eventnamn (${m[1].trim()})`)
      }
    }
  }
  return offenders
}

/** Eventnamnen ur §4-tabellen: första kolumnen, `backticks`. */
function eventUrDokumentet(): string[] {
  const doc = fs.readFileSync(ARCHITECTURE, 'utf8')
  const start = doc.indexOf('## 4. Eventkontrakt')
  const end = doc.indexOf('## 5. Pipeline')
  expect(start, 'ARCHITECTURE.md saknar §4').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const out: string[] = []
  for (const line of doc.slice(start, end).split('\n')) {
    const m = /^\|\s*`([a-z_]+)`\s*\|/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

test('EVENT_NAMES är sorterad och utan dubbletter', () => {
  const lista = [...EVENT_NAMES]
  expect(new Set(lista).size, 'dubblett i EVENT_NAMES').toBe(lista.length)
  expect(lista).toEqual([...lista].sort())
})

test('varje fireEvent() i app/ och lib/ skickar ett namn ur EVENT_NAMES', () => {
  const stallen = avfyrningsstallen()
  expect(stallen.length, 'inga fireEvent-anrop hittades — skanningen är trasig').toBeGreaterThan(20)

  const okanda = stallen
    .filter(s => !isEventName(s.namn))
    .map(s => `${s.fil}: '${s.namn}'`)
  expect(okanda, 'eventnamn i kod som saknas i lib/events/names.ts').toEqual([])
})

test('ett eventnamn i kod går aldrig att smyga in som variabel', () => {
  expect(ickeLiteralaAnrop()).toEqual([])
})

test('ARCHITECTURE.md §4 speglar EVENT_NAMES exakt', () => {
  const doc = [...eventUrDokumentet()].sort()
  const kod = [...EVENT_NAMES].sort()
  expect(doc, '§4-tabellen och EVENT_NAMES har glidit isär').toEqual(kod)
})

test('varje namn i EVENT_NAMES avfyras minst en gång i koden', () => {
  const avfyrade = new Set(avfyrningsstallen().map(s => s.namn))
  const doda = EVENT_NAMES.filter(n => !avfyrade.has(n))
  expect(doda, 'namn i kontraktet som ingen kod avfyrar').toEqual([])
})

test('§4 pekar ut en fil som faktiskt avfyrar eventet', () => {
  const doc = fs.readFileSync(ARCHITECTURE, 'utf8')
  const sektion = doc.slice(doc.indexOf('## 4. Eventkontrakt'), doc.indexOf('## 5. Pipeline'))
  const stallen = avfyrningsstallen()

  const fel: string[] = []
  for (const line of sektion.split('\n')) {
    const m = /^\|\s*`([a-z_]+)`\s*\|(.*)$/.exec(line)
    if (!m) continue
    const namn = m[1]
    const sistaKolumnen = m[2].split('|').filter(Boolean).pop() || ''
    const filerIDok = Array.from(sistaKolumnen.matchAll(/`([^`]+)`/g)).map(x => x[1].replace(/\\/g, ''))
    if (filerIDok.length === 0) { fel.push(`${namn}: §4 saknar fil`); continue }
    const verkliga = new Set(stallen.filter(s => s.namn === namn).map(s => s.fil.replace(/\\/g, '/')))
    for (const f of filerIDok) {
      if (!verkliga.has(f)) fel.push(`${namn}: §4 pekar på ${f}, men där avfyras eventet inte`)
    }
    for (const f of Array.from(verkliga)) {
      if (!filerIDok.includes(f)) fel.push(`${namn}: avfyras i ${f} som inte står i §4`)
    }
  }
  expect(fel, '§4:s kolumn "Avfyras i" stämmer inte med koden').toEqual([])
})

test('loopspärren: sms_sent får aldrig utlösa send_sms', () => {
  // Beteendet, inte texten: en regel som svarar på sitt eget SMS-event med
  // ett nytt SMS skulle skicka SMS till kunden tills kvoten tar slut.
  expect(skaparEventLoop('sms_sent', 'send_sms')).toBe(true)
  // Allt annat passerar — spärren får inte vara en generell strypning.
  expect(skaparEventLoop('sms_sent', 'create_approval')).toBe(false)
  expect(skaparEventLoop('sms_sent', 'notify_owner')).toBe(false)
  expect(skaparEventLoop('sms_received', 'send_sms')).toBe(false)
  expect(skaparEventLoop('lead_received', 'send_sms')).toBe(false)
})

test('motorn använder loopspärren — den ligger inte oanvänd i en fil', () => {
  const src = utanKommentarer(fs.readFileSync(ENGINE, 'utf8'))
  expect(src, 'fireEvent filtrerar inte längre bort looppande regler').toMatch(
    /skaparEventLoop\s*\(\s*eventName\s*,\s*r\.action_type\s*\)/
  )
})

test('ingen seedad regel kombinerar sms_sent med send_sms', () => {
  // Spärren i motorn är räddningsnätet; seeden ska inte behöva det.
  const seed = fs.readFileSync(path.join(ROOT, 'lib', 'seed-defaults.ts'), 'utf8')
  const block = utanKommentarer(seed)
  const regler = Array.from(block.matchAll(/event_name:\s*'([a-z_]+)'[\s\S]{0,400}?action_type:\s*'([a-z_]+)'/g))
  const trasiga = regler
    .filter(m => isEventName(m[1]) && skaparEventLoop(m[1] as EventName, m[2]))
    .map(m => `${m[1]} → ${m[2]}`)
  expect(trasiga, 'seedad regel skulle mata sig själv').toEqual([])
})
