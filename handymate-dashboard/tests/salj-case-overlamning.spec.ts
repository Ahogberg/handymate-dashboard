import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  arUtgangen,
  branschFranSni,
  prefillFranCase,
  SALES_CASE_TTL_DAGAR,
} from '../lib/sales/sales-case'
import { TRADES } from '../app/onboarding/constants'

/**
 * Facit för säljgenomgångens överlämning (2026-09-12, Andreas: "Jag vill att
 * CTAn på slutet ska kunna knyta in DIREKT i onboardingen").
 *
 * ═══ FELET SOM FÅTT DET HÄR PASSET ATT FINNAS ═══
 *
 * Prototypen sparade caset i localStorage under `hm_sales_case`. localStorage
 * är per origin OCH per webbläsare. Säljaren bygger genomgången i mötet i sin
 * browser; kunden öppnar sin personliga länk senare, på sin egen dator. Där
 * finns ingenting — kunden hade fått demodatan (Svenssons El AB) i stället för
 * sin egen genomgång, och onboardingens förifyllning hade varit tom.
 *
 * Provet vaktar därför fyra saker, i den ordning de kan gå sönder tyst:
 *   1. Ingen väg tillbaka till localStorage för det som måste korsa enheter.
 *   2. Gränsen som inte får flytta: caset FÖRIFYLLER, hoppar aldrig ett steg.
 *      Särskilt aldrig betalningen eller genomgången av kundens egna siffror.
 *   3. Kontots egna data vinner ALLTID över en säljlänk.
 *   4. Branschgissningen ur SNI är konservativ — en fel bransch ger en halv
 *      artikelbank för ett helt jobb.
 *
 * Körs: npx playwright test tests/salj-case-overlamning.spec.ts --no-deps --project=chromium
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar kommentarer — ett prov som spricker på ett filhuvud vaktar prosa, inte kod. */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const MODUL = 'lib/sales/sales-case.ts'
const SKAPA = 'app/api/sales-case/route.ts'
const LAS = 'app/api/sales-case/[token]/route.ts'
const SIDA = 'app/onboarding/page.tsx'
const PUT = 'app/api/onboarding/route.ts'

/** En genomgång i exakt den form Sales Experience:s casePayload() bygger. */
function genomgang() {
  return {
    company: {
      name: 'Svenssons El AB',
      short: 'Svenssons El',
      org: '556487-1234',
      sni: '43210 — Elinstallationer',
      seat: 'Stockholm',
    },
    told: [
      { v: '14 personer', l: 'jobbar aktivt i verksamheten' },
      { v: '50–100 jobb', l: 'per månad' },
    ],
    focusTitle: 'Tänk om administrationen gjorde sig själv.',
    pkg: { name: 'Firman', monthly: '5 990' },
    goal: { name: 'Få tillbaka tid', quote: 'Ungefär 15 timmar i veckan går till administration.' },
    meeting: { date: '4 september', iso: '2026-09-04' },
    prospect: { name: 'Peter Svensson', email: 'peter@svenssonsel.se' },
    raw: { company: { form: 'Aktiebolag' }, employees: 14, jobs: '50–100' },
  }
}

