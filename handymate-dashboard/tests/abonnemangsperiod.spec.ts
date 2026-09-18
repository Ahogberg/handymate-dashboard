/**
 * Facit för prenumerationsperioden och årsförnyelsepåminnelsen (2026-09-18).
 *
 * ═══ BUGGEN SOM FÅTT DET HÄR PASSET ATT FINNAS ═══
 *
 * Koden läste `(subscription as any).current_period_start/end`. I stripe v20
 * (API 2026-01-28.clover) finns de fälten inte på prenumerationsroten — de
 * ligger på varje SubscriptionItem. Casten tystade typfelet, uttrycket blev
 * undefined, och den icke-blockerande skrivningen skrev tyst ingenting.
 *
 * Följden: business_config.billing_period_start/end var null för ALLA konton.
 * Det tog bort underlaget för /api/billing/usage, för fakturasidans
 * förnyelserad, och för varje påminnelse om att ett årsabonnemang på
 * 59 950 kr är på väg att dras.
 *
 * Provet vaktar därför tre saker:
 *   1. Perioden läses från posterna, inte från roten.
 *   2. Intervallet härleds ur periodens längd (det lagras inte någonstans).
 *   3. Påminnelsen kan inte skicka två gånger, och skickar bara för årsplan.
 *
 * Körs: npx playwright test tests/abonnemangsperiod.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { laesAbonnemangsperiod, harledIntervall } from '../lib/billing/write-billing-update'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1')

const SEK = 1_726_000_000
const MANAD = 30 * 86_400
const AR = 365 * 86_400

function abonnemang(post: Record<string, unknown> | null, rot: Record<string, unknown> = {}) {
  return { items: post ? { data: [post] } : { data: [] }, ...rot } as any
}

test.describe('perioden läses där Stripe faktiskt lägger den', () => {
  test('från prenumerationens poster', () => {
    const p = laesAbonnemangsperiod(abonnemang({
      current_period_start: SEK,
      current_period_end: SEK + AR,
    }))
    expect(p?.start).toBe(new Date(SEK * 1000).toISOString())
    expect(p?.end).toBe(new Date((SEK + AR) * 1000).toISOString())
  })

  test('roten används som reserv för äldre API-versioner', () => {
    const p = laesAbonnemangsperiod(abonnemang(null, {
      current_period_start: SEK,
      current_period_end: SEK + MANAD,
    }))
    expect(p?.end).toBe(new Date((SEK + MANAD) * 1000).toISOString())
  })

  test('posterna vinner över roten när båda finns', () => {
    const p = laesAbonnemangsperiod(abonnemang(
      { current_period_start: SEK, current_period_end: SEK + AR },
      { current_period_start: 1, current_period_end: 2 },
    ))
    expect(p?.end).toBe(new Date((SEK + AR) * 1000).toISOString())
  })

  test('utan period alls: undefined, aldrig ett påhittat datum', () => {
    expect(laesAbonnemangsperiod(abonnemang(null))).toBeUndefined()
    expect(laesAbonnemangsperiod(abonnemang({ current_period_start: undefined, current_period_end: undefined })))
      .toBeUndefined()
  })

  test('ingen kod läser current_period_* från roten längre', () => {
    // Det var den här raden som var buggen. Hjälparen är enda stället som
    // får röra fälten, och den läser posterna först.
    for (const fil of ['app/api/billing/webhook/route.ts', 'app/api/billing/onboarding-checkout/verify/route.ts']) {
      expect(utanKommentarer(read(fil)), fil).not.toContain('current_period')
    }
    const hjalpare = utanKommentarer(read('lib/billing/write-billing-update.ts'))
    expect(hjalpare).toContain('subscription.items?.data?.[0]')
  })
})

test.describe('intervallet härleds ur periodens längd', () => {
  test('årsplan och månadsplan skiljs entydigt', () => {
    const iso = (s: number) => new Date(s * 1000).toISOString()
    expect(harledIntervall({ start: iso(SEK), end: iso(SEK + AR) })).toBe('yearly')
    expect(harledIntervall({ start: iso(SEK), end: iso(SEK + MANAD) })).toBe('monthly')
    // 28-dagarsmånad och skottår ligger båda långt från tröskeln 45 dygn.
    expect(harledIntervall({ start: iso(SEK), end: iso(SEK + 28 * 86_400) })).toBe('monthly')
    expect(harledIntervall({ start: iso(SEK), end: iso(SEK + 366 * 86_400) })).toBe('yearly')
  })

  test('ofullständig eller orimlig period ger null, aldrig en gissning', () => {
    expect(harledIntervall(undefined)).toBeNull()
    expect(harledIntervall({ start: null, end: '2026-01-01T00:00:00Z' })).toBeNull()
    expect(harledIntervall({ start: '2026-01-01T00:00:00Z', end: null })).toBeNull()
    expect(harledIntervall({ start: 'skräp', end: 'skräp' })).toBeNull()
    // Slutet före starten är trasig data, inte en månadsplan.
    expect(harledIntervall({ start: '2026-02-01T00:00:00Z', end: '2026-01-01T00:00:00Z' })).toBeNull()
  })
})

test.describe('årsförnyelsepåminnelsen', () => {
  const CRON = 'app/api/cron/arsforyelse-paminnelse/route.ts'

  test('bara årsplaner, aldrig demo- eller testkonton', () => {
    const s = utanKommentarer(read(CRON))
    expect(s).toContain("if (intervall !== 'yearly') continue")
    expect(s).toContain('konto.is_demo_tenant === true) continue')
    expect(s).toContain('arTestNamn(konto.business_name')
  })

  test('kan inte skicka två gånger — deterministiskt kvitto före utskick', () => {
    const s = utanKommentarer(read(CRON))
    expect(s).toContain('const kvittoNyckel = `arsforyelse_${konto.business_id}_${')
    // Kollen sker FÖRE sendEmail.
    const kollIdx = s.indexOf('redanSkickat')
    const skickIdx = s.indexOf('await sendEmail')
    expect(kollIdx).toBeGreaterThan(-1)
    expect(kollIdx).toBeLessThan(skickIdx)
  })

  test('kvittot skrivs bara när utskicket lyckades', () => {
    // Skrivs det ändå blir en misslyckad påminnelse permanent osänd.
    const s = utanKommentarer(read(CRON))
    const idx = s.indexOf('if (resultat.success)')
    expect(idx).toBeGreaterThan(-1)
    expect(s.slice(idx, idx + 400)).toContain("event_type: 'yearly_renewal_reminder_sent'")
  })

  test('hoppar över konton utan förnyelsedatum i stället för att gissa', () => {
    const s = utanKommentarer(read(CRON))
    expect(s).toContain(".not('billing_period_end', 'is', null)")
  })

  test('registrerad som daglig cron', () => {
    const v = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
    const cron = v.crons.find(c => c.path === '/api/cron/arsforyelse-paminnelse')
    expect(cron, 'cronen saknas i vercel.json').toBeTruthy()
    // Fönstret är ett dygn brett och förutsätter exakt en körning per dygn.
    expect(cron!.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })

  test('uppsägningsvägen i mejlet kommer från den kanoniska källan', () => {
    const s = utanKommentarer(read(CRON))
    expect(s).toContain("getCancellationFacts('yearly')")
    expect(s).not.toMatch(/Inställningar → Fakturering → Hantera prenumeration/)
  })
})

test.describe('backfyllnaden', () => {
  const RUTT = 'app/api/admin/billing-resync/route.ts'

  test('adminbehörighet och samma skrivväg som webhooken', () => {
    const s = utanKommentarer(read(RUTT))
    expect(s).toContain('isAdmin(request)')
    expect(s).toContain('writeBillingUpdate(')
    expect(s).toContain('laesAbonnemangsperiod(subscription)')
  })

  test('rör aldrig grundarstämpeln', () => {
    // Den sätts vid köptillfället och får inte kunna återuppstå vid omläsning.
    const s = utanKommentarer(read(RUTT))
    expect(s).not.toContain('byggGrundarstampel')
    expect(s).not.toContain('founding_at')
  })

  test('ett trasigt konto stoppar inte svepet', () => {
    const s = utanKommentarer(read(RUTT))
    expect(s).toContain('catch (err: any)')
  })
})
