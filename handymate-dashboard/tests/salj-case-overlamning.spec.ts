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

test.describe('partnerns attribution följer med caset', () => {
  // Beslut Andreas 2026-09-15: partners ska kunna SKAPA case, inte bara visa
  // materialet — och då måste deras attribution följa med in i onboardingen.
  //
  // Hålet: attributionen fryses EN gång, vid kontoskapandet (POST /api/auth →
  // claimPartnerAttribution), ur `?ref=` som förifyller fältet i
  // Step2Business. Case-länken bar ingen kod, så en partner som gjorde hela
  // genomgången fick kunden in med allt ifyllt UTOM det som gör kunden till
  // partnerns. Ingen kod, ingen rad i provisionsledgern.
  // Mät på koden, inte på kommentarerna — de beskriver just det hål som
  // lagades och nämner alltså strängarna vi förbjuder.
  const modul = utanKommentarer(read('lib/sales/sales-case.ts'))
  const skapa = utanKommentarer(read('app/api/sales-case/route.ts'))
  const las = utanKommentarer(read('app/api/sales-case/[token]/route.ts'))

  test('onboardinglänken bär koden som ?ref= — samma parameter som annars', () => {
    // En egen väg in för case-länkar hade blivit en andra sanning om vem som
    // ska ha provisionen. Step2Business läser och validerar redan ?ref=.
    expect(modul).toMatch(/export function byggOnboardingLank\(token: string, referralCode\?: string \| null\)/)
    expect(modul).toMatch(/&ref=\$\{encodeURIComponent\(kod\)\}/)
    // Och utan kod ska länken vara oförändrad — inget tomt ref=.
    expect(modul).toMatch(/kod \? `\$\{bas\}&ref=/)
    const step2 = utanKommentarer(read('app/onboarding/components/Step2Business.tsx'))
    expect(step2, 'Step2Business läser inte längre ?ref= — då bär länken en död parameter')
      .toMatch(/searchParams\?\.get\('ref'\)/)
  })

  test('koden läses ur partnerns EGEN rad, aldrig ur anropets body', () => {
    // En kod klienten får skicka är en kod någon annan kan göra anspråk på.
    expect(skapa).toMatch(/referralCode = partner\.referral_code/)
    expect(skapa).not.toMatch(/body\.referral|payload\?\.referral|body\.ref\b/)
    expect(skapa).toContain('getPartnerFromToken')
  })

  test('en partner som inte är aktiv kan inte skapa case', () => {
    // Annars producerar den länkar som utlovar en attribution
    // registreringen sedan avvisar.
    const pos = skapa.indexOf("partner.status !== 'active'")
    expect(pos, 'statusgrinden saknas').toBeGreaterThan(-1)
    expect(skapa.slice(pos, pos + 400)).toContain('403')
  })

  test('rutten dömer inte själv om provisionen — det gör registreringen', () => {
    // Två domare glider isär. claimPartnerAttribution äger bedömningen
    // (self_referral, already_attributed, agreement_not_current ...).
    expect(skapa).not.toContain('claimPartnerAttribution')
    expect(skapa).not.toContain('self_referral')
  })

  test('läsrutten lämnar ut koden men aldrig vem som byggde caset', () => {
    expect(las).toMatch(/\.select\('[^']*referral_code[^']*'\)/)
    expect(las).not.toMatch(/\.select\('[^']*created_by_partner_id/)
    expect(las).not.toMatch(/\.select\('[^']*created_by_business_id/)
  })

  test('kundsidans knapp får sin URL från servern, inte av sig själv', () => {
    // Bygger sidan sin egen länk tappas ?ref= första gången någon skriver om
    // knappen — och då är provisionen borta utan att något syns gå sönder.
    expect(las).toMatch(/onboardingUrl: byggOnboardingLank\(token, referralCode\)/)
  })

  test('attributionen ligger i en KOLUMN, inte i payloaden', () => {
    // payload ägs av säljsidans design och kan bytas ut; ett löfte om pengar
    // får inte bo där.
    const sql = read('sql/v235_sales_case_attribution.sql')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS referral_code TEXT/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS created_by_partner_id UUID/)
    expect(skapa).toMatch(/referral_code: referralCode/)
  })
})

test.describe('genomgången bor i appen, inte i kanvasen', () => {
  // 2026-09-15. Kanvasens iframe har ingen nätutgång bortom sin egen
  // origin, så CTA:n kunde aldrig nå /api/sales-case därifrån — den föll
  // tillbaka på localStorage, som inte följer med till kundens webbläsare.
  // Porteringen är själva kopplingen, inte kosmetik.
  const kalla = read('design-sales-experience/SalesExperience.dc.html')
  const genererad = read('components/sales/sales-experience.generated.jsx')

  test('den genererade filen är utdata, inte en kopia att redigera', () => {
    expect(genererad.slice(0, 400)).toContain('GENERERAD FIL')
    expect(genererad).toContain('scripts/dc_till_react.py')
    // Logikklassen ska följa med orörd — en handredigerad kopia driver
    // isär från designkällan vid första ändringen i kanvasen.
    expect(genererad).toContain('class Component extends DCLogic')
  })

  test('skriptet kan köras om — källan och verktyget finns kvar i repot', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/dc_till_react.py'))).toBe(true)
    expect(kalla).toContain('<x-dc>')
  })

  test('token läses ur sökvägen, inte bara ur ?case=', () => {
    // Den personliga länken är /case/<token>. Läser sidan bara
    // frågeparametern hittar den aldrig sitt eget case, och kunden möts av
    // en tom genomgång.
    for (const fil of [kalla, genererad]) {
      expect(fil).toMatch(/location\.pathname\.match\(\/\\\/case\\\/\(\[\^\/\?#\]\+\)\//)
      expect(fil).toContain("URLSearchParams(location.search).get('case')")
    }
  })

  test('CTA:n på kundens sida använder serverns onboardingUrl', () => {
    // Faller den tillbaka på location.pathname + '#onboarding' tappas
    // ?ref= — alltså partnerns provision, tyst.
    for (const fil of [kalla, genererad]) {
      expect(fil).toContain('caseOnboardingUrl: d.onboardingUrl')
    }
  })

  test('kanvasens globala CSS är skopad, inte utsläppt i dashboarden', () => {
    // `*`, `body`, `a`, `button` och `p` från designkällan hade annars
    // slagit mot hela appen.
    expect(genererad).toContain('.hm-sx *{box-sizing:border-box}')
    expect(genererad).not.toMatch(/const CSS = "\*\{/)
    // Även inuti @media — där låg ett oskopat `*`.
    expect(genererad).not.toContain('reduce){*{')
    // Och hovringstillstånden finns kvar som riktiga regler.
    expect(genererad).toMatch(/\.hm-sx \.hx\d+:hover\{/)
  })

  test('variablerna designen ärver definieras i appen', () => {
    // 32 variabler kommer från kanvasens brand-bundle och finns inte i
    // dashboardens CSS. Utan dem renderas sidan färglös, och det syns inte
    // i en typkontroll.
    const tokens = read('components/sales/sales-tokens.css')
    for (const v of ['--teal-700', '--slate-900', '--border', '--fg-muted', '--bg-page', '--brand', '--amber-700']) {
      expect(tokens, `variabeln ${v} saknas`).toContain(v + ':')
    }
    expect(tokens).toContain('.hm-sx {')
    // Fonterna sätts app-brett av layouten och ska inte sättas om här.
    expect(tokens).not.toContain('--font-heading:')
    expect(genererad).toContain("import './sales-tokens.css'")
  })

  test('båda monteringsplatserna finns och är rätt läge', () => {
    const admin = read('app/admin/sales/page.tsx')
    const kund = read('app/case/[token]/KundGenomgang.tsx')
    // Säljarvyn är på hos oss, av hos kunden.
    expect(admin).toContain('showSalesSession={true}')
    expect(kund).toContain('showSalesSession={false}')
    // ssr: false — logiken läser window/location i componentDidMount.
    for (const sida of [admin, kund]) {
      expect(sida).toContain('ssr: false')
      expect(sida).toContain("'use client'")
    }
  })

  test('kundens sida behåller grinden som fanns före porteringen', () => {
    // Sidan fanns redan som serverkomponent och bar tre saker som en
    // klientsida inte kan bära. Porteringen bytte vyn, inte grinden.
    const sida = utanKommentarer(read('app/case/[token]/page.tsx'))
    // 1. En utgången eller okänd token ska ge 404 på servern. Utan detta
    //    möts kunden av säljarens första steg ("skriv in
    //    organisationsnummer"), för vyn faller tillbaka dit när
    //    hämtningen misslyckas.
    //    Importen räcker inte — utgångsdatumet ska faktiskt läsas och
    //    leda till notFound(). (Ett tidigare utkast av det här testet
    //    letade bara efter namnet 'arUtgangen' och överlevde att anropet
    //    togs bort.)
    expect(sida).toMatch(/arUtgangen\(\s*data\.expires_at/)
    expect(sida).toMatch(/arUtgangen\([^)]*\)[^\n]*\)\s*notFound\(\)/)
    expect(sida).toContain("select('expires_at')")
    expect(sida.match(/notFound\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    // 2. Den personliga länken ska aldrig indexeras eller läcka sin URL
    //    vidare som referrer.
    expect(sida).toMatch(/index: false/)
    expect(sida).toMatch(/referrer: 'no-referrer'/)
    // 3. Uppslaget av en token får aldrig cachas statiskt.
    expect(sida).toContain("export const dynamic = 'force-dynamic'")
    // Grinden ligger på servern, alltså får sidan inte vara klientkod.
    expect(sida).not.toContain("'use client'")
  })
})

test.describe('partnern kör genomgången själv', () => {
  // 2026-09-15, Andreas: "lägg in bland materialet som ingår som partner".
  // Tredje monteringsplatsen för samma komponent. Partnern ÄR säljaren där,
  // så säljarläget är på — kan partnern inte spara ett case kan hen inte
  // lämna ifrån sig en länk som bär den egna koden, och då gör partnern
  // jobbet medan affären blir oattribuerad.
  const sida = read('app/partners/material/genomgang/page.tsx')
  const rutt = utanKommentarer(read('app/api/sales-case/route.ts'))
  const kalla = read('design-sales-experience/SalesExperience.dc.html')
  const genererad = read('components/sales/sales-experience.generated.jsx')

  test('partnersidan monterar samma komponent, inte en kopia', () => {
    expect(sida).toContain("import('@/components/sales/sales-experience.generated')")
    expect(sida).toContain('showSalesSession={true}')
    expect(sida).toContain('ssr: false')
  })

  test('sidan är portalinnehåll — inloggad partner, samma grind som resten av materialet', () => {
    expect(sida).toContain('usePartnerMe')
    // usePartnerMe skickar 401 till inloggningen. Utan grinden vore
    // genomgången en öppen sida med vår prissättning och våra argument.
    expect(utanKommentarer(read('app/partners/material/usePartnerMe.ts'))).toContain("router.push('/partners/login')")
  })

  test('den syns i portalen — annars finns den inte', () => {
    const portal = read('app/partners/dashboard/page.tsx')
    expect(portal).toContain("href: '/partners/material/genomgang'")
  })

  test('rutten nekar en partner utan gällande avtal, inte bara en inaktiv', () => {
    // claimPartnerAttribution avvisar med agreement_not_current. En aktiv
    // partner blir icke-aktuell i samma sekund som AGREEMENT_VERSION höjs,
    // och skulle då dela ut länkar som ser ut att bära provision men inte
    // gör det. Grinden hör i rutten, inte i efterhand hos registreringen.
    expect(rutt).toContain('hasAcceptedCurrentAgreement(partner)')
    expect(rutt).toMatch(/!hasAcceptedCurrentAgreement\(partner\)\)\s*\{\s*return NextResponse\.json\([^)]*status: 403/s)
    expect(rutt).toMatch(/partner\.status !== 'active'/)
  })

  test('en nekad sparning ger ALDRIG ut en länk', () => {
    // Kanvasens reservväg skriver till localStorage och pekar på en
    // .dc.html-fil. I appen blev det en "Skickat."-ruta med en död länk
    // som säljaren skickar vidare — tystare och värre än ett fel.
    for (const fil of [kalla, genererad]) {
      // Reservvägen frågar VAR vi kör, inte hur anropet misslyckades: ett
      // nätfel i appen är inte en prototyp.
      expect(fil).toMatch(/iKanvasen = \/\\\.dc\\\.html\$\/i\.test\(location\.pathname\)/)
      expect(fil).toContain('if (!iKanvasen)')
      // Det nekade läget nollar länken och flaggar sig självt.
      expect(fil).toMatch(/caseUrl: '', caseOnboardingUrl: '', caseError: meddelande, caseNekad: true/)
      // localStorage-raden får bara nås efter kanvas-kontrollen.
      const kanvasIdx = fil.indexOf('if (!iKanvasen)')
      expect(kanvasIdx).toBeGreaterThan(-1)
      expect(fil.indexOf("localStorage.setItem('hm_sales_case'", kanvasIdx)).toBeGreaterThan(kanvasIdx)
    }
  })

  test('den nekade kvittorutan ser inte ut som en bekräftelse', () => {
    for (const fil of [kalla, genererad]) {
      expect(fil).toContain("sentTitle: nekad ? 'Genomgången sparades inte.' : 'Skickat.'")
      // Ingen grön bock, ingen länkrad, ingen "Öppna kundens länk".
      expect(fil).toContain("sentMark: nekad ? '!' : '✓'")
      expect(fil).toContain('hasCaseUrl: Boolean(s.caseUrl)')
    }
    // Både url-raden och knappen är villkorade i markupen — inte bara
    // tomma, utan borta.
    expect((genererad.match(/\(v\.hasCaseUrl\) \? \(/g) || []).length).toBeGreaterThanOrEqual(2)
    // Och "Skickat." får inte längre stå hårdkodat i rubriken.
    expect(genererad).not.toMatch(/letter-spacing: '-\.025em'[^}]*\}\}>\s*Skickat\./)
  })
})
