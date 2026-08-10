/**
 * Facit + källskanningar för testdata-filtret (Tur 4 etapp 1).
 *
 * Debug-flödena (e2e-quote, e2e-invoice) skriver riktiga rader — det är
 * poängen med dem — men raderna nådde hemskärmen som om de vore riktiga
 * kunder och riktiga pengar (ägarens skärmdump 2026-08-10).
 *
 * Två saker låses här:
 * 1. FACIT — predikaten i lib/testdata.ts fångar producentmönstren och
 *    friar riktiga svenska namn ("Protestera Bygg AB", "Attesterad tid").
 * 2. KÄLLSKANNINGAR åt båda håll — läsvägarna anropar filtret, OCH
 *    producenternas mönster matchas fortfarande av predikatet. Byter någon
 *    prefix i e2e-flödet blir den här specen röd, inte hemskärmen smutsig.
 *
 *   npx playwright test tests/testdata-filter.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { arTestId, arTestNamn, arTestdataApproval, arTestdataObservation } from '../lib/testdata'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('facit: arTestId — prefix, inte innehåll', () => {
  test('producenternas id-prefix fångas', () => {
    expect(arTestId('test_1723190000000')).toBe(true)
    expect(arTestId('e2e_1723190000000')).toBe(true)
    expect(arTestId('e2e_inv_1723190000000')).toBe(true)
    expect(arTestId('test_project_001')).toBe(true)
    expect(arTestId('test_customer_001')).toBe(true)
  })

  test('riktiga id:n frias — även när ordet förekommer INUTI', () => {
    // 'latest_x' innehåller 'test_' men BÖRJAR inte med det.
    expect(arTestId('latest_x')).toBe(false)
    expect(arTestId('appr_1723190000000_abc')).toBe(false)
    expect(arTestId('proj_e2e_lookalike')).toBe(false)
    expect(arTestId('inv_2026_001')).toBe(false)
  })

  test('icke-strängar failar stängt till false', () => {
    expect(arTestId(null)).toBe(false)
    expect(arTestId(undefined)).toBe(false)
    expect(arTestId(12345)).toBe(false)
    expect(arTestId('')).toBe(false)
  })
})

test.describe('facit: arTestNamn — versalkänsligt med flit', () => {
  test('testnamnen fångas', () => {
    expect(arTestNamn('E2E Testkund')).toBe(true)
    expect(arTestNamn('Testkund Eriksson')).toBe(true)
    expect(arTestNamn('E2E Test — Badrumsrenovering')).toBe(true)
    expect(arTestNamn('Arbete — E2E-test installation')).toBe(true)
  })

  test('riktiga svenska namn frias — gement "test" matchas aldrig', () => {
    expect(arTestNamn('Protestera Bygg AB')).toBe(false)
    expect(arTestNamn('Attesterad tid')).toBe(false)
    expect(arTestNamn('Badrum Andersson')).toBe(false)
    expect(arTestNamn('testkund')).toBe(false)
  })

  test('icke-strängar failar stängt till false', () => {
    expect(arTestNamn(null)).toBe(false)
    expect(arTestNamn(undefined)).toBe(false)
    expect(arTestNamn(42)).toBe(false)
  })
})

test.describe('facit: arTestdataApproval', () => {
  const riktigt = {
    title: 'Skicka påminnelse för faktura 2026-014',
    description: 'Faktura 2026-014 på 3 813 kr är 9 dagar försenad.',
    payload: { invoice_id: 'inv_2026_014', customer_name: 'Eva Lindqvist' },
  }

  test('fångar via titel, beskrivning, payload-namn och payload-id', () => {
    expect(arTestdataApproval({ ...riktigt, title: 'E2E Test — Badrumsrenovering' })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, description: 'Offerten "E2E Test" går ut' })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { customer_name: 'Testkund Eriksson' } })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { project_name: 'E2E Testprojekt' } })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { invoice_id: 'e2e_inv_17231' } })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { customer_id: 'test_17231' } })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { quote_id: 'e2e_17231' } })).toBe(true)
    expect(arTestdataApproval({ ...riktigt, payload: { project_id: 'test_project_001' } })).toBe(true)
  })

  test('friar riktiga kort — även utan payload', () => {
    expect(arTestdataApproval(riktigt)).toBe(false)
    expect(arTestdataApproval({ title: 'Avslutat projekt saknar faktura' })).toBe(false)
    expect(arTestdataApproval({ title: 'X', payload: null })).toBe(false)
  })
})

test.describe('facit: arTestdataObservation', () => {
  const riktig = {
    title: 'Offerter med detaljerade rader vinner oftare',
    observation: 'Av 11 offerter accepterades 4.',
    suggestion: null,
    data_basis: { quote_id: 'q_bengtsson' },
  }

  test('fångar via texterna och data_basis-id:n', () => {
    expect(arTestdataObservation({ ...riktig, title: 'Testkund Eriksson betalar sent' })).toBe(true)
    expect(arTestdataObservation({ ...riktig, observation: 'E2E Testkund öppnade aldrig' })).toBe(true)
    expect(arTestdataObservation({ ...riktig, suggestion: 'Påminn E2E Testkund' })).toBe(true)
    expect(arTestdataObservation({ ...riktig, data_basis: { quote_id: 'e2e_17231' } })).toBe(true)
    expect(arTestdataObservation({ ...riktig, data_basis: { customer_id: 'test_17231' } })).toBe(true)
  })

  test('friar riktiga observationer', () => {
    expect(arTestdataObservation(riktig)).toBe(false)
    expect(arTestdataObservation({ title: 'X', data_basis: null })).toBe(false)
  })
})

test.describe('källskanning: läsvägarna anropar filtret', () => {
  test('GET /api/approvals filtrerar med arTestdataApproval', () => {
    const s = read('app/api/approvals/route.ts')
    expect(s).toContain("from '@/lib/testdata'")
    expect(s).toContain('arTestdataApproval')
  })

  test('GET /api/observations filtrerar med arTestdataObservation', () => {
    const s = read('app/api/observations/route.ts')
    expect(s).toContain('arTestdataObservation')
  })

  test('GET /api/automations/activity filtrerar beskrivningen', () => {
    const s = read('app/api/automations/activity/route.ts')
    expect(s).toContain('arTestNamn(r.description)')
  })

  test('pengar-rutten filtrerar FÖRE sammanställningen — och läser fälten filtret behöver', () => {
    const s = read('app/api/dashboard/pengar/route.ts')
    // Selecterna måste bära fälten — en kolumnlista utan dem gör filtret
    // till en no-op (lesson 2026-08-05: "kolumnen finns" ≠ "den fylls").
    expect(s).toContain("select('total, sent_at, title')")
    expect(s).toContain("select('invoice_id, total, customer_pays, rot_rut_type')")
    // Testprojekten faller före svepet, inte efter.
    const filtret = s.indexOf('riktigaProjekt')
    const svepet = s.indexOf('sweepMissedRevenue({')
    expect(filtret).toBeGreaterThan(-1)
    expect(filtret).toBeLessThan(svepet)
    expect(s).toContain('staleQuotes: riktigaOfferter')
    expect(s).toContain('overdueInvoices: riktigaForfallna')
  })
})

test.describe('källskanning: producenterna skapar inget nytt testskräp', () => {
  test('missed-revenue-svepet hoppar testfynd — utan att avföra gömda kort', () => {
    const s = read('app/api/cron/missed-revenue/route.ts')
    expect(s).toContain('!arTestId(f.projectId) && !arTestNamn(f.projectName)')
    // Filtret ska ligga EFTER nyckelinsamlingen: annars expirar
    // legacy-e2e-kort destruktivt i stället för att gömmas av läsfiltret.
    const nycklar = s.indexOf('currentFindingKeys')
    const filtret = s.indexOf('!arTestId(f.projectId)')
    expect(nycklar).toBeGreaterThan(-1)
    expect(nycklar).toBeLessThan(filtret)
  })

  test('påminnelse- och uppföljningscronen bär billiga vakter', () => {
    expect(read('app/api/cron/send-reminders/route.ts')).toContain('arTestId(inv.invoice_id)')
    const qf = read('app/api/cron/quote-follow-up/route.ts')
    expect(qf).toContain('arTestId(q.quote_id)')
    expect(qf).toContain('arTestId(quote.quote_id)')
  })
})

test.describe('kopplingen åt andra hållet: producentmönstren matchas fortfarande', () => {
  test('e2e-quote: kund-, offert- och namnmönstren fångas av predikaten', () => {
    const s = read('app/api/debug/e2e-quote/route.ts')
    // Mönstren finns kvar i producenten…
    expect(s).toContain("'test_' + Date.now()")
    expect(s).toContain("'e2e_' + Date.now()")
    expect(s).toContain('E2E Testkund')
    expect(s).toContain('E2E Test — Badrumsrenovering')
    // …och predikaten fångar exakt dem.
    expect(arTestId('test_' + 1723190000000)).toBe(true)
    expect(arTestId('e2e_' + 1723190000000)).toBe(true)
    expect(arTestNamn('E2E Testkund')).toBe(true)
    expect(arTestNamn('E2E Test — Badrumsrenovering')).toBe(true)
  })

  test('e2e-invoice: fakturamönstret fångas', () => {
    const s = read('app/api/debug/e2e-invoice/route.ts')
    expect(s).toContain("'e2e_inv_' + Date.now()")
    expect(s).toContain('E2E-test installation')
    expect(arTestId('e2e_inv_' + 1723190000000)).toBe(true)
    expect(arTestNamn('Arbete — E2E-test installation')).toBe(true)
  })

  test('push/test-approval: payload-id:n och testnamnen fångas', () => {
    const s = read('app/api/push/test-approval/route.ts')
    for (const id of ['test_project_001', 'test_customer_001', 'test_quote_001', 'test_change_001']) {
      expect(s, `${id} har bytt form i producenten`).toContain(id)
      expect(arTestId(id), `${id} fångas inte längre`).toBe(true)
    }
    expect(s).toContain('Testkund Eriksson')
    expect(arTestNamn('Testkund Eriksson')).toBe(true)
  })
})
