/**
 * Facit: kontoradering (Apple 5.1.1(v), Google Play) — 2026-09-04,
 * tasks/plan-kontoradering.md.
 *
 * ═══ VARFÖR DET HÄR TESTET FINNS ═══
 *
 * Kontoraderingen är destruktiv kod: fel ordning, fel behörighetskontroll
 * eller en glömd tabell kan antingen radera fakturaunderlag som lagen kräver
 * att firman sparar i 7 år, eller lämna kvar en anställds persondata efter
 * att kontot sagts vara borta. Ingen av de två får hända tyst.
 *
 * ═══ FULLSTÄNDIGHETSVAKTEN ═══
 *
 * Samma mönster som tests/column-contract.spec.ts (kolumnkontraktet):
 * bygg ett facit över varje tabell som `sql/*.sql` visar har en
 * `business_id`-kolumn (CREATE TABLE-kropp ELLER en senare
 * ALTER TABLE ... ADD COLUMN business_id), och kräv att den finns i EXAKT EN
 * av RADERAS/BEHALLS/IRRELEVANT (lib/account/radera.ts). En ny tabell som
 * ingen hunnit klassa gör det här testet rött i stället för att tyst läcka
 * persondata förbi kontoraderingen.
 *
 * Källskanningen stripper `--`-radkommentarer och `/* *\/`-blockkommentarer
 * innan mönstermatchning — en tabell som bara nämns i en kommentar (t.ex.
 * "-- business_id fanns tidigare på X") ska inte räknas som en träff.
 *
 * ═══ TABELLER UTANFÖR sql/ ═══
 *
 * business_config, invoice, supplier_invoices, customer, quotes, booking
 * (samma lucka som schema-contract.spec.ts BASE_TABLES), customer_activity,
 * sms_campaign, material_order (samma lucka som MANUAL_TABLES), och det
 * äldre telefoni-/ärendelagret call/transcript/case_record/action_log/
 * emergency_escalation/human_followup_queue/reservation (verifierat
 * read-only mot information_schema 2026-09-04, se lib/account/radera.ts) kan
 * fullständighetsvakten inte se — de har ingen CREATE TABLE i sql/. De
 * klassas ändå i lib/account/radera.ts, och BASTABELLER nedan håller DEN
 * listan ärlig på samma sätt.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/kontoradering.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { RADERAS, BEHALLS, IRRELEVANT, arKlassad } from '../lib/account/radera'

const ROOT = path.resolve(__dirname, '..')
const RADERA_TS = fs.readFileSync(path.join(ROOT, 'lib', 'account', 'radera.ts'), 'utf8')
const ROUTE_TS = fs.readFileSync(path.join(ROOT, 'app', 'api', 'account', 'delete', 'route.ts'), 'utf8')
const AUTH_ROUTE_TS = fs.readFileSync(path.join(ROOT, 'app', 'api', 'auth', 'route.ts'), 'utf8')

/** Stripper SQL-kommentarer innan mönstermatchning — samma metod som
    tests/column-contract.spec.ts. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join('\n')
}

/** Varje tabell i sql/*.sql som har en business_id-kolumn, via CREATE TABLE
    ELLER en senare ALTER TABLE ... ADD COLUMN business_id. */
function tabellerMedBusinessId(): Set<string> {
  const sqlDir = path.join(ROOT, 'sql')
  const resultat = new Set<string>()
  const filer = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort()

  for (const f of filer) {
    const sql = stripComments(fs.readFileSync(path.join(sqlDir, f), 'utf8'))

    const skapa = /CREATE TABLE (?:IF NOT EXISTS )?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\s*\);/gi
    for (const m of Array.from(sql.matchAll(skapa))) {
      if (/\bbusiness_id\b/i.test(m[2])) resultat.add(m[1].toLowerCase())
    }

    const satser = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?\b([\s\S]*?);/gi
    for (const s of Array.from(sql.matchAll(satser))) {
      if (/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?business_id"?/i.test(s[2])) {
        resultat.add(s[1].toLowerCase())
      }
    }
  }
  return resultat
}

