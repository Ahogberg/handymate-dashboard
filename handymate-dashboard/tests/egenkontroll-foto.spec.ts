/**
 * Egenkontroll-agenten — Etapp 1a facit-tester för fotobedömningens rena
 * kärna. Körs: npx playwright test tests/egenkontroll-foto.spec.ts --no-deps
 *
 * Testar buildAssessmentPrompt + parseAssessmentResponse + orkestreringens
 * felväg (lib/egenkontroll/photo-assessment.ts) — INGA live-API-anrop.
 * Anthropic-klienten instansieras aldrig här: assessPhotoAgainstChecklist
 * anropas alltid med en injicerad `caller`-mock, så defaultAnthropicCaller
 * (som gör `new Anthropic(...)`) nås aldrig.
 */
import { test, expect } from '@playwright/test'
import {
  buildAssessmentPrompt,
  parseAssessmentResponse,
  assessPhotoAgainstChecklist,
  type ChecklistPunkt,
} from '../lib/egenkontroll/photo-assessment'

const ITEMS: ChecklistPunkt[] = [
  { id: 'ci_1', text: 'Tätskikt applicerat enligt BBV', required: true },
  { id: 'ci_2', text: 'Verifiera fall mot brunn', required: true },
  { id: 'ci_3', text: 'Kontrollera ventilation', required: false },
]

// ── buildAssessmentPrompt ─────────────────────────────────────────

test.describe('buildAssessmentPrompt', () => {
  test('innehåller varje punkts text', () => {
    const { userText } = buildAssessmentPrompt(ITEMS)
    for (const item of ITEMS) {
      expect(userText).toContain(item.text)
      expect(userText).toContain(item.id)
    }
  })

  test('innehåller JSON-schema-instruktionen', () => {
    const { systemPrompt } = buildAssessmentPrompt(ITEMS)
    expect(systemPrompt).toContain('"bedomningar"')
    expect(systemPrompt).toContain('"punktId"')
    expect(systemPrompt).toContain('"status"')
    expect(systemPrompt).toContain('"motivering"')
    expect(systemPrompt).toContain('"konfidens"')
    expect(systemPrompt).toContain('stods')
    expect(systemPrompt).toContain('motsags')
    expect(systemPrompt).toContain('ej_synlig')
    expect(systemPrompt).toContain('ej_bedombar')
  })

  test('innehåller juridik-formuleringen — aldrig "godkänt enligt besiktningskrav"', () => {
    const { systemPrompt } = buildAssessmentPrompt(ITEMS)
    expect(systemPrompt).toContain('godkänt enligt besiktningskrav')
    expect(systemPrompt).toContain('hantverkaren')
    expect(systemPrompt.toLowerCase()).toContain('aldrig')
  })

  test('med photoContext: bildtexten syns i user-text', () => {
    const { userText } = buildAssessmentPrompt(ITEMS, 'Badrum, vägg mot dusch')
    expect(userText).toContain('Badrum, vägg mot dusch')
  })

  test('utan photoContext: ingen "Bildtext"-rad, inget kraschande', () => {
    const { userText: withoutCtx } = buildAssessmentPrompt(ITEMS)
    expect(withoutCtx).not.toContain('Bildtext')

    const { userText: withEmptyCtx } = buildAssessmentPrompt(ITEMS, '   ')
    expect(withEmptyCtx).not.toContain('Bildtext')
  })
})

// ── parseAssessmentResponse ───────────────────────────────────────

