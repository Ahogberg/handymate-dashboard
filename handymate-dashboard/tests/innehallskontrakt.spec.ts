/**
 * Facit för innehållskontraktet på hemskärmen (Claude Design-granskningen
 * 2026-08-08, verifierad mot koden).
 *
 * Granskningen sa: korten bär en rubrik om ett problem och två knappar, inte
 * ett färdigt resultat man kan säga ja till — så Godkänn blir ett löfte utan
 * täckning. Kodläget var värre än så.
 *
 * `voice="foreslar"` stod HÅRDKODAT på varje kort, medan missad_intakt,
 * review_auto_invoice och four_eyes_* är REVIEW_REQUIRED i ACTION_CONTRACT och
 * alltså inte kan utföras. Servern svarade ärligt `executed: false` med texten
 * "Öppna ärendet och granska det innan något skickas" — och klienten kastade
 * svaret och skrev "skickade: …" i Klart idag.
 *
 * Det är samma felklass som Resend-buggen och de svalda Supabase-felen:
 * påstådd leverans utan verifierad leverans. Sanningen fanns redan i svaret;
 * ytan slängde den.
 *
 *   npx playwright test tests/innehallskontrakt.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { voiceFor, reviewAlternatives, doneRowText } from '../lib/jarvis/card-voice'
import { ACTION_CONTRACT, classify } from '../lib/approvals/action-contract'
import { cardActions } from '../lib/jarvis/voice'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('regel 4: ett sant verb — planens viktigaste test', () => {
  test('INGEN korttyp kan säga "föreslår" utan att kunna utföras', () => {
    // Går över HELA kontraktet, inte ett urval. Läggs en ny typ till som
    // REVIEW_REQUIRED får den aldrig av misstag en Godkänn-knapp.
    const fel: string[] = []
    for (const [typ, klass] of Object.entries(ACTION_CONTRACT)) {
      const röst = voiceFor(typ)
      if (röst === 'foreslar' && klass !== 'EXECUTABLE_ACTION') fel.push(`${typ} (${klass})`)
      if (röst !== 'foreslar' && klass === 'EXECUTABLE_ACTION') fel.push(`${typ} borde få föreslå`)
    }
    expect(fel, `röst och kontrakt är oense: ${fel.join(', ')}`).toEqual([])
  })

  test('de fyra som utlöste fyndet frågar numera', () => {
    for (const typ of ['missad_intakt', 'review_auto_invoice', 'manual_project_create', 'four_eyes_quote']) {
      expect(classify(typ), `${typ} har bytt klass`).toBe('REVIEW_REQUIRED')
      expect(voiceFor(typ), `${typ} säger fortfarande föreslår`).toBe('fragar')
    }
  })

  test('okänd typ frågar — den godkänns aldrig blint', () => {
    expect(voiceFor('nagot_helt_nytt')).toBe('fragar')
    expect(voiceFor(null)).toBe('fragar')
    expect(voiceFor(undefined)).toBe('fragar')
  })

  test('ett frågande kort KAN inte utlösa ett godkännande', () => {
    // Det räcker inte att dölja knappen: cardActions sätter approves:false på
    // varje alternativ, så mekaniken i sig utesluter godkännande.
    const knappar = cardActions('fragar', { alternatives: reviewAlternatives('missad_intakt') })
    expect(knappar.length).toBeGreaterThan(0)
    expect(knappar.some(k => k.approves), 'ett granskningskort har en godkänn-knapp').toBe(false)
    expect(knappar[0].label).toBe('Öppna och granska')
  })

  test('ett utförande kort har fortfarande sin Godkänn-knapp', () => {
    const knappar = cardActions('foreslar', { approveLabel: 'Skicka påminnelsen' })
    expect(knappar.some(k => k.approves && k.label === 'Skicka påminnelsen')).toBe(true)
  })

  test('kvittensen anpassas efter vad kortet är', () => {
    // Man avvisar inte ett konstaterande.
    expect(reviewAlternatives('missad_intakt')[1].label).toBe('Avvisa')
    const ack = Object.entries(ACTION_CONTRACT).find(([, k]) => k === 'ACKNOWLEDGEMENT')
    if (ack) expect(reviewAlternatives(ack[0])[1].label).toBe('Noterat')
  })
})

test.describe('Klart idag ljuger inte om vad som hände', () => {
  test('executed:false ger serverns egna ord, aldrig "skickade"', () => {
    const rad = doneRowText({
      action: 'approve',
      title: 'Avslutat projekt saknar faktura',
      executed: false,
      note: 'Öppna ärendet och granska det innan något skickas.',
    })
    expect(rad, 'påstår fortfarande leverans').not.toContain('skickade')
    expect(rad).toContain('Öppna ärendet och granska')
  })

  test('utan note men executed:false sägs det ändå inte "skickade"', () => {
    const rad = doneRowText({ action: 'approve', title: 'Något', executed: false })
    expect(rad).not.toContain('skickade')
    expect(rad).toContain('öppnade')
  })

  test('ett verkligt utförande får säga skickade', () => {
    expect(doneRowText({ action: 'approve', title: 'Påminnelse', executed: true }))
      .toContain('skickade')
    // Äldre svar utan fältet får behålla det gamla ordet hellre än ett påhittat.
    expect(doneRowText({ action: 'approve', title: 'Påminnelse' })).toContain('skickade')
  })

  test('avvisning är alltid avvisning', () => {
    expect(doneRowText({ action: 'reject', title: 'X', executed: false })).toBe('avvisade: X')
  })
})

test.describe('bruset uppströms — fem rader om samma tio offerter', () => {
  test('Daniels schema och dedup-fönstret säger samma sak', () => {
    // 168 h dimensionerades för "söndag + onsdag" — det står i dedup-modulens
    // eget filhuvud. Daniel kördes ändå DAGLIGEN, så det räckte att modellen
    // formulerade om sig för att samma insikt skulle passera som ny.
    const v = JSON.parse(read('vercel.json'))
    const daniel = v.crons.find((c: any) => c.path.endsWith('/daniel'))
    expect(daniel, 'daniels cron saknas').toBeTruthy()
    expect(daniel.schedule, 'daniel kör oftare än dedup-fönstret klarar')
      .toMatch(/\* \* 0,3$/)
  })

  test('varje hypotes har en dedup-nyckel som beskriver fenomenet', () => {
    // Punkt 1-4 saknade instruerad nyckel och föll tillbaka på rubriken.
    const p = read('lib/agents/daniel/observation-prompt.ts')
    for (const nyckel of [
      'daniel_conversion_by_customer_type',
      'daniel_stale_quotes_pattern',
      'daniel_lead_source_conversion',
      'daniel_price_elasticity',
    ]) {
      expect(p, `hypotesen saknar ${nyckel}`).toContain(nyckel)
    }
  })

  test('rate-limiten tar bort brus i stället för att flytta det', () => {
    // Kontrollen låg EFTER inserten: observationen sparades, fick inget
    // related_approval_id, och dök upp som nyhetsrad i stället. Ett tak som
    // skulle skona hantverkaren gjorde beslutskort till nyheter.
    const s = kod('lib/agents/shared/save-and-push.ts')
    const grind = s.indexOf('approvalsRemainingToday <= 0')
    const insert = s.indexOf(".from('business_knowledge')")
    expect(grind, 'ingen kvotgrind').toBeGreaterThan(-1)
    expect(grind, 'kvoten kollas efter att raden sparats').toBeLessThan(insert)
  })

  test('ett avfärdat kort återuppstår inte som nyhet', () => {
    // Rutten nollar related_approval_id när kortet inte längre är pending
    // (rätt för Agera-knappen). Nyhetsfiltret testade bara det fältet, så
    // kortet man nyss avfärdat kom tillbaka längre ned på sidan.
    expect(kod('app/api/observations/route.ts')).toContain('had_approval: true')
    expect(kod('components/jarvis/JarvisHome.tsx'))
      .toContain('!o.related_approval_id && !o.had_approval')
  })

  test('utkastkorten åldras — NULL matchas aldrig av .lt()', () => {
    for (const fil of ['lib/quotes/suggest-quote-draft.ts', 'lib/ata/suggest-ata-draft.ts']) {
      expect(kod(fil), `${fil} sätter inget expires_at`).toContain('expires_at:')
    }
  })
})

test.describe('ytan använder härledningen', () => {
  const s = kod('components/jarvis/JarvisHome.tsx')

  test('rösten är inte hårdkodad längre', () => {
    expect(s, 'voice="foreslar" står kvar hårdkodat').not.toContain('voice="foreslar"')
    expect(s).toContain('voiceFor(approval.approval_type)')
  })

  test('klienten läser serverns svar innan den skriver Klart idag', () => {
    expect(s).toContain('doneRowText({')
    // Fälten ligger nästlade under `execution` i route-svaret — läses de från
    // toppnivån blir executed alltid undefined och raden ljuger igen.
    expect(s).toContain('svar?.execution')
  })

  test('ångra-rutan säger inte "Skickar" om kort som inte kan skicka', () => {
    // Samma lögn som Klart idag-raden, bara några sekunder tidigare: den
    // optimistiska rutan visas FÖRE utskicket och sa "Skickar: …" även för
    // REVIEW_REQUIRED-kort.
    const i = s.indexOf('setSnack({')
    expect(i).toBeGreaterThan(-1)
    const block = s.slice(i, i + 500)
    expect(block).toContain('mayExecute(approval.approval_type)')
    expect(block).toContain('Behandlar:')
  })

  test('Öppna-knappen öppnar i stället för att skicka', () => {
    const i = s.indexOf("action.id === 'open'")
    expect(i, 'ingen hantering av Öppna').toBeGreaterThan(-1)
    const efter = s.slice(i, i + 400)
    expect(efter).toContain('setDetailIds')
    expect(efter, 'Öppna skickar något').not.toContain('queueAction')
  })
})
