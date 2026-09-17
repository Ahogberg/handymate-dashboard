/**
 * Garantins facit (2026-09-17) — kundytorna får formulera nyttan olika men
 * aldrig bära egen garantitext.
 *
 * ═══ VARFÖR ═══
 *
 * Inventeringen (docs/gtm/garantin-inventering-2026-09-17.md) hittade fem
 * formuleringar på elva ytor: "pengarna tillbaka, inga frågor",
 * "resultatgaranti", "minst 5 kundkontakter", "om garantin inte infrias" och
 * heroutkastets användningsgaranti. Fakturasidan lovade villkorslöst medan
 * betalsteget lovade ett villkor som "inga frågor" på nästa rad upphävde.
 * Och tests/founders-offer.spec.ts låste fast ordet "resultatgaranti" i EN
 * yta — ett prov som garanterade att två ytor sa olika saker.
 *
 * Samma idiom som tests/pricing-truth.spec.ts: EN källa (getGuaranteeFacts i
 * lib/feature-gates.ts), och varje kundyta måste läsa därifrån. Källtext
 * prövas UTAN kommentarer — ett prov som spricker på ett filhuvud vaktar
 * prosa, inte beteende (lärdom 2026-09-17, tests/launch-visibility.spec.ts).
 *
 * Körs: npx playwright test tests/guarantee-truth.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  FOUNDERS_GUARANTEE_DAYS,
  GUARANTEE_MODEL,
  STANDARD_GUARANTEE_DAYS,
  USAGE_GUARANTEE_DECISION_DAYS,
  getFoundersBannerBody,
  getGuaranteeFacts,
} from '../lib/feature-gates'
import { ADOPTION_FONSTER_DAGAR, ADOPTION_TROSKEL, YTA_NYCKLAR } from '../lib/admin/adoption'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar kommentarer — provet ska vakta vad kunden ser, inte förklaringar i koden. */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
}

test.describe('en kanonisk garantisanning', () => {
  test('modellen är den publicerade tills §10 i heroutkastet är uppfyllt', () => {
    // Bytet till 'usage' är ett Andreas-beslut efter juridisk genomläsning —
    // texterna blir avtalsvillkor i samma stund de publiceras. Ändras den här
    // raden ska det vara medvetet, och då uppdateras provet i samma pass.
    expect(GUARANTEE_MODEL).toBe('money_back')
  })

  test('pengarna-tillbaka: två nivåer, villkorslös, exakt text', () => {
    const standard = getGuaranteeFacts(false)
    const founders = getGuaranteeFacts(true)
    expect(standard.days).toBe(STANDARD_GUARANTEE_DAYS)
    expect(founders.days).toBe(FOUNDERS_GUARANTEE_DAYS)
    for (const g of [standard, founders]) {
      expect(g.model).toBe('money_back')
      expect(g.condition).toBeNull()
      expect(g.refund).toBe('period')
      expect(g.headline).toBe(`${g.days} dagars pengarna-tillbaka-garanti`)
      expect(g.body).toBe('Är du inte nöjd får du pengarna tillbaka. Inga frågor. Gäller även årsavtal.')
    }
  })

  test('användningsgarantins siffror är adoptionsmåttets — aldrig egna', () => {
    // Villkoret får inte hänvisa till ett mått som räknas annorlunda än det
    // annonseras. Fyra av åtta på trettio dagar ÄR lib/admin/adoption.ts.
    expect(ADOPTION_TROSKEL).toBe(4)
    expect(YTA_NYCKLAR.length).toBe(8)
    expect(ADOPTION_FONSTER_DAGAR).toBe(30)
    expect(USAGE_GUARANTEE_DECISION_DAYS).toBe(90)
    // Texten i källan citerar exakt de talen (kontrolleras även när modellen
    // är money_back, så bytet inte överraskar).
    const src = read('lib/feature-gates.ts')
    expect(src).toContain('Använd Handymate på ${surfaces} av ${of} ytor under dina första ${windowDays} dagar.')
    expect(src).toContain("interval === 'yearly' ? 'hela året tillbaka'")
    expect(src).toContain("interval === 'monthly' ? 'tillbaka det du betalat'")
    expect(src).toContain('så får du ${aterbetalning}. Du behåller all data, och vi hjälper dig exportera den.')
  })

  test('grundarbannern citerar garantin, hittar inte på en egen', () => {
    const banner = getFoundersBannerBody()
    expect(banner).toContain('ditt pris låses för alltid')
    expect(banner).toContain(getGuaranteeFacts(true).headline)
    expect(banner).toContain('direktlinje till grundaren under hela första året')
  })

  test('min-garanti-rutten räknar beslutsfönstret från samma konstant', () => {
    const s = utanKommentarer(read('app/api/min-garanti/route.ts'))
    expect(s).toContain('USAGE_GUARANTEE_DECISION_DAYS')
    expect(s).not.toMatch(/BESLUTSFONSTER_DAGAR\s*=\s*\d+/)
  })
})

