/**
 * Kolumnkontraktet — varje select/filter/order mot en verifierbar tabell (2026-08-07).
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

  // Testbäddar är avsiktliga MINIATYRER för disponibla miljöer — deras
  // CREATE TABLE beskriver inte prod-schemat och får inte krympa facit.
  // (testbed_tenant_isolation.sql har t.ex. en femkolumnig business_config.)
  const filer = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql') && !f.startsWith('testbed'))
    .sort()

  for (const f of filer) {
    const sql = fs.readFileSync(path.join(sqlDir, f), 'utf8')

    // CREATE TABLE t ( ... ) — kroppen parsas rad för rad.
    const skapa = /CREATE TABLE (?:IF NOT EXISTS )?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\s*\);/gi
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
    const satser = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?\b([\s\S]*?);/gi
    for (const s of Array.from(sql.matchAll(satser))) {
      const tabell = s[1].toLowerCase()
      if (!facit.has(tabell)) continue // ingen CREATE TABLE → inte verifierbar
      const kolumner = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
      for (const k of Array.from(s[2].matchAll(kolumner))) {
        facit.get(tabell)!.add(k[1].toLowerCase())
      }
    }
  }

  // Centrala legacy-tabeller vars CREATE TABLE aldrig checkades in får ett
  // versionshanterat facit från PostgREST:s skarpa OpenAPI-schema. Snapshoten
  // hämtas read-only och uppdateras avsiktligt när en migration ändrar tabellen.
  // Detta gör att serverkodens explicita select-listor kan valideras även när
  // tabellens historiska bas-DDL saknas ur sql/.
  const snapshotPath = path.join(ROOT, 'tests', 'fixtures', 'production-schema-columns.json')
  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as {
      tables?: Record<string, string[]>
    }
    for (const [table, columns] of Object.entries(snapshot.tables || {})) {
      facit.set(table.toLowerCase(), new Set(columns.map(column => column.toLowerCase())))
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

/**
 * Kolumner som verifierats mot den levande produktionstabellen, men där repots
 * historiska CREATE TABLE-filer beskriver en äldre tabellform. Grundlistan
 * verifierades read-only 2026-08-07; project_log.work_performed verifierades i
 * portal-/writer-kryssprovet 2026-08-31. Migrationerna har körts manuellt, så
 * sql/ är inte bevis för att de här kolumnerna saknas.
 *
 * Listan är avsiktligt explicit och storlekslåst nedan. Den ska ersättas av ett
 * versionshanterat basschema, inte bli en allmän undantagsventil.
 */
const PRODUKTIONSVERIFIERADE_KOLUMNER = new Set([
  'project_checklist.order_id',
  'project_log.date',
  'project_log.order_id',
  'project_log.work_performed',
])

/**
 * Serverreferenser som live-snapshoten bevisar är fel men som tillhör andra
 * sammanhängande produktlaner. Nyckeln innehåller FILEN så en gammal skuld
 * aldrig får kopieras till ännu en anropare. Listan ska bara krympa.
 *
 * De känsliga Google-/Fortnoxfälten får inte mekaniskt döpas om: deras rätta
 * källa är integrationslagret, inte business_config. Övriga ersätts med det
 * kanoniska fältet (bankgiro, phone_number, website_url) i respektive lane.
 */