/**
 * Tabeller som bär business_id men vars CREATE TABLE aldrig checkades in i
 * sql/ (samma lucka som schema-contract.spec.ts BASE_TABLES/MANUAL_TABLES),
 * plus det äldre telefoni-/ärendelagret. Verifierade enligt kommentaren i
 * lib/account/radera.ts filhuvud. Fullständighetsvakten kan inte upptäcka
 * dessa på egen hand — den här listan är den manuella motsvarigheten.
 */
const BASTABELLER = [
  'business_config', 'invoice', 'supplier_invoices', 'customer', 'quotes',
  'booking', 'business_users',
  'customer_activity', 'sms_campaign', 'material_order',
  'call', 'transcript', 'case_record', 'action_log', 'emergency_escalation',
  'human_followup_queue', 'reservation',
]

test.describe('kontoradering — barntabellerna batchas', () => {
  const kod = RADERA_TS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

  test('transcript_turn och sms_campaign_recipient raderas i batchar, aldrig en enda .in() med hela listan', () => {
    // Ett konto med tusentals samtal spränger annars URL-längden i .in(),
    // och raderingen fastnar för just de konton som har mest att radera.
    expect(kod).toContain('const ID_BATCH')
    for (const tabell of ['transcript_turn', 'sms_campaign_recipient']) {
      const start = kod.indexOf(`.from('${tabell}')`)
      expect(start, `${tabell} raderas inte alls`).toBeGreaterThan(-1)
      const block = kod.slice(Math.max(0, start - 700), start + 400)
      expect(block, `${tabell} saknar batchslinga`).toContain('ID_BATCH')
      expect(block, `${tabell} skickar hela listan`).toMatch(/\.slice\(i, i \+ ID_BATCH\)/)
    }
  })
})

test.describe('kontoradering — fullständighetsvakten', () => {
  test('SANITY — facit läser faktiskt sql/ och hittar kända business_id-tabeller', () => {
    const facit = tabellerMedBusinessId()
    expect(facit.size, 'inga tabeller med business_id hittades — skannern är trasig').toBeGreaterThan(100)
    expect(facit.has('leads'), 'leads saknas i facit').toBe(true)
    expect(facit.has('project_change'), 'project_change saknas i facit (ALTER-tillägg fångas inte)').toBe(true)
  })

  test('kommentarer räknas inte som träffar', () => {
    const kommenterad = stripComments(`
      -- CREATE TABLE spok_tabell (business_id text);
      CREATE TABLE riktig_tabell (
        id text,
        /* business_id text, */
        name text
      );
    `)
    expect(kommenterad).not.toContain('spok_tabell')
    expect(kommenterad).toMatch(/CREATE TABLE riktig_tabell/)
  })

  test('varje tabell med business_id i sql/ är klassad i exakt en av RADERAS/BEHALLS/IRRELEVANT', () => {
    const facit = tabellerMedBusinessId()
    const raderasSet = new Set(RADERAS)
    const behallsSet = new Set(BEHALLS)
    const irrelevantSet = new Set(IRRELEVANT)

    const oklassade: string[] = []
    const iFleraListor: string[] = []

    for (const tabell of Array.from(facit)) {
      const traffar = [raderasSet.has(tabell), behallsSet.has(tabell), irrelevantSet.has(tabell)]
        .filter(Boolean).length
      if (traffar === 0) oklassade.push(tabell)
      if (traffar > 1) iFleraListor.push(tabell)
    }

    expect(oklassade, 'Nya tabeller med business_id — klassa dem i lib/account/radera.ts').toEqual([])
    expect(iFleraListor, 'Tabeller klassade i mer än en lista').toEqual([])
  })

  test('BASTABELLER (utanför sql/) är också klassade i exakt en lista', () => {
    const raderasSet = new Set(RADERAS)
    const behallsSet = new Set(BEHALLS)
    const irrelevantSet = new Set(IRRELEVANT)
    const oklassade: string[] = []
    const iFleraListor: string[] = []

    for (const tabell of BASTABELLER) {
      const traffar = [raderasSet.has(tabell), behallsSet.has(tabell), irrelevantSet.has(tabell)]
        .filter(Boolean).length
      if (traffar === 0) oklassade.push(tabell)
      if (traffar > 1) iFleraListor.push(tabell)
    }
    expect(oklassade).toEqual([])
    expect(iFleraListor).toEqual([])
  })

  test('RADERAS/BEHALLS/IRRELEVANT har inga interna dubbletter eller överlapp', () => {
    expect(new Set(RADERAS).size).toBe(RADERAS.length)
    expect(new Set(BEHALLS).size).toBe(BEHALLS.length)
    expect(new Set(IRRELEVANT).size).toBe(IRRELEVANT.length)

    const raderasSet = new Set(RADERAS)
    const behallsSet = new Set(BEHALLS)
    const overlappRB = BEHALLS.filter(t => raderasSet.has(t))
    const overlappRI = IRRELEVANT.filter(t => raderasSet.has(t))
    const overlappBI = IRRELEVANT.filter(t => behallsSet.has(t))
    expect(overlappRB, 'tabell i både RADERAS och BEHALLS').toEqual([])
    expect(overlappRI, 'tabell i både RADERAS och IRRELEVANT').toEqual([])
    expect(overlappBI, 'tabell i både BEHALLS och IRRELEVANT').toEqual([])
  })

  test('arKlassad() svarar sant för klassade och falskt för en påhittad tabell', () => {
    expect(arKlassad('invoice')).toBe(true)
    expect(arKlassad('leads')).toBe(true)
    expect(arKlassad('en_tabell_som_inte_finns_xyz')).toBe(false)
  })
})

