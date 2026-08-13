/**
 * Facit för Måndagsmötet-takeovern (Måndagsmötet etapp 2, 2026-08-13).
 *
 * Ren källskanning + rena funktioner — samma stil som
 * tests/company-scan.spec.ts / tests/hemtur.spec.ts / tests/mandagskort.spec.ts.
 * Ingen browser/session krävs:
 *
 *   npx playwright test tests/mandagsmote-takeover.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  mandagsmoteSeenKey,
  onboardingGatesResolved,
  shouldAutoOpenMandagsmote,
  mandagsmoteSectionOrder,
} from '../lib/jarvis/mandagsmote'
import { approveLabel } from '../lib/jarvis/approval-view'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const TAKEOVER = 'components/jarvis/MandagsmoteTakeover.tsx'
const HEM = 'components/jarvis/JarvisHome.tsx'
const CARD = 'components/jarvis/MandagskortCard.tsx'

test.describe('mandagsmoteSeenKey — skopad per approval-id', () => {
  test('formatet är hm_mandagsmote_sett_{approvalId}', () => {
    expect(mandagsmoteSeenKey('mbrief_biz_1_2026-W33')).toBe('hm_mandagsmote_sett_mbrief_biz_1_2026-W33')
  })

  test('olika approval-id (dvs olika vecka, se mandagskortId) ger olika nyckel — nollställs naturligt varje vecka', () => {
    expect(mandagsmoteSeenKey('mbrief_biz_1_2026-W33')).not.toBe(mandagsmoteSeenKey('mbrief_biz_1_2026-W34'))
  })
})

test.describe('onboardingGatesResolved — CompanyScan/HemTur-kedjan måste vara helt förbi', () => {
  test('varken server-flaggan eller den lokala HemTur-flaggan satt → inte löst', () => {
    expect(onboardingGatesResolved({ welcomeTourSeen: false, hemturSeenLocally: false })).toBe(false)
  })

  test('server-flaggan (business.welcome_tour_seen) räcker ensam', () => {
    expect(onboardingGatesResolved({ welcomeTourSeen: true, hemturSeenLocally: false })).toBe(true)
  })

  test('den lokala HemTur-flaggan räcker ensam (täcker fönstret innan fire-and-forget-PUT:en rundtripat)', () => {
    expect(onboardingGatesResolved({ welcomeTourSeen: false, hemturSeenLocally: true })).toBe(true)
  })

  test('båda satta → löst', () => {
    expect(onboardingGatesResolved({ welcomeTourSeen: true, hemturSeenLocally: true })).toBe(true)
  })
})

test.describe('shouldAutoOpenMandagsmote — de tre villkoren', () => {
  test('inget pending-kort → aldrig, oavsett övrigt', () => {
    expect(shouldAutoOpenMandagsmote({ approvalId: null, onboardingResolved: true, alreadySeen: false })).toBe(false)
  })

  test('onboardingen inte löst → aldrig, även med ett pending-kort', () => {
    expect(shouldAutoOpenMandagsmote({ approvalId: 'mbrief_x', onboardingResolved: false, alreadySeen: false })).toBe(false)
  })

  test('redan sett den här veckans kort → aldrig igen', () => {
    expect(shouldAutoOpenMandagsmote({ approvalId: 'mbrief_x', onboardingResolved: true, alreadySeen: true })).toBe(false)
  })

  test('alla tre villkor uppfyllda → öppna', () => {
    expect(shouldAutoOpenMandagsmote({ approvalId: 'mbrief_x', onboardingResolved: true, alreadySeen: false })).toBe(true)
  })
})

test.describe('mandagsmoteSectionOrder — ordningen på den stegvisa avslöjningen', () => {
  test('bara sektioner som faktiskt finns tas med, i resultat/lärdomar/risker/förtroende-ordning', () => {
    const order = mandagsmoteSectionOrder({
      resultat: [{ key: 'identifierat' }],
      lardomar: null,
      risker: [{ project_id: 'p1' }],
      fortroende: [{ key: 'invoice_reminder' }],
    })
    expect(order).toEqual(['resultat', 'risker', 'fortroende'])
  })

  test('alla fyra tomma/null → tom ordning (hittar aldrig på en femte sektion)', () => {
    expect(mandagsmoteSectionOrder({ resultat: null, lardomar: null, risker: null, fortroende: null })).toEqual([])
  })

  test('lardomar är ett objekt (inte en array) — truthy-checken funkar ändå', () => {
    expect(mandagsmoteSectionOrder({ resultat: null, lardomar: { antal: 3 }, risker: null, fortroende: null })).toEqual(['lardomar'])
  })

  test('tomma arrayer räknas inte som "finns" — samma n>0-anda som byggMandagskort redan garanterar server-side', () => {
    expect(mandagsmoteSectionOrder({ resultat: [], lardomar: null, risker: [], fortroende: [] })).toEqual([])
  })
})

test.describe('approveLabel — samma etikett som knappen faktiskt visar', () => {
  test('"Jag har läst det" för monday_brief, oförändrat av refaktoreringen', () => {
    expect(approveLabel('monday_brief')).toBe('Jag har läst det')
  })
})

test.describe('MandagsmoteTakeover.tsx — ren presentation, ingen egen fetch/endpoint', () => {
  const s = read(TAKEOVER)

  test('komponenten importerar aldrig fetch/supabase — bara onApprove/onDismiss-callbacks', () => {
    expect(s).not.toContain('fetch(')
    expect(s).not.toContain("from '@/lib/supabase'")
  })

  test('återanvänder MandagskortCard — duplicerar aldrig sektions-renderingen', () => {
    expect(s).toContain("import { MandagskortCard } from '@/components/jarvis/MandagskortCard'")
    expect(s).toContain('<MandagskortCard')
  })

  test('dismiss (handleDismiss) anropar ALDRIG onApprove — bara onDismiss', () => {
    const fn = s.slice(s.indexOf('function handleDismiss()'), s.indexOf('function handleApprove()'))
    expect(fn).toContain('onDismissRef.current()')
    expect(fn).not.toContain('onApproveRef.current()')
  })

  test('"Jag har läst det"-knappen (handleApprove) anropar ALDRIG onDismiss — bara onApprove', () => {
    const start = s.indexOf('function handleApprove()')
    const fn = s.slice(start, s.indexOf('return (', start))
    expect(fn).toContain('onApproveRef.current()')
    expect(fn).not.toContain('onDismissRef.current()')
  })

  test('godkänn-knappen visar approveLabel-propen, inte en hårdkodad text', () => {
    expect(s).toContain('{approveLabel}')
  })

  test('X-knappen (escape-luckan) triggar handleDismiss', () => {
    const btnBlock = s.slice(s.indexOf('aria-label="Stäng"') - 100, s.indexOf('aria-label="Stäng"') + 20)
    expect(btnBlock).toContain('onClick={handleDismiss}')
  })

  test('prefers-reduced-motion läses via matchMedia, samma mönster som CompanyScan/HemTur', () => {
    expect(s).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(s).toContain('if (reducedMotion) { setVisibleCount(order.length); return }')
  })

  test('B7-säkerhetsnätet: 5 s tvingar fram nästa sektion om avslöjningen fastnar', () => {
    expect(s).toContain('HANG_TIMEOUT_MS = 5000')
    const net = s.slice(s.indexOf('Säkerhetsnätet (B7-mönstret)'), s.length)
    expect(net).toContain('if (reducedMotion) return')
    expect(net).toContain('Math.min(v + 1, order.length)')
  })
})

test.describe('kedjningen (Måndagsmötet får aldrig fira mitt i onboardingen)', () => {
  const hem = read(HEM)

  test('auto-öppningen läser onboardingGatesResolved — inte bara scanKlar', () => {
    const effect = hem.slice(hem.indexOf('MÅNDAGSMÖTETS AUTO-ÖPPNING'), hem.indexOf('/** Manuell öppning'))
    expect(effect).toContain('onboardingGatesResolved({')
    expect(effect).toContain('welcomeTourSeen: Boolean(business.welcome_tour_seen)')
    expect(effect).toContain('hemturSeenLocally')
  })

  test('läser SAMMA localStorage-nyckel som HemTur.tsx skriver (hm_hemtur_klar)', () => {
    expect(hem).toContain("HEMTUR_SEEN_KEY = 'hm_hemtur_klar'")
    const hemturSrc = read('components/tour/HemTur.tsx')
    expect(hemturSrc).toContain("SEEN_KEY = 'hm_hemtur_klar'")
  })

  test('CompanyScan/HemTur.tsx är helt orörda av det här spåret', () => {
    const scan = read('components/tour/CompanyScan.tsx')
    const hemtur = read('components/tour/HemTur.tsx')
    expect(scan).not.toContain('Mandagsmote')
    expect(scan).not.toContain('mandagsmote')
    expect(hemtur).not.toContain('Mandagsmote')
    expect(hemtur).not.toContain('mandagsmote')
  })

  test('lib/jarvis/monday-brief.ts är helt orörd (constraint) — inget mandagsmote-spår i den filen', () => {
    const brief = read('lib/jarvis/monday-brief.ts')
    expect(brief).not.toContain('Mandagsmote')
    expect(brief).not.toContain('mandagsmote')
  })

  test('shouldAutoOpenMandagsmote returnerar false medan HemTur teoretiskt fortfarande är aktiv (varken flagga satt)', () => {
    // Samma påstående som onboardingGatesResolved-testerna ovan, men skrivet
    // ut explicit i "kedjnings"-kontext: så länge varken business.welcome_tour_seen
    // eller hm_hemtur_klar är sant kan takeovern inte auto-öppna, vilket är
    // EXAKT det fönster där CompanyScan/HemTur kan vara aktiva i DOM:en.
    const onboardingResolved = onboardingGatesResolved({ welcomeTourSeen: false, hemturSeenLocally: false })
    expect(shouldAutoOpenMandagsmote({ approvalId: 'mbrief_x', onboardingResolved, alreadySeen: false })).toBe(false)
  })
})

test.describe('godkänn-vägen — SAMMA endpoint som varje annat kort, ingen ny rutt', () => {
  const hem = read(HEM)

  test('approveMandagsmote anropar queueAction(mandagskortApproval, \'approve\') — inte ett eget fetch-anrop', () => {
    const fn = hem.slice(hem.indexOf('function approveMandagsmote()'), hem.indexOf('function flash('))
    expect(fn).toContain("queueAction(mandagskortApproval, 'approve')")
    expect(fn).not.toContain('fetch(')
  })

  test('dismissMandagsmote stänger bara takeovern — anropar aldrig queueAction/approve', () => {
    const start = hem.indexOf('function dismissMandagsmote()')
    // Slutet av FUNKTIONSKROPPEN: dismissMandagsmote har ingen egen nästlad
    // { }, så den FÖRSTA stängande klammern efter den öppnande är dess egen
    // — robust mot CRLF/radslutstecken, till skillnad från ett
    // newline-baserat mönster (som annars kan hoppa förbi och fånga med sig
    // JSDoc-kommentaren ovanför approveMandagsmote, som nämner queueAction).
    const openBrace = hem.indexOf('{', start)
    const closeBrace = hem.indexOf('}', openBrace)
    const fn = hem.slice(start, closeBrace + 1)
    expect(fn).not.toContain('queueAction')
    expect(fn).toContain('setMandagsmoteOpen(false)')
  })

  test('takeoverns approveLabel-prop härleds ur lib/jarvis/approval-view.ts, inte hårdkodad i JSX', () => {
    expect(hem).toContain("approveLabel={approveLabel('monday_brief', mandagskortApproval.payload)}")
  })
})

test.describe('bannern i "Det här behöver dig idag" — den ständiga återingången', () => {
  const hem = read(HEM)

  test('bannern renderas bara när mandagskortApproval finns, med openMandagsmote som klick-handler', () => {
    expect(hem).toContain('{mandagskortApproval && (() => {')
    expect(hem).toContain('onClick={openMandagsmote}')
  })

  test('bannern ligger i samma sektion som de vanliga besluts-korten (före queueLoaded-grenen)', () => {
    const bannerIdx = hem.indexOf('Måndagsmötets ständiga återingång')
    const queueLoadedIdx = hem.indexOf('{!queueLoaded ? (')
    const hemturAttnIdx = hem.indexOf('data-tour-target="hemtur-attn"')
    expect(bannerIdx).toBeGreaterThan(hemturAttnIdx)
    expect(bannerIdx).toBeLessThan(queueLoadedIdx)
  })

  test('det generiska kortet för monday_brief hoppas över i beslutslistan — bannern är dess enda representation där', () => {
    const mapBlock = hem.slice(hem.indexOf('grupper.map((grupp, i)'), hem.indexOf('{/* Frågeläget'))
    expect(mapBlock).toContain("if (approval.approval_type === 'monday_brief') return null")
  })

  test('kortet räknas ändå med i beslut/grupper (bara raden hoppas över, inte hela ärendet)', () => {
    // synliga/grupper/beslut filtreras INTE på approval_type — bara .map-
    // callbacken returnerar null för monday_brief. Regressionsskydd: om
    // någon i framtiden filtrerar bort typen tidigare i kedjan (t.ex. i
    // `synliga`), räknar "N saker behöver ditt beslut" plötsligt fel.
    const synligaLine = hem.slice(hem.indexOf('const synliga ='), hem.indexOf('const synliga =') + 120)
    expect(synligaLine).not.toContain('monday_brief')
  })
})

test.describe('MandagskortCard.tsx — helt orörd, återanvänd som den är', () => {
  test('inga nya props/refaktor — samma exporterade signatur som redan täcks av tests/mandagskort.spec.ts-omgivningen', () => {
    const s = read(CARD)
    expect(s).toContain('export function MandagskortCard({')
    expect(s).toContain('resultat,')
    expect(s).toContain('lardomar,')
    expect(s).toContain('risker,')
    expect(s).toContain('fortroende,')
    // Anropsstället i approvals-listan ska fortfarande fungera oförändrat.
    const approvalsPage = read('app/dashboard/approvals/page.tsx')
    expect(approvalsPage).toContain('<MandagskortCard')
    expect(approvalsPage).toContain('resultat={pl.resultat ?? null}')
  })
})