const LIVE_SCHEMA_GAPS = new Set([
  'app/api/automations/test/route.ts:business_config.google_calendar_token',
  'app/api/debug/mail/route.ts:business_config.gmail_send_enabled',
  'app/api/debug/mail/route.ts:business_config.gmail_email',
  'app/api/debug/mail/route.ts:business_config.google_access_token',
  'app/api/debug/mail/route.ts:business_config.google_refresh_token',
  'app/api/gdpr/delete/route.ts:business_config.deletion_requested_at',
  'app/api/integrations/fortnox/status/route.ts:business_config.fortnox_token_expires_at',
  'app/api/invoices/from-project/route.ts:business_config.bankgiro_number',
  'app/api/invoices/[id]/reminder-pdf/route.ts:business_config.contact_phone',
  'app/api/invoices/[id]/reminder-pdf/route.ts:business_config.tagline',
  'app/api/portal/route.ts:business_config.contact_phone',
  'app/api/portal/[token]/invoices/[id]/route.ts:business_config.contact_phone',
  'app/api/portal/[token]/invoices/[id]/route.ts:business_config.website',
  'app/api/portal/[token]/invoices/[id]/route.ts:business_config.tagline',
  'app/api/projects/[id]/logs/pdf/route.ts:business_config.contact_phone',
  'app/api/quotes/pdf/route.ts:business_config.website',
  'app/api/quotes/preview-html/route.ts:business_config.website',
  'app/api/time-entry/report/route.ts:business_config.website',
  'app/api/voice/execute/route.ts:business_config.google_access_token',
  'lib/e2e-deal-flow.ts:business_config.bankgiro_number',
  'lib/gmail-send.ts:business_config.google_access_token',
  'lib/gmail-send.ts:business_config.google_refresh_token',
  'lib/gmail-send.ts:business_config.gmail_send_enabled',
  'lib/gmail-send.ts:business_config.gmail_email',
])

const FILTER_METHODS = ['eq', 'neq', 'gt', 'lt', 'in', 'is', 'contains', 'order'] as const
type FilterMethod = typeof FILTER_METHODS[number]

interface Ref {
  tabell: string
  kolumn: string
  fil: string
  metod: 'select' | FilterMethod
}

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
        ut.push({
          tabell,
          kolumn: kol,
          fil: path.relative(ROOT, fil).replace(/\\/g, '/'),
          metod: 'select',
        })
      }
    }
  }
  return ut
}

interface Binding { variabel: string; tabell: string; index: number }

function skipTrivia(source: string, start: number): number {
  let index = start
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index++
      continue
    }
    if (source.startsWith('//', index)) {
      index = source.indexOf('\n', index + 2)
      if (index === -1) return source.length
      continue
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2)
      return end === -1 ? source.length : skipTrivia(source, end + 2)
    }
    break
  }
  return index
}

function readCall(source: string, openParen: number): { args: string; end: number } | null {
  let depth = 0
  let quote: "'" | '"' | '`' | null = null
  let escaped = false

  for (let index = openParen; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
    } else if (char === '(') {
      depth++
    } else if (char === ')' && --depth === 0) {
      return { args: source.slice(openParen + 1, index), end: index + 1 }
    }
  }
  return null
}

function firstLiteralArgument(args: string): string | null {
  const start = skipTrivia(args, 0)
  const quote = args[start]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null

  let value = ''
  let escaped = false
  for (let index = start + 1; index < args.length; index++) {
    const char = args[index]
    if (escaped) {
      value += char
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === quote) {
      return value
    } else {
      value += char
    }
  }
  return null
}

function walkMethodChain(
  source: string,
  start: number,
  visit: (method: string, firstArgument: string | null) => void,
): void {
  let index = start
  while (index < source.length) {
    index = skipTrivia(source, index)
    if (source[index] !== '.') return
    index = skipTrivia(source, index + 1)

    const nameMatch = /^[a-z_$][a-z0-9_$]*/i.exec(source.slice(index))
    if (!nameMatch) return
    const method = nameMatch[0]
    index = skipTrivia(source, index + method.length)
    if (source[index] !== '(') return

    const call = readCall(source, index)
    if (!call) return
    visit(method, firstLiteralArgument(call.args))
    index = call.end
  }
}

