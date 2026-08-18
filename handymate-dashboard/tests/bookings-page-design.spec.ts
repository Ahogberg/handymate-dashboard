/**
 * Facit för Bokningar-sidans strukturlyft mot Command Center-språket
 * (Etapp L2b1, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/approvals-page-design.spec.ts), inte
 * ett DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/bookings-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/bookings/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Bokningar — strukturlyft', () => {
  test('den råa <table> är borta — bara kommentaren om den gamla tabellen finns kvar', () => {
    expect(source).not.toMatch(/<table[ >]/)
    expect(source).not.toContain('<thead>')
    expect(source).not.toContain('<tbody')
  })

  test('dag-gruppering finns — I dag/I morgon/{datum}, aldrig omsortering', () => {
    expect(source).toContain('function bookingDayLabel')
    expect(source).toContain("return 'I dag'")
    expect(source).toContain("return 'I morgon'")
    // Ordningen kommer från filteredBookings som redan är sorterad
    // (scheduled_start ascending i fetchData) — dag-headern får aldrig
    // sortera om listan själv.
    expect(source).not.toMatch(/filteredBookings\s*\.\s*sort\(/)
    expect(source).not.toMatch(/\[\s*\.\.\.filteredBookings\s*\]\s*\.sort/)
    expect(source).toContain('filteredBookings.map((booking, idx) => {')
  })

  test('ingen hover:text-white kvar (osynlig text på vit botten i filterknapparna)', () => {
    expect(source).not.toContain('hover:text-white')
  })

  test('no-op-hovers borta — tomt-state-länkarna har nu en riktig hover-färg', () => {
    expect(source).not.toContain('text-primary-700 hover:text-primary-700')
  })

  test('rounded-card och font-heading används — fanns inte innan', () => {
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBeGreaterThanOrEqual(4)
    const fontHeading = source.match(/font-heading/g) || []
    expect(fontHeading.length).toBeGreaterThanOrEqual(3)
  })

  test('min-h-[44px] finns på handlingsknapparna (mobil tumzon)', () => {
    const matches = source.match(/min-h-\[44px\]/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(8)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain('onClick={() => setFilter(f)}')
    expect(source).toContain('onClick={openCreateModal}')
    expect(source).toContain('onClick={() => openEditModal(booking)}')
    expect(source).toContain('onClick={() => handleDelete(booking.booking_id)}')
    expect(source).toContain('onClick={handleSubmit}')
    expect(source).toContain('onClick={() => setModalOpen(false)}')
  })

  test('datakällan (fetchData mot supabase booking/customer) är oförändrad', () => {
    expect(source).toContain(".from('booking')")
    expect(source).toContain(".from('customer')")
    expect(source).toContain(".order('scheduled_start', { ascending: true })")
  })

  test('statusfunktionerna (getStatusStyle/getStatusText) är oförändrade', () => {
    expect(source).toContain("case 'confirmed': return 'Bekräftad'")
    expect(source).toContain("case 'completed': return 'Slutförd'")
    expect(source).toContain("case 'cancelled': return 'Avbokad'")
    expect(source).toContain("case 'no_show': return 'Uteblev'")
  })

  test('ingen mörk hero läggs till — Bokningar är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
