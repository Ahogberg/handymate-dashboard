import { classify } from './action-contract'

export interface ApprovalReceipt {
  state: 'acknowledged' | 'saved' | 'sent' | 'queued' | 'partial' | 'failed' | 'needs_action' | 'rejected'
  text: string
  next_url?: string
}
const saved: Record<string, string> = {
  confirm_payment: 'Betalningen är registrerad.', create_booking: 'Bokningen är skapad.',
  create_quote_draft: 'Offertutkastet är sparat. Det har inte skickats.', quote_request: 'Offertutkastet är sparat. Det har inte skickats.',
  quote_addition: 'Offertutkastet är sparat. Det har inte skickats.', create_ata_draft: 'Utkastet är sparat. Det har inte skickats.',
  autonomy_offer: 'De granskade befogenheterna för automatisk hantering är sparade.',
  dispatch_suggestion: 'Tilldelningen är sparad.', time_attestation: 'Tiden är attesterad och registrerad.',
  tidrapport_forslag: 'Tidrapporten är registrerad och godkänd.', meeting_followup: 'Uppgiften är skapad och synlig för teamet.',
  project_log_note: 'Anteckningen är sparad i projektets dagbok.', customer_fact: 'Kunduppgiften är sparad.',
  agent_memory_confirmation: 'Minnet är bekräftat.', four_eyes_quote: 'Offerten är granskad och klar för separat utskick.',
  four_eyes_project_close: 'Projektet är avslutat.', price_adjustment: 'Timpriset är ändrat.', lead_review: 'Kundförfrågan är granskad.',
  publish_microsite: 'Webbsidan är publicerad.', egenkontroll_foto: 'De granskade kontrollpunkterna är markerade.',
  checklist_forslag: 'Checklistan är skapad.', project_debrief: 'Dina svar är sparade som projektlärdomar.',
  playbook_pattern_confirmation: 'Arbetssättet är sparat i företagets kunskap.', playbook_kickoff_suggestion: 'Kontrollpunkten är skapad.',
  operating_experiment_proposal: 'Försöket är startat.', operating_experiment_readout: 'Ditt beslut om försöket är sparat.',
}
export function rejectionEffect(type: string): string {
  if (type === 'lead_review') return 'Förslaget avvisas och kundförfrågan markeras som förlorad.'
  if (type === 'four_eyes_quote') return 'Granskningen avslås och offerten återgår till utkast.'
  if (type === 'operating_experiment_readout') return 'Förslaget avvisas och försöket får beslutet avvisat.'
  if (['send_sms', 'invoice_reminder', 'review_request', 'automation'].includes(type)) return 'Förslaget avvisas. Eventuellt beviljad automatisk hantering för samma åtgärdstyp återkallas.'
  return 'Det här förslaget avvisas. Inget kundutskick görs av avvisningen.'
}
export function approvalReceipt(type: string, action: string, result: Record<string, any> | null, outcome?: string | null): ApprovalReceipt {
  if (action === 'reject') return result?.error ? { state: 'partial', text: `Kortet är avvisat, men en följdändring misslyckades: ${result.error}` } : { state: 'rejected', text: 'Förslaget är avvisat.' }
  const r = result || {}
  const metadata = r.metadata || {}
  const delivered = r.sms_sent === true || r.email_sent === true || r.einvoice === true || r.sent === true ||
    metadata.sms === true || metadata.email === true || metadata.einvoice === true || r.reply_saved === true
  const errors = r.error || ([...(Array.isArray(r.errors) ? r.errors : []), ...(Array.isArray(metadata.errors) ? metadata.errors : [])].join('; ') || null)
  if (outcome === 'failed' || r.ok === false || errors) return { state: delivered || r.partial === true ? 'partial' : 'failed',
    text: `${delivered || r.partial === true ? 'Handlingen utfördes delvis' : 'Handlingen kunde inte slutföras'}${errors ? `: ${errors}` : '.'}` }
  if (r.queued === true) return { state: 'queued', text: r.receipt || 'Utskicket är köat. Leverans är inte bekräftad ännu.' }
  const klass = classify(type)
  if (r.acknowledged === true || (r.executed === false && (klass === 'INFORMATIONAL' || klass === 'ACKNOWLEDGEMENT'))) {
    return { state: 'acknowledged', text: type === 'karin_deadline' ? 'Påminnelsen är noterad. Detta bekräftar inte någon inlämning.' : r.note || 'Informationen är noterad.' }
  }
  if (r.executed === false || r.skipped || outcome === 'skipped') return { state: 'needs_action', text: r.note || 'Ingen handling utfördes. Ärendet behöver hanteras vidare.' }
  if (r.action === 'autopilot_package') {
    const results = Array.isArray(r.results) ? r.results : []
    const failed = results.filter((item: any) => item.ok === false).length
    if (failed) return { state: failed < results.length ? 'partial' : 'failed', text: `${results.length - failed} av ${results.length} delåtgärder slutfördes.` }
    return results.length ? { state: 'saved', text: `${results.length} delåtgärder slutfördes. Se utfallet för varje delåtgärd.` } : { state: 'needs_action', text: 'Inga delåtgärder valdes.' }
  }
  if (type === 'new_booking_request' && r.ok === true && r.booking_id) return { state: r.sms_sent === true ? 'saved' : 'partial', text: r.sms_sent === true ? 'Bokningen är sparad och bekräftelsen har accepterats av SMS-tjänsten.' : 'Bokningen är sparad, men ingen SMS-bekräftelse har skickats.' }
  if (type === 'project_debrief' && r.ok === true && r.saved === 0) return { state: 'acknowledged', text: 'Frågorna är avslutade utan nya projektlärdomar.' }
  if (saved[type] && (r.ok === true || Object.keys(r).some(k => /_id$/.test(k)) || r.assigned || typeof r.minutes === 'number')) return { state: 'saved', text: saved[type] }
  if (delivered || (type === 'send_email' && r.ok === true)) return { state: 'sent', text: r.reply_saved ? (r.sms_sent === true ? 'Svaret är sparat i kundportalen och SMS-notisen är skickad.' : 'Svaret är sparat i kundportalen. Ingen SMS-notis är bekräftad.') : 'Utskicket har accepterats av sändtjänsten. Det är inte en bekräftelse på att mottagaren har läst det.' }
  if (r.navigate_to) return { state: 'needs_action', text: r.note || 'Ärendet är öppet för fortsatt handläggning.', next_url: r.navigate_to }
  return { state: 'needs_action', text: 'Beslutet är registrerat, men utförandet saknar en bekräftad kvittens.' }
}
