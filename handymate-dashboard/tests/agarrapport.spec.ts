/**
 * Facit för ägarrapporten (Spår A1, 2026-08-10) — sanningsnivåerna.
 *
 * Rapporten är garantimodellens retention-argument: "kostat X, bidragit
 * till Y bekräftat". Ett enda tillfälle där uppskattat läcker in i
 * bekräftat, eller där en gissad kostnad står som fakta, och argumentet
 * är förbrukat för alltid. Nivåerna testas hårdare än mappningen.
 *
 *   npx playwright test tests/agarrapport.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggAgarrapport, retentionRad, AGARRAPPORT_METHOD_VERSION } from '../lib/value/agarrapport'
import { byggVardekvitto } from '../lib/value/vardekvitto'
import type { Attribution } from '../lib/value/recovered-revenue'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const attribution = (over: Partial<Attribution> = {}): Attribution => ({
  card_id: 'appr_1',
  approval_type: 'quote_nudge',
  agent: 'daniel',
  event_kind: 'quote_accepted',
  event_id: 'q_1',
  customer_id: 'c_1',
  amount_kr: 18400,
  occurred_at_ms: Date.UTC(2026, 7, 5),
  card_resolved_at_ms: Date.UTC(2026, 7, 1),
  label: 'Offert accepterad: Takbyte',
  ...over,
})

const kvittoMed = (attributions: Attribution[]) =>
  byggVardekvitto({ period: '2026-08', attributions, potentialKr: null })

test.describe('nivåerna blandas aldrig', () => {
  test('uppskattad tid rubbar aldrig bekräftat', () => {
    const rapport = byggAgarrapport({
      kvitto: kvittoMed([attribution()]),
      uppskattat: { adminTimmar: 99, samtalFangade: 40, automatiskaAtgarder: 12 },
      vilandeKr: 250000,
      kostnad: { kr: 5995, planNamn: 'Firman' },
    })
    expect(rapport.bekraftat.kr).toBe(18400)
    expect(rapport.uppskattat?.adminTimmar).toBe(99)
    expect(rapport.vilandeKr).toBe(250000)
  })

  test('ingen kod i modulen adderar nivåerna', () => {
    const s = read('lib/value/agarrapport.ts')
    expect(s).not.toMatch(/bekraftat\.kr\s*\+|vilandeKr\s*\+|adminTimmar\s*\+/)
  })

  test('saknat uppskattat-data är null — aldrig nollor som ser mätta ut', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([]), uppskattat: null, vilandeKr: null, kostnad: null })
    expect(rapport.uppskattat).toBeNull()
    expect(rapport.vilandeKr).toBeNull()
  })

  test('tom månad är ärliga nollor i bekräftat', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([]), uppskattat: null, vilandeKr: 0, kostnad: null })
    expect(rapport.bekraftat.kr).toBe(0)
    expect(rapport.bekraftat.rader).toEqual([])
    expect(rapport.method_version).toBe(AGARRAPPORT_METHOD_VERSION)
  })

  test('rapporten är fryst — den redigeras inte', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([attribution()]), uppskattat: null, vilandeKr: null, kostnad: { kr: 5995, planNamn: null } })
    expect(Object.isFrozen(rapport)).toBe(true)
    expect(Object.isFrozen(rapport.bekraftat)).toBe(true)
    expect(Object.isFrozen(rapport.kostnad)).toBe(true)
  })
})

test.describe('kostnaden och retention-raden — bara vid säker källa', () => {
  test('null-kostnad ger ingen rad, aldrig en gissning', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([attribution()]), uppskattat: null, vilandeKr: null, kostnad: null })
    expect(rapport.kostnad).toBeNull()
    expect(retentionRad(rapport)).toBeNull()
  })

  test('nollpris eller trasigt pris räknas som osäker källa', () => {
    for (const kr of [0, -5, NaN]) {
      const rapport = byggAgarrapport({ kvitto: kvittoMed([]), uppskattat: null, vilandeKr: null, kostnad: { kr, planNamn: 'X' } })
      expect(rapport.kostnad, `pris ${kr} accepterades`).toBeNull()
    }
  })

  test('med bekräftat värde: kostat X — bidragit till Y', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([attribution()]), uppskattat: null, vilandeKr: null, kostnad: { kr: 5995, planNamn: 'Firman' } })
    const rad = retentionRad(rapport)!
    expect(rad).toContain(`${(5995).toLocaleString('sv-SE')} kr`)
    expect(rad).toContain(`${(18400).toLocaleString('sv-SE')} kr bekräftat värde`)
  })

  test('utan bekräftat värde lovas ingen kvot — bara ärlig kostnad', () => {
    const rapport = byggAgarrapport({ kvitto: kvittoMed([]), uppskattat: null, vilandeKr: null, kostnad: { kr: 5995, planNamn: 'Firman' } })
    const rad = retentionRad(rapport)!
    expect(rad).toContain('Bekräftat värde räknas först')
    expect(rad).not.toContain('bidragit')
  })
})

test.describe('rutten och ytan', () => {
  test('rutten är ägargrindad, bara läsning, och kostnaden grindas på B7-fälten', () => {
    const s = read('app/api/value/agarrapport/route.ts')
    expect(s).toContain('isOwnerOrAdmin')
    expect(s).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(/)
    // Kostnaden kräver aktiv prenumeration MED Stripe-koppling — testkonton
    // och comp-konton får aldrig en påhittad kostnadsrad.
    expect(s).toContain("subscription_status === 'active'")
    expect(s).toContain('stripe_subscription_id')
    expect(s).toContain("from('billing_plan')")
  })

  test('blocket bor på Månadsrapporten — ingen ny ekonomiyta', () => {
    expect(read('app/dashboard/monthly-review/page.tsx')).toContain('<AgarrapportBlock />')
    expect(fs.existsSync(path.join(ROOT, 'app/dashboard/vardekvitto')), 'en andra ekonomiyta har smugit in').toBe(false)
  })

  test('vilande läses ur samma källa som Att hämta — ingen andra sanning', () => {
    const block = read('components/value/AgarrapportBlock.tsx')
    expect(block).toContain("fetch('/api/dashboard/pengar')")
    expect(block).toContain('Uppskattat')
    expect(block).toContain('uppskattad administration')
  })
})
