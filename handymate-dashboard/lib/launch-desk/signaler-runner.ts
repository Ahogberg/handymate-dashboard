/**
 * lib/launch-desk/signaler-runner.ts (pass 1b, tasks/plan-launch-desk-signaler.md)
 *
 * Delad körning av "läs kontots egen sajt → härled signaler → spara" —
 * återanvänds av både enkelrutten (accounts/[id]/signaler) och batchrutten
 * (signaler/batch) så att SSRF-skyddet, mergningen av brief_source_snapshot
 * och felhanteringen bara finns på ett ställe.
 *
 * Server-only (importerar lib/onboarding/website-fetch.ts, som kräver
 * node:dns) — får bara anropas från route-handlers.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { harledSignaler, type GtmSignal, type GtmSignalSnapshot } from './signaler'
import { hamtaPlatsbankenTraffar, harledRekryteringssignal } from './rekryteringssignal'
import {
  normalizeWebsiteUrl,
  isBlockedHostname,
  isPrivateOrReservedIp,
  htmlToExtractableText,
  SCRAPE_MIN_TEXT_CHARS,
} from '@/lib/onboarding/website-scrape'
import { fetchWebsiteWithSsrfGuard } from '@/lib/onboarding/website-fetch'

export interface SignalRunResult {
  ok: boolean
  account_id: string
  reason?: string
  snapshot: GtmSignalSnapshot | (GtmSignalSnapshot & { error: string })
  account?: Record<string, unknown>
}

function isBlockedTarget(hostname: string): boolean {
  if (isBlockedHostname(hostname)) return true
  return isPrivateOrReservedIp(hostname)
}

/**
 * Läser `account.website` (kontots EGEN sajt — aldrig kataloger), härleder
 * signaler och sparar dem i brief_source_snapshot.signals utan att röra
 * andra nycklar i snapshoten. Kastar aldrig — ett misslyckande ger
 * { ok:false, reason } och en tom signals-snapshot med felorsaken sparad,
 * så UI:t kan visa "Sajten gick inte att läsa".
 */
export async function korSignalerForAccount(
  supabase: SupabaseClient,
  account: {
    id: string
    website: string | null
    company_name?: string | null
    org_number?: string | null
    brief_source_snapshot?: unknown
  },
  adminUserId: string,
): Promise<SignalRunResult> {
  const fetchedAt = new Date().toISOString()

  // Rekryteringssignalen hämtas OBEROENDE av webbplatsen. Många av de bästa
  // prospekten — små firmor med en telefon och inget mer — har ingen sajt
  // alls, och de ska inte tappa signalen bara för att webbläsningen faller.
  // Den behöver bara organisationsnumret och företagsnamnet.
  const rekryteringPromise: Promise<GtmSignal | null> = (async () => {
    if (!account.org_number || !account.company_name) return null
    try {
      const traffar = await hamtaPlatsbankenTraffar(account.company_name)
      return harledRekryteringssignal(traffar, account.org_number, new Date())
    } catch (err) {
      console.warn('[signaler-runner] rekryteringssignalen kunde inte hämtas:', err instanceof Error ? err.message : err)
      return null
    }
  })()
  const existingSnapshot = (account.brief_source_snapshot && typeof account.brief_source_snapshot === 'object')
    ? account.brief_source_snapshot as Record<string, unknown>
    : {}

  async function spara(snapshot: GtmSignalSnapshot | (GtmSignalSnapshot & { error: string })) {
    const { data, error } = await supabase
      .from('gtm_account')
      .update({
        brief_source_snapshot: { ...existingSnapshot, signals: snapshot },
        updated_by: adminUserId,
        updated_at: fetchedAt,
      })
      .eq('id', account.id)
      .select('*')
      .maybeSingle()
    if (error) console.warn('[launch-desk/signaler-runner] kunde inte spara snapshot:', error)
    return data || undefined
  }

  async function fel(reason: string): Promise<SignalRunResult> {
    // Även när webbplatsen inte gick att läsa sparas rekryteringssignalen om
    // den finns — annars hade en trasig sajt tystat en fullt giltig signal
    // från en helt annan källa.
    const rekrytering = await rekryteringPromise
    const felSnapshot: GtmSignalSnapshot & { error: string } = {
      fetched_at: fetchedAt,
      url: account.website || '',
      signals: rekrytering ? [rekrytering] : [],
      text_chars: 0,
      error: reason,
    }
    const saved = await spara(felSnapshot)
    return { ok: false, account_id: account.id, reason, snapshot: felSnapshot, account: saved }
  }

  if (!account.website) return fel('Prospektet saknar webbplats')

  const normalized = normalizeWebsiteUrl(account.website)
  if (!normalized.ok) return fel(normalized.reason)
  if (isBlockedTarget(normalized.hostname)) {
    return fel('Den adressen pekar på ett internt mål och kan inte läsas')
  }

  const fetchResult = await fetchWebsiteWithSsrfGuard(normalized.url)
  if (!fetchResult.ok) return fel(fetchResult.reason)

  const text = htmlToExtractableText(fetchResult.html)
  if (!text || text.length < SCRAPE_MIN_TEXT_CHARS) {
    return fel('Sidan innehöll för lite text för att läsas')
  }

  const webbsignaler = harledSignaler(text, fetchResult.html, new Date())
  const rekrytering = await rekryteringPromise
  // Rekryteringen först: en firma som växer är den starkaste öppningen vi har,
  // och valjOppning() tar den starkaste signalen.
  const signals = rekrytering ? [rekrytering, ...webbsignaler] : webbsignaler
  const snapshot: GtmSignalSnapshot = { fetched_at: fetchedAt, url: normalized.url, signals, text_chars: text.length }
  const saved = await spara(snapshot)
  return { ok: true, account_id: account.id, snapshot, account: saved }
}
