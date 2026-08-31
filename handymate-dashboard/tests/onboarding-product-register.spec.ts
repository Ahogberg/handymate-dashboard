import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { seedProducts } from '../lib/seed-defaults'
import { getDefaultProducts } from '../lib/product-defaults'

const ROOT = path.resolve(__dirname, '..')
function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// Produktregister-onboarding-planen (2026-08-16) + Prisslingan V2 pass 2
// (2026-08-31): price_list-spåret (seedPriceList/v137-synken) är BORTTAGET —
// tabellen kunde aldrig ta emot en rad (INTEGER-id vs TEXT-inserts) och
// products är nu enda sanningen (lib/products/price-list-view.ts för
// kundvända läsare). Facitet låser seedProducts + onboarding-flödets
// ledningsdragning.

function fakeSeedSupabase() {
  const inserted: Record<string, any[]> = { products: [], price_list: [] }
  return {
    inserted,
    client: {
      from(table: string) {
        const query: any = {
          select() { return query },
          eq() { return query },
          limit() {
            // "Finns redan rader?"-kollen: alltid tomt i det här facitet —
            // vi testar den rena seed-vägen, inte idempotens-grenen.
            return Promise.resolve({ data: [], error: null })
          },
          insert(rows: any[]) {
            inserted[table] = rows
            return Promise.resolve({ data: rows, error: null })
          },
        }
        return query
      },
    } as any,
  }
}

test.describe('seedProducts — deterministisk seed av produktbanken', () => {
  test('id-schemat är prod_{businessId}_{index i getDefaultProducts}', async () => {
    const fake = fakeSeedSupabase()
    const businessId = 'biz_c'
    await seedProducts(fake.client, businessId, 'electrician')

    const all = getDefaultProducts('electrician')
    const firstPriced = all.find(p => p.unit_price > 0)
    expect(firstPriced).toBeTruthy()
    const expectedIndex = all.indexOf(firstPriced!)
    const row = fake.inserted.products.find((r: any) => r.name === firstPriced!.name)
    expect(row.id).toBe(`prod_${businessId}_${expectedIndex}`)
  })

  test('B2: price_list seedas ALDRIG längre (tabellen är död — aldrig en rad)', async () => {
    const fake = fakeSeedSupabase()
    await seedProducts(fake.client, 'biz_b', 'construction')
    expect(fake.inserted.price_list).toEqual([])
    expect(fake.inserted.products.length).toBeGreaterThan(0)
  })
})

test.describe('UX1f — timpriset från steg 3 når seedade timartiklar', () => {
  test('seedProducts med hourlyRate: basen får timpriset, relativa påslag bevaras, prislösa orörda', async () => {
    const fake = fakeSeedSupabase()
    await seedProducts(fake.client, 'biz_rate', 'electrician', 900)

    const byName = new Map(fake.inserted.products.map((p: any) => [p.name, p]))
    // Bas: Elinstallation 550 → 900
    expect(byName.get('Elinstallation')!.sales_price).toBe(900)
    // Felsökning 650 (bas+100) → 1000; Jour 950 (bas+400) → 1300
    expect(byName.get('Felsökning')!.sales_price).toBe(1000)
    expect(byName.get('Jour och akut utryckning')!.sales_price).toBe(1300)
    // Prislös timartikel rörs aldrig
    expect(byName.get('Lärling')!.sales_price).toBe(0)
    // Icke-tim-artikel orörd
    expect(byName.get('Installation vägguttag')!.sales_price).toBe(850)
  })

  test('utan hourlyRate: exakt samma priser som förut (identitet)', async () => {
    const fake = fakeSeedSupabase()
    await seedProducts(fake.client, 'biz_norate', 'electrician')
    const byName = new Map(fake.inserted.products.map((p: any) => [p.name, p]))
    expect(byName.get('Elinstallation')!.sales_price).toBe(550)
  })
})

test.describe('onboarding-flödets ledningsdragning', () => {
  test('TOTAL_STEPS är 8 och StepProductRegister monteras mellan StepImportData och Step6LiveTour', () => {
    const src = source('app/onboarding/page.tsx')
    expect(src).toContain('const TOTAL_STEPS = 8')
    expect(src).toContain("import StepProductRegister from './components/StepProductRegister'")

    const step5Index = src.indexOf('{step === 5 &&')
    const step6Index = src.indexOf('{step === 6 &&')
    const step7Index = src.indexOf('step === 7 && !launchRequested && <Step6LiveTour')
    expect(step5Index).toBeGreaterThan(-1)
    expect(step6Index).toBeGreaterThan(step5Index)
    expect(step7Index).toBeGreaterThan(step6Index)

    const step6Block = src.slice(step6Index, step7Index)
    expect(step6Block).toContain('StepProductRegister')
  })

  test('UX2d: prick-numreringen har EN källa (OB_DOTS/OB_DOT_TOTAL) — inga hårdkodade siffror', () => {
    const files = [
      'app/onboarding/components/Step2Business.tsx',
      'app/onboarding/components/Step3HowYouWork.tsx',
      'app/onboarding/components/Step4PhoneNumber.tsx',
      'app/onboarding/components/Step5Activate.tsx',
      'app/onboarding/components/StepImportData.tsx',
      'app/onboarding/components/StepProductRegister.tsx',
    ]
    for (const f of files) {
      const src = source(f)
      expect(src, `${f} hårdkodar total`).not.toMatch(/total=\{\d+\}/)
      expect(src, `${f} hårdkodar step`).not.toMatch(/OnboardingHeader step=\{\d+\}/)
      expect(src, `${f} använder inte OB_DOT_TOTAL`).toContain('total={OB_DOT_TOTAL}')
    }
    const constants = source('app/onboarding/constants.ts')
    expect(constants).toContain('OB_DOT_TOTAL = 6')
    // Prick-ordningen är unik och stigande — steg-index-fallgropen (CLAUDE.md).
    expect(constants).toMatch(/business: 0[\s\S]*howYouWork: 1[\s\S]*phone: 2[\s\S]*activate: 3[\s\S]*importData: 4[\s\S]*productRegister: 5/)
  })

  test('dashboard-grinden släpper bara in slutförda konton — steg >= 8, aldrig 7 (2026-08-27)', () => {
    // Steg 6 (produktregistret) skriver steg 7 vid "Fortsätt". Med `>= 7`
    // hamnade en användare som öppnade /dashboard från LiveTouren på en
    // dashboard utan seedade defaults och utan startkort.
    const layout = source('app/dashboard/layout.tsx')
    expect(layout).toContain('business.onboarding_step >= 8')
    expect(layout).not.toContain('onboarding_step >= 7')
  })

  test('de döda V2-komponenterna är borta', () => {
    for (const f of [
      'app/onboarding/components/Step1BusinessAccount.tsx',
      'app/onboarding/components/Step3Phone.tsx',
      'app/onboarding/components/StepProgress.tsx',
    ]) {
      expect(fs.existsSync(path.join(ROOT, f)), `${f} finns fortfarande`).toBe(false)
    }
  })
})