test.describe('parseAssessmentResponse — facit', () => {
  test('1) perfekt JSON-svar → alla punkter mappade korrekt', () => {
    const raw = JSON.stringify({
      bedomningar: [
        { punktId: 'ci_1', status: 'stods', motivering: 'Tätskikt syns tydligt applicerat.', konfidens: 'hog' },
        { punktId: 'ci_2', status: 'motsags', motivering: 'Fallet lutar fel väg.', konfidens: 'medel' },
        { punktId: 'ci_3', status: 'ej_synlig', motivering: 'Ventilation syns inte i bilden.', konfidens: 'hog' },
      ],
    })
    const result = parseAssessmentResponse(raw, ITEMS)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ punktId: 'ci_1', status: 'stods', motivering: 'Tätskikt syns tydligt applicerat.', konfidens: 'hog' })
    expect(result[1]).toEqual({ punktId: 'ci_2', status: 'motsags', motivering: 'Fallet lutar fel väg.', konfidens: 'medel' })
    expect(result[2]).toEqual({ punktId: 'ci_3', status: 'ej_synlig', motivering: 'Ventilation syns inte i bilden.', konfidens: 'hog' })
  })

  test('2) JSON i ```json-block med omgivande prat', () => {
    const raw = `Visst, här är min bedömning:\n\n\`\`\`json\n${JSON.stringify({
      bedomningar: [
        { punktId: 'ci_1', status: 'stods', motivering: 'Ser bra ut.', konfidens: 'hog' },
        { punktId: 'ci_2', status: 'stods', motivering: 'Fall mot brunn syns.', konfidens: 'medel' },
        { punktId: 'ci_3', status: 'ej_bedombar', motivering: 'Oskarp bild.', konfidens: 'lag' },
      ],
    })}\n\`\`\`\n\nHoppas det hjälper!`
    const result = parseAssessmentResponse(raw, ITEMS)
    expect(result).toHaveLength(3)
    expect(result.map(r => r.status)).toEqual(['stods', 'stods', 'ej_bedombar'])
  })

  test('3) svar som saknar en punkt → den punkten fylls "ej_bedombar"', () => {
    const raw = JSON.stringify({
      bedomningar: [
        { punktId: 'ci_1', status: 'stods', motivering: 'Ser bra ut.', konfidens: 'hog' },
        { punktId: 'ci_2', status: 'stods', motivering: 'Fall mot brunn syns.', konfidens: 'medel' },
        // ci_3 saknas helt
      ],
    })
    const result = parseAssessmentResponse(raw, ITEMS)
    expect(result).toHaveLength(3)
    const ci3 = result.find(r => r.punktId === 'ci_3')
    expect(ci3?.status).toBe('ej_bedombar')
    expect(ci3?.motivering).toBe('Kunde inte tolkas ur svaret')
    expect(ci3?.konfidens).toBe('lag')
  })

  test('4) okänd extra punkt i svaret → ignoreras, resten oförändrat', () => {
    const raw = JSON.stringify({
      bedomningar: [
        { punktId: 'ci_1', status: 'stods', motivering: 'Ser bra ut.', konfidens: 'hog' },
        { punktId: 'ci_2', status: 'stods', motivering: 'Fall mot brunn syns.', konfidens: 'medel' },
        { punktId: 'ci_3', status: 'ej_synlig', motivering: 'Syns ej.', konfidens: 'medel' },
        { punktId: 'ci_okänd_999', status: 'stods', motivering: 'Hittad på.', konfidens: 'hog' },
      ],
    })
    const result = parseAssessmentResponse(raw, ITEMS)
    expect(result).toHaveLength(3)
    expect(result.find(r => r.punktId === 'ci_okänd_999')).toBeUndefined()
  })

  test('5) ogiltig status-sträng → faller tillbaka till "ej_bedombar"', () => {
    const raw = JSON.stringify({
      bedomningar: [
        { punktId: 'ci_1', status: 'nog_okej_typ', motivering: 'Oklar status.', konfidens: 'hog' },
        { punktId: 'ci_2', status: 'stods', motivering: 'Fall mot brunn syns.', konfidens: 'ultra-sure' },
        { punktId: 'ci_3', status: 'ej_synlig', motivering: 'Syns ej.', konfidens: 'medel' },
      ],
    })
    const result = parseAssessmentResponse(raw, ITEMS)
    const ci1 = result.find(r => r.punktId === 'ci_1')
    expect(ci1?.status).toBe('ej_bedombar')
    const ci2 = result.find(r => r.punktId === 'ci_2')
    // ogiltig konfidens-sträng faller också tillbaka, till 'lag'
    expect(ci2?.konfidens).toBe('lag')
  })

  test('6) helt trasigt svar (ren prosa) → alla "ej_bedombar", inget kast', () => {
    const raw = 'Tyvärr kan jag inte analysera bilden just nu, försök igen senare.'
    expect(() => parseAssessmentResponse(raw, ITEMS)).not.toThrow()
    const result = parseAssessmentResponse(raw, ITEMS)
    expect(result).toHaveLength(3)
    expect(result.every(r => r.status === 'ej_bedombar')).toBe(true)
    expect(result.every(r => r.motivering === 'Kunde inte tolkas ur svaret')).toBe(true)
  })

  test('6b) tomt svar och null-liknande input kraschar inte', () => {
    expect(() => parseAssessmentResponse('', ITEMS)).not.toThrow()
    expect(parseAssessmentResponse('', ITEMS).every(r => r.status === 'ej_bedombar')).toBe(true)

    expect(() => parseAssessmentResponse('{"not_bedomningar": 123}', ITEMS)).not.toThrow()
    expect(() => parseAssessmentResponse('{ broken json ][', ITEMS)).not.toThrow()
  })

  test('7) tom punktlista → tom bedömningslista oavsett svar', () => {
    const raw = JSON.stringify({ bedomningar: [{ punktId: 'ci_1', status: 'stods', motivering: 'x', konfidens: 'hog' }] })
    expect(parseAssessmentResponse(raw, [])).toEqual([])
    expect(parseAssessmentResponse('helt trasig text', [])).toEqual([])
  })
})

