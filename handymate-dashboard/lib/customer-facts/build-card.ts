/**
 * Delat kortbygge för customer_fact-korten (Customer Memory V1.1, 2026-08-16).
 *
 * Flyttad hit från app/api/voice/analyze/route.ts där den delades av mötes-
 * och telefongrenen — nu behöver även e-postgrenen (lib/gmail/processor.ts)
 * bygga exakt samma kort, och tre producenter med varsin lokal kopia hade
 * garanterat glidit isär. Formen låses av tests/customer-facts.spec.ts.
 *
 * Anroparen ansvarar för att bara kalla denna med en säkert härledd kund
 * (ingen gissning här) — och för att själv skriva kortet till
 * pending_approvals. Godkännandet hanteras generiskt av
 * app/api/approvals/[id]/route.ts (case 'customer_fact').
 */
import type { DecisionRecord } from '@/lib/ai/decision-record'

/** Minsta gemensamma form för ett fynd — röstgrenarnas AISuggestion och
    e-postgrenens ExtractedFact mappas båda hit strukturellt. */
export interface CustomerFactFynd {
  title: string
  description: string
  source_text?: string | null
  confidence: number
  fact_type?: 'preference' | 'constraint' | 'commitment' | 'contact'
}

export function buildCustomerFactCard(
  s: CustomerFactFynd,
  opts: {
    customerId: string
    decisionRecord: DecisionRecord
    /** "mötet" / "samtalet" / "mejlet" — syns i kortets evidensrad. */
    evidensKalla: string
    /** Talkällorna (möte/telefon): call_recording-id. */
    recordingId?: string
    /** E-postkällan: email_conversations-raden fyndet extraherades ur. */
    emailConversationId?: string
    /** "hörde" för tal, "läste" för text — titeln ska inte ljuga om kanalen. */
    verb?: 'hörde' | 'läste'
  }
): Record<string, unknown> {
  const evidens = s.source_text ? ` Ur ${opts.evidensKalla}: "${s.source_text}"` : ''
  const kortInnehall = s.description || s.title
  return {
    approval_type: 'customer_fact',
    title: `Matte ${opts.verb || 'hörde'}: ${kortInnehall.length > 60 ? kortInnehall.slice(0, 60) + '…' : kortInnehall}`,
    description: `${s.description || ''}${evidens}`,
    risk_level: 'low',
    payload: {
      customer_id: opts.customerId,
      fact_type: s.fact_type || 'preference',
      content: s.description,
      evidence_quote: s.source_text || null,
      confidence: s.confidence,
      // Källreferensen skiljer sig per kanal: talgrenarna bär recording_id
      // (godkännande-handlern läser den till customer_fact.source_id),
      // e-postgrenen bär email_conversation_id. Handlern ignorerar okända
      // payload-nycklar (verifierat i case 'customer_fact' 2026-08-16), så
      // e-postkortens källa följer med utan att handlern behöver röras.
      ...(opts.recordingId ? { recording_id: opts.recordingId } : {}),
      ...(opts.emailConversationId ? { email_conversation_id: opts.emailConversationId } : {}),
      agent_id: 'matte',
      decision_record: opts.decisionRecord,
    },
  }
}