test.describe('förifyllningen — bara fält som finns, aldrig en gissning', () => {
  test('företagsnamn, org.nr, bolagsform, bransch och område mappas', () => {
    const { form } = prefillFranCase('t0ken', genomgang())
    expect(form.companyName).toBe('Svenssons El AB')
    expect(form.orgNumber).toBe('556487-1234')
    expect(form.companyForm).toBe('Aktiebolag')
    expect(form.trade).toBe('electrician')
    expect(form.area).toBe('Stockholm')
  })

  test('varje förifyllt trade-värde är ett RIKTIGT id ur TRADES', () => {
    // En bransch som inte finns i tile-griden ger ett tomt val i Step2 —
    // värre än ingen förifyllning, eftersom det ser ifyllt ut.
    const ids = new Set(TRADES.map(t => t.id))
    for (const sni of ['43210', '43221', '43341', '43910', '43120', '41200', '43320', '43990']) {
      const trade = branschFranSni(sni)
      if (trade) expect(ids.has(trade), `${sni} → ${trade} finns inte i TRADES`).toBe(true)
    }
  })

  test('e-post och lösenord förifylls ALDRIG', () => {
    // Prospektets e-post i genomgången är dit LÄNKEN skickades — inte
    // nödvändigtvis den som ska äga kontot. Ett förifyllt kontomejl som är
    // fel är värre än ett tomt fält.
    const { form } = prefillFranCase('t0ken', genomgang())
    expect(form.email).toBeUndefined()
    expect((form as Record<string, unknown>).password).toBeUndefined()
    expect(form.contactName).toBeUndefined()
  })

  test('tomma och skräpiga fält blir undefined, aldrig tomma strängar', () => {
    const { form } = prefillFranCase('t0ken', {
      company: { name: 'Firman AB', org: '   ', sni: '', seat: '  ' },
    })
    expect(form.companyName).toBe('Firman AB')
    expect(form.orgNumber).toBeUndefined()
    expect(form.trade).toBeUndefined()
    expect(form.area).toBeUndefined()
  })

  test('en tom eller trasig genomgång kastar inte', () => {
    for (const trasig of [null, undefined, {}, { company: null }, { company: { name: 123 } }] as any[]) {
      expect(() => prefillFranCase('t', trasig)).not.toThrow()
    }
    expect(prefillFranCase('t', null).form.companyName).toBeUndefined()
    expect(prefillFranCase('t', null).extras.token).toBe('t')
  })

  test('adressen delas ALDRIG isär ur en enda rad', () => {
    // Sales Experience har i dag ett enda `address`-fält. Att gissa fram
    // gata/postnummer/ort ur det hade gett fel adress på första fakturan.
    const { form } = prefillFranCase('t', {
      company: { name: 'Firman AB', address: 'Kabelvägen 12, 121 45 Johanneshov' },
    } as any)
    expect(form.addressStreet).toBeUndefined()
    expect(form.addressPostalCode).toBeUndefined()
    expect(form.addressCity).toBeUndefined()
  })

  test('extras bär målet och siffrorna kunden själv uppgav', () => {
    const { extras } = prefillFranCase('t0ken', genomgang())
    expect(extras.mal).toBe('Få tillbaka tid')
    expect(extras.malCitat).toContain('15 timmar')
    expect(extras.rekommenderatPaket).toBe('Firman')
    expect(extras.personer).toBe(14)
    expect(extras.jobbPerManad).toBe('50–100')
    expect(extras.motesdatum).toBe('2026-09-04')
    // Hela genomgången sparas orörd, så inget går förlorat om fälten ovan ändras.
    expect(extras.genomgang.company?.name).toBe('Svenssons El AB')
  })
})

test.describe('branschgissningen är konservativ', () => {
  test('entydiga SNI-koder mappas', () => {
    expect(branschFranSni('43210 — Elinstallationer')).toBe('electrician')
    expect(branschFranSni('43221')).toBe('plumber')
    expect(branschFranSni('43341')).toBe('painter')
    expect(branschFranSni('43910')).toBe('roofing')
    expect(branschFranSni('43120')).toBe('groundworks')
    expect(branschFranSni('41200')).toBe('construction')
  })

  test('okända, tvetydiga och tomma koder ger undefined — inte en gissning', () => {
    // 43342 är glasmästeri, inte måleri. 62010 är IT. 41100 är
    // projektutveckling, inte en bransch i TRADES.
    for (const sni of ['43342', '62010', '41100', '', '   ', 'Elinstallationer', 'abc']) {
      expect(branschFranSni(sni), sni).toBeUndefined()
    }
    expect(branschFranSni(null)).toBeUndefined()
    expect(branschFranSni(undefined)).toBeUndefined()
  })
})