test.describe('seed-products-routen (POST /api/onboarding/seed-products)', () => {
  test('gated av samma betalgrind som finalize, seedar bara products (B2: seedPriceList borta)', () => {
    const route = source('app/api/onboarding/seed-products/route.ts')
    expect(route).toContain('isOnboardingPaymentBlocked')
    expect(route).toContain('seedProducts(')
    expect(route).not.toContain('seedPriceList(')
    // Får ALDRIG ANROPA hela seedAllDefaults — bara produktseedningen
    // (kommentarer i filen får gärna NÄMNA seedAllDefaults för kontext).
    expect(route).not.toMatch(/seedAllDefaults\(/)
  })

  test('ett seed-fel ger ok:false, aldrig ett kastat 500 — steget får aldrig krascha onboardingen', () => {
    const route = source('app/api/onboarding/seed-products/route.ts')
    const catchIndex = route.indexOf('catch (error')
    expect(catchIndex).toBeGreaterThan(-1)
    const catchBlock = route.slice(catchIndex)
    expect(catchBlock).toContain('ok: false')
  })

  test('finalize-routen (POST /api/onboarding) delar samma betalgrind-helper', () => {
    const route = source('app/api/onboarding/route.ts')
    expect(route).toContain("import { isOnboardingPaymentBlocked } from '@/lib/onboarding/payment-gate'")
    expect(route).toContain('isOnboardingPaymentBlocked(supabase, business.business_id)')
  })
})

test.describe('B2 — price_list-spåret är dött och får inte återuppstå', () => {
  test('/api/products anropar inte längre syncPriceListRow (filen är borttagen)', () => {
    const route = source('app/api/products/route.ts')
    // Inget ANROP och ingen import — ordet får förekomma i förklarande
    // kommentarer (B2-kommentaren beskriver varför synken togs bort).
    expect(route).not.toMatch(/syncPriceListRow\(/)
    expect(route).not.toMatch(/import .*sync-price-list/)
    expect(fs.existsSync(path.join(ROOT, 'lib/products/sync-price-list.ts'))).toBe(false)
  })

  test('ingen app-/lib-kod läser price_list-tabellen längre', () => {
    // Kundvända läsare går via lib/products/price-list-view.ts (products,
    // sales_price>0). En återinförd from('price_list') vore en regression
    // mot en tabell som aldrig innehållit data.
    const vy = source('lib/products/price-list-view.ts')
    expect(vy).toContain("from('products')")
    expect(vy).toContain(".gt('sales_price', 0)")
  })
})

test.describe('StepProductRegister — återanvänder befintlig UI, bygger ingen ny editor', () => {
  test('importerar ProductEditorModal och ProductCsvImportModal från Settings, definierar ingen egen', () => {
    const stepSrc = source('app/onboarding/components/StepProductRegister.tsx')
    expect(stepSrc).toContain("from '@/app/dashboard/settings/products/components/ProductEditorModal'")
    expect(stepSrc).toContain("from '@/app/dashboard/settings/products/components/ProductCsvImportModal'")
    expect(stepSrc).not.toMatch(/function ProductEditorModal/)
    expect(stepSrc).not.toMatch(/function ProductCsvImportModal/)
  })

  test('CSV-importmodalen wrappas i en lokal ToastProvider (saknas i onboarding-trädet annars)', () => {
    const stepSrc = source('app/onboarding/components/StepProductRegister.tsx')
    const importIndex = stepSrc.indexOf('<ProductCsvImportModal')
    expect(importIndex).toBeGreaterThan(-1)
    const before = stepSrc.slice(0, importIndex)
    expect(before.lastIndexOf('<ToastProvider>')).toBeGreaterThan(-1)
    expect(before.lastIndexOf('<ToastProvider>')).toBeGreaterThan(before.lastIndexOf('</ToastProvider>'))
  })

  test('seedar tidigt vid steg-inträde (POST seed-products), inte bara vid finalize', () => {
    const stepSrc = source('app/onboarding/components/StepProductRegister.tsx')
    expect(stepSrc).toContain("fetch('/api/onboarding/seed-products'")
  })

  test('skip-länken finns och seedning sker ändå (skip anropar bara onNext, blockerar aldrig)', () => {
    const stepSrc = source('app/onboarding/components/StepProductRegister.tsx')
    expect(stepSrc).toContain('obi-skiplink')
    expect(stepSrc).toMatch(/obi-skiplink[\s\S]{0,80}onClick=\{onNext\}/)
  })
})
