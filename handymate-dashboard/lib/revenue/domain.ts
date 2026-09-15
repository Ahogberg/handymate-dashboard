import type { SalesCasePayload } from '@/lib/sales/sales-case'
import { normaliseraOrgnummer } from '@/lib/launch-desk/rekryteringssignal'

export const STAGES = {
  identified: 'Identifierad',
  contacted: 'Kontaktad',
  conversation: 'Dialog',
  audit_booked: 'Genomgång bokad',
  demo: 'Genomgång',
  proposal: 'Förslag',
  verbal_commit: 'Muntligt ja',
  won: 'Vunnen',
  lost: 'Förlorad',
  nurture: 'Pausad',
} as const
export const PAINS = {
  time: {
    title: 'Få tillbaka tid',
    question: 'Vilken administration tar mest tid i veckan?',
    workflow: 'Samla underlaget till offerter och fakturor löpande.',
    agent: 'Karin håller ihop nästa steg och vad som behöver ditt beslut.',
  },
  payment: {
    title: 'Få betalt snabbare',
    question: 'Var fastnar vägen från färdigt jobb till betalning?',
    workflow:
      'Fånga tid och material och granska fakturaunderlaget när jobbet är klart.',
    agent: 'Lars hjälper till med fakturaunderlag och uppföljning.',
  },
  offers: {
    title: 'Vinn fler offerter',
    question: 'Vad händer med offerterna efter att de skickats?',
    workflow: 'Samla förfrågningar och följ upp obesvarade offerter.',
    agent: 'Daniel hjälper till med offertarbetet och nästa uppföljning.',
  },
  control: {
    title: 'Få kontroll över jobben',
    question: 'Var tappar ni information mellan kontoret och jobbet?',
    workflow: 'Samla jobb, ansvar och underlag så nästa steg blir tydligt.',
    agent: 'Karin synliggör vad som pågår och var någon behöver agera.',
  },
  owner: {
    title: 'Minska beroendet av ägaren',
    question: 'Vad stannar upp när du inte är tillgänglig?',
    workflow: 'Fördela ansvar och samla information som teamet behöver.',
    agent: 'Teamet får en gemensam bild av jobben och nästa steg.',
  },
} as const
export type Pain = keyof typeof PAINS
export type Account = {
  website: string | null
  qualification: import('./qualification').Qualification | null
  id: string
  company_name: string
  org_number: string | null
  industry: string | null
  city: string | null
  employee_count: number | null
  owner_email: string | null
  total_score: number
  icp_score: number
  pain_score: number
  timing_score: number
  growth_score: number
  warmth_score: number
  ability_to_pay_score: number
  status: keyof typeof STAGES
  next_action: string | null
  next_action_at: string | null
  last_contact_at: string | null
  why_now: string | null
  pain_hypothesis: string | null
  personalization_hook: string | null
  contact_state: string
  version: number
  research_at: string | null
  research_error: string | null
}
export type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  source_url: string | null
  contact_basis: string
}
export type Signal = {
  id: string
  title: string
  detail: string | null
  source_url: string | null
  observed_at: string
  signal_type: string
}
export type Activity = {
  id: string
  activity_type: string
  outcome: string | null
  summary: string | null
  seller_email: string
  occurred_at: string
}
export type Draft = {
  id: string
  body: string
  status: 'draft' | 'approved' | 'cancelled'
  created_at: string
  approved_at: string | null
}
export type Session = {
  id: string
  account_id: string
  meeting_date: string
  payload: SalesCasePayload
  case_token: string | null
  version: number
}
export function normalizeOrg(value: unknown): string | null {
  if (value == null || value === '') return null
  const org = normaliseraOrgnummer(String(value))
  if (!/^\d{10}$/.test(org))
    throw new Error('Organisationsnumret ska ha tio siffror.')
  return org
}
export function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string') return ''
  if (value.length > max) throw new Error('Texten är för lång.')
  return value.trim()
}
export function safeUrl(value: unknown): string | null {
  const raw = text(value, 2000)
  if (!raw) return null
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Ange en säker webbadress med https.')
  return url.href
}
export function makeBrief(
  company: string,
  signals: Signal[],
  now = Date.now(),
) {
  const fresh = signals.filter(
    (s) =>
      s.source_url &&
      Number.isFinite(Date.parse(s.observed_at)) &&
      Date.parse(s.observed_at) <= now &&
      Date.parse(s.observed_at) >= now - 90 * 86400000,
  )
  return {
    why_now: fresh.length
      ? fresh
          .map((s) => `${s.title} (${s.observed_at.slice(0, 10)})`)
          .join('\n')
          .slice(0, 4000)
      : 'Inga aktuella källbelagda signaler. Undersök behovet i samtalet.',
    pain_hypothesis: fresh.some((s) => s.signal_type === 'hiring')
      ? 'Rekrytering kan öka behovet av samordning. Fråga om det gäller här; annonsen bevisar inte tillväxt eller administrationsproblem.'
      : 'Administrationsbehovet är ännu inte bekräftat.',
    personalization_hook: fresh.some((s) => s.signal_type === 'hiring')
      ? `Jag såg er rekryteringsannons. Hur fungerar planeringen och administrationen när ni tar in nya medarbetare på ${company}?`
      : `Hur fungerar administrationen runt jobben på ${company} i dag?`,
    timing_score: fresh.some((s) => s.signal_type === 'hiring') ? 15 : 0,
  }
}
export function casePayload(
  account: Account,
  input: Record<string, unknown>,
  meetingDate: string,
): SalesCasePayload {
  const pain = text(input.pain, 30) as Pain
  if (!Object.prototype.hasOwnProperty.call(PAINS, pain))
    throw new Error('Välj en smärtpunkt.')
  const quote = text(input.quote, 3000)
  const goal = text(input.goal, 500) || PAINS[pain].title
  return {
    company: {
      name: account.company_name,
      org: account.org_number || undefined,
      seat: account.city || undefined,
    },
    focusTitle: PAINS[pain].title,
    goal: { name: goal, quote },
    meeting: { iso: meetingDate, date: meetingDate },
    pkg: { name: 'Firman' },
    steps: [PAINS[pain].workflow],
    agents: [PAINS[pain].agent],
    raw: { pain, employees: account.employee_count },
    prospect: {
      name: text(input.prospect_name, 200),
      email: text(input.prospect_email, 320),
    },
  }
}
export function followupBody(
  company: string,
  summary: string,
  caseUrl?: string,
  outcome?: string,
) {
  if (outcome === 'no_response') return `Hej!\n\nJag försökte nå dig angående administrationen runt jobben på ${company}. Vill du boka 20 minuter för att gå igenom var den tar mest tid?\n\nVänliga hälsningar\nHandymate`
  return `Hej!\n\nTack för samtalet om ${company}.\n\nDet här tog vi upp:\n${summary}\n\n${caseUrl ? `Här är er personliga genomgång: ${caseUrl}\n\n` : ''}Vill du att vi bokar nästa steg tillsammans?\n\nVänliga hälsningar\nHandymate`
}
