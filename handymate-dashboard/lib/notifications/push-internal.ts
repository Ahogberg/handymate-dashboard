/**
 * Intern push-adapter (Etapp 0 i OUTBOUND_COMMUNICATION_INVENTORY, 2026-08-27).
 *
 * /api/push/send var helt oautentiserad: vem som helst kunde posta en push
 * till valfritt business_id. Rutten kräver nu antingen en inloggad session
 * som tillhör business_id ELLER den interna signaturen x-internal-secret
 * (samma CRON_SECRET som crons redan använder). Alla server-side anropare
 * går genom den här filen så headern aldrig glöms.
 *
 * sendInternalPush skiljer dessutom "levererat" från "0 mottagare": rutten
 * svarade tidigare success:true även när ingen prenumeration fanns eller
 * VAPID saknades, och V3 notify_owner räknade det som lyckat.
 */

/** Samma header som verifyCronSecret (lib/cron/verify-secret.ts) faktiskt
    läser: `x-cron-secret`. OBS: den tidigare `x-internal-secret` som några
    crons skickade lästes ALDRIG av någon rutt. */
export function internalPushHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-cron-secret': process.env.CRON_SECRET || '',
  }
}

export interface InternalPushPayload {
  business_id: string
  title: string
  body?: string
  url?: string
  tag?: string
  target_user_id?: string | null
  data?: Record<string, unknown>
  /** Klassens TTL/prioritet (lib/notifications/push-policy.ts). Utelämnad = beslut-klassens. */
  ttl_seconds?: number
  priority?: 'high' | 'normal'
}

export interface InternalPushResult {
  /** true = minst en kanal accepterade pushen. Inte ett device-receipt. */
  delivered: boolean
  sent: number
  /** 'no_recipients' | 'vapid_not_configured' | 'web_push_not_installed' | 'http_<status>' | 'network' */
  reason?: string
  channels?: {
    web?: { attempted: number; accepted: number; rejected: number; reason?: string }
    expo?: { attempted: number; accepted: number; rejected: number; reason?: string }
  }
}

export async function sendInternalPush(payload: InternalPushPayload): Promise<InternalPushResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  try {
    const res = await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: internalPushHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { delivered: false, sent: 0, reason: `http_${res.status}` }
    const data = await res.json().catch(() => ({})) as {
      sent?: number
      reason?: string
      delivered?: boolean
      channels?: InternalPushResult['channels']
    }
    const sent = Number(data.sent ?? 0)
    return {
      delivered: data.delivered === true || sent > 0,
      sent,
      reason: data.reason,
      channels: data.channels,
    }
  } catch (err: unknown) {
    console.error('[push-internal] push misslyckades:', err instanceof Error ? err.message : err)
    return { delivered: false, sent: 0, reason: 'network' }
  }
}
