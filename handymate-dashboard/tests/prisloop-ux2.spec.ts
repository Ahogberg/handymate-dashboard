/**
 * Facit för UX2 (Prisslingan V2 pass 2): beta-av-vyn + levande nudgar.
 * Källkontrakt — låser att ytorna räknar PRISSATTA (inte totalen) och att
 * saknar-pris-vägen finns kvar hela kedjan nudge → filter → snabbpris.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const source = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('UX2a — beta-av-vyn i Inställningar → Produkter', () => {
  const sida = source('app/dashboard/settings/products/page.tsx')

  test('?filter=saknar-pris aktiverar filtret (nudge-länkarnas kontrakt)', () => {
    expect(sida).toContain("searchParams?.get('filter') === 'saknar-pris'")
  })

  test('filtret räknar aktiva prislösa och läggs OVANPÅ kategorifiltret', () => {
    expect(sida).toContain('antalSaknarPris')
    expect(sida).toContain('!(p.sales_price > 0)')
  })

  test('snabbläget använder delade QuickPriceInput (samma som onboardingen)', () => {
    expect(sida).toContain("from '@/components/products/QuickPriceInput'")
    const onboarding = source('app/onboarding/components/StepProductRegister.tsx')
    expect(onboarding).toContain("from '@/components/products/QuickPriceInput'")
  })
})

test.describe('UX2b — nudgarna räknar prissatta, inte totalen', () => {
  test('oversikt räknar priced/unpriced separat (gt sales_price 0)', () => {
    const oversikt = source('app/dashboard/oversikt/page.tsx')
    expect(oversikt).toContain(".gt('sales_price', 0)")
    expect(oversikt).toContain('setPricedCount')
    expect(oversikt).toContain('setUnpricedCount')
  })

  test('AgentReadinessCard: grönt på pricedCount > 0, länk till saknar-pris-filtret', () => {
    const kort = source('components/dashboard/AgentReadinessCard.tsx')
    expect(kort).toContain('ok: pricedCount > 0')
    expect(kort).toContain('?filter=saknar-pris')
    // Långsvansen är designen: unpricedCount får aldrig krävas vara 0.
    expect(kort).not.toContain('unpricedCount === 0')
  })

  test('OnboardingChecklist matas med prissatta (inte råa totalen)', () => {
    const oversikt = source('app/dashboard/oversikt/page.tsx')
    expect(oversikt).toContain('priceListCount={pricedCount}')
  })
})

test.describe('UX2c — onboardingens "10 vanliga att prissätta nu"', () => {
  const steg = source('app/onboarding/components/StepProductRegister.tsx')

  test('max 10 prislösa arbetsartiklar, seed-ordningen är prioriteten', () => {
    expect(steg).toContain(".slice(0, 10)")
    expect(steg).toContain("p.category === 'arbete'")
  })

  test('steget är fortfarande frivilligt — skip-länken orörd', () => {
    expect(steg).toContain('Hoppa över — jag gör det senare')
  })
})

test.describe('Pass 4 — agentpriskontext + reservationer serverside (UX3/UX5/D3)', () => {
  test('UX3a: intent-agenten och tool-routern använder den delade priskontexten', () => {
    expect(source('lib/matte/intent-agent.ts')).toContain('buildAgentPriceBlock')
    const router = source('app/api/agent/trigger/tool-router.ts')
    expect(router).toContain('fetchPriceContextProducts')
    expect(router).toContain('matchProductByName(bankArtiklar')
    // Priset rörs aldrig av länkningen — bara id/artikelnr sätts
    expect(router).toContain('linked_product_id: bankTraff.id')
  })

  test('UX3b: kö-godkända utkast får reservations_snapshot (fail-soft)', () => {
    const approvals = source('app/api/approvals/[id]/route.ts')
    expect(approvals).toContain('suggestSnapshotForItems')
    expect(approvals).toContain('reservations_snapshot: reservationsSnapshot')
  })

  test('D3: kundprislist-uppslaget har EN serverväg', () => {
    const route = source('app/api/pricing/resolve/route.ts')
    expect(route).toContain('resolveCustomerPriceList')
    expect(route).toContain("dynamic = 'force-dynamic'")
  })

  test('UX5: reservationer seedas för ALLA branscher', () => {
    const seed = source('lib/seed-defaults.ts')
    expect(seed).toContain('seedReservations(supabase, businessId, productBranches)')
    const defaults = source('lib/reservation-defaults.ts')
    expect(defaults).toContain('branch: string | string[]')
  })
})

test.describe('Pass 5 — fakturans artikelväljare + materialpåslaget (UX4/beslut 4)', () => {
  test('UX4a: LineItemEditor monterar InvoiceAddRowCombo och bevarar produktkopplingen', () => {
    const editor = source('components/invoices/LineItemEditor.tsx')
    expect(editor).toContain('InvoiceAddRowCombo')
    expect(editor).toContain('linked_product_id: p.id')
    expect(editor).toContain('labor_amount')
    // ROT/RUT bara när fakturans globala typ matchar produktens flagga
    expect(editor).toContain("rotRutType === 'rot' && !!p.rot_eligible")
  })

  test('UX4a: combon visar "Sätt pris" för prislösa (delade pricing-state-språket)', () => {
    const combo = source('components/invoices/InvoiceAddRowCombo.tsx')
    expect(combo).toContain('priceLabel(p.sales_price')
    expect(combo).toContain("from '@/lib/products/use-product-search'")
  })

  test('useProductSearch bor neutralt — offertens fil är en ren re-export', () => {
    const gammal = source('app/dashboard/quotes/_shared/useProductSearch.ts')
    expect(gammal).toContain("from '@/lib/products/use-product-search'")
    expect(gammal).not.toContain('fetch(')
  })

  test('beslut 4: materialpåslaget resolveras (uttryckligt → kundlista → företag), aldrig hårdkodad 20', () => {
    const route = source('app/api/projects/[id]/materials/route.ts')
    expect(route).toContain('resolveraMaterialPaslag')
    expect(route).toContain('resolveCustomerPriceList')
    expect(route).toContain('pricing_settings')
    // Kodmönstret (inte kommentarer): ingen fallback-kedja som slutar i 20.
    expect(route).not.toMatch(/markup_percent \?\? 20/)
    expect(route).not.toMatch(/existing\.markup_percent \?\? 20/)
    // inget påslag = ärligt: varning, inte tyst nollmarginal
    expect(route).toContain('Inget materialpåslag är satt')
  })
})

test.describe('QuickPriceInput — kontraktet', () => {
  const komponent = source('components/products/QuickPriceInput.tsx')

  test('sparar via PUT /api/products (saveStandardPrice-vägen), aldrig 0', () => {
    expect(komponent).toContain("method: 'PUT'")
    expect(komponent).toContain('sales_price: pris')
    expect(komponent).toContain('if (!(pris > 0)')
  })
})
