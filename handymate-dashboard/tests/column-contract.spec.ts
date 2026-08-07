/**
 * Kolumnkontraktet — varje `.select()` mot en verifierbar tabell (2026-08-07).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * `app/api/cron/missed-revenue/route.ts` selectade `id` från `project_change`.
 * Tabellens primärnyckel heter `change_id`, och ingen migration lägger till
 * någon `id`. PostgREST svarade 42703, felkontrollen kastade, och catchen
 * hoppade över hela företagets svep — alla tre reglerna.
 *
 * **Intäktssvepet hade alltså aldrig skapat ett enda kort.** Det upptäcktes
 * först när någon läste koden rad för rad, tre veckor efter att det skeppats,
 * och bekräftades mot produktionsschemat.
 *
 * Det är samma felklass som `tests/schema-contract.spec.ts` redan vaktar för
 * TABELLNAMN. Den här filen gör samma sak för KOLUMNNAMN, med samma metod:
 * bygg facit ur `sql/`, läs koden, jämför.
 *
 * ═══ VAD DEN MEDVETET INTE VAKTAR ═══
 *
 * Bara tabeller vars `CREATE TABLE` finns i `sql/`. Flera centrala tabeller
 * (`invoice`, `business_config`, `quotes`, `customer`, `project`) skapades
 * utanför versionshanteringen — för dem finns bara `ALTER TABLE ADD COLUMN`,
 * och en fullständig kolumnlista går inte att härleda. Att vakta dem hade gett
 * falska fel på varje baskolumn.
 *
 * Det är en verklig lucka, inte en förenkling: den dagen basschemat dumpas in
 * i `sql/` växer den här vakten automatiskt till att täcka dem.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/column-contract.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

/** PostgREST-nyckelord och syntax som inte är kolumnnamn. */
const ICKE_KOLUMNER = new Set(['count', 'sum', 'avg', 'min', 'max'])

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
      walk(p, out)
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Kolumner per tabell, men BARA för tabeller vars CREATE TABLE finns här.
 * En tabell utan CREATE TABLE går inte att uttala sig om.
 */
function buildColumnFacit(): Map<string, Set<string>> {
  const facit = new Map<string, Set<string>>()
  const sqlDir = path.join(ROOT, 'sql')
  if (!fs.existsSync(sqlDir)) return facit

  const filer = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort()

  for (const f of filer) {
    const sql = fs.readFileSync(path.join(sqlDir, f), 'utf8')

    // CREATE TABLE t ( ... ) — kroppen parsas rad för rad.
    const skapa = /CREATE TABLE (?:IF NOT EXISTS )?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\s*\);/gi
    for (const m of Array.from(sql.matchAll(skapa))) {
      const tabell = m[1].toLowerCase()
      const kolumner = facit.get(tabell) || new Set<string>()
      for (const rad of m[2].split('\n')) {
        const t = rad.trim()
        // Hoppa över constraints, index och kommentarer.
        if (!t || t.startsWith('--') || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(t)) continue
        const kol = t.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)
        if (kol) kolumner.add(kol[1].toLowerCase())
      }
      facit.set(tabell, kolumner)
    }
  }

  // ALTER TABLE t ADD COLUMN a, ADD COLUMN b, ... — körs efter så tillägg
  // fångas oavsett filordning.
  //
  // HELA satsen fram till `;` läses, inte bara första kolumnen. Ett tidigare
  // utkast matchade `ALTER TABLE t ADD COLUMN` som ett stycke och tappade
  // därför varje kolumn utom den första i en kommaseparerad sats — t.ex. alla
  // fyra efter `partner_id` i sql/v9_partners.sql:35. Det gav falska fel på
  // kolumner som finns, vilket är precis det som gör en vakt värdelös.
  for (const f of filer) {
    const sql = fs.readFileSync(path.join(sqlDir, f), 'utf8')
    const satser = /ALTER TABLE\s+(?:IF EXISTS\s+)?"?([a-z0-9_]+)"?\b([\s\S]*?);/gi
    for (const s of Array.from(sql.matchAll(satser))) {
      const tabell = s[1].toLowerCase()
      if (!facit.has(tabell)) continue // ingen CREATE TABLE → inte verifierbar
      const kolumner = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
      for (const k of Array.from(s[2].matchAll(kolumner))) {
        facit.get(tabell)!.add(k[1].toLowerCase())
      }
    }
  }

  return facit
}

/** Plockar ut kolumnnamnen ur en select-sträng, med alias och embeds bortsorterade. */
export function parseSelect(select: string): string[] {
  if (select.includes('*')) return []

  const ut: string[] = []
  let djup = 0
  let aktuell = ''

  // Splitta på toppnivå-komma; embeds som `customer(name, phone)` hoppas över
  // eftersom deras kolumner tillhör en ANNAN tabell.
  for (const tecken of select) {
    if (tecken === '(') djup++
    else if (tecken === ')') djup--
    if (tecken === ',' && djup === 0) { ut.push(aktuell); aktuell = ''; continue }
    aktuell += tecken
  }
  ut.push(aktuell)

  return ut
    .map(d => d.trim())
    .filter(d => d && !d.includes('(')) // embeds bort
    .map(d => {
      // `alias:riktig_kolumn` → det är den riktiga som måste finnas.
      const kolon = d.indexOf(':')
      return (kolon >= 0 ? d.slice(kolon + 1) : d).trim()
    })
    .map(d => d.split('.')[0].split('->')[0].trim().toLowerCase())
    .filter(d => /^[a-z_][a-z0-9_]*$/.test(d) && !ICKE_KOLUMNER.has(d))
}

