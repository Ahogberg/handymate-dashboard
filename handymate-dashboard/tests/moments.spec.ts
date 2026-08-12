/**
 * Facit för momentlagret (2026-08-08).
 *
 * ═══ VAD SOM VAKTAS ═══
 *
 * Momenten är säljdemons och de globala ytornas råvara — och därmed det
 * ställe där ett påhittat belopp gör mest skada. Reglerna som låses:
 *
 * 1. amountKr finns BARA när källraden bär ett verkligt, strukturerat
 *    belopp. Aldrig 0, aldrig en gissning, aldrig text-parsning.
 * 2. `projekt_utan_faktura` (amount_kr = 0 i svepet) blir en upptäckt
 *    utan siffra — inte "0 kr".
 * 3. Observationer blir insikter, aldrig pengar — business_knowledge har
 *    ingen värdekolumn.
 * 4. Högst ETT globalt kort, och samma moment avbryter aldrig två gånger.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/moments.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  formatKr,
  deriveFromApprovals,
  deriveFromObservations,
  deriveMoments,
  urgencyForAmount,
  type ApprovalRow,
  type ObservationRow,
} from '../lib/moments/derive'
import { tierFor, splitByTier, unseenValueKr } from '../lib/moments/interruption'
import { pengaFynd, approvalIdFromMoment } from '../lib/jarvis/moment-rows'

const NU = new Date('2026-08-08T12:00:00Z')

function appr(over: Partial<ApprovalRow> & { approval_type: string }): ApprovalRow {
  return {
    id: over.id ?? 'a1',
    title: over.title ?? 'Titel',
    description: over.description ?? null,
    payload: over.payload ?? null,
    created_at: over.created_at ?? '2026-08-08T06:00:00Z',
    approval_type: over.approval_type,
  }
}

test.describe('belopp är aldrig påhittade', () => {
  test('missad_intakt med belopp bär beloppet', () => {
    const [m] = deriveFromApprovals([
      appr({
        approval_type: 'missad_intakt',
        payload: { amount_kr: 34_900, project_id: 'p1', project_name: 'Badrum Sundin', kind: 'material_ej_fakturerat', evidence: 'Material klart' },
      }),
    ])
    expect(m.amountKr).toBe(34_900)
    expect(m.valueKind).toBe('potential')
    expect(m.action.label).toContain(formatKr(34_900))
    expect(m.action.href).toBe('/dashboard/projects/p1')
  })

  test('projekt_utan_faktura (0 kr) blir upptäckt utan siffra — aldrig "0 kr"', () => {
    const [m] = deriveFromApprovals([
      appr({
        approval_type: 'missad_intakt',
        payload: { amount_kr: 0, project_id: 'p2', project_name: 'Altan Ek', kind: 'projekt_utan_faktura' },
      }),
    ])
    expect(m.amountKr).toBeUndefined()
    expect(m.headline).not.toContain('0 kr')
    expect(m.action.label).toBe('Granska projektet')
  })

  test('invoice_reminder får belopp bara via uppslaget — aldrig ur texten', () => {
    const rad = appr({
      approval_type: 'invoice_reminder',
      description: 'Faktura 1042 på 24 300 kr är 3 dagar försenad.',
      payload: { invoice_id: 'inv1' },
    })
    // Utan uppslag: inget belopp, trots att texten innehåller ett.
    const [utan] = deriveFromApprovals([rad])
    expect(utan.amountKr).toBeUndefined()
    // Med uppslag: fakturans verkliga belopp.
    const [med] = deriveFromApprovals([rad], { inv1: 24_300 })
    expect(med.amountKr).toBe(24_300)
    expect(med.action.label).toContain(formatKr(24_300))
  })

  test('profitability_warning blir risk med overrun som belopp', () => {
    const [m] = deriveFromApprovals([
      appr({
        approval_type: 'profitability_warning',
        payload: { agent_id: 'karin', project_id: 'p3', project_name: 'Storgatan', projected_overrun: 9_250 },
      }),
    ])
    expect(m.valueKind).toBe('risk')
    expect(m.amountKr).toBe(9_250)
    expect(m.action.label).toContain('Skydda')
  })

  test('okända korttyper blir inga moments alls', () => {
    expect(deriveFromApprovals([appr({ approval_type: 'send_sms', payload: { message: 'hej' } })])).toEqual([])
  })
})

test.describe('observationer är insikter, inte pengar', () => {
  const obs = (over: Partial<ObservationRow>): ObservationRow => ({
    id: over.id ?? 'o1',
    agent_id: over.agent_id ?? 'lisa',
    title: over.title ?? 'Observation',
    observation: over.observation ?? 'Något hände',
    suggestion: over.suggestion ?? null,
    related_approval_id: over.related_approval_id ?? null,
    created_at: over.created_at ?? '2026-08-08T06:00:00Z',
  })

  test('en observation får aldrig ett belopp', () => {
    const [m] = deriveFromObservations([obs({ observation: 'Tre offerter värda 186 000 kr har inte följts upp' })])
    expect(m.valueKind).toBe('insikt')
    expect(m.amountKr).toBeUndefined()
  })

  test('observation med kort filtreras — samma fynd knackar inte två gånger', () => {
    expect(deriveFromObservations([obs({ related_approval_id: 'appr_x' })])).toEqual([])
  })
})

test.describe('avbrottsmotorn', () => {
  const stort = deriveFromApprovals([
    appr({ id: 'stor', approval_type: 'missad_intakt', payload: { amount_kr: 34_900, project_id: 'p1', project_name: 'X', kind: 'material_ej_fakturerat' } }),
  ])[0]

  test('stora färska pengar får avbryta', () => {
    expect(tierFor(stort, NU)).toBe('global')
  })

  test('gamla fynd avbryter inte, hur stora de än är', () => {
    const gammalt = { ...stort, createdAt: '2026-08-01T06:00:00Z' }
    expect(tierFor(gammalt, NU)).toBe('badge')
  })

  test('insikter utan belopp hamnar i panelen', () => {
    const insikt = deriveFromObservations([
      { id: 'o1', agent_id: 'lars', title: 'T', observation: 'Obs', suggestion: null, related_approval_id: null, created_at: '2026-08-08T06:00:00Z' },
    ])[0]
    expect(tierFor(insikt, NU)).toBe('panel')
  })

  test('högst ETT globalt kort — resten blir badge', () => {
    const tva = deriveFromApprovals([
      appr({ id: 'a', approval_type: 'missad_intakt', payload: { amount_kr: 30_000, project_id: 'p1', project_name: 'A', kind: 'material_ej_fakturerat' } }),
      appr({ id: 'b', approval_type: 'missad_intakt', payload: { amount_kr: 20_000, project_id: 'p2', project_name: 'B', kind: 'material_ej_fakturerat' } }),
    ])
    const { global, badge } = splitByTier(tva, new Set(), NU)
    expect(global?.id).toBe('appr:a')
    expect(badge.map(m => m.id)).toContain('appr:b')
  })

  test('ett sett moment avbryter aldrig igen', () => {
    const { global, panel } = splitByTier([stort], new Set(['appr:stor']), NU)
    expect(global).toBeNull()
    // Panelen behåller det — att öppna Matte är att be om hela listan.
    expect(panel.map(m => m.id)).toContain('appr:stor')
  })

  test('bubbelsumman räknar bara osedda verkliga belopp', () => {
    const insikt = deriveFromObservations([
      { id: 'o1', agent_id: 'lars', title: 'T', observation: 'Obs', suggestion: null, related_approval_id: null, created_at: '2026-08-08T06:00:00Z' },
    ])[0]
    expect(unseenValueKr([stort, insikt], new Set())).toBe(34_900)
    expect(unseenValueKr([stort, insikt], new Set(['appr:stor']))).toBe(0)
  })
})

test.describe('penga-fynd i Värt att veta (JarvisHome, 2026-08-12)', () => {
  const stor = deriveFromApprovals([
    appr({ id: 'stor', approval_type: 'missad_intakt', payload: { amount_kr: 34_900, project_id: 'p1', project_name: 'X', kind: 'material_ej_fakturerat' } }),
  ])[0]
  const utanBelopp = deriveFromApprovals([
    appr({ id: 'utan', approval_type: 'missad_intakt', payload: { amount_kr: 0, project_id: 'p2', project_name: 'Y', kind: 'projekt_utan_faktura' } }),
  ])[0]
  const insikt = deriveFromObservations([
    { id: 'o1', agent_id: 'lars', title: 'T', observation: 'Obs', suggestion: null, related_approval_id: null, created_at: '2026-08-08T06:00:00Z' },
  ])[0]

  test('approvalIdFromMoment läser bara appr:-formatet', () => {
    expect(approvalIdFromMoment(stor)).toBe('stor')
    expect(approvalIdFromMoment(insikt)).toBeNull()
  })

  test('ett moment vars approval redan är ett synligt beslutskort dedupliceras bort', () => {
    const utan = pengaFynd([stor], new Set(['stor']))
    expect(utan.map(m => m.id)).not.toContain('appr:stor')
  })

  test('ett moment vars approval INTE syns som beslutskort tas med', () => {
    const med = pengaFynd([stor], new Set(['annan-approval']))
    expect(med.map(m => m.id)).toContain('appr:stor')
  })

  test('insikter (observationsmoment) hör inte hemma här — Värt att veta visar dem redan som nyhetsrader', () => {
    const rader = pengaFynd([stor, insikt], new Set())
    expect(rader.map(m => m.id)).toEqual(['appr:stor'])
  })

  test('ett moment utan belopp (t.ex. projekt_utan_faktura) tas ändå med — bara badgen uteblir', () => {
    const rader = pengaFynd([utanBelopp], new Set())
    expect(rader).toHaveLength(1)
    expect(rader[0].amountKr).toBeUndefined()
  })

  test('högst `max` rader — resten göms, inkommande ordning bevaras (deriveMoments sorterar redan störst-först innan pengaFynd anropas)', () => {
    const flera = deriveFromApprovals([
      appr({ id: 'a', approval_type: 'missad_intakt', payload: { amount_kr: 40_000, project_id: 'p1', project_name: 'A', kind: 'material_ej_fakturerat' } }),
      appr({ id: 'b', approval_type: 'missad_intakt', payload: { amount_kr: 30_000, project_id: 'p2', project_name: 'B', kind: 'material_ej_fakturerat' } }),
      appr({ id: 'c', approval_type: 'missad_intakt', payload: { amount_kr: 20_000, project_id: 'p3', project_name: 'C', kind: 'material_ej_fakturerat' } }),
      appr({ id: 'd', approval_type: 'missad_intakt', payload: { amount_kr: 10_000, project_id: 'p4', project_name: 'D', kind: 'material_ej_fakturerat' } }),
    ])
    const rader = pengaFynd(flera, new Set(), 3)
    expect(rader).toHaveLength(3)
    expect(rader.map(m => m.id)).toEqual(['appr:a', 'appr:b', 'appr:c'])
  })
})

test.describe('sortering och trösklar', () => {
  test('störst belopp först', () => {
    const lista = deriveMoments(
      [
        appr({ id: 'liten', approval_type: 'missad_intakt', payload: { amount_kr: 3_000, project_id: 'p1', project_name: 'A', kind: 'ata_ej_fakturerad' } }),
        appr({ id: 'stor', approval_type: 'missad_intakt', payload: { amount_kr: 50_000, project_id: 'p2', project_name: 'B', kind: 'material_ej_fakturerat' } }),
      ],
      [],
    )
    expect(lista[0].id).toBe('appr:stor')
  })

  test('brådsketrappan följer beloppet', () => {
    expect(urgencyForAmount(null)).toBe('low')
    expect(urgencyForAmount(1_500)).toBe('low')
    expect(urgencyForAmount(5_000)).toBe('medium')
    expect(urgencyForAmount(25_000)).toBe('high')
  })
})
