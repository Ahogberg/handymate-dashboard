import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Facit för partnerportalens demoknapp (Andreas beslut 2026-09-17: "alla
// partners kan ju dela demokonto, och då är det ju smidigt om det bara är en
// knapp in utan att man faktiskt behöver logga in med uppgifter").
//
// En knapp som delar ut en inloggad session är en betrodd väg. Testerna här
// håller fyra saker, och bara dessa fyra:
//  1. samma tre partnergrindar som POST /api/sales-case — session, aktiv
//     status, accepterat gällande avtal,
//  2. målkontot måste vara MÄRKT som demo (is_demo_tenant). DEMO_BUSINESS_ID
//     är urvalet, inte grinden — pekar variabeln fel ska rutten vägra i
//     stället för att dela ut en session till en betalande kunds konto,
//  3. magiclänken loggas aldrig — inte till konsolen, inte till audittabellen,
//  4. fliken öppnas före await:et (annars blockerar popup-skyddet den).

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const ROUTE = 'app/api/partners/demo-entry/route.ts'
const SIDA = 'app/partners/dashboard/page.tsx'

test.describe('Partnerns väg in i det delade demokontot', () => {
  test('rutten grindar på partnersession, aktiv status och gällande avtal', () => {
    const src = read(ROUTE)

    // Samma auth-mekanism som resten av portalen, inte en egen.
    expect(src).toContain('getPartnerTokenFromRequest')
    expect(src).toContain('getPartnerFromToken')

    const iSession = src.indexOf('if (!partner)')
    const iStatus = src.indexOf("partner.status !== 'active'")
    const iAvtal = src.indexOf('hasAcceptedCurrentAgreement(partner)')
    expect(iSession, 'saknar 401-grind för utloggad partner').toBeGreaterThan(-1)
    expect(iStatus, 'saknar grind för icke-aktivt partnerkonto').toBeGreaterThan(-1)
    expect(iAvtal, 'saknar avtalsgrind').toBeGreaterThan(-1)

    // Alla tre före länken skapas — en grind efter generateLink är ingen grind.
    // Anropet, inte ordet: filhuvudet nämner generateLink i en förklaring.
    const iLank = src.search(/await supabase\.auth\.admin\.generateLink\(\{/)
    expect(iLank, 'hittar inte anropet som skapar magiclänken').toBeGreaterThan(-1)
    expect(iSession).toBeLessThan(iLank)
    expect(iStatus).toBeLessThan(iLank)
    expect(iAvtal).toBeLessThan(iLank)

    // Grindarna ska svara 401/403, inte släppa vidare med en varning.
    const grindblock = src.slice(iSession, iLank)
    expect(grindblock).toContain('status: 401')
    expect(grindblock).toContain('status: 403')
  })

  test('målkontot måste vara märkt is_demo_tenant — env-variabeln är inte grinden', () => {
    const src = read(ROUTE)

    // Kontot läses ur business_config med flaggan med i selecten.
    expect(src).toContain("from('business_config')")
    expect(src).toMatch(/\.select\([^)]*is_demo_tenant/)

    // Och flaggan avgör. Strikt jämförelse: null/undefined/'false' får inte
    // passera som sanning.
    expect(src).toContain('is_demo_tenant !== true')

    const iFlagga = src.indexOf('is_demo_tenant !== true')
    const iLank = src.search(/await supabase\.auth\.admin\.generateLink\(\{/)
    expect(iFlagga, 'is_demo_tenant-grinden saknas').toBeGreaterThan(-1)
    expect(iFlagga).toBeLessThan(iLank)

    // Grinden avslutar anropet. Utan return är kontrollen bara en logg.
    const efterFlaggan = src.slice(iFlagga, iLank)
    expect(efterFlaggan).toMatch(/return NextResponse\.json\([\s\S]*status: 503/)
  })

  test('magiclänken loggas aldrig — varken till konsolen eller till audittabellen', () => {
    const src = read(ROUTE)

    // Varje console.*-anrop i rutten: inget av dem får bära länken.
    const konsolanrop = src.match(/console\.(log|error|warn|info)\([\s\S]*?\n/g) || []
    expect(konsolanrop.length, 'rutten loggar ingenting alls — då mäter detta test inget').toBeGreaterThan(0)
    for (const anrop of konsolanrop) {
      expect(anrop, `console-anrop bär länken: ${anrop}`).not.toMatch(/actionLink|action_link|link\?\.properties|data\.url/)
    }

    // Auditraden bär vem och när, aldrig nyckeln.
    const iInsert = src.indexOf("from('partner_demo_entry')")
    expect(iInsert, 'ingen auditrad skrivs').toBeGreaterThan(-1)
    const insertblock = src.slice(iInsert, src.indexOf('})', src.indexOf('.insert(', iInsert)) + 2)
    expect(insertblock).toContain('partner_id')
    expect(insertblock).not.toMatch(/actionLink|action_link|url/)
  })

  test('audittabellen är bara service_role och har RLS', () => {
    const sql = read('sql/v256_partner_demo_entry.sql')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.partner_demo_entry FROM PUBLIC, anon, authenticated')
    expect(sql).toMatch(/GRANT [A-Z, ]+ ON public\.partner_demo_entry TO service_role/)
    // Ingen kolumn som kan bära en länk eller ett token.
    const tabell = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');', sql.indexOf('CREATE TABLE')))
    expect(tabell).not.toMatch(/url|token|link|magic/i)
  })

  test('portalen öppnar fliken före await:et, annars blockerar popup-skyddet den', () => {
    const src = read(SIDA)
    const iFn = src.indexOf('async function oppnaDemo()')
    expect(iFn, 'oppnaDemo saknas i partnerdashboarden').toBeGreaterThan(-1)
    const fn = src.slice(iFn, src.indexOf('\n  }\n', iFn))

    const iOpen = fn.indexOf('window.open(')
    const iAwait = fn.indexOf('await ')
    expect(iOpen, 'ingen ny flik öppnas').toBeGreaterThan(-1)
    expect(iAwait, 'ingen fetch görs').toBeGreaterThan(-1)
    expect(iOpen, 'window.open ligger efter await — popup-skyddet blockerar den').toBeLessThan(iAwait)

    // Länken sätts på den redan öppnade fliken.
    expect(fn).toContain('flik.location.href')
    expect(fn).toContain("fetch('/api/partners/demo-entry'")
    expect(fn).toContain("method: 'POST'")
  })

  test('kortet säger att kontot är delat och att utskicken är simulerade', () => {
    const src = read(SIDA)
    const iKort = src.indexOf('Visa Handymate live')
    expect(iKort, 'demokortet saknas i portalen').toBeGreaterThan(-1)
    const kort = src.slice(iKort, src.indexOf('</section>', iKort))

    // Partnern måste veta att en återställning drabbar andras möten.
    expect(kort).toContain('delas av alla partners')
    // Och att inget går ut till riktiga personer (lib/outbound/sms-gate.ts
    // stoppar det, men portalen ska säga det innan partnern undrar).
    expect(kort).toMatch(/simulerat|simulerade/)
    // Knappen ska nå tummen på en telefon.
    expect(kort).toContain('min-h-[44px]')
    expect(kort).toContain('onClick={oppnaDemo}')
  })
})
