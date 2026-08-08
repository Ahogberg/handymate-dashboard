/**
 * Facit för den delade agentytan (Codex audit avsnitt 7–8, Epic 3).
 *
 * Auditens fynd: MatteChatModal och Jobbkompisen renderade varsin kopia av
 * samma bubbla, och båda ritade Mattes porträtt på ALLA svar med en fotnot
 * "💬 via Karin" under. Efter Epic 2 kan tre kollegor svara i följd — då är
 * fel ansikte inte en detalj utan en obegriplig konversation.
 *
 * Fyra saker som måste hålla:
 *   1. samma agent har samma identitet överallt (en källa, inte fyra)
 *   2. de tre ytorna går genom samma adapter
 *   3. UI:t hittar aldrig på en status — den kommer från servern
 *   4. den gamla kopierade fotnoten är borta från båda ytorna
 *
 *   npx playwright test tests/agent-interaction.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  agentIdentity,
  byline,
  statusLabel,
  fromChatMessage,
  fromMoment,
  fromApproval,
} from '../lib/agents/interaction'
import { TEAM } from '../lib/agents/team'
import type { AgentMoment } from '../lib/moments/derive'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/**
 * Kommentarerna beskriver ofta det som TOGS BORT ("fotnoten 💬 via Karin").
 * Ett facit som söker efter borttagen kod måste därför läsa koden, inte
 * berättelsen om den.
 */
const utanKommentarer = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // Blockkommentarer bara när de börjar på egen rad. En naiv /\*…\*\//-regel
    // tolkar accept="image/*" som kommentarstart och äter halva filen — den
    // buggen åt upp <AgentMessage> och fick facit att larma om rätt kod.
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('identitetskontraktet — en källa för hela teamet', () => {
  test('varje agent i TEAM har namn, roll, accent och ett eget verb', () => {
    for (const a of TEAM) {
      const id = agentIdentity(a.id)
      expect(id.name, `${a.id} saknar namn`).toBe(a.name)
      expect(id.role, `${a.id} saknar roll`).toBe(a.role)
      expect(id.dot, `${a.id} saknar accentfärg`).toBe(a.dot)
      expect(id.shortVerb, `${a.id} fick reservverbet — lägg till ett eget`).not.toBe('noterade')
    }
  })

  test('verben skiljer rollerna åt — inte sex gånger samma ord', () => {
    const verb = TEAM.map(a => agentIdentity(a.id).shortVerb)
    expect(new Set(verb).size, 'flera agenter delar verb').toBe(verb.length)
  })

  test('okänd agent får neutral identitet, aldrig en gissad person', () => {
    const okänd = agentIdentity('rickard')
    expect(okänd.name).toBe('Teamet')
    expect(okänd.role).toBe('')
  })

  test('bylinen är tredje person: "Karin · Ekonom förberedde"', () => {
    expect(byline('karin')).toBe('Karin · Ekonom förberedde')
    expect(byline('daniel')).toContain('hittade')
  })
})

test.describe('adaptrarna — tre ytor, en form', () => {
  test('chattmeddelande blir interaction med rätt avsändare', () => {
    const i = fromChatMessage({ role: 'assistant', content: 'Fakturan är förberedd.', agent: 'karin' })
    expect(i.source).toBe('chat')
    expect(i.agentKey).toBe('karin')
    expect(i.byline).toContain('Karin')
    expect(i.body, 'adaptern skriver om texten').toBe('Fakturan är förberedd.')
  })

  test('överlämning får eget läge — den är ett skifte, inte ett svar', () => {
    const i = fromChatMessage({
      role: 'assistant', content: 'Jag lämnar över till Karin.', agent: 'lars', is_handoff_announcement: true,
    })
    expect(i.mode).toBe('handoff')
  })

  test('moment är alltid informational — får aldrig se ut som utförd åtgärd', () => {
    const moment: AgentMoment = {
      id: 'appr:1',
      agentId: 'daniel',
      headline: 'Offerten har stått i sex dagar',
      explanation: 'Mikael svarade aldrig.',
      valueKind: 'potential',
      amountKr: 18400,
      urgency: 'medium',
      action: { label: 'Följ upp 18 400 kr', href: '/dashboard/quotes/q1' },
      createdAt: '2026-08-08T08:00:00Z',
    }
    const i = fromMoment(moment)
    expect(i.mode).toBe('informational')
    expect(i.status).toBe('informational')
    expect(i.value?.amountKr).toBe(18400)
    expect(i.target?.href).toBe('/dashboard/quotes/q1')
  })

  test('godkännande som väntar är proposal, utfört är result', () => {
    const väntar = fromApproval({ id: 'a1', approval_type: 'send_invoice', status: 'pending' })
    expect(väntar.mode).toBe('proposal')
    expect(väntar.status).toBe('awaiting_approval')
    expect(väntar.agentKey, 'faktura hör till Karin').toBe('karin')
    expect(väntar.approvalId).toBe('a1')

    const utfört = fromApproval({ id: 'a2', approval_type: 'send_invoice', status: 'approved' })
    expect(utfört.status).toBe('completed')
    expect(utfört.mode).toBe('result')
  })
})

