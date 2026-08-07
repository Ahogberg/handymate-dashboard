/**
 * Facit för agentens röstlägen (2026-08-07).
 *
 * Den regel som är hela anledningen till att knappraden byggs av en funktion i
 * stället för i JSX:
 *
 *   **Ett kort som FRÅGAR får aldrig ha en Godkänn-knapp.**
 *
 * Godkänn betyder "gör det du föreslår". Frågar systemet betyder det att det
 * inte har ett förslag — och en Godkänn-knapp där hade godkänt ingenting,
 * eller det första alternativet utan att hantverkaren valt det.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/jarvis-voice.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { voiceVerb, allowsApproval, isFramed, cardActions, type Voice } from '../lib/jarvis/voice'

const ALLA: Voice[] = ['berattar', 'foreslar', 'fragar']

test.describe('EN FRÅGA ÄR INTE ETT GODKÄNNANDE', () => {
  test('fragar producerar aldrig en handling som godkänner', () => {
    const actions = cardActions('fragar', {
      alternatives: [
        { id: 'flytta', label: 'Flytta Norén till 13:00' },
        { id: 'fraga', label: 'Fråga kunden om måndag' },
      ],
    })
    expect(actions.length).toBe(2)
    expect(actions.some(a => a.approves), 'Ett frågekort fick en godkännande-handling').toBe(false)
  })

  test('fragar får ingen Godkänn-knapp ens när approveLabel skickas in', () => {
    // Anroparen kan råka skicka med etiketten. Läget ska ändå avgöra.
    const actions = cardActions('fragar', {
      approveLabel: 'Godkänn & skicka',
      editable: true,
      alternatives: [{ id: 'a', label: 'Alternativ A' }],
    })
    expect(actions.some(a => a.approves)).toBe(false)
    expect(actions.some(a => a.id === 'approve')).toBe(false)
    expect(actions.some(a => a.id === 'edit')).toBe(false)
  })

  test('allowsApproval är sant BARA för föreslår', () => {
    expect(allowsApproval('foreslar')).toBe(true)
    expect(allowsApproval('fragar')).toBe(false)
    expect(allowsApproval('berattar')).toBe(false)
  })

  test('inget läge utom föreslår kan ge en godkännande-handling', () => {
    for (const v of ALLA) {
      const actions = cardActions(v, {
        approveLabel: 'Godkänn',
        editable: true,
        alternatives: [{ id: 'a', label: 'A' }],
      })
      const harGodkann = actions.some(a => a.approves)
      expect(harGodkann, `${v} gav en godkännande-handling`).toBe(allowsApproval(v))
    }
  })

  test('det första alternativet är fyllt för läsbarhet — men godkänner inget', () => {
    // Två identiska knappar bredvid varandra är svårlästa, så det första
    // alternativet får den fyllda formen. Skillnaden mot ett förval är att
    // `approves` förblir false — det är den skillnaden som räknas.
    const a = cardActions('fragar', {
      alternatives: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    })
    expect(a[0].kind).toBe('primar')
    expect(a[0].approves).toBe(false)
    expect(a[1].kind).toBe('sekundar')
  })
})

test.describe('berättar bär inga knappar alls', () => {
  test('tom knapprad oavsett vad som skickas in', () => {
    expect(cardActions('berattar', { approveLabel: 'Godkänn', editable: true })).toEqual([])
  })

  test('och renderas inte som ett kort', () => {
    // Skillnaden beslut/nyhet bärs av anatomin: ram + knappar = beslut,
    // ram-lös rad = nyhet. Man skummar sidan på två sekunder.
    expect(isFramed('berattar')).toBe(false)
    expect(isFramed('foreslar')).toBe(true)
    expect(isFramed('fragar')).toBe(true)
  })
})

test.describe('föreslår', () => {
  test('Godkänn, Läs & ändra, Avvisa när texten går att ändra', () => {
    const a = cardActions('foreslar', { approveLabel: 'Godkänn & skicka', editable: true })
    expect(a.map(x => x.id)).toEqual(['approve', 'edit', 'reject'])
    expect(a[0].label).toBe('Godkänn & skicka')
  })

  test('Ändra-knappen uteblir när inget går att ändra', () => {
    const a = cardActions('foreslar', { editable: false })
    expect(a.map(x => x.id)).toEqual(['approve', 'reject'])
  })

  test('högst en primär knapp', () => {
    // Två fyllda knappar bredvid varandra gör valet svårare, inte lättare.
    for (const v of ALLA) {
      const a = cardActions(v, {
        editable: true,
        alternatives: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
      })
      expect(a.filter(x => x.kind === 'primar').length, `${v} har flera primärknappar`).toBeLessThanOrEqual(1)
    }
  })

  test('exakt en handling godkänner — aldrig två', () => {
    const a = cardActions('foreslar', { editable: true })
    expect(a.filter(x => x.approves).length).toBe(1)
  })
})

test.describe('verbet i bylinen', () => {
  test('rösten syns som ord, inte som färg', () => {
    expect(voiceVerb('foreslar')).toBe('föreslår')
    expect(voiceVerb('fragar')).toBe('frågar')
  })

  test('berättar har inget verb — raden talar i dåtid själv', () => {
    expect(voiceVerb('berattar')).toBe('')
  })
})
