import { getServerSupabase } from '@/lib/supabase'

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  sound?: 'default' | null
  data?: Record<string, unknown>
  /** Sekunder notisen får ligga och vänta hos Expo/APNs/FCM innan den kastas. */
  ttl?: number
  priority?: 'default' | 'normal' | 'high'
}

export interface ExpoPushOptions {
  ttlSeconds?: number
  priority?: 'high' | 'normal'
}

interface ExpoPushTicket {
  status?: 'ok' | 'error'
  id?: string
}

export type ExpoPushFailureReason =
  | 'no_tokens'
  | 'no_matching_token'
  | 'provider_error'
  | 'network_error'

/** Provideracceptans, inte bevis på att telefonen visade notisen. */
export interface ExpoPushResult {
  attempted: number
  accepted: number
  rejected: number
  tickets: string[]
  reason?: ExpoPushFailureReason
}

export function summarizeExpoTickets(payload: unknown, attempted: number): ExpoPushResult {
  const raw = (payload as { data?: unknown } | null)?.data
  const rows: ExpoPushTicket[] = Array.isArray(raw) ? raw : raw ? [raw as ExpoPushTicket] : []
  const acceptedRows = rows.slice(0, attempted).filter((ticket) => ticket.status === 'ok')
  const accepted = acceptedRows.length
  const rejected = Math.max(0, attempted - accepted)
  return {
    attempted,
    accepted,
    rejected,
    tickets: acceptedRows
      .map((ticket) => ticket.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ...(rejected > 0 ? { reason: 'provider_error' as const } : {}),
  }
}

/**
 * En push_tokens-rad, så mycket expo-push.ts behöver för att filtrera.
 * user_id är nullable (sql/v159_push_tokens_user_id.sql, additiv) —
 * äldre rader/enheter som inte registrerat om sig saknar den.
 */
export interface ExpoTokenRow {
  token: string
  user_id?: string | null
}

export interface SelectExpoTargetsResult {
  tokens: string[]
  /** true = filtrerades faktiskt till targetUserId. false = otillriktat blast
   *  (targetUserId saknades — den enda återstående blast-vägen). */
  usedTargetFilter: boolean
  /** true = targetUserId var satt men ingen push_tokens-rad matchade den.
   *  Ingen sändning sker då (se P1-1, 2026-09-01) — callern loggar gapet. */
  noMatchingToken: boolean
}

/**
 * Ren filtreringsfunktion — bugg fixad 2026-08-19: Expo-leveransen blastade
 * alltid till HELA businessens push_tokens oavsett vem ett beslut gällde
 * (pending_approvals.routed_business_user_id slogs upp och skickades som
 * target_user_id, men mobilpushen hade ingen kolumn att filtrera på).
 *
 * P1-1 (2026-09-01): fail-safe-blasten som ersatte det togs bort. Ett beslut
 * riktat till EN person ska aldrig kunna exponeras för resten av tenanten
 * bara för att just den personens telefon-token saknas — web-push
 * (app/api/push/send/route.ts) har redan alltid gjort det rätta här (0
 * skickat, ingen fallback). Approval-kortet försvinner inte av detta; det
 * ligger kvar i kön oavsett om en push-notis lyckas nå någon.
 *
 *  (a) targetUserId finns + minst en rad matchar → BARA de raderna
 *  (b) targetUserId finns men INGEN rad matchar (gammal rad utan user_id,
 *      eller användaren har bara webb-inloggning) → INGEN sändning.
 *      noMatchingToken=true så callern loggar gapet synligt, aldrig tyst.
 *  (c) targetUserId saknas (null/undefined/tomsträng) → oförändrat blast
 *      (avsiktligt — company-wide-notiser har inget att rikta mot)
 */
export function selectExpoTargets(
  rows: ExpoTokenRow[],
  targetUserId?: string | null,
): SelectExpoTargetsResult {
  if (!targetUserId) {
    return { tokens: rows.map((r) => r.token), usedTargetFilter: false, noMatchingToken: false }
  }

  const matched = rows.filter((r) => r.user_id === targetUserId)
  if (matched.length > 0) {
    return { tokens: matched.map((r) => r.token), usedTargetFilter: true, noMatchingToken: false }
  }

  return { tokens: [], usedTargetFilter: false, noMatchingToken: true }
}

/**
 * Postgres "undefined_column" (42703) — detekteras för att överbrygga
 * gapet mellan kod-deploy (auto, git push till main) och den manuella
 * körningen av sql/v159_push_tokens_user_id.sql. Utan den här kollen
 * skulle EN SELECT mot en kolumn som ännu inte finns slå ut ALL
 * push-leverans (inte bara riktningen) tills Andreas kör migrationen.
 */
export function isUndefinedColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  return typeof error.message === 'string' && /user_id.*does not exist/i.test(error.message)
}