/**
 * Kända luckor — kolumner koden ber om som INTE finns, och som inte är
 * stavfel utan en funktion som aldrig byggdes färdigt.
 *
 * `review_request` har bara `review_received` (sql/moat_features.sql). Något
 * betyg eller någon fritext lagras ingenstans, och **ingen kod i repot skriver
 * dem** — skyltfönstrets omdömesavsnitt är byggt mot ett schema som aldrig
 * existerat. `app/site/[slug]/page.tsx:297` erkänner det redan i en kommentar.
 *
 * Att alias:a bort felet vore att låtsas att luckan är lagad. Att lägga till
 * kolumnerna vore att bygga insamlingsflödet, vilket är ett eget arbete. Den
 * står därför här: synlig, räknad, och den enda som får stå här.
 *
 * **Listan får bara krympa.** Testet nedan låser antalet, så en ny död kolumn
 * kan inte smygas in genom att skrivas upp här.
 */
const KANDA_LUCKOR = new Set([
  'review_request.review_rating',
  'review_request.review_text',
])

interface Ref { tabell: string; kolumn: string; fil: string }

function collectSelectRefs(): Ref[] {
  const ut: Ref[] = []
  const filer = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]

  for (const fil of filer) {
    const innehall = fs.readFileSync(fil, 'utf8')
    // `.from('t')` följt av `.select('...')` — mellanliggande blanksteg,
    // radbrytningar och kommentarer tillåts.
    const m = /\.from\(\s*'([a-z0-9_]+)'\s*\)([\s\S]{0,600}?)\.select\(\s*[`'"]([^`'"]*)[`'"]/g
    for (const tr of Array.from(innehall.matchAll(m))) {
      // Korsar mellanrummet ett ANNAT `.from(` hör selecten till den frågan.
      // Utan den här kontrollen paras `.from('project_change').update(...)`
      // ihop med nästa frågas select, och vakten rapporterar kolumner på fel
      // tabell. Ett svep gav 81 fel varav merparten var just den hopparningen.
      if (tr[2].includes('.from(')) continue
      const tabell = tr[1].toLowerCase()
      for (const kol of parseSelect(tr[3])) {
        ut.push({ tabell, kolumn: kol, fil: path.relative(ROOT, fil).replace(/\\/g, '/') })
      }
    }
  }
  return ut
}

test.describe('kolumnkontraktet', () => {
  test('SANITY — facit läser faktiskt sql/', () => {
    // Utan detta kan parsern gå sönder och hela sviten bli grön av fel skäl.
    const facit = buildColumnFacit()
    expect(facit.size, 'inga tabeller lästes ur sql/').toBeGreaterThan(30)
    expect(facit.get('project_change')?.has('change_id'), 'project_change.change_id saknas i facit').toBe(true)
    expect(facit.get('project_change')?.has('invoiced_at'), 'ALTER-tillägg fångas inte').toBe(true)
  })

  test('SANITY — project_change har INGEN id-kolumn', () => {
    // Verifierat mot produktionsschemat 2026-08-07. Det var precis den här
    // frånvaron som gjorde intäktssvepet till en no-op.
    expect(buildColumnFacit().get('project_change')?.has('id')).toBe(false)
  })

  test('varje selectad kolumn finns i tabellen', () => {
    const facit = buildColumnFacit()
    const refs = collectSelectRefs()
    expect(refs.length, 'inga select-anrop hittades — parsern är trasig').toBeGreaterThan(50)

    const fel: string[] = []
    for (const r of refs) {
      const kolumner = facit.get(r.tabell)
      if (!kolumner) continue // tabellen saknar CREATE TABLE — inte verifierbar
      if (KANDA_LUCKOR.has(`${r.tabell}.${r.kolumn}`)) continue
      if (!kolumner.has(r.kolumn)) fel.push(`${r.fil}: ${r.tabell}.${r.kolumn}`)
    }

    expect(fel, 'Kolumner som inte finns — PostgREST 400:ar HELA frågan').toEqual([])
  })

  test('de kända luckorna blir inte fler', () => {
    // Undantagslistan är en skuld, inte en ventil. Växer den har någon skrivit
    // upp en ny död kolumn i stället för att laga den.
    expect(KANDA_LUCKOR.size, 'Ny post i KANDA_LUCKOR — laga kolumnen i stället').toBeLessThanOrEqual(2)
  })
})

test.describe('parsern', () => {
  test('alias pekar ut den riktiga kolumnen', () => {
    // `id:change_id` betyder "hämta change_id, kalla den id". Det är
    // change_id som måste finnas.
    expect(parseSelect('id:change_id, project_id')).toEqual(['change_id', 'project_id'])
  })

  test('embeds tillhör en annan tabell och hoppas över', () => {
    expect(parseSelect('booking_id, customer (name, phone_number)')).toEqual(['booking_id'])
  })

  test('stjärna ger inga krav', () => {
    expect(parseSelect('*')).toEqual([])
    expect(parseSelect('*, customer(name)')).toEqual([])
  })

  test('count och aggregat är inte kolumner', () => {
    expect(parseSelect('count')).toEqual([])
  })

  test('blanksteg och radbrytningar tolereras', () => {
    expect(parseSelect('\n  a,\n  b\n')).toEqual(['a', 'b'])
  })
})