test.describe('kundytorna läser garantin, bär den inte', () => {
  const ytorSomVisarGarantin = [
    'app/onboarding/components/Step5Activate.tsx',
    'app/dashboard/settings/billing/page.tsx',
    'app/partners/material/partnerdeck/page.tsx',
    'app/partners/material/demo-manus/page.tsx',
  ]

  for (const file of ytorSomVisarGarantin) {
    test(`${file} anropar getGuaranteeFacts`, () => {
      expect(utanKommentarer(read(file))).toContain('getGuaranteeFacts(')
    })
  }

  // Ytor som hänvisar till köpflödet i stället för att upprepa garantin —
  // rätt mönster, och de får inte glida tillbaka till egen text.
  const ytorSomHanvisar = [
    'app/jamfor/page.tsx',
    'app/api/onboarding/chat/route.ts',
  ]

  const egenGarantitext: Array<[RegExp, string]> = [
    [/\d+\s*dagars pengarna-tillbaka/i, 'egna dagar + pengarna-tillbaka'],
    [/\d+-dagars/i, 'egna "N-dagars"'],
    [/resultatgaranti/i, 'resultatgaranti'],
    [/kundkontakter/i, 'minst N kundkontakter'],
    [/Inga frågor/, 'Inga frågor'],
    [/garantin inte infrias/i, 'om garantin inte infrias'],
    [/standardgarantin är/i, 'standardgarantin är N dagar'],
    [/FOUNDERS_GUARANTEE_DAYS\}\s*dagars/, 'egen interpolering av dagarna'],
    [/STANDARD_GUARANTEE_DAYS\}\s*dagars/, 'egen interpolering av dagarna'],
  ]

  for (const file of [...ytorSomVisarGarantin, ...ytorSomHanvisar]) {
    test(`${file} bär ingen egen garantitext`, () => {
      const s = utanKommentarer(read(file))
      for (const [re, namn] of egenGarantitext) {
        expect(s, `${file} bär "${namn}" — ska läsa getGuaranteeFacts()`).not.toMatch(re)
      }
    })
  }
})

test.describe('grundarstämpeln — vem som fick livstidspriset skrivs ned', () => {
  test('båda checkout-skaparna avgör grundarstatus vid sessionsskapandet', () => {
    for (const file of ['app/api/billing/onboarding-checkout/route.ts', 'app/api/billing/checkout/route.ts']) {
      const s = utanKommentarer(read(file))
      expect(s, file).toContain('isFoundersOfferAvailable(supabase)')
      // I BÅDA metadata-blocken — sessionens och prenumerationens.
      expect((s.match(/founders: foundersAtCheckout \? 'true' : 'false'/g) || []).length, file).toBe(2)
    }
  })

  test('den delade skrivningen stämplar en gång och blockerar aldrig aktiveringen', () => {
    const s = utanKommentarer(read('lib/billing/write-billing-update.ts'))
    expect(s).toContain("metadata?.founders !== 'true'")
    expect(s).toContain(".is('founding_at', null)")
    // Icke-blockerande: varnar, kastar inte.
    const idx = s.indexOf(".is('founding_at', null)")
    expect(s.slice(idx, idx + 300)).toContain('console.warn')
    expect(s.slice(idx, idx + 300)).not.toContain('throw')
  })

  test('verifieringsvägen stämplar ur sessionen, webhooken ur prenumerationen', () => {
    // Två vägar in efter en checkout. Verify-rutten (onboardingens egen) har
    // sessionen; webhooken skriver kontots status i updateSubscriptionData
    // och har bara prenumerationen. Därför `founders` i BÅDA metadata-blocken
    // hos checkout-skaparna, och samma hjälpare på båda ställena.
    const verify = utanKommentarer(read('app/api/billing/onboarding-checkout/verify/route.ts'))
    expect(verify).toContain('const { critical, period, founding } = await byggAbonnemangsfalt(')
    expect(verify).toContain('critical, period, founding)')
    const webhook = utanKommentarer(read('app/api/billing/webhook/route.ts'))
    expect(webhook).toContain('byggGrundarstampel(subscription.metadata)')
    const delad = utanKommentarer(read('lib/billing/write-billing-update.ts'))
    expect(delad).toContain('founding: byggGrundarstampel(session.metadata)')
  })

  test('migrationen finns och är idempotent', () => {
    const s = read('sql/v239_founding_customer.sql')
    for (const col of ['founding_at', 'founding_plan', 'founding_interval', 'founding_price_sek']) {
      expect(s).toContain(`ADD COLUMN IF NOT EXISTS ${col}`)
    }
  })
})