test.describe('utgångsdatum', () => {
  test('en utgången eller obedömbar rad räknas som utgången', () => {
    const nu = Date.parse('2026-09-12T10:00:00Z')
    expect(arUtgangen('2026-09-11T10:00:00Z', nu)).toBe(true)
    expect(arUtgangen('2026-12-11T10:00:00Z', nu)).toBe(false)
    // Saknat eller ogiltigt → hellre neka än släppa igenom en rad vi inte kan bedöma.
    expect(arUtgangen(null, nu)).toBe(true)
    expect(arUtgangen('inte ett datum', nu)).toBe(true)
  })

  test('TTL:n är satt och rimlig', () => {
    expect(SALES_CASE_TTL_DAGAR).toBeGreaterThanOrEqual(30)
    expect(SALES_CASE_TTL_DAGAR).toBeLessThanOrEqual(365)
    // Och rutten som skapar raden måste faktiskt använda den.
    expect(read(SKAPA)).toContain('SALES_CASE_TTL_DAGAR')
  })
})

test.describe('ingen väg tillbaka till localStorage', () => {
  test('varken modulen eller rutterna rör localStorage', () => {
    // Hela poängen med passet. En framtida hand som "förenklar" tillbaka
    // till localStorage tar bort överlämningen mellan enheter igen.
    //
    // Kommentarerna strippas: filhuvudena FÖRKLARAR varför localStorage är
    // fel här, och ett prov som spricker på den förklaringen vaktar prosa
    // i stället för kod. (Det gjorde det här provet i sitt första utkast.)
    for (const fil of [MODUL, SKAPA, LAS]) {
      expect(utanKommentarer(read(fil)), `${fil} använder localStorage`).not.toContain('localStorage')
      expect(utanKommentarer(read(fil)), `${fil} använder sessionStorage`).not.toContain('sessionStorage')
    }
  })

  test('onboardingen läser caset från SERVERN, inte ur webbläsaren', () => {
    const ren = utanKommentarer(read(SIDA))
    expect(ren).toContain('/api/sales-case/')
    expect(ren, 'caset läses ur localStorage').not.toMatch(/localStorage[^\n]*sales_case/i)
    expect(ren, 'hm_sales_case-nyckeln lever kvar i onboardingen').not.toContain('hm_sales_case')
  })
})

test.describe('gränsen som inte får flytta: förifylla, aldrig hoppa över', () => {
  test('caset sätter aldrig ett steg förbi registreringen', () => {
    // Beslutet 2026-09-02: betalningen ligger efter importen OCH en
    // genomgång av kundens egna siffror. En säljgenomgång är VÅR bild av
    // kunden — den får aldrig ersätta kundens egen data ur deras system,
    // och därmed aldrig flytta kunden förbi steg 1.
    const ren = utanKommentarer(read(SIDA))
    const block = ren.slice(ren.indexOf('if (salesCase) {'), ren.indexOf('setLoading(false)', ren.indexOf('if (salesCase) {')))
    expect(block, 'hittade inte case-grenen').toBeTruthy()
    const steg = /setStep\((\d+)\)/.exec(block)
    expect(steg, 'case-grenen sätter inget steg').toBeTruthy()
    expect(Number(steg![1]), 'caset hoppar förbi registreringssteget').toBeLessThanOrEqual(1)
  })

  test('caset sätter aldrig paid, businessId eller betalningsfält', () => {
    const prefill = prefillFranCase('t', genomgang()).form as Record<string, unknown>
    for (const farligt of ['paid', 'businessId', 'paymentPending', 'password', 'stripeSessionId']) {
      expect(prefill[farligt], `caset sätter ${farligt}`).toBeUndefined()
    }
  })

  test('rutten som skapar caset skriver aldrig till business_config', () => {
    const ren = utanKommentarer(read(SKAPA))
    expect(ren, 'skapa-rutten rör business_config').not.toContain("from('business_config')")
    expect(ren, 'skapa-rutten skapar konton').not.toContain("from('business_users')")
    // Och den kräver inloggning — annars är den en öppen skrivväg till en
    // tabell vars rader delas ut som publika länkar.
    expect(ren).toContain('getAuthenticatedBusiness')
    expect(ren).toMatch(/status:\s*401/)
  })
})

