/**
 * Facit för agentteamet (2026-08-06, spår D1).
 *
 * ═══ VARFÖR DEN HÄR VAKTEN FINNS ═══
 *
 * Teamet låg i FYRA kopior: lib/agents/team.ts, agentPersonas.ts, en inlinead
 * karta i approvals/page.tsx och en till i den gamla morgonbriefen. De hann gå
 * isär precis som kopior gör:
 *
 * - **Lisa saknades helt i morgonbriefen.** Telefonisten — agenten som fångar
 *   det hantverkaren annars missar — syntes inte i den vy som ska sammanfatta
 *   vad teamet gjort. Ingen märkte det på månader, för ingenting pekade ut det.
 * - Lars var oliv i briefen men smaragd överallt annars.
 * - Hanna var rosa i briefen men lila överallt annars.
 *
 * Kopiorna är sammanslagna. Den här filen är regressionstestet: den låser att
 * alla sju finns, att härledningen är fullständig, och att paletten är hel.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/agent-team.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { TEAM, getAgentById } from '../lib/agents/team'
import { AGENT_INFO } from '../components/dashboard/agentPersonas'

/** De sju som faktiskt finns. Ändras listan ska någon behöva tänka efter. */
const EXPECTED_AGENT_IDS = ['matte', 'karin', 'hanna', 'daniel', 'lars', 'lisa', 'support']

test.describe('teamet är fullständigt', () => {
  test('alla sju agenter finns — inklusive Lisa och Handymate Support', () => {
    const ids = TEAM.map(a => a.id).sort()
    expect(ids, 'Någon agent saknas i teamet').toEqual([...EXPECTED_AGENT_IDS].sort())
  })

  test('inga dubbletter på id', () => {
    expect(new Set(TEAM.map(a => a.id)).size).toBe(TEAM.length)
  })

  test('varje agent har namn, roll och initialer', () => {
    const trasiga = TEAM.filter(a => !a.name?.trim() || !a.role?.trim() || !a.initials?.trim())
    expect(trasiga.map(a => a.id), 'Agenter utan namn, roll eller initialer').toEqual([])
  })
})

test.describe('paletten är hel — det som gick isär', () => {
  test('varje agent har alla fyra färgfälten', () => {
    const utan = TEAM.filter(a => !a.color || !a.dot || !a.softBg || !a.softText)
    expect(utan.map(a => a.id), 'Agenter med ofullständig palett').toEqual([])
  })

  test('färgerna är giltiga hexvärden', () => {
    const ogiltiga = TEAM.filter(
      a => !/^#[0-9a-fA-F]{6}$/.test(a.dot) || !/^#[0-9a-fA-F]{6}$/.test(a.softBg) || !/^#[0-9a-fA-F]{6}$/.test(a.softText),
    )
    expect(ogiltiga.map(a => a.id), 'Ogiltiga hexvärden').toEqual([])
  })

  test('två agenter delar aldrig färg', () => {
    // Samma färg på två agenter gör avataren obrukbar som identitet — och det
    // är enda platsen färgen får finnas.
    const dots = TEAM.map(a => a.dot.toLowerCase())
    expect(new Set(dots).size, 'Två agenter har samma färg').toBe(dots.length)
  })

  test('två agenter delar aldrig initialer', () => {
    const init = TEAM.map(a => a.initials.toLowerCase())
    expect(new Set(init).size, 'Två agenter har samma initialer').toBe(init.length)
  })
})

test.describe('härledningen tappar ingen', () => {
  test('AGENT_INFO har exakt samma agenter som TEAM', () => {
    expect(Object.keys(AGENT_INFO).sort()).toEqual(TEAM.map(a => a.id).sort())
  })

  test('AGENT_INFO speglar TEAM fält för fält', () => {
    // Det här är hela poängen med sammanslagningen: en agent kan inte längre
    // ha en färg på ett ställe och en annan någon annanstans.
    for (const a of TEAM) {
      const p = AGENT_INFO[a.id]
      expect(p.name, `${a.id} namn`).toBe(a.name)
      expect(p.role, `${a.id} roll`).toBe(a.role)
      expect(p.color, `${a.id} färgklass`).toBe(a.color)
      expect(p.initials, `${a.id} initialer`).toBe(a.initials)
      expect(p.dot, `${a.id} hexfärg`).toBe(a.dot)
    }
  })
})

test.describe('uppslaget', () => {
  test('hittar på id oavsett skiftläge', () => {
    expect(getAgentById('LISA')?.id).toBe('lisa')
    expect(getAgentById('lisa')?.id).toBe('lisa')
  })

  test('okänd agent ger null, inte en gissning', () => {
    // Ett fallback till Matte hade fått Lisas ärenden att se ut som hans.
    expect(getAgentById('finns-inte')).toBeNull()
    expect(getAgentById(null)).toBeNull()
    expect(getAgentById('')).toBeNull()
  })
})