/**
 * Hämta alla Expo push-token-rader (token + user_id) för ett business.
 * Faller tillbaka till en select utan user_id om kolumnen inte finns än
 * (migration ej körd) — push-leverans ska aldrig stanna helt av det.
 */
async function getExpoPushTokenRows(businessId: string): Promise<ExpoTokenRow[]> {
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .eq('business_id', businessId)

  if (!error) {
    return data || []
  }

  if (isUndefinedColumnError(error)) {
    console.warn('[expo-push] push_tokens.user_id saknas ännu (sql/v159 ej körd) — faller tillbaka till oriktad hämtning')
    const fallback = await supabase.from('push_tokens').select('token').eq('business_id', businessId)
    if (fallback.error) {
      console.error('Kunde inte hämta push-tokens (fallback):', fallback.error)
      return []
    }
    return (fallback.data || []).map((r: { token: string }) => ({ token: r.token, user_id: null }))
  }

  console.error('Kunde inte hämta push-tokens:', error)
  return []
}

/**
 * Skicka push-notis till registrerade enheter för ett business.
 * Använder Expo Push API direkt (ingen SDK-dependency behövs).
 *
 * targetUserId (auth-uuid, Etapp 4 multi-employee-parity-plan.md) — om
 * satt riktas leveransen mot bara den personens enheter (selectExpoTargets).
 * Utelämnad = oförändrat blast, som tidigare.
 */
export async function sendExpoPushNotification(
  businessId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  targetUserId?: string | null,
  options: ExpoPushOptions = {},
): Promise<ExpoPushResult> {
  const rows = await getExpoPushTokenRows(businessId)

  if (rows.length === 0) {
    console.log(`Inga push-tokens för business ${businessId}`)
    return { attempted: 0, accepted: 0, rejected: 0, tickets: [], reason: 'no_tokens' }
  }

  const { tokens, noMatchingToken } = selectExpoTargets(rows, targetUserId)

  if (noMatchingToken) {
    // P1-1: ingen fallback-blast längre — riktade beslut ska aldrig kunna
    // nå fel person bara för att målpersonens telefon saknar registrerad
    // token. Loggas synligt (inte tyst) så gapet går att åtgärda; kortet
    // finns kvar i approval-kön oavsett.
    console.warn('[expo-push] target_user_id satt men ingen matchande push_tokens-rad — ingen Expo-sändning skickad', {
      businessId,
      targetUserId,
      totalTokens: rows.length,
    })
  }

  if (tokens.length === 0) {
    return {
      attempted: 0,
      accepted: 0,
      rejected: 0,
      tickets: [],
      reason: noMatchingToken ? 'no_matching_token' : 'no_tokens',
    }
  }

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: 'default',
    data,
    // TTL + prioritet (lib/notifications/push-policy.ts, 2026-09-01):
    // ett beslut ska inte dyka upp tre dagar senare på en avstängd telefon.
    ...(options.ttlSeconds ? { ttl: options.ttlSeconds } : {}),
    ...(options.priority ? { priority: options.priority } : {}),
  }))

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Expo Push API fel:', errorText)
      return {
        attempted: tokens.length,
        accepted: 0,
        rejected: tokens.length,
        tickets: [],
        reason: 'provider_error',
      }
    }

    const providerPayload = await response.json().catch(() => null)
    const result = summarizeExpoTickets(providerPayload, tokens.length)

    const rawProviderRows = (providerPayload as { data?: unknown } | null)?.data
    const providerRows: ExpoPushTicket[] = Array.isArray(rawProviderRows)
      ? rawProviderRows
      : rawProviderRows
        ? [rawProviderRows as ExpoPushTicket]
        : []
    const acceptedTokens = tokens.filter((_, index) => providerRows[index]?.status === 'ok')

    // last_used_at betyder nu att Expo faktiskt accepterade ticketen, inte
    // bara att vi försökte använda tokenen.
    if (acceptedTokens.length > 0) {
      const supabase = getServerSupabase()
      const { error } = await supabase
        .from('push_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .in('token', acceptedTokens)
      if (error) console.error('[expo-push] kunde inte uppdatera last_used_at:', error.message)
    }

    return result
  } catch (error) {
    console.error('Push-notis misslyckades:', error)
    return {
      attempted: tokens.length,
      accepted: 0,
      rejected: tokens.length,
      tickets: [],
      reason: 'network_error',
    }
  }
}
