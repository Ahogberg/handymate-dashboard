/**
 * Facit för Mötesassistenten V2 — segmentrotation (90-minutersmöten).
 *
 * Två rena funktioner testas hårt eftersom de är källan till sanning för
 * vad kunden faktiskt sa: assembleTranscript (ihopsättning av 5-minuters-
 * segment till ett tidsstämplat transkript, med ärliga luckor vid
 * misslyckade segment) och bokningarAttPaminna (fönstret för
 * förmötespåminnelse-pushen).
 *
 *   npx playwright test tests/meeting-v2.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  assembleTranscript,
  formatOffset,
  type TranscriptSegment,
} from '../lib/meetings/assemble-transcript'
import {
  bokningarAttPaminna,
  PAMINNELSE_FONSTER_MIN,
  type ReminderCandidate,
} from '../lib/meetings/reminder-window'

const seg = (over: Partial<TranscriptSegment> & { seq: number }): TranscriptSegment => ({
  status: 'transcribed',
  transcript: 'Hej och välkommen.',
  durationSeconds: 300,
  whisperSegments: null,
  ...over,
})

test.describe('formatOffset', () => {
  test('0 → 00:00', () => {
    expect(formatOffset(0)).toBe('00:00')
  })
  test('65 → 01:05', () => {
    expect(formatOffset(65)).toBe('01:05')
  })
  test('3661 → 1:01:01 (timme utan padding, resten paddat)', () => {
    expect(formatOffset(3661)).toBe('1:01:01')
  })
})

test.describe('assembleTranscript — markörer och kumulativa offsets', () => {
  test('två 300s-segment → andra blocket markeras [05:00]', () => {
    const result = assembleTranscript([
      seg({ seq: 1, transcript: 'Första delen.' }),
      seg({ seq: 2, transcript: 'Andra delen.' }),
    ])
    expect(result.text).toContain('[00:00]\nFörsta delen.')
    expect(result.text).toContain('[05:00]\nAndra delen.')
    expect(result.text).toBe('[00:00]\nFörsta delen.\n\n[05:00]\nAndra delen.')
  })

  test('h:mm:ss används när offseten är minst en timme', () => {
    const result = assembleTranscript([
      seg({ seq: 1, transcript: 'Inledning.', durationSeconds: 3600 }),
      seg({ seq: 2, transcript: 'Efter en timme.', durationSeconds: 300 }),
    ])
    expect(result.text).toContain('[1:00:00]\nEfter en timme.')
  })

  test('misslyckat segment → explicit lucka, offset avancerar ändå', () => {
    const result = assembleTranscript([
      seg({ seq: 1, transcript: 'Första delen.', durationSeconds: 300 }),
      seg({ seq: 2, status: 'failed', transcript: null, durationSeconds: 300 }),
      seg({ seq: 3, transcript: 'Tredje delen.', durationSeconds: 300 }),
    ])
    expect(result.missingSegments).toBe(1)
    expect(result.text).toContain('[05:00]\n[— avsnitt saknas —]')
    // Tredje segmentet ska ändå ligga på 10:00, trots att segment 2 saknar text.
    expect(result.text).toContain('[10:00]\nTredje delen.')
    expect(result.totalSeconds).toBe(900)
  })

  test('tomt transkript (status transcribed men tom sträng) räknas som saknat', () => {
    const result = assembleTranscript([seg({ seq: 1, transcript: '   ' })])
    expect(result.missingSegments).toBe(1)
    expect(result.text).toBe('[00:00]\n[— avsnitt saknas —]')
  })

  test('ej ännu transkriberat segment (status uploaded) räknas som saknat', () => {
    const result = assembleTranscript([
      seg({ seq: 1, status: 'uploaded', transcript: null }),
    ])
    expect(result.missingSegments).toBe(1)
  })

  test('indataordning spelar ingen roll — sortering sker på seq', () => {
    const ordnad = assembleTranscript([
      seg({ seq: 1, transcript: 'Ett.' }),
      seg({ seq: 2, transcript: 'Två.' }),
      seg({ seq: 3, transcript: 'Tre.' }),
    ])
    const blandad = assembleTranscript([
      seg({ seq: 3, transcript: 'Tre.' }),
      seg({ seq: 1, transcript: 'Ett.' }),
      seg({ seq: 2, transcript: 'Två.' }),
    ])
    expect(JSON.stringify(blandad)).toBe(JSON.stringify(ordnad))
  })
})

test.describe('assembleTranscript — timeline', () => {
  test('whisperSegments ger en timeline-post per whisper-segment, offset = segmentoffset + start', () => {
    const result = assembleTranscript([
      seg({
        seq: 1,
        transcript: 'Hej. Hur mår du?',
        durationSeconds: 300,
        whisperSegments: [
          { start: 0, end: 1.2, text: ' Hej.' },
          { start: 1.2, end: 3, text: ' Hur mår du?' },
        ],
      }),
      seg({
        seq: 2,
        transcript: 'Bra tack.',
        durationSeconds: 300,
        whisperSegments: [{ start: 0.5, end: 2, text: ' Bra tack.' }],
      }),
    ])
    expect(result.timeline).toEqual([
      { offsetSeconds: 0, text: 'Hej.' },
      { offsetSeconds: 1, text: 'Hur mår du?' },
      { offsetSeconds: 301, text: 'Bra tack.' }, // 300 + round(0.5) = 301 (JS rundar 0.5 uppåt)
    ])
  })

  test('segment utan whisperSegments ger en enda timeline-post på segmentoffset', () => {
    const result = assembleTranscript([
      seg({ seq: 1, transcript: 'Första.', durationSeconds: 300 }),
      seg({ seq: 2, transcript: 'Andra.', durationSeconds: 300, whisperSegments: null }),
    ])
    expect(result.timeline).toEqual([
      { offsetSeconds: 0, text: 'Första.' },
      { offsetSeconds: 300, text: 'Andra.' },
    ])
  })
})

test.describe('assembleTranscript — grundregler', () => {
  test('totalSeconds är summan av alla segments längd', () => {
    const result = assembleTranscript([
      seg({ seq: 1, durationSeconds: 300 }),
      seg({ seq: 2, durationSeconds: 280 }),
      seg({ seq: 3, status: 'failed', transcript: null, durationSeconds: 310 }),
    ])
    expect(result.totalSeconds).toBe(890)
  })

  test('tom indata → tom text och nollställda tal', () => {
    const result = assembleTranscript([])
    expect(result.text).toBe('')
    expect(result.totalSeconds).toBe(0)
    expect(result.missingSegments).toBe(0)
    expect(result.timeline).toEqual([])
  })

  test('determinism: samma indata → identiskt utfall', () => {
    const input = [
      seg({ seq: 2, transcript: 'Andra.', whisperSegments: [{ start: 1, end: 2, text: 'Andra.' }] }),
      seg({ seq: 1, transcript: 'Första.' }),
      seg({ seq: 3, status: 'failed', transcript: null }),
    ]
    const a = assembleTranscript(input)
    const b = assembleTranscript(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

test.describe('bokningarAttPaminna — fönstret [nu+10min, nu+20min)', () => {
  const NU = new Date('2026-08-11T10:00:00Z')

  const booking = (over: Partial<ReminderCandidate>): ReminderCandidate => ({
    booking_id: 'bok_1',
    business_id: 'biz_001',
    scheduled_start: '2026-08-11T10:15:00Z',
    customer_id: 'cust_1',
    status: null,
    meeting_reminder_pushed_at: null,
    ...over,
  })

  const plusMin = (min: number) => new Date(NU.getTime() + min * 60_000).toISOString()

  test('konstanten matchar det dokumenterade fönstret', () => {
    expect(PAMINNELSE_FONSTER_MIN).toEqual({ fran: 10, till: 20 })
  })

  test('exakt nu+10min inkluderas (inklusiv nedre gräns)', () => {
    const result = bokningarAttPaminna([booking({ scheduled_start: plusMin(10) })], NU)
    expect(result).toHaveLength(1)
  })

  test('exakt nu+20min exkluderas (exklusiv övre gräns)', () => {
    const result = bokningarAttPaminna([booking({ scheduled_start: plusMin(20) })], NU)
    expect(result).toHaveLength(0)
  })

  test('nu+9min exkluderas (för tidigt)', () => {
    const result = bokningarAttPaminna([booking({ scheduled_start: plusMin(9) })], NU)
    expect(result).toHaveLength(0)
  })

  test('nu+21min exkluderas (för sent)', () => {
    const result = bokningarAttPaminna([booking({ scheduled_start: plusMin(21) })], NU)
    expect(result).toHaveLength(0)
  })

  test('saknad customer_id exkluderas', () => {
    const result = bokningarAttPaminna(
      [booking({ scheduled_start: plusMin(15), customer_id: null })],
      NU
    )
    expect(result).toHaveLength(0)
  })

  test('redan skickad påminnelse exkluderas', () => {
    const result = bokningarAttPaminna(
      [
        booking({
          scheduled_start: plusMin(15),
          meeting_reminder_pushed_at: '2026-08-11T09:00:00Z',
        }),
      ],
      NU
    )
    expect(result).toHaveLength(0)
  })

  test('avbokad bokning exkluderas', () => {
    const result = bokningarAttPaminna(
      [booking({ scheduled_start: plusMin(15), status: 'cancelled' })],
      NU
    )
    expect(result).toHaveLength(0)
  })

  test('null status inkluderas', () => {
    const result = bokningarAttPaminna(
      [booking({ scheduled_start: plusMin(15), status: null })],
      NU
    )
    expect(result).toHaveLength(1)
  })

  test('ogiltigt datum exkluderas', () => {
    const result = bokningarAttPaminna(
      [booking({ scheduled_start: 'inte-ett-datum' })],
      NU
    )
    expect(result).toHaveLength(0)
  })

  test('resultatet sorteras stigande på scheduled_start', () => {
    const sen = booking({ booking_id: 'sen', scheduled_start: plusMin(19) })
    const tidig = booking({ booking_id: 'tidig', scheduled_start: plusMin(10) })
    const mitten = booking({ booking_id: 'mitten', scheduled_start: plusMin(15) })
    const result = bokningarAttPaminna([sen, tidig, mitten], NU)
    expect(result.map((b) => b.booking_id)).toEqual(['tidig', 'mitten', 'sen'])
  })
})
