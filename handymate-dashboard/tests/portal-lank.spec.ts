/**
 * Vakter för PortalLänkKnapp — genvägen till kundportalen från deal- och
 * projektnivå (2026-08-12). Tidigare gick det bara via kundkortet.
 *
 * Ren källskanning, samma stil som tests/portal-hub.spec.ts.
 *
 *   npx playwright test tests/portal-lank.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('PortalLankKnapp — komponenten', () => {
  const src = read('components/customers/PortalLankKnapp.tsx')

  test('öppnar portalen i ny flik med rel-skydd', () => {
    expect(src).toContain('target="_blank"')
    expect(src).toContain('rel="noopener noreferrer"')
    expect(src).toContain('href={`/portal/${token}`}')
  })

  test('döljer sig helt vid fel eller saknad kund — aldrig en trasig yta', () => {
    // Väntande/dolt läge renderar ingenting
    expect(src).toContain("if (status === 'loading' || status === 'hidden') return null")
    // Klientläsningen är try/catch-skyddad och faller tillbaka till 'hidden'
    const loadFn = src.slice(src.indexOf('async function load'), src.indexOf('async function activate'))
    expect(loadFn).toContain('try {')
    expect(loadFn).toContain("setStatus('hidden')")
    expect(loadFn).toContain('catch {')
  })

  test('ikon-varianten göms helt när portalen inte är aktiverad — ingen aktiveringslogik i kompakta kort', () => {
    const inactiveBlock = src.slice(src.indexOf("status === 'inactive'"), src.indexOf("// status === 'active'"))
    expect(inactiveBlock).toContain("if (variant === 'icon') return null")
  })

  test('aktivering återanvänder befintliga portal-link-API:t — ingen ny endpoint', () => {
    expect(src).toContain('fetch(`/api/customers/${customerId}/portal-link`')
    expect(src).toContain("method: 'POST'")
  })

  test('kopiering visar en riktig toast, inte en tyst lyckad-effekt', () => {
    expect(src).toContain("useToast()")
    expect(src).toContain("toast.success('Länk kopierad')")
  })

  test('portalstatus läses från samma customer-tabell som kundkortet använder', () => {
    expect(src).toContain("from('customer')")
    expect(src).toContain("select('portal_token, portal_enabled')")
  })
})

test.describe('Projektsidan monterar knappen', () => {
  const infoCard = read('components/projects/economy/ProjectInfoCard.tsx')

  test('ProjectInfoCard importerar och renderar PortalLankKnapp i kundsektionen', () => {
    expect(infoCard).toContain("import { PortalLankKnapp } from '@/components/customers/PortalLankKnapp'")
    const kundBlock = infoCard.slice(infoCard.indexOf('{customer && ('), infoCard.indexOf('{quote && ('))
    expect(kundBlock).toContain('<PortalLankKnapp customerId={customer.customer_id}')
  })
})

test.describe('Deal-nivån monterar knappen', () => {
  const card = read('app/dashboard/pipeline/components/DealCard.tsx')
  const modal = read('app/dashboard/pipeline/components/DealModal.tsx')

  test('DealCard (kompakt kort) använder ikon-varianten', () => {
    expect(card).toContain("import { PortalLankKnapp } from '@/components/customers/PortalLankKnapp'")
    expect(card).toContain('<PortalLankKnapp customerId={deal.customer_id} variant="icon" />')
  })

  test('DealModal (detaljvyn) använder den fullständiga chip-varianten bland snabbknapparna', () => {
    expect(modal).toContain("import { PortalLankKnapp } from '@/components/customers/PortalLankKnapp'")
    expect(modal).toContain('<PortalLankKnapp customerId={selectedDeal.customer_id} variant="chip" />')
  })
})
