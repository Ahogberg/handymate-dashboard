/**
 * Facit för fakturans leveranssanning (N3, 2026-08-07).
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * `autoInvoiceOnComplete` skapade fakturan direkt med `status: 'sent'` när
 * auto-sändning var påslagen — alltså INNAN sändningen ens försökts. Därefter
 * anropades `/api/invoices/send` med `await fetch(...)` vars svar kastades bort,
 * inuti en tom `catch`.
 *
 * Rutten kräver `getAuthenticatedBusiness`. Anropet är ett serveranrop utan
 * session, så det svarar 401 — **varje gång**. Fältet `_internal_business_id`
 * som skickades med konsumeras inte av rutten; det var en verkningslös lösning
 * på just det problemet.
 *
 * Auto-sändningen har alltså aldrig fungerat, och produkten sa motsatsen: SMS
 * till hantverkaren löd "Faktura X skickad till kund", loggen sa "skickades till
 * kund", och fakturan låg som `sent` i listan. Ingen visste att kunden aldrig
 * fått något.
 *
 * Invarianten som nu gäller: **ett leveransfel får aldrig producera `sent`-status
 * eller "skickad"-copy.**
 *
 * Statisk granskning av källan. Sändvägen kräver session, nätverk och en riktig
 * faktura — den går inte att köra här, men lögnen går att låsa ute.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/invoice-delivery-truth.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const KALLA = fs.readFileSync(path.join(ROOT, 'lib/projects/auto-invoice-on-complete.ts'), 'utf8')

/** Källan utan kommentarer — annars matchar testerna sin egen dokumentation. */
const KOD = KALLA
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(r => !r.trim().startsWith('//'))
  .join('\n')

test.describe('skapandet påstår ingen leverans', () => {
  test('fakturan skapas alltid som utkast', () => {
    // Regressionstestet för `autoSend ? 'sent' : 'draft'`.
    expect(KOD).toContain("const invoiceStatus = 'draft'")
    expect(KOD, 'statusen får inte härledas ur inställningen igen')
      .not.toMatch(/invoiceStatus\s*=\s*autoSend/)
  })

  test('ingen kodväg sätter sent vid skapandet', () => {
    // Ankras på KOD, inte på kommentartext — kommentarerna är bortstrippade.
    const start = KOD.indexOf('createInvoice(supabase')
    // `from('project_change')` duger inte som slutankare — ÄTA HÄMTAS redan
    // före skapandet. Källmarkeringen som följer efteråt är unik (P0-4:
    // själva invoiced-skrivningen bor numera i lib/invoices/mark-sources).
    const slut = KOD.indexOf('markInvoiceSources(')
    expect(start, 'createInvoice-anropet hittades inte').toBeGreaterThan(-1)
    expect(slut, 'ÄTA-blocket hittades inte').toBeGreaterThan(start)
    expect(KOD.slice(start, slut)).not.toContain("'sent'")
  })
})

test.describe('sändningen läses', () => {
  test('svaret plockas upp i stället för att kastas bort', () => {
    expect(KOD).toMatch(/const res = await fetch\(`\$\{appUrl\}\/api\/invoices\/send`/)
    expect(KOD).toContain('levererad = res.ok')
  })

  test('det verkningslösa auth-fältet är borta', () => {
    // Rutten konsumerar det inte. Att skicka med det gav ett falskt intryck av
    // att server-till-server-anropet var löst.
    expect(KOD).not.toContain('_internal_business_id')
  })

  test('ingen tom catch sväljer felet', () => {
    const start = KOD.indexOf('/api/invoices/send')
    const slut = KOD.indexOf('config?.personal_phone')
    expect(start, 'sändanropet hittades inte').toBeGreaterThan(-1)
    expect(slut, 'SMS-blocket hittades inte').toBeGreaterThan(start)
    const sandBlock = KOD.slice(start, slut)
    expect(sandBlock, 'sändfel måste loggas').toContain('console.error')
    expect(sandBlock, 'tom catch är tillbaka').not.toMatch(/catch\s*\{\s*\}/)
  })
})

test.describe('ingenting säger skickad utan att det är sant', () => {
  test('SMS-texten grenar på leveransen, inte på inställningen', () => {
    // Tidigare: `if (autoSend)` → "skickad till kund". Nu måste det vara
    // utfallet som avgör.
    expect(KOD).toContain('if (levererad) {')
    expect(KOD, 'SMS:et får inte grena på autoSend igen')
      .not.toMatch(/let smsMessage[\s\S]{0,80}if \(autoSend\) \{/)
  })

  test('det finns en ärlig text för misslyckad sändning', () => {
    expect(KOD).toContain('kunde inte skickas automatiskt')
  })

  test('aktivitetsloggen speglar utfallet', () => {
    expect(KOD).toMatch(/\$\{levererad \? ' och skickades till kund' : ' \(utkast\)'\}/)
    expect(KOD).toContain('auto_sent: levererad')
  })

  test('returvärdet rapporterar det faktiska sluttillståndet', () => {
    expect(KOD).toMatch(/status: \(levererad \? 'sent' : 'draft'\)/)
  })
})

test.describe('pengarna hamnar inte i limbo', () => {
  test('granskningskort skapas när fakturan förblir utkast', () => {
    // Villkoret var `!autoSend`. Misslyckades sändningen blev fakturan ett
    // utkast som ingen fick ett kort om — pengar som väntar utan att någon vet.
    expect(KOD).toContain('if (!levererad) {')
    expect(KOD).not.toContain('if (!autoSend) {')
  })

  test('kortets text skiljer misslyckad sändning från avstängd', () => {
    expect(KOD).toContain('men kunde inte skickas')
  })
})

test.describe('sändrutten läser Resends svar (fynd av Codex 2026-08-08)', () => {
  // Resend-SDK:n kastar INTE vid HTTP-fel — den returnerar { data, error }.
  // Rutten kastade bort svaret och satte results.email = true villkorslöst:
  // en avvisad sändning blev "skickad" och fakturan fick status sent utan
  // att något nått kunden. Samma felklass som auto-fakturans 401, fast i
  // den manuella sändvägen.
  const RUTT = fs.readFileSync(path.join(ROOT, 'app/api/invoices/send/route.ts'), 'utf8')

  test('returvärdet fångas och felet grenas', () => {
    expect(RUTT).toContain('const emailRes = await resend.emails.send')
    expect(RUTT).toContain('if (emailRes.error)')
  })

  test('email markeras bara skickad när Resend inte avvisat', () => {
    // results.email = true får bara finnas i else-grenen efter felkontrollen.
    const i = RUTT.indexOf('if (emailRes.error)')
    const j = RUTT.indexOf('results.email = true')
    expect(i).toBeGreaterThan(-1)
    expect(j, 'results.email sätts före felkontrollen').toBeGreaterThan(i)
  })

  test('status sent grindas på faktiskt utfall', () => {
    expect(RUTT).toContain('if (results.email || results.sms)')
  })
})