test.describe('kontoradering — invoice är helig', () => {
  test('invoice finns i BEHALLS och förekommer ALDRIG i RADERAS', () => {
    expect(BEHALLS).toContain('invoice')
    expect(RADERAS).not.toContain('invoice')
  })

  test('supplier_invoices och rot_payment_request (skatteunderlag) behålls också', () => {
    expect(BEHALLS).toContain('supplier_invoices')
    expect(BEHALLS).toContain('rot_payment_request')
    expect(RADERAS).not.toContain('supplier_invoices')
    expect(RADERAS).not.toContain('rot_payment_request')
  })

  test('business_config behålls (mjukraderas, raderas aldrig hårt)', () => {
    expect(BEHALLS).toContain('business_config')
    expect(RADERAS).not.toContain('business_config')
  })
})

test.describe('kontoradering — barntabeller utan business_id', () => {
  test('transcript_turn och sms_campaign_recipient töms via verifierad join, inte via en business_id-kolumn de saknar', () => {
    expect(RADERA_TS).toContain("'transcript_turn'")
    expect(RADERA_TS).toContain("'sms_campaign_recipient'")
    // Får aldrig filtreras på en kolumn som inte finns på dem.
    expect(RADERA_TS).not.toMatch(/from\('transcript_turn'\)[\s\S]{0,200}eq\('business_id'/)
    expect(RADERA_TS).not.toMatch(/from\('sms_campaign_recipient'\)[\s\S]{0,200}eq\('business_id'/)
  })

  test('transcript_turn och sms_campaign_recipient är INTE i RADERAS/BEHALLS/IRRELEVANT (de har ingen business_id-kolumn att skanna)', () => {
    expect(arKlassad('transcript_turn')).toBe(false)
    expect(arKlassad('sms_campaign_recipient')).toBe(false)
  })
})

test.describe('kontoradering — rutten kräver ägaren', () => {
  test('ägarskapet jämförs mot business_config.user_id, inte business_users.role', () => {
    expect(ROUTE_TS).toMatch(/firma\.user_id\s*!==\s*callerUserId/)
  })

  test('en anställd (ej ägare) nekas med 403', () => {
    const idx = ROUTE_TS.search(/firma\.user_id\s*!==\s*callerUserId/)
    expect(idx).toBeGreaterThan(-1)
    const efter = ROUTE_TS.slice(idx, idx + 400)
    expect(efter).toMatch(/status:\s*403/)
  })

  test('callerUserId hämtas från serverns egen tokenverifiering (extractUserId), inte från request-body', () => {
    expect(ROUTE_TS).toMatch(/extractUserId\(request\)/)
    expect(ROUTE_TS).not.toMatch(/body\.user_id/)
    expect(ROUTE_TS).not.toMatch(/body\.callerUserId/)
  })

  test('bekräftelsen jämförs mot business_name PÅ SERVERN, inte klientens ord för det', () => {
    expect(ROUTE_TS).toMatch(/bekraftelse\s*!==\s*firma\.business_name/)
    // "på servern" betyder: värdet route.ts jämför mot kommer från den FÄRSKA
    // databasläsningen (firma.business_name), aldrig från request-kroppen.
    expect(ROUTE_TS).not.toMatch(/bekraftelse\s*!==\s*body\.business_name/)
  })

  test('impersonation kan inte radera en kunds firma', () => {
    expect(ROUTE_TS).toMatch(/business\._impersonation/)
  })
})

test.describe('kontoradering — ordningen', () => {
  // Stripe → persondata → auth-användare → business_users → business_config
  const stripeIdx = ROUTE_TS.search(/subscriptions\.cancel/)
  const persondataIdx = ROUTE_TS.search(/raderaPersondata\(/)
  const authDeleteIdx = ROUTE_TS.search(/auth\.admin\.deleteUser\(/)
  const businessUsersDeleteIdx = ROUTE_TS.search(/from\('business_users'\)\s*\n\s*\.delete\(\)/)
  const businessConfigUpdateIdx = ROUTE_TS.search(/from\('business_config'\)\s*\n\s*\.update\(/)

  test('alla fem stegen hittas i källan (sanity)', () => {
    expect(stripeIdx, 'Stripe-avslutet hittades inte').toBeGreaterThan(-1)
    expect(persondataIdx, 'raderaPersondata-anropet hittades inte').toBeGreaterThan(-1)
    expect(authDeleteIdx, 'auth.admin.deleteUser hittades inte').toBeGreaterThan(-1)
    expect(businessUsersDeleteIdx, 'business_users-raderingen hittades inte').toBeGreaterThan(-1)
    expect(businessConfigUpdateIdx, 'business_config-uppdateringen hittades inte').toBeGreaterThan(-1)
  })

  test('Stripe avslutas FÖRE persondata raderas', () => {
    expect(stripeIdx).toBeLessThan(persondataIdx)
  })

  test('persondata raderas FÖRE någon auth.admin.deleteUser', () => {
    expect(persondataIdx).toBeLessThan(authDeleteIdx)
  })

  test('auth-användare raderas FÖRE business_users-raderna', () => {
    expect(authDeleteIdx).toBeLessThan(businessUsersDeleteIdx)
  })

  test('business_users raderas FÖRE business_config uppdateras (mjukraderas)', () => {
    expect(businessUsersDeleteIdx).toBeLessThan(businessConfigUpdateIdx)
  })

  test('business_users-raderna LÄSES (för att hitta user_id:n) innan de raderas', () => {
    const lasIdx = ROUTE_TS.search(/from\('business_users'\)\s*\n\s*\.select\(/)
    expect(lasIdx, 'ingen select mot business_users innan radering').toBeGreaterThan(-1)
    expect(lasIdx).toBeLessThan(authDeleteIdx)
  })
})

test.describe('kontoradering — fail-loud', () => {
  test('raderaPersondata kastar (inte bara loggar) när en tabell inte kunde tömmas', () => {
    expect(RADERA_TS).toMatch(/throw error/)
    expect(RADERA_TS).toMatch(/Persondata-raderingen misslyckades för/)
  })

  test('en tabell som saknas i miljön hoppas över tyst (arSchemaSaknas), stoppar inte raderingen', () => {
    expect(RADERA_TS).toMatch(/arSchemaSaknas\(/)
  })

  test('routen svarar aldrig success:true om ett steg efter persondata-raderingen misslyckas', () => {
    // Varje felgren efter steg 3 (auth-radering, business_users, business_config)
    // måste returnera INNAN "success: true" i lyckade-svaret nedanför.
    const framgangIdx = ROUTE_TS.indexOf("success: true,\n      message:")
    expect(framgangIdx).toBeGreaterThan(-1)
    const stegEfterPersondata = [
      /Kunde inte läsa business_users för inloggningsradering/,
      /Kunde inte radera alla inloggningar/,
      /Kunde inte radera business_users/,
      /Kunde inte mjukradera business_config/,
    ]
    for (const monster of stegEfterPersondata) {
      const idx = ROUTE_TS.search(monster)
      expect(idx, `${monster} hittades inte`).toBeGreaterThan(-1)
      expect(idx).toBeLessThan(framgangIdx)
    }
  })
})

test.describe('kontoradering — inloggningen nekar ett raderat konto', () => {
  test('login-selecten hämtar deleted_at', () => {
    // Skopat till LOGIN-actionen specifikt — "check"-actionen längre ner
    // använder select('*') (fångar deleted_at automatiskt när migrationen
    // körts) och ska inte räknas in här.
    const loginStart = AUTH_ROUTE_TS.indexOf("if (action === 'login')")
    const loginEnd = AUTH_ROUTE_TS.indexOf('==================== LOGOUT', loginStart)
    expect(loginStart, 'login-actionen hittades inte').toBeGreaterThan(-1)
    expect(loginEnd).toBeGreaterThan(loginStart)
    const loginBlock = AUTH_ROUTE_TS.slice(loginStart, loginEnd)

    const loginSelects = Array.from(
      loginBlock.matchAll(/\.from\('business_config'\)\s*\n\s*\.select\('([^']*)'\)/g),
    ).map(m => m[1])
    expect(loginSelects.length, 'inga business_config-selectar hittades i login-flödet').toBeGreaterThanOrEqual(2)
    for (const sel of loginSelects) {
      expect(sel, `select saknar deleted_at: ${sel}`).toContain('deleted_at')
    }
  })

  test('ett raderat konto (deleted_at satt) nekas med "Kontot är avslutat"', () => {
    expect(AUTH_ROUTE_TS).toMatch(/business\.deleted_at/)
    expect(AUTH_ROUTE_TS).toContain('Kontot är avslutat')
  })
})

test.describe('kontoradering — migrationen är skriven men inte körd', () => {
  test('sql/v211_kontoradering.sql finns och innehåller inga destruktiva satser', () => {
    const migPath = path.join(ROOT, 'sql', 'v211_kontoradering.sql')
    expect(fs.existsSync(migPath)).toBe(true)
    const sql = fs.readFileSync(migPath, 'utf8')
    expect(sql).toMatch(/deleted_at/)
    expect(sql).toMatch(/deleted_by/)
    // Kommentarerna FÅR nämna ordet "DELETE" (de förklarar varför en hård
    // DELETE är utesluten) — det är den KÖRBARA SQL:n, inte prosan, som inte
    // får innehålla en destruktiv sats. Samma "strippa kommentarer före
    // matchning"-princip som fullständighetsvakten ovan.
    const korbarSql = stripComments(sql).toUpperCase()
    expect(korbarSql).not.toMatch(/\bDELETE\s+FROM\b/)
    expect(korbarSql).not.toMatch(/\bDROP\b/)
    expect(korbarSql).not.toMatch(/\bTRUNCATE\b/)
  })
})
