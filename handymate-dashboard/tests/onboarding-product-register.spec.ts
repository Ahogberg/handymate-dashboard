import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { seedProducts, seedPriceList } from '../lib/seed-defaults'
import { getDefaultProducts } from '../lib/product-defaults'

const ROOT = path.resolve(__dirname, '..')
function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// Produktregister-onboarding-planen (2026-08-16): ett nytt, guidat
// granskningssteg i onboardingen + en products→price_list-skriv-igenom-synk
// (sql/v137). Detta facit låser den delen av kontraktet källkod kan
// verifiera utan en riktig databas — dels seedPriceList:s deterministiska
// sku→product_id-härledning (ren funktion av getDefaultProducts, ingen
// DB-fråga behövs), dels att onboarding-flödets ledningsdragning faktiskt
// stämmer.

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

test.describe('seedPriceList — product_id-länken (v137) är en ren, deterministisk härledning', () => {
  test('varje seedad price_list-rad pekar på RÄTT products-rad via sku, utan DB-fråga', async () => {
    const fake = fakeSeedSupabase()
    const businessId = 'biz_test'
    const branch = 'electrician'

    await seedProducts(fake.client, businessId, branch)
    await seedPriceList(fake.client, businessId, branch)

    const products = fake.inserted.products
    const priceListRows = fake.inserted.price_list
    expect(products.length).toBeGreaterThan(0)
    expect(priceListRows.length).toBeGreaterThan(0)

    const productById = new Map(products.map((p: any) => [p.id, p]))
    for (const row of priceListRows) {
      expect(row.product_id, `price_list-raden "${row.name}" saknar product_id`).toBeTruthy()
      const linked = productById.get(row.product_id)
      expect(linked, `product_id ${row.product_id} pekar inte på en seedad products-rad`).toBeTruthy()
      expect(linked.name).toBe(row.name)
      expect(linked.sales_price).toBe(row.unit_price)
    }
  })

  test('alla seedade price_list-rader har ett product_id — ingen lämnas ohängd', async () => {
    const fake = fakeSeedSupabase()
    await seedProducts(fake.client, 'biz_b', 'construction')
    await seedPriceList(fake.client, 'biz_b', 'construction')

    const utanLank = fake.inserted.price_list.filter((r: any) => !r.product_id)
    expect(utanLank.map((r: any) => r.name)).toEqual([])
  })

  test('id-schemat matchar seedProducts exakt: prod_{businessId}_{index i getDefaultProducts}', async () => {
    const fake = fakeSeedSupabase()
    const businessId = 'biz_c'
    await seedProducts(fake.client, businessId, 'electrician')
    await seedPriceList(fake.client, businessId, 'electrician')

    const all = getDefaultProducts('electrician')
    const firstPriced = all.find(p => p.unit_price > 0)
    expect(firstPriced).toBeTruthy()
    const expectedIndex = all.indexOf(firstPriced!)
    const row = fake.inserted.price_list.find((r: any) => r.name === firstPriced!.name)
    expect(row.product_id).toBe(`prod_${businessId}_${expectedIndex}`)
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
    const step7Index = src.indexOf('step === 7 && <Step6LiveTour')
    expect(step5Index).toBeGreaterThan(-1)
    expect(step6Index).toBeGreaterThan(step5Index)
    expect(step7Index).toBeGreaterThan(step6Index)

    const step6Block = src.slice(step6Index, step7Index)
    expect(step6Block).toContain('StepProductRegister')
  })

  test('inga kvarvarande OnboardingHeader total={5} — alla sex ställen bumpade till 6', () => {
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
      expect(src, `${f} har kvar total={5}`).not.toContain('total={5}')
      expect(src, `${f} saknar total={6}`).toContain('total={6}')
    }
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
  test('gated av samma betalgrind som finalize, seedar bara products+price_list', () => {
    const route = source('app/api/onboarding/seed-products/route.ts')
    expect(route).toContain('isOnboardingPaymentBlocked')
    expect(route).toContain('seedProducts(')
    expect(route).toContain('seedPriceList(')
    // Får ALDRIG ANROPA hela seedAllDefaults — bara de två produktrelaterade
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

test.describe('products → price_list-synken (v137)', () => {
  test('PUT och DELETE /api/products anropar syncPriceListRow', () => {
    const route = source('app/api/products/route.ts')
    const putIndex = route.indexOf('export async function PUT')
    const deleteIndex = route.indexOf('export async function DELETE')
    expect(putIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(putIndex)

    const putBlock = route.slice(putIndex, deleteIndex)
    const deleteBlock = route.slice(deleteIndex)
    expect(putBlock).toContain('syncPriceListRow(')
    expect(deleteBlock).toContain('syncPriceListRow(')
  })

  test('PUT skickar en namn-fallback (produkten är redan känd, kan fallbacka); DELETE gör det inte', () => {
    const route = source('app/api/products/route.ts')
    const putIndex = route.indexOf('export async function PUT')
    const deleteIndex = route.indexOf('export async function DELETE')
    const putBlock = route.slice(putIndex, deleteIndex)
    const deleteCall = route.slice(route.indexOf('syncPriceListRow(', deleteIndex))

    expect(putBlock).toMatch(/syncPriceListRow\([\s\S]*?data\.name,\s*\)/)
    // DELETE-anropet ska bara ha fyra argument (ingen femte name-fallback).
    const deleteCallSlice = deleteCall.slice(0, deleteCall.indexOf(')') + 1)
    expect(deleteCallSlice).not.toContain('data.name')
  })

  test('migrationen lägger ett nullable product_id på price_list, ingen backfill av gamla rader', () => {
    const migration = source('sql/v137_price_list_product_link.sql')
    expect(migration).toMatch(/ALTER TABLE price_list ADD COLUMN IF NOT EXISTS product_id/)
    expect(migration).toContain('REFERENCES products(id)')
    expect(migration).not.toMatch(/UPDATE price_list SET product_id/)
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
