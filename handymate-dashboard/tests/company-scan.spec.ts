/**
 * Facit för Company Scan (tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren källskanning — samma stil som tests/hemtur.spec.ts och
 * tests/startkort.spec.ts. Ingen browser/session krävs:
 *
 *   npx playwright test tests/company-scan.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildScanRows } from '../components/tour/CompanyScan'
import type { CompanyScanResult } from '../app/api/onboarding/company-scan/route'
import { fmt } from '../lib/onboarding/instant-value'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const SCAN = 'components/tour/CompanyScan.tsx'
const ROUTE = 'app/api/onboarding/company-scan/route.ts'
const HEM = 'components/jarvis/JarvisHome.tsx'

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

test.describe('bara-sanna-rader-regeln (buildScanRows)', () => {
  test('en rad per n>0-fält, i den ordning skannen ska visa dem', () => {
    const rader = buildScanRows({
      ...tomtResultat(),
      customerCount: 12,
      openInvoicesCount: 3,
      activeProjectsCount: 2,
      openQuotesCount: 4,
      karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 45000 },
      staleQuotesCount: 1,
      pendingApprovalsCount: 5,
    })
    expect(rader.map(r => r.key)).toEqual([
      'kunder', 'fakturor', 'projekt', 'offerter', 'karin', 'daniel', 'lars', 'ko',
    ])
  })

  test('n=0-fält producerar ALDRIG en rad (antiklimax utelämnas)', () => {
    const rader = buildScanRows({
      ...tomtResultat(),
      customerCount: 12, // enda fältet med data
    })
    expect(rader).toHaveLength(1)
    expect(rader[0].key).toBe('kunder')
  })

  test('varje rad bär ett RIKTIGT tal ur indata, aldrig en hårdkodad siffra', () => {
    const rader = buildScanRows({ ...tomtResultat(), customerCount: 347 })
    expect(rader[0].text).toContain('347')
  })

  test('Karin-raden kräver headline.amount_kr — ett tomt/null-fynd ger ingen rad', () => {
    const utanFynd = buildScanRows({ ...tomtResultat(), customerCount: 1, karinHeadline: null })
    expect(utanFynd.find(r => r.key === 'karin')).toBeUndefined()

    const medFynd = buildScanRows({
      ...tomtResultat(),
      customerCount: 1,
      karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 63400 },
    })
    const karinRad = medFynd.find(r => r.key === 'karin')
    // fmt() ger sv-SE-gruppering (icke-brytande mellanslag) — jämför mot
    // samma funktion i stället för en hårdkodad sträng med fel tecken.
    expect(karinRad?.text).toBe(`Karin hittade ${fmt(63400)} kr i utestående kundfordringar`)
    expect(karinRad?.agent).toBe('karin')
  })

  test('Daniel- och Lars-raderna bär agent-nyckeln för avataren', () => {
    const rader = buildScanRows({
      ...tomtResultat(),
      customerCount: 1,
      staleQuotesCount: 3,
      activeProjectsCount: 2,
    })
    expect(rader.find(r => r.key === 'daniel')?.agent).toBe('daniel')
    expect(rader.find(r => r.key === 'lars')?.agent).toBe('lars')
  })

  test('kö-raden (pendingApprovalsCount) är sist och saknar agent — den pekar framåt, inte på en agent', () => {
    const rader = buildScanRows({
      ...tomtResultat(),
      customerCount: 1,
      pendingApprovalsCount: 4,
    })
    expect(rader[rader.length - 1].key).toBe('ko')
    expect(rader[rader.length - 1].agent).toBeUndefined()
  })
})

test.describe('API-rutten — ägargrindad som instant-value', () => {
  const s = read(ROUTE)

  test('kräver getAuthenticatedBusiness + see_financials, samma mönster som instant-value', () => {
    expect(s).toContain('getAuthenticatedBusiness(request)')
    expect(s).toContain("hasPermission(currentUser, 'see_financials')")
    expect(s).toContain("status: 403")
  })

  test('återanvänder computeInstantValue — ingen egen sanning om samma kronor', () => {
    expect(s).toContain("import { computeInstantValue")
    expect(s).toContain('computeInstantValue({')
  })

  test('karinHeadline sätts BARA när headline verkligen är Karins', () => {
    expect(s).toContain("instant.headline.agent === 'Karin' ? instant.headline : null")
  })

  test('offerter läser OPEN_QUOTE_STATUSES och samma 5-dagarsregel som pengar-sidan', () => {
    expect(s).toContain("import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'")
    expect(s).toContain('STALE_QUOTE_DAYS = 5')
  })

  test('väntande kort läser pending_approvals status pending (inkluderar startkorten)', () => {
    expect(s).toContain(".from('pending_approvals')")
    expect(s).toContain(".eq('status', 'pending')")
  })

  test('aktiva projekt filtrerar på status active', () => {
    expect(s).toContain(".from('project')")
    expect(s).toContain(".eq('status', 'active')")
  })
})

test.describe('grinden — welcome_tour_seen + hm_scan_klar, dubbelt skydd', () => {
  const s = read(SCAN)

  test('läser business.welcome_tour_seen, samma fält som Hemturen', () => {
    expect(s).toContain('business.welcome_tour_seen')
    expect(s).toContain("import { useBusiness } from '@/lib/BusinessContext'")
  })

  test('egen localStorage-nyckel, skild från Hemturens', () => {
    expect(s).toContain("SEEN_KEY = 'hm_scan_klar'")
    expect(s).not.toContain("'hm_hemtur_klar'")
  })

  test('trasig localStorage failar STÄNGT — hoppar skannen, fastnar aldrig', () => {
    const gate = s.slice(s.indexOf('GRINDEN'), s.indexOf('Hämtningen'))
    expect(gate).toContain('catch {')
    expect(gate).toContain('skipQuiet()')
  })

  test('skannen skriver ALDRIG welcome_tour_seen — Hemturen är ensam ägare av flaggan', () => {
    // Skannen LÄSER business.welcome_tour_seen (grinden), men SKRIVER den
    // aldrig — det whitelistade PUT-mönstret från HemTur.tsx (config: {
    // welcome_tour_seen: ... }) får aldrig dyka upp här.
    expect(s).not.toContain("config: { welcome_tour_seen")
    expect(s).not.toContain("fetch('/api/onboarding',")
  })
})

test.describe('sanningsregler — fail-safe-varianterna', () => {
  const s = read(SCAN)

  test('tomt konto (customerCount===0) ger den ärliga korta varianten, inte 0-rader i checklistan', () => {
    expect(s).toContain('data.customerCount === 0')
    expect(s).toContain('Teamet är på plats och redo')
    expect(s).toContain('Lägg till din första kund så börjar de jobba.')
  })

  test('403/nätverksfel/hängande request hoppar HELA skannen (skipQuiet), utan att skriva hm_scan_klar', () => {
    const hamtning = s.slice(s.indexOf('Hämtningen'), s.indexOf('const isEmpty'))
    expect(hamtning).toContain('skipQuiet()')
    expect(hamtning).not.toContain('localStorage.setItem')
  })

  test('skipQuiet() skriver inte hm_scan_klar — bara finish() gör det (facit för koden, inte bara kommentaren)', () => {
    const skipFn = s.slice(s.indexOf('function skipQuiet()'), s.indexOf('function finish()'))
    expect(skipFn).not.toContain('localStorage.setItem')
    const finishFn = s.slice(s.indexOf('function finish()'), s.indexOf('// ═══ GRINDEN'))
    expect(finishFn).toContain('localStorage.setItem(SEEN_KEY')
  })

  test('"Hoppa över" är alltid synlig, oavsett laddningsläge', () => {
    // Länken ligger utanför de tre villkorliga grenarna (laddar/tomt/rader) —
    // den syns innan den villkorliga `{!data ? ... : isEmpty ? ... : ...}`-grenen.
    const idx = s.indexOf('Hoppa över')
    const villkorIdx = s.indexOf('{!data ?')
    expect(idx).toBeGreaterThan(-1)
    expect(idx).toBeLessThan(villkorIdx)
  })
})

test.describe('säkerhetsnät mot hängande timers (B7-mönstret)', () => {
  const s = read(SCAN)

  test('nätverksvakthunden: 5 s utan svar hoppar skannen', () => {
    expect(s).toContain('HANG_TIMEOUT_MS = 5000')
    const fetchBlock = s.slice(s.indexOf("fetch('/api/onboarding/company-scan')") - 200, s.indexOf("fetch('/api/onboarding/company-scan')") + 400)
    expect(fetchBlock).toContain('watchdog')
  })

  test('per-rad-timern har sitt eget 5 s-säkerhetsnät, skilt från 700 ms-avslöjandet', () => {
    expect(s).toContain('ROW_INTERVAL_MS = 700')
    // HANG_TIMEOUT_MS används som timeout-längd på TVÅ oberoende
    // setTimeout-anrop: nätverksvakthunden och rad-säkerhetsnätet.
    const forekomster = (s.match(/, HANG_TIMEOUT_MS\)/g) || []).length
    expect(forekomster).toBeGreaterThanOrEqual(2)
    expect(s).toContain('Säkerhetsnätet (B7-mönstret)')
  })
})

test.describe('prefers-reduced-motion', () => {
  const s = read(SCAN)

  test('läses via matchMedia, samma mönster som uppdraget kräver', () => {
    expect(s).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
  })

  test('reduced motion visar alla rader direkt utan att röra rad-timern', () => {
    const block = s.slice(s.indexOf('Rad-för-rad-avslöjandet'), s.indexOf('Säkerhetsnätet (B7-mönstret)'))
    expect(block).toContain('if (reducedMotion) { setVisibleCount(rows.length); return }')
  })

  test('rad-säkerhetsnätet är avstängt i reduced-motion-läget (ingen timer alls den vägen)', () => {
    const net = s.slice(s.indexOf('Säkerhetsnätet (B7-mönstret)'), s.indexOf('if (!active) return null'))
    expect(net).toContain('reducedMotion) return')
  })
})

test.describe('kedjningen i JarvisHome — CompanyScan före Hemturen', () => {
  const hem = read(HEM)

  test('CompanyScan importeras och renderas', () => {
    expect(hem).toContain("import CompanyScan from '@/components/tour/CompanyScan'")
    expect(hem).toContain('<CompanyScan onClose=')
  })

  test('HemTur renderas villkorat på skannens onClose-flagga, inte ovillkorat längre', () => {
    expect(hem).toContain('const [scanKlar, setScanKlar] = useState(false)')
    expect(hem).toContain('{scanKlar && !forstaAtgardId && <HemTur />}')
  })

  test('CompanyScan står FÖRE HemTur i JSX-trädet', () => {
    const scanIdx = hem.indexOf('<CompanyScan onClose=')
    const hemturIdx = hem.indexOf('{scanKlar && !forstaAtgardId && <HemTur />}')
    expect(scanIdx).toBeGreaterThan(-1)
    expect(hemturIdx).toBeGreaterThan(-1)
    expect(scanIdx).toBeLessThan(hemturIdx)
  })

  test('onClose sätter scanKlar till true — den enda vägen HemTur kan börja rendera', () => {
    expect(hem).toContain('setScanKlar(true)')
    expect(hem).toContain('setForstaAtgardId(r.firstActionId)')
  })
})

test.describe('första verifierade handlingen (2026-08-27) — skanningen slutar med en handling, inte en tur', () => {
  const scan = read('components/tour/CompanyScan.tsx')
  const hem = read(HEM)

  test('POST first-action körs först när GET-datat finns, med egen vakthund och kill-switch', () => {
    expect(scan).toContain('const FORSTA_ATGARD_PA = true')
    expect(scan).toContain("fetch('/api/onboarding/first-action', { method: 'POST' })")
    const effekt = scan.slice(scan.indexOf('// Första verifierade handlingen — parallellt'), scan.indexOf('const isEmpty ='))
    expect(effekt).toContain('if (!active || !data || !FORSTA_ATGARD_PA) return')
    expect(effekt).toContain('HANG_TIMEOUT_MS')
    // Allt annat än ett tydligt svar ⇒ null ⇒ dagens knapp
    expect(effekt).toContain('if (cancelled || !json || !json.kind) return')
  })

  test('slutknappen är handlingen; "Visa mig runt först" är sekundär; utan kort finns dagens "Visa mig" kvar', () => {
    expect(scan).toContain('onClick={() => finishMed(forstaKort.approvalId!)}')
    expect(scan).toContain('Visa mig runt först')
    expect(scan.match(/>\s*Visa mig\s*</g)?.length).toBe(2)
    expect(scan).toContain('{skapaKund.cta ?? \'Lägg till din första kund\'} →')
  })

  test('finish() är fortfarande ende skrivaren av hm_scan_klar-vägen — finishMed skriver samma nyckel och skickar id:t', () => {
    expect(scan.match(/localStorage\.setItem\(SEEN_KEY, '1'\)/g)?.length).toBe(2)
    expect(scan).toContain('onCloseRef.current({ firstActionId })')
    expect(scan).not.toContain("config: { welcome_tour_seen")
  })

  test('JarvisHome: kortet hämtas om, expanderas och scrollas till; Hemturen väntar på första beslutet', () => {
    expect(hem).toContain('const [forstaAtgardId, setForstaAtgardId] = useState<string | null>(null)')
    expect(hem).toContain('if (r?.firstActionId) {')
    expect(hem).toContain('void fetchQueue().finally(() => setForstaAtgardHamtad(true))')
    // Bevisat 2026-08-27: utan vantan pa omhamtningen nollades id:t mot den GAMLA kon
    expect(hem).toContain('if (!forstaAtgardId || !queueLoaded || !forstaAtgardHamtad) return')
    expect(hem).toContain('if (approval.id === forstaAtgardId) setForstaAtgardId(null)')
    expect(hem).toContain("document.getElementById(`beslut-${forstaAtgardId}`)")
    // Saknas kortet i kön (routing/utgånget/testdata) släpps turen i stället för att vänta
    expect(hem).toContain('if (!approvals.some(a => a.id === forstaAtgardId)) { setForstaAtgardId(null); return }')
  })
})