test.describe('statusspråket är Epic 2:s, på svenska', () => {
  test('varje status har ett ord — utom informational, som inte ska ha ett', () => {
    expect(statusLabel('failed')).toBe('Gick inte')
    expect(statusLabel('partial')).toBe('Delvis klart')
    expect(statusLabel('awaiting_approval')).toBe('Väntar på ditt godkännande')
    expect(statusLabel('completed')).toBe('Klart')
    expect(statusLabel('informational')).toBeNull()
  })

  test('UI:t gissar aldrig en status — den kommer från servern', () => {
    const utanStatus = fromChatMessage({ role: 'assistant', content: 'Klart, allt är fixat!', agent: 'daniel' })
    expect(utanStatus.status, 'modellens ord gav status').toBe('informational')
  })

  test('servern sätter sammanfattningens status till den sämsta av stegen', () => {
    const s = read('app/api/matte/chat/route.ts')
    const i = s.indexOf('const värst')
    expect(i, 'ingen statushärledning på sammanfattningen').toBeGreaterThan(-1)
    const block = s.slice(i, i + 400)
    // Ordningen ÄR regeln: ett felat steg får aldrig gömmas bakom ett klart.
    expect(block.indexOf("'failed'")).toBeLessThan(block.indexOf("'partial'"))
    expect(block.indexOf("'partial'")).toBeLessThan(block.indexOf("'awaiting_approval'"))
  })
})

test.describe('båda chattytorna renderar samma bubbla', () => {
  const modal = utanKommentarer(read('components/MatteChatModal.tsx'))
  const bubbla = utanKommentarer(read('components/Jobbkompisen.tsx'))

  test('ingen av dem har kvar sin egen meddelanderendering', () => {
    for (const [namn, källa] of [['MatteChatModal', modal], ['Jobbkompisen', bubbla]] as const) {
      expect(källa, `${namn} använder inte den delade bubblan`).toContain('<AgentMessage')
      expect(källa, `${namn} har kvar den kopierade fotnoten`).not.toContain('💬 via')
    }
  })

  test('modalen ritar inte längre Mattes porträtt på specialisternas svar', () => {
    // avatarUrl får finnas kvar i rubriken — men inte i meddelandelistan.
    const listStart = modal.indexOf('{messages.map(')
    const listSlut = modal.indexOf('{sending && (', listStart)
    expect(listStart).toBeGreaterThan(-1)
    expect(listSlut).toBeGreaterThan(listStart)
    expect(modal.slice(listStart, listSlut)).not.toContain('avatarUrl')
  })

  test('statusen bärs hela vägen från servern till bubblan', () => {
    for (const [namn, källa] of [['MatteChatModal', modal], ['Jobbkompisen', bubbla]] as const) {
      expect(källa, `${namn} tappar status i mappningen`).toContain('status: m.status ?? null')
    }
    expect(read('components/agents/AgentMessage.tsx')).toContain('statusLabel(interaction.status)')
  })

  test('bubblan visar specialistens eget porträtt', () => {
    const c = read('components/agents/AgentMessage.tsx')
    expect(c).toContain('agentKey={interaction.agentKey}')
    expect(c).toContain('interaction.byline')
  })
})

test.describe('momentkortet går genom samma kontrakt', () => {
  test('bylinen är agentens eget verb, inte "hittade något" för alla sex', () => {
    const c = utanKommentarer(read('components/moments/MomentCard.tsx'))
    expect(c).toContain('agentIdentity(moment.agentId)')
    expect(c).toContain('identitet.shortVerb')
    expect(c, 'det gamla gemensamma verbet kvar').not.toContain('hittade något')
  })
})
