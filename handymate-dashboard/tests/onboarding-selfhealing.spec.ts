/**
 * Självläkning av grundarberoendena i onboardingen (Etapp B3, 2026-09-02).
 *
 *   npx playwright test tests/onboarding-selfhealing.spec.ts --project=chromium
 *
 * Två saker krävde tidigare att en grundare gjorde något manuellt per kund:
 *   1. raden i email_inbound_route (lead-adressen) — skapades bara om kunden
 *      själv hittade knappen i Inställningar
 *   2. 46elks-numret — misslyckades både steg 3 och webhooken fanns ingen retry
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { slugifyBusinessName, LEAD_DOMAIN } from '../lib/email/provision-inbound-route'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test.describe('lead-adressen — slugen', () => {
  test('svenska tecken, versaler och skräptecken blir en säker slug', () => {
    expect(slugifyBusinessName('Bee Bygg AB')).toBe('bee-bygg-ab')
    expect(slugifyBusinessName('Åkes Måleri & Söner')).toBe('akes-maleri-soner')
    expect(slugifyBusinessName('  ---  ')).toBe('foretag')
    expect(slugifyBusinessName('!!!')).toBe('foretag')
  })

  test('slugen kapas till 30 tecken utan att sluta på bindestreck', () => {
    const lang = slugifyBusinessName('Ett alldeles orimligt langt foretagsnamn i branschen')
    expect(lang.length).toBeLessThanOrEqual(30)
    expect(lang.endsWith('-')).toBe(false)
  })

  test('domänen är en konstant, inte utspridda literaler', () => {
    expect(LEAD_DOMAIN).toBe('leads.handymate.se')
    const src = kod('lib/email/provision-inbound-route.ts')
    // Adressen byggs bara ur konstanten — inga hårdkodade literaler i koden
    expect(src.match(/'leads\.handymate\.se'/g)?.length).toBe(1)
    expect(src).toContain('@${LEAD_DOMAIN}')
  })
})

test.describe('lead-adressen — provisioneringen', () => {
  test('finalize skapar adressen automatiskt, utan att kunna fälla onboardingen', () => {
    const src = kod('app/api/onboarding/route.ts')
    expect(src).toContain("import { provisionInboundRoute } from '@/lib/email/provision-inbound-route'")
    expect(src).toContain('provisionInboundRoute(supabase, business.business_id')
    expect(src).toContain('icke-blockerande')
    expect(src).toContain('.catch(')
  })

  test('Inställningar-knappen och finalize delar exakt samma funktion', () => {
    const src = kod('app/api/integrations/email-lead/route.ts')
    expect(src).toContain('provisionInboundRoute(')
    // Ingen egen kopia av slug-logiken kvar i rutten
    expect(src).not.toContain('function slugifyBusinessName')
    expect(src).not.toContain('function generateUniqueSlug')
  })

  test('provisioneringen kastar aldrig — saknad tabell är ett svar, inte ett fel', () => {
    const src = kod('lib/email/provision-inbound-route.ts')
    expect(src).toContain("reason: 'table_missing'")
    expect(src).toContain('isMissingTableError')
    expect(src).toContain('catch (err: any)')
    // Idempotent: befintlig rad returneras oförändrad
    expect(src).toContain('created: false')
    // Race på slugen hanteras
    expect(src).toContain("insertError?.code === '23505'")
  })
})

test.describe('46elks-numret — retry-svepet', () => {
  const src = kod('app/api/cron/phone-provision-retry/route.ts')

  test('cron-secret krävs på båda metoderna', () => {
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect((src.match(/if \(!verifyCronSecret\(request\)\)/g) || []).length).toBe(2)
  })

  test('urvalet: klar onboarding, inget nummer, inte pilot — och NULL räknas som inte pilot', () => {
    expect(src).toContain(".not('onboarding_completed_at', 'is', null)")
    expect(src).toContain(".is('assigned_phone_number', null)")
    expect(src).toContain("or('is_pilot.is.null,is_pilot.eq.false')")
    // .neq skulle tappa NULL-raderna — får inte smyga tillbaka
    expect(src).not.toContain(".neq('is_pilot'")
  })

  test('samma idempotenta köpfunktion som webhooken använder', () => {
    expect(src).toContain("await import('@/lib/phone/purchase-number')")
    expect(src).toContain('purchaseAndAssignNumber(supabase, kandidat.business_id)')
  })

  test('larm först efter tre dygn — dag 1–2 löser svepet självt', () => {
    expect(src).toContain('const LARM_EFTER_DAGAR = 3')
    expect(src).toContain('dagarUtanNummer >= LARM_EFTER_DAGAR')
    expect(src).toContain("'telefonnummer_saknas'")
    // Larmet får aldrig fälla svepet
    expect(src).toMatch(/rapporteraTystFel\([\s\S]*?\)\.catch\(/)
  })

  test('ett kraschande köp stoppar inte resten av kontona', () => {
    expect(src).toMatch(/try \{\s*\n\s*resultat = await purchaseAndAssignNumber/)
    expect(src).toContain('resultat = { ok: false, error: String(err) }')
  })

  test('schemat är dagligt och registrerat i vercel.json', () => {
    const vercel = JSON.parse(kod('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
    const rad = vercel.crons.find(c => c.path === '/api/cron/phone-provision-retry')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    expect(rad!.schedule).toBe('42 6 * * *')
    // Ingen annan cron får samma minut
    expect(vercel.crons.filter(c => c.schedule === rad!.schedule).length).toBe(1)
  })
})
