import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { caseLage } from '../lib/sales/case-lage'

// Facit för återkopplingen på partnerns säljgenomgångar (Andreas 2026-09-17:
// "Sales Experience samt Revenue OS vill vi ju kunna väva in i
// partner-dashboarden").
//
// Hålet: partnern körde mötet, skickade länken och hörde sedan aldrig något
// igen — trots att databasen visste. `opened_at` stämplas när prospektet
// öppnar /case/<token>, `consumed_at` när onboardingen förbrukar caset.
//
// Testerna håller fyra saker:
//  1. läget härleds på ETT ställe, och förbrukat slår utgånget,
//  2. rutten ser bara partnerns egna genomgångar och lämnar aldrig ut
//     genomgångens innehåll,
//  3. länken delas bara när den fortfarande leder någonstans,
//  4. adressen till genomgången kan PEKA UT ett företag, aldrig mata in ett.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const NU = Date.parse('2026-09-17T12:00:00Z')
const framtid = '2026-12-01T00:00:00Z'
const forflutet = '2026-09-01T00:00:00Z'

test.describe('caseLage — ett läge, ett ställe', () => {
  test('förbrukat case har vunnit även om länken hunnit gå ut efteråt', () => {
    const lage = caseLage({ consumed_at: forflutet, expires_at: forflutet, opened_at: forflutet }, NU)
    expect(lage.kod).toBe('konto_skapat')
    // Länken är förbrukad — en delningsknapp här är ett löfte som bryts.
    expect(lage.kanDelas).toBe(false)
  })

  test('utgången länk delas aldrig, även om kunden öppnat den', () => {
    const lage = caseLage({ expires_at: forflutet, opened_at: forflutet }, NU)
    expect(lage.kod).toBe('utgangen')
    expect(lage.kanDelas).toBe(false)
  })

  test('öppnad men levande länk får delas och bär tidpunkten', () => {
    const lage = caseLage({ expires_at: framtid, opened_at: '2026-09-16T08:00:00Z' }, NU)
    expect(lage.kod).toBe('oppnad')
    expect(lage.kanDelas).toBe(true)
    expect(lage.tidpunkt).toBe('2026-09-16T08:00:00Z')
  })

  test('inget har hänt än — ingen tidpunkt hittas på', () => {
    const lage = caseLage({ expires_at: framtid }, NU)
    expect(lage.kod).toBe('skickad')
    expect(lage.tidpunkt).toBeNull()
    expect(lage.kanDelas).toBe(true)
  })

  test('saknad utgångstid räknas som utgången, inte som levande', () => {
    // Samma konservativa linje som arUtgangen: utan utgångstid vet vi inget,
    // och då ska vi inte dela ut länken.
    expect(caseLage({}, NU).kod).toBe('utgangen')
    expect(caseLage({ expires_at: null }, NU).kanDelas).toBe(false)
  })
})

