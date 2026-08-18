/**
 * lib/customers/contact-source.ts — v152 (kontaktproveniens).
 *
 * BAKGRUND: varje customer-rad som skapas utan en registrerad källa blir
 * dyrt granskningsarbete längre fram (går inte att avgöra om kontakten
 * någonsin gett sitt medgivande, eller hur den ens uppstod, i efterhand).
 * Denna fil är den EN ställe-mappningen mellan leads.source (styrd av
 * valid_source-CHECK:en i sql/leads_pipeline.sql / v107) och
 * customer.contact_source (styrd av CHECK:en i sql/v152_contact_source.sql)
 * — allt annat som behöver mappa lead-källa till kontaktproveniens ska
 * importera härifrån, aldrig duplicera listan.
 */

/** Stängd lista — måste matcha CHECK:en i sql/v152_contact_source.sql. */
export type ContactSource =
  | 'manual'
  | 'csv_import'
  | 'gmail_import'
  | 'lead_form'
  | 'portal'
  | 'referral'
  | 'widget'
  | 'phone_call'
  | 'fortnox_sync'
  | 'unknown'

/**
 * Mappar en leads.source (lib/leads/golden-path.ts `source`-parametern) till
 * customer.contact_source. Golden Path (lib/leads/golden-path.ts) är den
 * enda platsen som faktiskt skapar en customer-rad ur ett lead, så denna
 * funktion behöver bara känna till de källvärden som är lovliga enligt
 * valid_source-CHECK:en: 'vapi_call', 'inbound_sms', 'website_form',
 * 'manual', 'email_lead', 'email_forward', 'referral'.
 *
 * Medvetet enkel tre-hinkars-mappning (referral / telefoni / e-post) —
 * allt annat (webbformulär, SMS-inledd kontakt, agentens egen 'manual')
 * landar i 'lead_form' som en generisk "kontakten kom in via ett formulär/
 * inledande meddelande"-hink. Se sql/v152_contact_source.sql för det
 * fullständiga CHECK-facit.
 */
export function contactSourceFromLead(leadSource: string | null | undefined): ContactSource {
  const normalized = (leadSource || '').toLowerCase().trim()

  if (normalized === 'referral') return 'referral'
  if (normalized === 'vapi_call') return 'phone_call'
  if (normalized === 'email_lead' || normalized === 'email_forward') return 'gmail_import'

  return 'lead_form'
}

/**
 * True om felet beror på att contact_source/contact_source_at-kolumnerna
 * saknas (sql/v152 inte körd än) — samma toleransmönster som sms_opt_out
 * (v86, se app/api/actions/route.ts): en ännu ej körd proveniens-migration
 * får ALDRIG blockera kundskapande. Callsites som redan kastar hårt på
 * insert-fel (t.ex. app/api/customers/route.ts, "Skapa kund"-knappen) ska
 * fånga detta och göra om inserten utan de två fälten i stället för att
 * krascha hela flödet.
 */
export function isMissingContactSourceColumnError(message: string | null | undefined): boolean {
  return /column .*contact_source.* does not exist/i.test(message || '')
}
