/**
 * Hubbens utskicksgrind för proaktiva SMS — Fastighetspasset steg 3, grind 5.
 *
 * Före 2026-08-27 gällde kommunikationsinställningarna (tysta timmar,
 * veckotak per kund) bara automatiska utskick via canSendMessage i
 * lib/smart-communication.ts — ett godkänt kort i kön gick förbi dem helt.
 * Nu passerar proactive_care och warranty_followup den här grinden vid
 * exekvering.
 *
 * Medvetet inte inställningen för automatiska meddelanden: ägarens
 * godkännande är själva avsikten. Det
 * som gäller ändå är när (tysta timmar) och hur ofta (veckotak) — kunden
 * ska inte få ett SMS 23:30 för att ägaren godkände kön sent.
 *
 * Fail-open på databasfel i veckoräkningen (som frequency-guard), men de
 * tysta timmarna är ren aritmetik och gäller alltid.
 */
import { getServerSupabase } from '@/lib/supabase'
import { getCommunicationSettings } from '@/lib/smart-communication'

export interface HubGateDecision {
  allowed: boolean
  /** Svensk mening — visas rakt av i kvittot ("Godkänt — men …"). */
  reason?: string
  code?: 'quiet_hours' | 'weekly_cap'
}

/** Ren: är klockslaget (minuter sedan midnatt) inom tysta timmar? Hanterar över midnatt (21:00–07:00). */
export function isWithinQuietHours(startStr: string, endStr: string, minutesNow: number): boolean {
  const parse = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim())
    if (!m) return null
    const h = Number(m[1]), min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const start = parse(startStr), end = parse(endStr)
  if (start === null || end === null || start === end) return false
  if (start > end) return minutesNow >= start || minutesNow < end
  return minutesNow >= start && minutesNow < end
}

export function stockholmMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return (h % 24) * 60 + m
}

export async function hubAllowsProactiveSend(businessId: string, customerId: string | null, now: Date = new Date()): Promise<HubGateDecision> {
  const settings = await getCommunicationSettings(businessId)

  if (isWithinQuietHours(settings.quiet_hours_start, settings.quiet_hours_end, stockholmMinutesNow(now))) {
    return {
      allowed: false,
      code: 'quiet_hours',
      reason: `Tysta timmar (${settings.quiet_hours_start}–${settings.quiet_hours_end}) — SMS:et skickades inte. Försök igen på dagtid.`,
    }
  }

  if (!customerId) return { allowed: true }
  try {
    const supabase = getServerSupabase()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .gte('created_at', weekAgo)
      .in('status', ['sent', 'delivered'])
    if (error) {
      console.warn('[hub-gate] veckoräkning misslyckades (släpper igenom):', error.message)
      return { allowed: true }
    }
    if ((count || 0) >= settings.max_sms_per_customer_per_week) {
      return {
        allowed: false,
        code: 'weekly_cap',
        reason: `Kunden har redan fått ${settings.max_sms_per_customer_per_week} meddelanden den här veckan — SMS:et skickades inte.`,
      }
    }
  } catch (err) {
    console.warn('[hub-gate] oväntat fel i veckoräkning (släpper igenom):', err)
  }
  return { allowed: true }
}
