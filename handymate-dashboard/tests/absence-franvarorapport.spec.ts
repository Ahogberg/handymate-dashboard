/**
 * Facit för återkomstrapporten (Etapp Å) — deriveFranvarorapport är en ren
 * funktion (all I/O ligger i byggFranvarorapport, otestad här).
 *
 *   npx playwright test tests/absence-franvarorapport.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { deriveFranvarorapport, type FranvarorapportApprovalRow } from '../lib/absence/franvarorapport'
import type { DigestAktivitet } from '../lib/jarvis/dygnsdigest'

const FROM = new Date('2026-08-14T00:00:00.000Z')
const TO = new Date('2026-08-16T23:59:59.000Z')

const akt = (id: string, over: Partial<DigestAktivitet> = {}): DigestAktivitet => ({
  id,
  source: 'automation',
  agent_id: 'karin',
  description: 'Skickade påminnelse för faktura 2026-014',
  status: 'success',
  created_at: '2026-08-15T09:00:00.000Z',
  auto: true,
  ...over,
})

const appr = (id: string, over: Partial<FranvarorapportApprovalRow> = {}): FranvarorapportApprovalRow => ({
  id,
  approval_type: 'invoice_reminder',
  title: 'Skicka påminnelse',
  risk_level: 'medium',
  payload: null,
  status: 'pending',
  created_at: '2026-08-15T09:00:00.000Z',
  ...over,
})

test.describe('gjort — per agent, dygnsdigestens grindar över fönstret', () => {
  test('räknar godkända rader per agent, filtrerar bort brus/misslyckanden precis som dygnsdigesten', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [
        akt('a', { agent_id: 'karin' }),
        akt('b', { agent_id: 'karin' }),
        akt('c', { agent_id: 'lars' }),
        akt('d', { status: 'failed' }), // exkluderas ur gjort
        akt('e', { description: 'Jag är Karin och håller koll' }), // brus, exkluderas
      ],
      approvals: [],
    })
    expect(rapport.gjort).toEqual([
      { agentId: 'karin', antal: 2 },
      { agentId: 'lars', antal: 1 },
    ])
  })

  test('aktivitet utanför fönstret räknas inte med', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [akt('utanfor', { created_at: '2026-08-10T09:00:00.000Z' })],
      approvals: [],
    })
    expect(rapport.gjort).toEqual([])
  })
})

test.describe('misslyckades — komplementet till gjort', () => {
  test('status failed inom fönstret listas ärligt, med felmeddelande', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [akt('x', { status: 'failed', description: 'SMS gick inte fram' })],
      approvals: [],
    })
    expect(rapport.misslyckades).toEqual([
      { key: 'automation-x', tid: '2026-08-15T09:00:00.000Z', agentId: 'karin', text: 'SMS gick inte fram' },
    ])
  })

  test('saknad beskrivning ger ändå en ärlig rad, aldrig tyst borttappad', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [akt('x', { status: 'failed', description: null })],
      approvals: [],
    })
    expect(rapport.misslyckades[0].text).toBe('Misslyckades utan felmeddelande')
  })

  test('misslyckanden utanför fönstret räknas inte med', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [akt('x', { status: 'failed', created_at: '2026-08-20T00:00:00.000Z' })],
      approvals: [],
    })
    expect(rapport.misslyckades).toEqual([])
  })
})

test.describe('väntar — nulägets öppna kö, oavsett skapad-datum', () => {
  test('pending-kort listas, oavsett om de skapades i eller utanför fönstret', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [],
      approvals: [
        appr('gammalt', { status: 'pending', created_at: '2026-07-01T00:00:00.000Z' }),
        appr('nytt', { status: 'pending', created_at: '2026-08-15T00:00:00.000Z' }),
        appr('avgjort', { status: 'approved' }),
      ],
    })
    expect(rapport.vantar.map(v => v.id).sort()).toEqual(['gammalt', 'nytt'])
  })
})

test.describe('behöver beslut — eskaleringsklassade, öppna, skapade i fönstret', () => {
  test('ett kort med risk_level high inom fönstret hamnar här', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [],
      approvals: [appr('hog-risk', { risk_level: 'high', status: 'pending' })],
    })
    expect(rapport.behoverBeslut).toEqual([
      { id: 'hog-risk', approvalType: 'invoice_reminder', title: 'Skicka påminnelse', escalationClass: 'high_risk_approval' },
    ])
  })

  test('ett vanligt (icke-eskalerande) öppet kort hamnar INTE här — bara i väntar', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [],
      approvals: [appr('vanligt', { risk_level: 'medium', status: 'pending' })],
    })
    expect(rapport.behoverBeslut).toEqual([])
    expect(rapport.vantar.map(v => v.id)).toEqual(['vanligt'])
  })

  test('ett redan avgjort eskaleringskort (inte längre pending) hamnar inte här', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [],
      approvals: [appr('avgjort-hog', { risk_level: 'high', status: 'approved' })],
    })
    expect(rapport.behoverBeslut).toEqual([])
  })

  test('ett eskaleringskort skapat FÖRE fönstret hamnar inte här (redan känt innan frånvaron)', () => {
    const rapport = deriveFranvarorapport({
      window: { from: FROM, to: TO },
      aktiviteter: [],
      approvals: [appr('gammal-eskalering', { risk_level: 'high', status: 'pending', created_at: '2026-08-01T00:00:00.000Z' })],
    })
    expect(rapport.behoverBeslut).toEqual([])
    // ...men den är fortfarande en del av väntar-kön, den försvinner aldrig helt.
    expect(rapport.vantar.map(v => v.id)).toEqual(['gammal-eskalering'])
  })
})

test.describe('fönstrets tidsstämplar ekas i svaret', () => {
  test('from/to i svaret är ISO av det inskickade fönstret', () => {
    const rapport = deriveFranvarorapport({ window: { from: FROM, to: TO }, aktiviteter: [], approvals: [] })
    expect(rapport.from).toBe(FROM.toISOString())
    expect(rapport.to).toBe(TO.toISOString())
  })
})