test.describe('GET /api/partners/sales-cases', () => {
  const src = read('app/api/partners/sales-cases/route.ts')

  test('grindad på partnersession OCH gällande avtal, som partners/leads', () => {
    expect(src).toContain('getPartnerTokenFromRequest')
    expect(src).toContain('getPartnerFromToken')
    expect(src).toContain('hasAcceptedCurrentAgreement(partner)')
    const grind = src.slice(src.indexOf('const token ='), src.indexOf("from('sales_case')"))
    expect(grind).toContain('status: 401')
    // Grinden måste avbryta. En kontroll utan return är en kommentar.
    expect(grind).toMatch(/return NextResponse\.json\([\s\S]*status: 401/)
  })

  test('läser bara partnerns egna genomgångar', () => {
    expect(src).toContain(".eq('created_by_partner_id', partner.id)")
    // Aldrig ett filter klienten kan välja.
    expect(src).not.toMatch(/created_by_partner_id['"]\s*,\s*[^)]*searchParams/)
  })

  test('genomgångens innehåll lämnar aldrig rutten', () => {
    const select = src.slice(src.indexOf('.select('), src.indexOf(')', src.indexOf('.select(')))
    expect(select).not.toContain('payload')
    // Och svaret bygger inte in raden rått, där payload hade följt med.
    const svar = src.slice(src.indexOf('const genomgangar'), src.indexOf('return NextResponse.json(\n      { genomgangar'))
    expect(svar).not.toMatch(/\.\.\.rad/)
  })

  test('länken följer bara med när läget säger att den leder någonstans', () => {
    expect(src).toContain('url: lage.kanDelas ? byggCaseLank(rad.token) : null')
    // Läget härleds av caseLage, inte av egna villkor i rutten.
    expect(src).toContain('caseLage(rad, nu)')
    expect(src).not.toMatch(/expires_at\s*[<>]/)
  })

  test('force-dynamic — rutten läser cookies via en helper', () => {
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })
})

test.describe('Portalen visar rutten, inte sin egen sanning', () => {
  const src = read('app/partners/dashboard/components/MinaGenomgangar.tsx')

  test('sektionen är monterad i partnerdashboarden', () => {
    const sida = read('app/partners/dashboard/page.tsx')
    expect(sida).toContain('<MinaGenomgangar />')
    expect(sida).toContain("import MinaGenomgangar from './components/MinaGenomgangar'")
  })

  test('rubriken kommer från rutten — komponenten hittar inte på läget', () => {
    expect(src).toContain('{g.rubrik}')
    // Ingen egen ordlista per läge. Färg får komponenten välja; orden bor i
    // lib/sales/case-lage.ts och får inte finnas i två versioner.
    for (const ord of ['Kunden startade sitt konto', 'Länken har gått ut', 'Väntar på att kunden']) {
      expect(src, `komponenten har en egen kopia av "${ord}"`).not.toContain(ord)
    }
    // FARG-kartan innehåller bara klassnamn, aldrig text.
    const farg = src.slice(src.indexOf('const FARG'), src.indexOf('}', src.indexOf('const FARG')))
    for (const varde of Array.from(farg.matchAll(/:\s*'([^']+)'/g)).map(m => m[1])) {
      expect(varde, `FARG bär något som inte är klassnamn: ${varde}`).toMatch(/^bg-[\w-]+( text-[\w-]+)?$/)
    }
  })

  test('dela-knapparna finns bara när rutten skickade en länk', () => {
    const block = src.slice(src.indexOf('{g.url && ('), src.indexOf('</li>'))
    expect(block).toContain('Kopiera kundens länk')
    expect(block).toContain('min-h-[44px]')
    // Aldrig ett fallback-url som gissar sig till länken.
    expect(src).not.toMatch(/g\.url\s*\|\|/)
  })

  test('tomma läget pekar på genomgången i stället för att bara vara tomt', () => {
    const tomt = src.slice(src.indexOf('data?.length === 0'), src.indexOf('data && data.length > 0'))
    expect(tomt).toContain('/partners/material/genomgang')
  })

  test('kontostart utlovar ingen provision', () => {
    expect(src).toContain('inte samma sak som utbetald provision')
  })
})

test.describe('Leaden lämnar över till genomgången', () => {
  const src = read('app/partners/dashboard/components/AssignedLeads.tsx')

  test('länken bär orgnummer och kontakt ur leaden', () => {
    const fn = src.slice(src.indexOf('function genomgangsLank'), src.indexOf('function local'))
    expect(fn).toContain("q.set('org', snapshot.org_number)")
    expect(fn).toContain("q.set('kontakt', snapshot.contact_name)")
    expect(fn).toContain("q.set('epost', snapshot.contact_email)")
    expect(fn).toContain('/partners/material/genomgang')
    // Tomma värden ska inte bli tomma parametrar.
    expect(fn).toMatch(/if \(snapshot\.org_number\)/)
  })

  test('erbjuds bara på leads som fortfarande är öppna', () => {
    const rad = src.slice(src.indexOf('genomgangsLank(l.snapshot)') - 200, src.indexOf('genomgangsLank(l.snapshot)'))
    expect(rad).toContain("!['won','lost','declined','revoked'].includes(l.status)")
  })
})

test.describe('Adressen pekar ut ett företag — den matar inte in ett', () => {
  const generated = read('components/sales/sales-experience.generated.jsx')
  const dc = read('design-sales-experience/SalesExperience.dc.html')

  test('orgnumret i adressen startar samma uppslag som när det skrivs för hand', () => {
    for (const [namn, src] of [['skissen', dc], ['den kompilerade', generated]] as const) {
      expect(src, `${namn} läser inte org ur adressen`).toContain("q.get('org')")
      expect(src, `${namn} startar inte uppslaget`).toContain('this.setState({ org: orgFran }, this.submitLookup)')
      // Minst tio siffror krävs — submitLookup avvisar annars ändå, men en
      // halv inmatning ska inte kasta användaren in i laddsteget.
      expect(src, `${namn} saknar sifferkravet`).toContain('orgFran.length >= 10')
    }
  })

  test('adressen kan inte sätta företaget, bara orgnumret och kontakten', () => {
    const start = generated.indexOf("const q = new URLSearchParams(location.search)")
    expect(start).toBeGreaterThan(-1)
    const gren = generated.slice(start, generated.indexOf('} catch (e) {}', start))
    // Exakt tre fält får komma ur adressen. company kommer ur
    // Bolagsverket-svaret, aldrig ur en länk någon kan skriva själv.
    const satta = Array.from(gren.matchAll(/this\.setState\(\{([^}]*)\}/g)).map(m => m[1])
    expect(satta.length).toBeGreaterThan(0)
    for (const s of satta) {
      expect(s, `adressen sätter något mer än org/kontakt/epost: ${s}`).toMatch(/^\s*(org: orgFran|caseName: namn, caseEmail: epost)\s*$/)
    }
    expect(gren).not.toContain('company')
    expect(gren).not.toContain('employees')
  })

  test('case-länken och #onboarding-vägen är orörda', () => {
    // Den nya grenen är en ELSE. Skulle den ha lagts före token-grenen hade
    // /case/<token> slutat öppna kundens egen genomgång.
    const iToken = generated.indexOf("if (token) {")
    const iHash = generated.indexOf("location.hash === '#onboarding'")
    const iNy = generated.indexOf("const q = new URLSearchParams(location.search)")
    expect(iToken).toBeGreaterThan(-1)
    expect(iToken).toBeLessThan(iNy)
    expect(iHash).toBeLessThan(iNy)
  })
})
