/**
 * Facit för Materialbeställningar-sidans strukturlyft mot Command
 * Center-språket (Etapp L2b2, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/bookings-page-design.spec.ts), inte ett
 * DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/orders-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/orders/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Materialbeställningar — strukturlyft', () => {
  test('de fyra fåfänga statplattorna (Totalt/Beställda/Levererade/kr totalt) är borta', () => {
    expect(source).not.toContain('const stats = {')
    expect(source).not.toContain('>Totalt</p>')
    expect(source).not.toContain('>Beställda</p>')
    expect(source).not.toContain('>Levererade</p>')
    expect(source).not.toContain('>kr totalt</p>')
  })

  test('ny chip-rad härledd ur samma redan hämtade `orders`-lista — ingen ny fetch', () => {
    expect(source).toContain('const pendingDeliveries = orders.filter(o => o.status === \'ordered\')')
    expect(source).toContain('const pendingValue = pendingDeliveries.reduce(')
    expect(source).toContain('väntar leverans')
    expect(source).toContain('kr på väg')
    expect(source).toContain('Inget beställt just nu')
    // Baslinjen är fyra /api/orders-anrop (list/send/put/delete) — reskinnet
    // lägger inte till en femte.
    const fetchCalls = source.match(/fetch\(`?'?\/api\/orders/g) || []
    expect(fetchCalls.length).toBe(4)
  })

  test('ingen hover:text-white kvar (osynlig text på vit botten i filterknapparna)', () => {
    expect(source).not.toContain('hover:text-white')
  })

  test('det varma tomt-state-uttrycket finns — inte längre "Inga beställningar hittades"', () => {
    expect(source).not.toContain('Inga beställningar hittades')
    expect(source).toContain('Inga beställningar än')
  })

  test('rounded-card och font-heading används — fanns inte innan', () => {
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBeGreaterThanOrEqual(3)
    const fontHeading = source.match(/font-heading/g) || []
    expect(fontHeading.length).toBeGreaterThanOrEqual(3)
  })

  test('min-h-[44px] finns på handlingsknapparna (mobil tumzon)', () => {
    const matches = source.match(/min-h-\[44px\]/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(6)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain('onClick={() => handleSend(order.order_id)}')
    expect(source).toContain('onClick={() => handleDelete(order.order_id)}')
    expect(source).toContain('onClick={() => handleMarkDelivered(order.order_id)}')
    expect(source).toContain('onClick={() => setFilter(f.id as typeof filter)}')
    expect(source).toContain('onChange={(e) => setSearchTerm(e.target.value)}')
  })

  test('datakällan (fetchOrders mot /api/orders) och filtreringslogiken är oförändrad', () => {
    expect(source).toContain('fetch(`/api/orders?businessId=${business.business_id}`)')
    expect(source).toContain('const matchesFilter = filter === \'all\' || order.status === filter')
    expect(source).not.toMatch(/orders\s*\.\s*sort\(/)
  })

  test('statusfunktionerna (getStatusStyle/getStatusText) är oförändrade', () => {
    expect(source).toContain("case 'draft': return 'Utkast'")
    expect(source).toContain("case 'pending': return 'Väntar'")
    expect(source).toContain("case 'ordered': return 'Beställd'")
    expect(source).toContain("case 'delivered': return 'Levererad'")
  })

  test('ingen mörk hero läggs till — Materialbeställningar är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