// ── assessPhotoAgainstChecklist — orkestrering (injicerad caller, ingen live-API) ──

test.describe('assessPhotoAgainstChecklist', () => {
  test('är exporterad som funktion', () => {
    expect(typeof assessPhotoAgainstChecklist).toBe('function')
  })

  test('lyckat anrop: parsar caller-svaret och returnerar usage/kostnad', async () => {
    const result = await assessPhotoAgainstChecklist(
      {
        imageSource: { type: 'base64', mediaType: 'image/jpeg', data: 'ZmFrZQ==' },
        checklistItems: ITEMS,
        photoContext: 'Badrum',
      },
      {
        caller: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                bedomningar: [
                  { punktId: 'ci_1', status: 'stods', motivering: 'Ser bra ut.', konfidens: 'hog' },
                  { punktId: 'ci_2', status: 'stods', motivering: 'Fall syns.', konfidens: 'medel' },
                  { punktId: 'ci_3', status: 'ej_synlig', motivering: 'Syns ej.', konfidens: 'hog' },
                ],
              }),
            },
          ],
          usage: { input_tokens: 1200, output_tokens: 300 },
        }),
      },
    )
    expect(result.bedömningar).toHaveLength(3)
    expect(result.usage).toEqual({ input_tokens: 1200, output_tokens: 300 })
    expect(result.estimated_cost_usd).toBeGreaterThan(0)
  })

  test('felväg: caller kastar → alla punkter "ej_bedombar", inget kast till anroparen', async () => {
    const result = await assessPhotoAgainstChecklist(
      {
        imageSource: { type: 'url', url: 'https://example.com/foto.jpg' },
        checklistItems: ITEMS,
      },
      {
        caller: async () => {
          throw new Error('Anthropic API nere (simulerat i test)')
        },
      },
    )
    expect(result.bedömningar).toHaveLength(3)
    expect(result.bedömningar.every(b => b.status === 'ej_bedombar')).toBe(true)
    expect(result.bedömningar.every(b => b.motivering === 'Analysen kunde inte genomföras')).toBe(true)
    expect(result.usage).toBeUndefined()
    expect(result.estimated_cost_usd).toBeUndefined()
  })

  test('tom checklistItems → tom bedömningslista, callern anropas aldrig', async () => {
    let callerCalled = false
    const result = await assessPhotoAgainstChecklist(
      {
        imageSource: { type: 'base64', mediaType: 'image/jpeg', data: 'ZmFrZQ==' },
        checklistItems: [],
      },
      {
        caller: async () => {
          callerCalled = true
          return { content: [] }
        },
      },
    )
    expect(result.bedömningar).toEqual([])
    expect(callerCalled).toBe(false)
  })

  test('caller returnerar trasig text → fail-safe utan kast', async () => {
    const result = await assessPhotoAgainstChecklist(
      {
        imageSource: { type: 'base64', mediaType: 'image/jpeg', data: 'ZmFrZQ==' },
        checklistItems: ITEMS,
      },
      {
        caller: async () => ({ content: [{ type: 'text', text: 'inte json alls' }] }),
      },
    )
    expect(result.bedömningar).toHaveLength(3)
    expect(result.bedömningar.every(b => b.status === 'ej_bedombar')).toBe(true)
  })
})
