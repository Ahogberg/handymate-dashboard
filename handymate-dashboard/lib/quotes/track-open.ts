import type { SupabaseClient } from '@supabase/supabase-js'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'

/**
 * Registrerar att kunden öppnat en offert — EN gemensam väg för alla ytor.
 *
 * Bakgrund (verifiering 2026-08-05): "öppnad" sattes i praktiken nästan aldrig.
 * Utskicket länkar kunden till PORTALEN, men portalens offertmodal hämtade
 * offerten via en route som inte loggade något. Statusen berodde därför helt på
 * spårningspixeln i mejlet — skickades offerten via SMS, eller blockerade
 * kundens mejlklient bilder, blev en offert som lästs och signerats aldrig
 * markerad som öppnad.
 *
 * ═══ HÄRDNING 2026-08-10 (Andreas: "står inte som Öppnad än") ═══
 *
 * Kedjan var kopplad på alla tre ytor (pixel, kundvy, portalmodal) men
 * kunde ändå dö tyst: selecten och uppdateringen listade v16-kolumnerna
 * (view_count, first_viewed_at, …) i SAMMA operation som statusflippen.
 * Saknas en enda kolumn i prod 400:ar PostgREST hela frågan — och inget
 * `.error` lästes någonstans, så en offert som lästs förblev "Skickad"
 * utan ett enda loggspår (billing_plan-lärdomen 2026-05-30 + kolumnlista-
 * lärdomen 2026-08-06).
 *
 * Nu: statusflippen är en EGEN, minimal uppdatering som bara rör `status`.
 * Räknarna är best-effort för sig. VARJE fel läses och loggas synligt —
 * en död spårning ska aldrig mer vara tyst.
 *
 * Allt är non-blocking: en misslyckad loggning får aldrig hindra kunden
 * från att se sin offert.
 */

export interface RegisterQuoteOpenResult {
  registered: boolean
  viewCount: number
  isFirstOpen: boolean
}

export async function registerQuoteOpen(
  supabase: SupabaseClient,
  quoteId: string,
  opts: {
    sessionId?: string
    ipHash?: string | null
    userAgent?: string | null
    /** Var öppningen kom ifrån — för felsökning i händelseloggen. */
    source: 'pixel' | 'kundvy' | 'portal'
  },
): Promise<RegisterQuoteOpenResult> {
  const empty: RegisterQuoteOpenResult = { registered: false, viewCount: 0, isFirstOpen: false }

  try {
    // select('*') med flit: en enradsläsning där en enda saknad kolumn i en
    // kolumnlista hade tystat HELA spårningen (kolumnlista-lärdomen).
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .single()

    if (error) {
      console.error('[track-open] kunde inte läsa offerten — öppningen registreras inte:', error.message, { quoteId })
      return empty
    }
    if (!quote) return empty

    // En besvarad offert ska inte kunna "öppnas" igen och skriva över sin
    // status — men visningen är fortfarande intressant, så eventet loggas.
    const isOpenable = (OPEN_QUOTE_STATUSES as readonly string[]).includes(quote.status)

    // 1. STATUSFLIPPEN — det kritiska. Egen minimal uppdatering som bara rör
    //    status, så saknade räknarkolumner aldrig kan stoppa "Öppnad".
    if (quote.status === 'sent') {
      const { error: statusErr } = await supabase
        .from('quotes')
        .update({ status: 'opened' })
        .eq('quote_id', quoteId)
        .eq('status', 'sent')
      if (statusErr) {
        console.error('[track-open] statusflippen misslyckades:', statusErr.message, { quoteId })
      }
    }

    // 2. Händelseloggen — best-effort, felet läses (kastar aldrig).
    const { error: eventErr } = await supabase.from('quote_tracking_events').insert({
      quote_id: quoteId,
      business_id: quote.business_id,
      event_type: 'opened',
      session_id: opts.sessionId || opts.source,
      ip_hash: opts.ipHash || null,
      user_agent: (opts.userAgent || '').slice(0, 200) || null,
    })
    if (eventErr) {
      console.error('[track-open] händelseloggen misslyckades (är v16 körd?):', eventErr.message, { quoteId })
    }

    // 3. Räknarna — best-effort för sig. Saknas v16-kolumnerna loggas det
    //    högt, men statusen ovan är redan satt.
    const newViewCount = (Number(quote.view_count) || 0) + 1
    const isFirstOpen = !quote.first_viewed_at
    const { error: raknareErr } = await supabase
      .from('quotes')
      .update({
        view_count: newViewCount,
        first_viewed_at: quote.first_viewed_at || new Date().toISOString(),
        last_viewed_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId)
    if (raknareErr) {
      console.error('[track-open] räknarna kunde inte uppdateras (är v16 körd?):', raknareErr.message, { quoteId })
    }

    if (isFirstOpen) {
      // Live-notis: "Kunden läser din offert nu". Bara första gången —
      // en notis per omläsning vore brus.
      try {
        const { notifyQuoteOpened } = await import('@/lib/notifications')
        const { data: customer } = quote.customer_id
          ? await supabase.from('customer').select('name').eq('customer_id', quote.customer_id).maybeSingle()
          : { data: null }
        await notifyQuoteOpened({
          businessId: quote.business_id,
          customerName: customer?.name || 'Kunden',
          quoteId,
          quoteTitle: quote.title,
          total: quote.total ?? null,
        })
      } catch { /* non-blocking */ }

      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'quote_opened', quote.business_id, {
          quote_id: quoteId,
          customer_id: quote.customer_id,
          quote_title: quote.title,
        })
      } catch { /* non-blocking */ }
    }

    // Tre visningar utan svar → Daniel föreslår en knuff.
    if (newViewCount >= 3 && isOpenable) {
      try {
        const { createQuoteNudge } = await import('@/lib/autopilot/quote-nudge')
        await createQuoteNudge(quote.business_id, quoteId, newViewCount)
      } catch { /* non-blocking */ }
    }

    return { registered: true, viewCount: newViewCount, isFirstOpen }
  } catch (err) {
    console.error('[track-open] kunde inte registrera öppning (icke-blockerande):', err)
    return empty
  }
}