test.describe('kontots egna data vinner alltid', () => {
  test('en säljlänk kan inte skriva över ett befintligt kontos uppgifter', () => {
    const ren = utanKommentarer(read(SIDA))
    // Ordningen i spreadet ÄR regeln: prefill först, restored sist.
    expect(ren).toMatch(/\{ \.\.\.salesCase\.prefill, \.\.\.restored,/)
    // Och en gammal länk får aldrig skriva över den genomgång som faktiskt
    // ledde till kontot.
    expect(ren).toContain('salesCase: restored.salesCase ?? salesCase.extras')
  })

  test('ny kund: användarens redan ifyllda fält vinner över förifyllningen', () => {
    const ren = utanKommentarer(read(SIDA))
    expect(ren).toMatch(/setData\(d => \(\{ \.\.\.salesCase\.prefill, \.\.\.d,/)
  })
})

test.describe('läsrutten läcker inte säljsidan', () => {
  const ren = utanKommentarer(read(LAS))

  test('svaret innehåller aldrig vem hos oss som byggde caset', () => {
    const select = /\.select\('([^']*)'\)/.exec(ren)
    expect(select, 'hittade inte selecten').toBeTruthy()
    for (const hemligt of ['created_by_business_id', 'created_by_user_id', 'id,']) {
      expect(select![1], `selecten hämtar ${hemligt}`).not.toContain(hemligt)
    }
  })

  test('okänd och utgången token ger samma svar: 404', () => {
    // Annars kan en gissande anropare skilja "fanns men gick ut" från
    // "fanns aldrig".
    expect(ren).toContain('arUtgangen(')
    // while + exec, inte matchAll-spread: repots tsconfig saknar
    // downlevelIteration (samma fallgrop som i demo-seedningens facit).
    const koder: string[] = []
    const statusRe = /status:\s*(\d+)/g
    let traff: RegExpExecArray | null
    while ((traff = statusRe.exec(ren)) !== null) koder.push(traff[1])
    expect(koder.length).toBeGreaterThan(0)
    expect(new Set(koder), 'läsrutten svarar med något annat än 404').toEqual(new Set(['404']))
  })

  test('rutten är aldrig statisk', () => {
    // Utan force-dynamic kan första svaret efter deploy serveras till ALLA
    // (CLAUDE.md, svepet 2026-08-22). Här: ett företags genomgång till nästa
    // besökare — det värsta den här tabellen kan ge.
    expect(read(LAS)).toContain("export const dynamic = 'force-dynamic'")
    expect(read(SKAPA)).toContain("export const dynamic = 'force-dynamic'")
  })
})

test.describe('consumed_at — stämpeln som svarar om genomgången ledde någonstans', () => {
  const ren = utanKommentarer(read(PUT))

  test('stämplas avgränsat: rätt token, bara en gång', () => {
    const i = ren.indexOf("from('sales_case')")
    expect(i, 'onboardingen stämplar aldrig sales_case').toBeGreaterThan(-1)
    const block = ren.slice(i - 200, i + 400)
    expect(block).toContain("eq('token', salesCaseToken)")
    // En resume får aldrig flytta datumet.
    expect(block).toContain("is('consumed_at', null)")
    // Och ett misslyckat stämplande får aldrig fälla sparningen.
    expect(block, 'ett stämpelfel returnerar felstatus').not.toMatch(/return NextResponse\.json\([^)]*status:/)
  })
})
