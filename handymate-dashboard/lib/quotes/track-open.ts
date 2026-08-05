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
 * markerad som öppnad. `view_count` stod kvar på 0, nudgen vid tre visningar
 * kunde aldrig lösa ut, och "aldrig öppnade"-statistiken var systematiskt fel.
 *
 * Nu anropar både pixeln och den publika offert-routen den här funktionen.
 *
 * Allt är non-blocking: en misslyckad loggning får aldrig hindra kunden från
 * att se sin offert.
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
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('business_id, customer_id, title, total, view_count, first_viewed_at, status')
      .eq('quote_id', quoteId)
      .single()

    if (error || !quote) return empty

    // En besvarad offert ska inte kunna "öppnas" igen och skriva över sin
    // status — men visningen är fortfarande intressant, så eventet loggas.
    const isOpenable = (OPEN_QUOTE_STATUSES as readonly string[]).includes(quote.status)

    await supabase.from('quote_tracking_events').insert({
      quote_id: quoteId,
      business_id: quote.business_id,
      event_type: 'opened',
      session_id: opts.sessionId || opts.source,
      ip_hash: opts.ipHash || null,
      user_agent: (opts.userAgent || '').slice(0, 200) || null,
    })

    const newViewCount = (quote.view_count || 0) + 1
    const isFirstOpen = !quote.first_viewed_at

    await supabase
      .from('quotes')
      .update({
        view_count: newViewCount,
        first_viewed_at: quote.first_viewed_at || new Date().toISOString(),
        last_viewed_at: new Date().toISOString(),
        status: quote.status === 'sent' ? 'opened' : quote.status,
      })
      .eq('quote_id', quoteId)

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
    console.warn('[track-open] kunde inte registrera öppning (icke-blockerande):', err)
    return empty
  }
}
