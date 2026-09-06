/**
 * Facit för Företagsskanningens vy (2026-09-06, docs/design/skisser-2026-09-06/
 * foretagsskanning.dc.html) — det som INTE redan pinnas av
 * tests/company-scan.spec.ts: ärlighetsetiketten per rad, Karins/Daniels
 * tillägg, källistans sanning och skissens tre chip/legend i komponenten.
 *
 * Ren källskanning + rena funktioner, ingen browser/session:
 *
 *   npx playwright test tests/foretagsskanning-vy.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildScanRows, buildScanSources, KALLA_LABEL } from '../lib/onboarding/company-scan-rows'
import type { CompanyScanResult } from '../app/api/onboarding/company-scan/route'
import { fmt } from '../lib/onboarding/instant-value'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const SCAN = 'components/tour/CompanyScan.tsx'
const ROUTE = 'app/api/onboarding/company-scan/route.ts'

function tomtResultat(): CompanyScanResult {
  return {
    customerCount: 0,
    openInvoicesCount: 0,
    activeProjectsCount: 0,
    openQuotesCount: 0,
    staleQuotesCount: 0,
    pendingApprovalsCount: 0,
    karinHeadline: null,
  }
}

function fulltResultat(): CompanyScanResult {
  return {
    ...tomtResultat(),
    customerCount: 347,
    openInvoicesCount: 18,
    activeProjectsCount: 11,
    openQuotesCount: 7,
    staleQuotesCount: 3,
    pendingApprovalsCount: 4,
    karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 63400, count: 4 },
    profil: { hourlyRate: 650, employeeCount: 3, materialMarkupPct: 15, specialtyCount: 4, phoneNumber: '+46101234567' },
  }
}

test.describe('kalla — ärlighetsetiketten sätts av buildScanRows, aldrig av vyn', () => {
  test('antal ur databasen är Importerat, bedömningar Möjlighet, årsvärdet Uppskattat', () => {
    const rader = buildScanRows(fulltResultat())
    const kalla = Object.fromEntries(rader.map(r => [r.key, r.kalla]))
    expect(kalla).toEqual({
      kunder: 'importerat',
      fakturor: 'importerat',
      projekt: 'importerat',
      offerter: 'importerat',
      karin: 'mojlighet',
      daniel: 'mojlighet',
      lars: 'importerat',
      ko: 'importerat',
      profil_timme: 'uppskattat',
      profil_pastag: 'importerat',
      profil_tjanster: 'importerat',
      profil_telefon: 'importerat',
    })
  })

  test('ordningen och n=0-regeln är oförändrade av etiketten', () => {
    const rader = buildScanRows(fulltResultat())
    expect(rader.slice(0, 8).map(r => r.key)).toEqual(['kunder', 'fakturor', 'projekt', 'offerter', 'karin', 'daniel', 'lars', 'ko'])
    expect(buildScanRows(tomtResultat())).toHaveLength(0)
  })

  test('varje rad bär exakt en av de tre etiketterna — inga andra ord', () => {
    for (const rad of buildScanRows(fulltResultat())) {
      expect(['importerat', 'mojlighet', 'uppskattat'], rad.key).toContain(rad.kalla)
    }
    expect(KALLA_LABEL).toEqual({ importerat: 'Importerat', mojlighet: 'Möjlighet', uppskattat: 'Uppskattat' })
  })
})

test.describe('Karins och Daniels tillägg — bara när rutten faktiskt vet', () => {
  test('Karin: "… varav N förfallna" hängs på grundmeningen när overdueInvoicesCount > 0', () => {
    const med = buildScanRows({ ...tomtResultat(), customerCount: 1, karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 63400 }, overdueInvoicesCount: 4 })
    expect(med.find(r => r.key === 'karin')?.text).toBe(`Karin hittade ${fmt(63400)} kr i utestående kundfordringar, varav 4 förfallna`)
    const en = buildScanRows({ ...tomtResultat(), customerCount: 1, karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 500 }, overdueInvoicesCount: 1 })
    expect(en.find(r => r.key === 'karin')?.text).toContain(', varav 1 förfallen')
  })

  test('Karin: grundmeningen står orörd när inget är förfallet eller fältet saknas (äldre svar)', () => {
    const noll = buildScanRows({ ...tomtResultat(), customerCount: 1, karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 63400 }, overdueInvoicesCount: 0 })
    expect(noll.find(r => r.key === 'karin')?.text).toBe(`Karin hittade ${fmt(63400)} kr i utestående kundfordringar`)
    const saknas = buildScanRows({ ...tomtResultat(), customerCount: 1, karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 63400 } })
    expect(saknas.find(r => r.key === 'karin')?.text).not.toContain('förfall')
  })

  test('Daniel: "…, äldsta N dagar" bara när oldestStaleQuoteDays är känt', () => {
    const med = buildScanRows({ ...tomtResultat(), customerCount: 1, staleQuotesCount: 3, oldestStaleQuoteDays: 19 })
    expect(med.find(r => r.key === 'daniel')?.text).toBe('Daniel hittade 3 offerter som borde följas upp, äldsta 19 dagar')
    const utan = buildScanRows({ ...tomtResultat(), customerCount: 1, staleQuotesCount: 3, oldestStaleQuoteDays: null })
    expect(utan.find(r => r.key === 'daniel')?.text).toBe('Daniel hittade 3 offerter som borde följas upp')
    const saknas = buildScanRows({ ...tomtResultat(), customerCount: 1, staleQuotesCount: 1 })
    expect(saknas.find(r => r.key === 'daniel')?.text).toBe('Daniel hittade 1 offert som borde följas upp')
  })

  test('rutten levererar båda talen ur samma sanning: computeInstantValue.overdue_count och de gamla offerterna', () => {
    const s = read(ROUTE)
    expect(s).toContain('overdueInvoicesCount: instant.overdue_count')
    expect(s).toContain('oldestStaleQuoteDays')
    expect(s).toContain("staleQuotes.reduce<number | null>")
  })
})

test.describe('sources — en kvittens på vad skanningen gick igenom, aldrig ett löfte', () => {
  test('kundregister och fakturor listas bara med n>0, med riktiga tal i meta', () => {
    expect(buildScanSources({ customerCount: 347, openInvoicesCount: 18, fortnoxConnected: false })).toEqual([
      { key: 'kundregister', label: 'Kundregister', meta: `${fmt(347)} kunder` },
      { key: 'fakturor', label: 'Fakturor', meta: '18 öppna' },
    ])
    expect(buildScanSources({ customerCount: 1, openInvoicesCount: 0, fortnoxConnected: false })).toEqual([
      { key: 'kundregister', label: 'Kundregister', meta: '1 kund' },
    ])
    expect(buildScanSources({ customerCount: 0, openInvoicesCount: 0, fortnoxConnected: false })).toEqual([])
  })

  test('Fortnox listas BARA när business_config.fortnox_connected är sant', () => {
    const utan = buildScanSources({ customerCount: 5, openInvoicesCount: 2, fortnoxConnected: false, fortnoxLastSyncedAt: '2026-09-05T10:00:00Z' })
    expect(utan.map(s => s.key)).not.toContain('fortnox')
    const med = buildScanSources({ customerCount: 5, openInvoicesCount: 2, fortnoxConnected: true, fortnoxLastSyncedAt: '2026-09-05T10:00:00Z' })
    const fortnox = med.find(s => s.key === 'fortnox')
    expect(fortnox?.label).toBe('Fortnox')
    expect(fortnox?.meta.startsWith('kopplat')).toBe(true)
    expect(fortnox?.meta).toContain('synkat')
    // Utan synk-tid: bara "kopplat", aldrig ett påhittat datum.
    expect(buildScanSources({ customerCount: 5, openInvoicesCount: 2, fortnoxConnected: true }).find(s => s.key === 'fortnox')?.meta).toBe('kopplat')
  })

  test('Gmail finns inte som källa — skannen läser ingen post', () => {
    const alla = buildScanSources({ customerCount: 9, openInvoicesCount: 9, fortnoxConnected: true, fortnoxLastSyncedAt: '2026-09-05T10:00:00Z' })
    expect(alla.map(s => s.key).sort()).toEqual(['fakturor', 'fortnox', 'kundregister'])
    // Koden (inte kommentarerna, som får förklara VARFÖR Gmail inte listas)
    // nämner aldrig Gmail: ingen källa, ingen etikett, inget scope.
    const utanKommentarer = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const fil of [SCAN, ROUTE, 'lib/onboarding/company-scan-rows.ts']) {
      expect(utanKommentarer(read(fil)).toLowerCase(), fil).not.toContain('gmail')
    }
  })

  test('rutten läser Fortnox-flaggan ur business_config och matar buildScanSources', () => {
    const s = read(ROUTE)
    expect(s).toContain("select('fortnox_connected, fortnox_last_synced_at')")
    expect(s).toContain('fortnoxConnected: Boolean(fortnoxRes.data?.fortnox_connected)')
    expect(s).toContain('sources: buildScanSources({')
  })
})

test.describe('vyn — skissens tre chip, legend, slutkortet och förbjudna ord', () => {
  const s = read(SCAN)

  test('"Command Center" är ett internt namn och finns inte i UI:t', () => {
    expect(s).not.toContain('Command Center')
  })

  test('chip för alla tre etiketterna: Importerat slate, Möjlighet primary, Uppskattat vitt med slate-ram', () => {
    const chip = s.slice(s.indexOf('const KALLA_CHIP'), s.indexOf('const KALLA_LEGEND'))
    expect(chip).toMatch(/importerat: '[^']*bg-slate-100[^']*'/)
    expect(chip).toMatch(/mojlighet: '[^']*bg-primary-100[^']*text-primary-700[^']*'/)
    expect(chip).toMatch(/uppskattat: '[^']*bg-white[^']*border-slate-300[^']*'/)
    // Chipet renderas med etikettens ord ur EN källa (KALLA_LABEL), aldrig hårdkodat
    expect(s).toContain('{KALLA_LABEL[row.kalla]}')
    expect(s).toContain('KALLA_CHIP[row.kalla]')
  })

  test('legenden med de tre orden ligger under listan', () => {
    expect(s).toContain('const KALLA_LEGEND')
    expect(s).toContain("KALLA_ORDNING.map(k =>")
    expect(s).toContain('{KALLA_LABEL[k]}')
    expect(s).toContain('aria-label="Etiketternas betydelse"')
  })

  test('vänsterpanelen: Matte, "Ge mig 40 sekunder.", källistan och ärlighetsnoten ur skissen', () => {
    expect(s).toContain('Chefsassistent')
    expect(s).toContain('Ge mig 40 sekunder.')
    expect(s).toContain('>Går igenom<')
    expect(s).toContain('Fakta från dina system märks Importerat. Sådant teamet bedömer märks Möjlighet eller Uppskattat. Vi hittar aldrig på för att det ska se bra ut.')
    // Källorna bockas av i takt med raderna, inte på en egen klocka
    expect(s).toContain("kundregister: 'kunder'")
    expect(s).toContain("fortnox: 'kunder'")
    expect(s).toContain("fakturor: 'fakturor'")
  })

  test('rubriken vänder från "Matte sätter upp firman …" till "Handymate är igång." med "Här är vad teamet hittade."', () => {
    expect(s).toContain("finished ? 'Handymate är igång.' : 'Matte sätter upp firman …'")
    expect(s).toContain("'Här är vad teamet hittade.'")
    expect(s).toContain('role="progressbar"')
    expect(s).toContain('style={{ width: `${progressPct}%` }}')
  })

  test('kö-raden renderas EN gång — som slutkortet, filtrerad ur listan', () => {
    expect(s).toContain("const koRad = allaRader.find(r => r.key === 'ko')")
    expect(s).toContain("const rows = allaRader.filter(r => r.key !== 'ko')")
    expect(s).toContain('{finished && koRad && (')
    expect(s).toContain('{koRad.text}')
  })

  test('desktop två paneler (lg), mobil en kolumn — samma lista, inget chattläge', () => {
    expect(s).toContain('flex flex-col lg:flex-row')
    expect(s).toContain('hidden lg:flex flex-col flex-shrink-0 w-[320px]')
    // Bara radlistan rullar — rubrik, legend och knapp står stilla
    expect(s).toContain('flex-1 min-h-0 overflow-y-auto overflow-x-hidden')
    expect(s).toContain('lg:hidden')
    expect(s).not.toContain('Skriv till Matte')
  })

  test('svenska tecken är riktiga å/ä/ö, inga unicode-escapes', () => {
    expect(s).not.toMatch(/\\u00e[456]/i)
    expect(s).toContain('uppmärksamhet')
  })
})
