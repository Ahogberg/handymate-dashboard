import type { SupabaseClient } from '@supabase/supabase-js'
export function firstWorkEnabled() {
  return process.env.FIRST_WORK_ENABLED === 'true'
}
export async function beginFirstWork(
  db: SupabaseClient,
  businessId: string,
): Promise<string> {
  const { data, error } = await db.rpc('begin_first_work', {
    p_business_id: businessId,
  })
  if (error || typeof data?.id !== 'string')
    throw new Error('first_work_start_failed')
  if (data.quote_id) throw new Error('first_work_already_has_quote')
  return data.id
}
export interface FirstWorkReceipt {
  business_id: string
  id: string
  phase: 'started' | 'prepared' | 'draft' | 'sent'
  started_at: string
  prepared_at: string | null
  first_action_at: string | null
  elapsed_minutes: number | null
  quote_id: string | null
  quote_title: string | null
  headline: string
  done: string
  next: string
  needs_you: string
  href: string
}
export async function getFirstWork(
  db: SupabaseClient,
  businessId: string,
): Promise<FirstWorkReceipt | null> {
  const { data: work, error } = await db
    .from('first_work')
    .select('id,business_id,started_at,prepared_at,quote_id,first_action_at')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw new Error('first_work_read_failed')
  if (!work) return null
  let quote: any = null
  if (work.quote_id) {
    const result = await db
      .from('quotes')
      .select('quote_id,title,status,sent_at')
      .eq('business_id', businessId)
      .eq('quote_id', work.quote_id)
      .maybeSingle()
    if (result.error || !result.data)
      throw new Error('first_work_quote_read_failed')
    quote = result.data
  }
  const phase =
    quote?.sent_at && work.first_action_at
      ? 'sent'
      : quote
        ? 'draft'
        : work.prepared_at
          ? 'prepared'
          : 'started'
  const elapsed =
    phase === 'sent'
      ? (Date.parse(work.first_action_at) - Date.parse(work.started_at)) / 60000
      : null
  if (elapsed !== null && (!Number.isFinite(elapsed) || elapsed < 0))
    throw new Error('first_work_invalid_evidence')
  return {
    ...work,
    phase,
    quote_title: quote?.title ?? null,
    elapsed_minutes: elapsed === null ? null : Math.round(elapsed * 10) / 10,
    headline:
      phase === 'sent'
        ? 'Ditt första utskick är registrerat'
        : phase === 'draft'
          ? 'Fortsätt med ditt sparade jobb'
          : 'Fortsätt med jobbet du visade oss',
    done:
      phase === 'sent'
        ? 'Offerten är registrerad som skickad.'
        : phase === 'draft'
          ? 'Ett offertutkast finns sparat.'
          : phase === 'prepared'
            ? 'Ditt offertunderlag är förberett.'
            : 'Ditt första jobb är påbörjat.',
    next:
      phase === 'sent'
        ? 'Öppna offerten för aktuell uppföljning och kundens svar.'
        : phase === 'draft'
          ? 'Granska kund, omfattning och pris i samma offert.'
          : 'Ta med ditt underlag till offertbyggaren.',
    needs_you:
      phase === 'sent'
        ? 'Kontrollera överlämningen innan du räknar med fortsatt uppföljning.'
        : 'Du godkänner innehåll och mottagare innan något skickas.',
    href: quote
      ? `/dashboard/quotes/${encodeURIComponent(quote.quote_id)}`
      : '/dashboard/quotes/new',
  }
}