function collectFilterRefsFromSource(innehall: string, fil: string): Ref[] {
  const ut: Ref[] = []
  const seen = new Set<string>()
  const methods = FILTER_METHODS.join('|')

  const add = (tabell: string, kolumn: string, metod: FilterMethod) => {
    const normalized = kolumn.toLowerCase()
    const key = `${tabell}.${normalized}.${metod}.${fil}`
    if (seen.has(key)) return
    seen.add(key)
    ut.push({ tabell, kolumn: normalized, fil, metod })
  }

  // Direkt kedja: supabase.from('t').select(...).eq('kolumn', ...).
  // Följ bara faktiska metodanrop i samma kedja. Ett godtyckligt textfönster
  // kan annars koppla en senare, fristående query till fel tabell.
  const fromRe = /\.from\(\s*'([a-z0-9_]+)'\s*\)/g
  const fromMatches = Array.from(innehall.matchAll(fromRe))
  for (const match of fromMatches) {
    const start = match.index! + match[0].length
    walkMethodChain(innehall, start, (method, column) => {
      const normalizedMethod = method.toLowerCase()
      if (column && FILTER_METHODS.includes(normalizedMethod as FilterMethod)) {
        add(match[1].toLowerCase(), column, normalizedMethod as FilterMethod)
      }
    })
  }

  // Query-builder-variabler: detta är exakt formen som släppte igenom
  // project.invoice_id: `let query = supabase.from('project')`, därefter
  // `query = query.eq('invoice_id', ...)` på en annan rad.
  const bindings: Binding[] = []
  const bindingRe = /\b(?:const|let|var)\s+([a-z_$][a-z0-9_$]*)\s*=\s*[a-z_$][a-z0-9_$.]*\.from\(\s*'([a-z0-9_]+)'\s*\)/gi
  for (const binding of Array.from(innehall.matchAll(bindingRe))) {
    bindings.push({ variabel: binding[1], tabell: binding[2].toLowerCase(), index: binding.index! })
  }

  const variableMethodRe = new RegExp(
    `\\b([a-z_$][a-z0-9_$]*)\\s*\\.\\s*(${methods})\\(\\s*['\"\`]([a-z_][a-z0-9_]*)['\"\`]`,
    'gi',
  )
  for (const call of Array.from(innehall.matchAll(variableMethodRe))) {
    const binding = bindings
      .filter(candidate => candidate.variabel === call[1] && candidate.index <= call.index!)
      .at(-1)
    if (binding) add(binding.tabell, call[3], call[2].toLowerCase() as FilterMethod)
  }

  return ut
}

function collectFilterRefs(roots = [path.join(ROOT, 'app'), path.join(ROOT, 'lib')]): Ref[] {
  const filer = roots.flatMap(root => walk(root))
  return filer.flatMap(fil => collectFilterRefsFromSource(
    fs.readFileSync(fil, 'utf8'),
    path.relative(ROOT, fil).replace(/\\/g, '/'),
  ))
}

