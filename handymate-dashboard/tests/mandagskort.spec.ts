/**
 * Facit för Måndagskortet V1 (Måndagsmötet etapp 1, 2026-08-13).
 *
 * Rena funktioner ur lib/jarvis/monday-brief.ts — ingen DB, ingen browser
 * (samma stil som tests/company-scan.spec.ts / tests/startkort.spec.ts):
 *
 *   npx playwright test tests/mandagskort.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  byggMandagskort,
  byggFortroendeRader,
  mapRiskWarnings,
  isoWeekInfo,
  mandagskortId,
  mandagskortBeskrivning,
  type ManadsLedgerLike,
  type MandagskortFortroendeInput,
  type MandagskortRiskRad,
} from '../lib/jarvis/monday-brief'
import { ACTION_CONTRACT, classify, mayExecute } from '../lib/approvals/action-contract'
import { TYPE_LABEL, typeLabel, approveLabel } from '../lib/jarvis/approval-view'

const TOM_LEDGER: ManadsLedgerLike = {
  identifierat: { kr: 0, antal: 0 },
  agerat: { kr: 0, antal: 0 },
  fakturerat: { kr: 0, antal: 0 },
  betalt: { kr: 0, antal: 0 },
}

function basInput(overrides: Partial<Parameters<typeof byggMandagskort>[0]> = {}) {
  return {
    businessId: 'biz_1',
    monday: '2026-08-10', // en måndag (vecka 33, 2026)
    ledger: null,
    lessonsCount: 0,
    riskWarnings: [] as MandagskortRiskRad[],
    fortroendeInput: [] as MandagskortFortroendeInput[],
    ...overrides,
  }
}

test.describe('isoWeekInfo — ISO 8601-vecka', () => {
  test('en känd måndag ger rätt isoår + isovecka', () => {
    // 2026-08-10 är en måndag, ISO-vecka 33 2026.
    expect(isoWeekInfo('2026-08-10')).toEqual({ isoYear: 2026, isoWeek: 33 })
  })

  test('årsskifte hanteras (vecka 1 kan höra till föregående kalenderår i dec)', () => {
    // 2025-12-29 (måndag) är ISO-vecka 1, 2026 — kalenderåret 2025 men isoåret 2026.
    expect(isoWeekInfo('2025-12-29')).toEqual({ isoYear: 2026, isoWeek: 1 })
  })

  test('ogiltigt datum kastar i stället för att gissa', () => {
    expect(() => isoWeekInfo('inte-ett-datum')).toThrow()
  })
})

test.describe('mandagskortId — deterministisk primärnyckel', () => {
  test('formatet är mbrief_{businessId}_{isoÅr}-W{isovecka, 2 siffror}', () => {
    expect(mandagskortId('biz_1', '2026-08-10')).toBe('mbrief_biz_1_2026-W33')
  })

  test('samma företag + samma vecka ger samma id (dedupe-grunden)', () => {
    const a = mandagskortId('biz_1', '2026-08-10')
    const b = mandagskortId('biz_1', '2026-08-10')
    expect(a).toBe(b)
  })

  test('olika vecka eller företag ger olika id', () => {
    expect(mandagskortId('biz_1', '2026-08-10')).not.toBe(mandagskortId('biz_1', '2026-08-17'))
    expect(mandagskortId('biz_1', '2026-08-10')).not.toBe(mandagskortId('biz_2', '2026-08-10'))
  })

  test('enkelsiffrig veckonummer nollpaddas', () => {
    // 2026-01-05 är en måndag, ISO-vecka 2, 2026.
    expect(mandagskortId('biz_1', '2026-01-05')).toBe('mbrief_biz_1_2026-W02')
  })
})

test.describe('byggMandagskort — Resultat (n>0-regeln, en rad per ledger-steg)', () => {
  test('bara steg med antal > 0 tas med, i ordningen identifierat/agerat/fakturerat/betalt', () => {
    const kort = byggMandagskort(basInput({
      ledger: {
        identifierat: { kr: 45000, antal: 3 },
        agerat: { kr: 20000, antal: 1 },
        fakturerat: { kr: 0, antal: 0 }, // ska utelämnas
        betalt: { kr: 0, antal: 0 }, // ska utelämnas
      },
    }))
    expect(kort).not.toBeNull()
    expect(kort!.resultat).toEqual([
      { key: 'identifierat', kr: 45000, antal: 3 },
      { key: 'agerat', kr: 20000, antal: 1 },
    ])
  })

  test('alla fyra steg med antal 0 → hela Resultat-sektionen null', () => {
    const kort = byggMandagskort(basInput({ ledger: TOM_LEDGER }))
    expect(kort).toBeNull() // resultat var enda kandidaten och blev tom
  })

  test('ledger=null (ingen ledger hämtad) ger ingen resultat-sektion, kraschar inte', () => {
    const kort = byggMandagskort(basInput({ ledger: null, lessonsCount: 2 }))
    expect(kort).not.toBeNull()
    expect(kort!.resultat).toBeNull()
  })
})

test.describe('byggMandagskort — Lärdomar (n>0-regeln)', () => {
  test('lessonsCount > 0 ger sektionen', () => {
    const kort = byggMandagskort(basInput({ lessonsCount: 4 }))
    expect(kort!.lardomar).toEqual({ antal: 4 })
  })

  test('lessonsCount === 0 utelämnar sektionen helt (inte en tom rad)', () => {
    const kort = byggMandagskort(basInput({ lessonsCount: 0, riskWarnings: [{ project_id: 'p1', project_name: 'Kök', cost_percent: 80, status: 'at_risk' }] }))
    expect(kort!.lardomar).toBeNull()
  })
})

test.describe('byggMandagskort — Risker (n>0-regeln)', () => {
  const risk: MandagskortRiskRad = { project_id: 'p1', project_name: 'Villa Ek', cost_percent: 96, status: 'over_budget' }

  test('minst en öppen varning ger sektionen, oförändrad', () => {
    const kort = byggMandagskort(basInput({ riskWarnings: [risk] }))
    expect(kort!.risker).toEqual([risk])
  })

  test('tom lista utelämnar sektionen', () => {
    const kort = byggMandagskort(basInput({ riskWarnings: [], lessonsCount: 1 }))
    expect(kort!.risker).toBeNull()
  })
})

test.describe('byggMandagskort — alla fyra sektioner tomma → inget kort', () => {
  test('null när resultat/lärdomar/risker/förtroende alla saknas', () => {
    expect(byggMandagskort(basInput())).toBeNull()
  })

  test('en enda icke-tom sektion räcker för att skapa kortet', () => {
    expect(byggMandagskort(basInput({ lessonsCount: 1 }))).not.toBeNull()
  })
})

test.describe('mapRiskWarnings — validering, gissar aldrig', () => {
  test('rader utan project_id/project_name hoppas tyst över', () => {
    const rows = [
      { payload: { project_id: 'p1', project_name: 'Kök', cost_percent: 80, status: 'at_risk' } },
      { payload: { project_id: 'p2' } }, // saknar project_name
      { payload: null },
      { payload: {} },
    ]
    const rader = mapRiskWarnings(rows)
    expect(rader).toEqual([{ project_id: 'p1', project_name: 'Kök', cost_percent: 80, status: 'at_risk' }])
  })

  test('cost_percent/status som inte är rätt typ blir null, hittas inte på', () => {
    const rader = mapRiskWarnings([{ payload: { project_id: 'p1', project_name: 'Kök', cost_percent: '80%', status: 3 } }])
    expect(rader).toEqual([{ project_id: 'p1', project_name: 'Kök', cost_percent: null, status: null }])
  })
})

test.describe('byggFortroendeRader — bara autonoma nycklar visas', () => {
  test('en icke-autonom nyckel utelämnas helt, inte bara "nollad"', () => {
    const rader = byggFortroendeRader([
      { key: 'invoice_reminder', autonomous: true, streak: 18, cap_kr: 25000 },
      { key: 'quote_followup_sms', autonomous: false, streak: 0, cap_kr: null },
    ])
    expect(rader).toHaveLength(1)
    expect(rader[0].key).toBe('invoice_reminder')
  })

  test('etikett/agent hämtas ur AUTONOMY_META, inte hårdkodat i anropet', () => {
    const rader = byggFortroendeRader([{ key: 'invoice_reminder', autonomous: true, streak: 15, cap_kr: 25000 }])
    expect(rader[0]).toEqual({
      key: 'invoice_reminder',
      label: 'fakturapåminnelser',
      agent: 'karin',
      agentName: 'Karin',
      streak: 15,
      cap_kr: 25000,
    })
  })

  test('inga autonoma nycklar → tom lista, byggMandagskort ger null-sektion', () => {
    const kort = byggMandagskort(basInput({
      fortroendeInput: [{ key: 'invoice_reminder', autonomous: false, streak: 0, cap_kr: null }],
    }))
    expect(kort).toBeNull()
  })

  test('byggMandagskort tar bara med de autonoma raderna i fortroende-sektionen', () => {
    const kort = byggMandagskort(basInput({
      fortroendeInput: [
        { key: 'invoice_reminder', autonomous: true, streak: 20, cap_kr: 25000 },
        { key: 'quote_followup_sms', autonomous: false, streak: 0, cap_kr: null },
      ],
    }))
    expect(kort!.fortroende).toHaveLength(1)
    expect(kort!.fortroende![0].key).toBe('invoice_reminder')
  })
})

test.describe('mandagskortBeskrivning — svensk, teknikfri sammanfattning', () => {
  test('nämner bara de sektioner som faktiskt finns', () => {
    const kort = byggMandagskort(basInput({ lessonsCount: 2 }))!
    const text = mandagskortBeskrivning(kort)
    expect(text).toContain('lärdom')
    expect(text).not.toMatch(/payload|webhook|token/i)
  })
})

test.describe('action-contract — monday_brief är registrerad', () => {
  test('klassad som informationell — godkänn utför ingenting', () => {
    expect(classify('monday_brief')).toBe('INFORMATIONAL')
    expect(mayExecute('monday_brief')).toBe(false)
    expect(ACTION_CONTRACT.monday_brief).toBe('INFORMATIONAL')
  })
})

test.describe('approval-view.ts — monday_brief presenteras korrekt', () => {
  test('etiketten finns och är på svenska', () => {
    expect(TYPE_LABEL.monday_brief).toBe('Måndagskortet')
    expect(typeLabel('monday_brief')).toBe('Måndagskortet')
  })

  test('godkänn-knappen säger "Jag har läst det" — inget utförs', () => {
    expect(approveLabel('monday_brief')).toBe('Jag har läst det')
  })
})
