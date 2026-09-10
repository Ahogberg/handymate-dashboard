import { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES } from './statuses'
import { quoteFollowupStep } from './followup-cadence'

export interface HandoffRule {
  id: string; name: string; trigger_config: Record<string, unknown>
  action_type: string
  last_run_at: string | null; last_run_status: string | null
}
export interface HandoffLog { rule_id: string | null; status: string; created_at: string }
export interface HandoffSummary {
  state: 'draft' | 'closed' | 'decision' | 'paused' | 'configured' | 'attention'
  headline: string; done: string; next: string; needsYou: string
  eligibleAt?: string; lastRunAt?: string; link?: string; linkLabel?: string
}
export interface HandoffInput {
  quote: { status: string; sent_at: string | null; valid_until: string | null; follow_up_count: number | null }
  paused: boolean; teamActive: boolean; hasPhone: boolean; hasEmail: boolean
  historyIncomplete?: boolean
  followupRound?: { id: string; status: string; sendClaimed: boolean; providerAccepted: boolean; expired: boolean } | null
  rules: HandoffRule[]; logs: HandoffLog[]; pendingId: string | null
  intervalDays: number | null; today: string; now: number
}

export function deriveQuoteHandoff(input: HandoffInput): HandoffSummary {
  const { quote, rules, logs } = input
  const done = quote.sent_at ? 'Offerten är registrerad som skickad.' : 'Inget utskick är bekräftat för offerten.'
  if ((WON_QUOTE_STATUSES as readonly string[]).includes(quote.status)) return {
    state: 'closed', headline: 'Kunden har accepterat offerten', done: 'Accepten är registrerad.',
    next: 'Fortsätt med projektets planering.', needsYou: 'Kontrollera bemanning och starttid i projektet.' }
  if (quote.status === 'draft') return { state: 'draft', headline: 'Offerten väntar på dig', done,
    next: 'Granska och skicka offerten.', needsYou: 'Uppföljningen börjar först när offerten är skickad.' }
  if (!(OPEN_QUOTE_STATUSES as readonly string[]).includes(quote.status) || (quote.valid_until && quote.valid_until < input.today)) return {
    state: 'closed', headline: 'Den här offertuppföljningen är avslutad', done,
    next: 'Ingen fortsatt uppföljning visas för den här offerten.', needsYou: 'Ta ställning till ett nytt erbjudande om jobbet fortfarande är aktuellt.' }
  const round = input.followupRound
  if (round && (round.status !== 'pending' || round.sendClaimed || round.expired)) return {
    state: 'attention',
    headline: round.providerAccepted ? 'Uppföljningens sändkvittens finns'
      : round.status === 'rejected' ? 'Uppföljningsförslaget är avvisat'
      : round.expired && !round.sendClaimed ? 'Uppföljningsförslaget har löpt ut' : 'Uppföljningens utfall behöver kontrolleras',
    done: round.providerAccepted ? 'Sändningen har en sparad kvittens. Det bevisar inte att kunden har läst meddelandet.' : done,
    next: round.providerAccepted ? 'Nästa omgång kan fastställas när kvittensen har stämts av.' : 'Denna omgång hålls kvar. Inget nytt uppföljningskort skapas automatiskt.',
    needsYou: round.providerAccepted ? 'Kontrollera kundens eventuella svar.' : 'Kontrollera kortets beslut och leveranskvittens innan kunden kontaktas igen.',
    link: `/dashboard/approvals?focus=${encodeURIComponent(round.id)}`, linkLabel: 'Visa uppföljningen',
  }
  if (input.pendingId) return { state: 'decision', headline: 'Ett förslag väntar på ditt beslut', done,
    next: 'Granska teamets förslag. Ett väntande kort är inte ett skickat meddelande.',
    needsYou: 'Godkänn eller avvisa förslaget i godkännandekön.', link: `/dashboard/approvals?focus=${encodeURIComponent(input.pendingId)}`, linkLabel: 'Granska förslaget' }
  if (input.paused || !input.teamActive) return { state: 'paused', headline: 'Ingen aktiv överlämning är bekräftad', done,
    next: input.paused ? 'Teamet är pausat.' : 'Kontot saknar ett aktivt team.',
    needsYou: 'Följ upp själv eller kontrollera teamets inställningar.', link: '/dashboard/settings', linkLabel: 'Öppna inställningar' }
  if (!input.hasPhone && !input.hasEmail) return { state: 'attention', headline: 'Kontaktvägen behöver kompletteras', done,
    next: 'Ingen uppföljning kan bekräftas utan kontaktuppgifter.', needsYou: 'Kontrollera kundens telefonnummer och e-post.' }
  if (logs[0]?.status === 'failed') return { state: 'attention', headline: 'Senaste uppföljningen behöver kontrolleras', done,
    next: 'Den senaste körningen rapporterade ett fel.', needsYou: 'Kontrollera historiken innan du räknar med fortsatt uppföljning.' }
  if (input.historyIncomplete) return { state: 'attention', headline: 'Historiken behöver kontrolleras', done,
    next: 'Historiken är för omfattande för att bekräfta nästa omgång här.', needsYou: 'Kontrollera tidigare uppföljningar och välj nästa steg.' }
  if (rules.length) {
    const candidates = rules.filter(r => r.trigger_config.field === 'days_since_sent'
      && typeof r.trigger_config.value === 'number' && Number.isFinite(r.trigger_config.value) && r.trigger_config.value >= 0
      && Number(r.trigger_config.value) <= 3650
      && ['send_sms', 'send_email', 'create_approval'].includes(r.action_type)
      && !logs.some(log => log.rule_id === r.id))
      .sort((a, b) => Number(a.trigger_config.value) - Number(b.trigger_config.value))
    const rule = candidates[0]
    if (rule && ((rule.action_type === 'send_email' && !input.hasEmail) || (rule.action_type !== 'send_email' && !input.hasPhone))) return {
      state: 'attention', headline: 'Nästa uppföljning saknar kontaktväg', done,
      next: rule.action_type === 'send_email' ? 'Nästa regel behöver kundens e-post.' : 'Nästa regel behöver kundens telefonnummer.',
      needsYou: 'Komplettera kundens kontaktuppgifter.' }
    if (rule && quote.sent_at && Number.isFinite(Date.parse(quote.sent_at))) return {
      state: 'configured', headline: 'Daniel har en uppföljning inställd', done,
      next: rule.action_type === 'create_approval' ? 'Daniel kan förbereda ett förslag om att ringa kunden från tidpunkten nedan.' : 'Daniel kan behandla nästa uppföljning från tidpunkten nedan.',
      needsYou: 'Granska förslag som kräver ditt beslut. Ett kundsvar eller ändrat pris behöver bedömas separat.',
      eligibleAt: new Date(Date.parse(quote.sent_at) + Number(rule.trigger_config.value) * 86400000).toISOString(),
    }
    return { state: 'attention', headline: 'Nästa steg behöver kontrolleras', done,
      next: 'Ingen återstående uppföljningstid kan bekräftas från de aktiva reglerna.', needsYou: 'Kontrollera kundens svar och välj nästa steg.' }
  }
  const step = quoteFollowupStep(quote.sent_at, quote.follow_up_count, input.intervalDays, input.now)
  if (!quote.valid_until || (step && ((step.channel === 'sms' && !input.hasPhone) || (step.channel === 'email' && !input.hasEmail)))) return {
    state: 'attention', headline: 'Uppföljningen behöver kompletteras', done,
    next: !quote.valid_until ? 'Offerten saknar ett giltighetsdatum.' : `Nästa omgång saknar kundens ${step?.channel === 'sms' ? 'telefonnummer' : 'e-post'}.`, needsYou: 'Komplettera uppgifterna innan du lämnar över.' }
  return step ? { state: 'configured', headline: 'Daniel har en uppföljning inställd', done,
    next: `Nästa planerade omgång använder ${step.channel === 'sms' ? 'SMS' : 'e-post'}. Tidpunkten är tidigast möjliga behandling, inte bevis på utskick.`,
    needsYou: 'Granska förslag som kräver godkännande. Kontrollera kundens besked innan nästa beslut.', eligibleAt: step.eligibleAt,
  } : { state: 'attention', headline: 'Uppföljningen behöver ditt nästa beslut', done,
    next: 'Ingen ytterligare automatisk omgång är bekräftad.', needsYou: 'Ta ställning till om kunden ska kontaktas igen.' }
}