test.describe('kolumnkontraktet', () => {
  test('SANITY — facit läser faktiskt sql/', () => {
    // Utan detta kan parsern gå sönder och hela sviten bli grön av fel skäl.
    const facit = buildColumnFacit()
    expect(facit.size, 'inga tabeller lästes ur sql/').toBeGreaterThan(30)
    expect(facit.get('project_change')?.has('change_id'), 'project_change.change_id saknas i facit').toBe(true)
    expect(facit.get('project_change')?.has('invoiced_at'), 'ALTER-tillägg fångas inte').toBe(true)
    expect(facit.get('business_config')?.has('business_name'), 'live-snapshoten läses inte').toBe(true)
    expect(facit.get('business_config')?.has('company_name'), 'snapshoten innehåller en fantomkolumn').toBe(false)
  })

  test('SANITY — project_change har INGEN id-kolumn', () => {
    // Verifierat mot produktionsschemat 2026-08-07. Det var precis den här
    // frånvaron som gjorde intäktssvepet till en no-op.
    expect(buildColumnFacit().get('project_change')?.has('id')).toBe(false)
  })

  test('varje selectad, filtrerad och sorterad kolumn finns i tabellen', () => {
    const facit = buildColumnFacit()
    const refs = [...collectSelectRefs(), ...collectFilterRefs()]
    expect(refs.length, 'inga kolumnreferenser hittades — parsern är trasig').toBeGreaterThan(100)

    const fel: string[] = []
    for (const r of refs) {
      const kolumner = facit.get(r.tabell)
      if (!kolumner) continue // tabellen saknar CREATE TABLE — inte verifierbar
      if (KANDA_LUCKOR.has(`${r.tabell}.${r.kolumn}`)) continue
      if (PRODUKTIONSVERIFIERADE_KOLUMNER.has(`${r.tabell}.${r.kolumn}`)) continue
      if (LIVE_SCHEMA_GAPS.has(`${r.fil}:${r.tabell}.${r.kolumn}`)) continue
      if (!kolumner.has(r.kolumn)) {
        fel.push(`${r.fil}: ${r.tabell}.${r.kolumn} (${r.metod})`)
      }
    }

    expect(fel, 'Kolumner som inte finns — PostgREST 400:ar HELA frågan').toEqual([])
  })

  test('de kända luckorna blir inte fler', () => {
    // Undantagslistan är en skuld, inte en ventil. Växer den har någon skrivit
    // upp en ny död kolumn i stället för att laga den.
    expect(KANDA_LUCKOR.size, 'Ny post i KANDA_LUCKOR — laga kolumnen i stället').toBeLessThanOrEqual(2)
  })

  test('produktionsverifierade legacy-kolumner blir inte fler', () => {
    expect(Array.from(PRODUKTIONSVERIFIERADE_KOLUMNER).sort()).toEqual([
      'project_checklist.order_id',
      'project_log.date',
      'project_log.order_id',
      'project_log.work_performed',
    ])
  })

  test('kända live-schemaavvikelser är filbundna och blir inte fler', () => {
    expect(LIVE_SCHEMA_GAPS.size, 'Ny live-schemaavvikelse — laga frågan i stället').toBe(24)
  })

  test('app/dashboard/quotes ingår i filtervakten', () => {
    const refs = collectFilterRefs([path.join(ROOT, 'app', 'dashboard', 'quotes')])
    // QuoteBuilder-konsolideringen 2026-08-31 minskade antalet separata
    // Supabase-kedjor. Vakten ska bevisa att trädet faktiskt skannas, inte
    // låsa en historisk implementeringsmängd.
    expect(refs.length, 'inga offertfilter hittades — quotes-trädet skannas inte').toBeGreaterThan(5)
    expect(new Set(refs.map(ref => ref.metod))).toEqual(new Set(['eq', 'order']))
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

  test('alla filtermetoder och order plockar första argumentets kolumn', () => {
    const source = `
      const result = supabase.from('project_change')
        .eq('project_id', 'p1')
        .neq('status', 'draft')
        .gt('amount', 0)
        .lt('hours', 10)
        .in('change_type', ['addition'])
        .is('approved_at', null)
        .contains('items', [{ id: 'x' }])
        .order('created_at')
    `
    expect(collectFilterRefsFromSource(source, 'fixture.ts').map(ref => `${ref.metod}:${ref.kolumn}`))
      .toEqual([
        'eq:project_id',
        'neq:status',
        'gt:amount',
        'lt:hours',
        'in:change_type',
        'is:approved_at',
        'contains:items',
        'order:created_at',
      ])
  })

  test('query-builder på annan rad behåller sin tabellkoppling', () => {
    const source = `
      let query = supabase.from('project').select('project_id')
      query = query.eq('invoice_id', invoiceId)
    `
    expect(collectFilterRefsFromSource(source, 'fixture.ts')).toContainEqual({
      tabell: 'project',
      kolumn: 'invoice_id',
      fil: 'fixture.ts',
      metod: 'eq',
    })
  })
})
