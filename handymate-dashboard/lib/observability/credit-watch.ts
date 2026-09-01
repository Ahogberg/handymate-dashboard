/**
 * Kreditbevakning — de tre externa kreditkällorna + databasen, dagligen.
 *
 * Bakgrund: Reality Week (docs/REALITY-WEEK.md) stoppades tre gånger av slut
 * på kredit hos en leverantör — 46elks-saldot (#10), Anthropic-krediten
 * (#11) och Supabase-kontot — och 2026-08-31 svarade Matte fel till ALLA
 * kunder i två dygn innan någon märkte att Anthropic-krediterna var slut
 * (lib/ai/provider-outage.ts). Ingen av dem syntes i /api/health, som bara
 * kollade att miljövariablerna FANNS.
 *
 * Den här modulen gör tre saker, medvetet små:
 *  1. Rena bedömare (bedomElksSaldo/bedomAnthropicSvar/bedomStripeSvar) —
 *     testbara utan nät, exakta gränsvärden i namngivna konstanter.
 *  2. korKreditbevakning — kör de fyra kontrollerna med injicerbar fetch/env.
 *  3. spara/las — persisterar senaste utfallet i platform_health_check
 *     (sql/v191) så /api/health kan visa det UTAN att själv anropa
 *     leverantörerna (health är publik och oautentiserad — den ska aldrig
 *     kunna användas för att bränna Anthropic-anrop eller rate-limits).
 *
 * KONTRAKT: inget här kastar. En kontroll som själv går sönder blir
 * status 'warn' med orsak — "vi vet inte" får aldrig se ut som "grönt".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export type KontrollStatus = 'ok' | 'warn' | 'error'

export interface KontrollResultat {
  key: KontrollNyckel
  status: KontrollStatus
  /** Kort svensk text för digest/health — ingen hemlighet, inget belopp som är känsligt. */
  summary: string
  detail: Record<string, unknown>
}

export const CREDIT_WATCH_CHECK_KEYS = ['database', 'elks_balance', 'anthropic_credit', 'stripe_key'] as const
export type KontrollNyckel = typeof CREDIT_WATCH_CHECK_KEYS[number]

/** 46elks-saldo under detta = warn. Överstyrs av CREDIT_WATCH_ELKS_MIN_SEK. */
export const CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT = 300
/** Ett sparat utfall äldre än så räknas som inaktuellt i /api/health. */
export const CREDIT_WATCH_STALE_HOURS = 26
/** Billigaste modellen för en 1-token-probe; kostnaden är försumbar. */
export const CREDIT_WATCH_PROBE_MODEL = 'claude-haiku-4-5-20251001'
/**
 * 46elks redovisar belopp i 1/10000 av valutan (deras "cost" för ett SMS
 * är t.ex. 3500 = 0,35 kr). Både råvärdet och det omräknade sparas i
 * detail så ett feltolkat antagande syns första körningen.
 */
export const ELKS_BALANCE_DIVISOR = 10000

export function lasElksMinSek(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = Number(env.CREDIT_WATCH_ELKS_MIN_SEK)
  return Number.isFinite(raw) && raw >= 0 ? raw : CREDIT_WATCH_ELKS_MIN_SEK_DEFAULT
}

// ─── Rena bedömare ──────────────────────────────────────────────────────

export function bedomElksSaldo(body: unknown, minSek: number): KontrollResultat {
  const raw = (body as { balance?: unknown; currency?: unknown } | null)?.balance
  const currency = (body as { currency?: unknown } | null)?.currency
  const balanceRaw = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(balanceRaw)) {
    return {
      key: 'elks_balance',
      status: 'warn',
      summary: '46elks svarade utan tolkbart saldo',
      detail: { raw: raw ?? null },
    }
  }
  const balanceSek = balanceRaw / ELKS_BALANCE_DIVISOR
  const low = balanceSek < minSek
  return {
    key: 'elks_balance',
    status: low ? 'warn' : 'ok',
    summary: low
      ? `46elks-saldo ${balanceSek.toFixed(0)} kr — under gränsen ${minSek} kr, fyll på`
      : `46elks-saldo ${balanceSek.toFixed(0)} kr`,
    detail: { balance_raw: balanceRaw, balance_sek: balanceSek, min_sek: minSek, currency: currency ?? null },
  }
}

export function bedomAnthropicSvar(status: number, bodyText: string): KontrollResultat {
  const text = bodyText || ''
  if (status >= 200 && status < 300) {
    return { key: 'anthropic_credit', status: 'ok', summary: 'Anthropic svarar och kredit finns', detail: { http: status } }
  }
  if (status === 400 && text.includes('credit balance')) {
    return {
      key: 'anthropic_credit',
      status: 'error',
      summary: 'Anthropic-krediten är SLUT — Matte, offert-AI och samtalsanalys svarar fel till alla kunder',
      detail: { http: status, reason: 'credit_exhausted' },
    }
  }
  if (status === 401 || status === 403) {
    return {
      key: 'anthropic_credit',
      status: 'error',
      summary: 'Anthropic avvisar API-nyckeln',
      detail: { http: status, reason: 'invalid_key' },
    }
  }
  if (status === 429) {
    return { key: 'anthropic_credit', status: 'warn', summary: 'Anthropic rate-limitar just nu', detail: { http: status, reason: 'rate_limited' } }
  }
  if (status >= 500) {
    return { key: 'anthropic_credit', status: 'warn', summary: 'Anthropic har driftstörning', detail: { http: status, reason: 'provider_error' } }
  }
  return {
    key: 'anthropic_credit',
    status: 'warn',
    summary: `Anthropic svarade oväntat (HTTP ${status})`,
    detail: { http: status, reason: 'unexpected', body: text.slice(0, 200) },
  }
}

export function bedomStripeSvar(status: number, body: unknown): KontrollResultat {
  if (status >= 200 && status < 300) {
    const livemode = (body as { livemode?: unknown } | null)?.livemode
    return {
      key: 'stripe_key',
      status: 'ok',
      summary: livemode === false ? 'Stripe-nyckeln fungerar (TESTLÄGE, inte live)' : 'Stripe-nyckeln fungerar',
      detail: { http: status, livemode: livemode ?? null },
    }
  }
  if (status === 401) {
    return { key: 'stripe_key', status: 'error', summary: 'Stripe avvisar hemliga nyckeln — betalningar och webhooks är nere', detail: { http: status, reason: 'invalid_key' } }
  }
  return { key: 'stripe_key', status: 'warn', summary: `Stripe svarade oväntat (HTTP ${status})`, detail: { http: status, reason: 'unexpected' } }
}

export function sammanfattaKreditlage(results: KontrollResultat[]): {
  overall: KontrollStatus
  errors: KontrollResultat[]
  warnings: KontrollResultat[]
} {
  const errors = results.filter(r => r.status === 'error')
  const warnings = results.filter(r => r.status === 'warn')
  return {
    overall: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warn' : 'ok',
    errors,
    warnings,
  }
}

export function arFarsk(checkedAtIso: string, nowMs: number = Date.now()): boolean {
  const t = new Date(checkedAtIso).getTime()
  if (!Number.isFinite(t)) return false
  return nowMs - t <= CREDIT_WATCH_STALE_HOURS * 3600_000
}

// ─── Körning ────────────────────────────────────────────────────────────

export interface KreditbevakningDeps {
  fetchImpl?: typeof fetch
  env?: Readonly<Record<string, string | undefined>>
  /** Databasprobe — true = nåbar. Standard: en select mot business_config. */
  dbProbe?: () => Promise<boolean>
}

function saknas(key: KontrollNyckel, vad: string): KontrollResultat {
  return { key, status: 'error', summary: `${vad} är inte konfigurerad`, detail: { reason: 'not_configured' } }
}

function kraschade(key: KontrollNyckel, vad: string, err: unknown): KontrollResultat {
  return {
    key,
    status: 'warn',
    summary: `${vad} kunde inte kontrolleras (${err instanceof Error ? err.message : String(err)})`,
    detail: { reason: 'probe_failed' },
  }
}

export async function korKreditbevakning(deps: KreditbevakningDeps = {}): Promise<KontrollResultat[]> {
  const env = deps.env ?? process.env
  const fetchImpl = deps.fetchImpl ?? fetch
  const results: KontrollResultat[] = []

  // 1. Databas
  try {
    const probe = deps.dbProbe ?? defaultDbProbe
    const ok = await probe()
    results.push(ok
      ? { key: 'database', status: 'ok', summary: 'Databasen svarar', detail: {} }
      : { key: 'database', status: 'error', summary: 'Databasen svarar inte', detail: { reason: 'query_failed' } })
  } catch (err) {
    results.push({ key: 'database', status: 'error', summary: 'Databasen svarar inte', detail: { reason: 'query_threw', message: err instanceof Error ? err.message : String(err) } })
  }

  // 2. 46elks-saldo
  if (!env.ELKS_API_USER || !env.ELKS_API_PASSWORD) {
    results.push(saknas('elks_balance', '46elks'))
  } else {
    try {
      const res = await fetchImpl('https://api.46elks.com/a1/me', {
        headers: { Authorization: 'Basic ' + Buffer.from(`${env.ELKS_API_USER}:${env.ELKS_API_PASSWORD}`).toString('base64') },
      })
      if (res.status === 401) {
        results.push({ key: 'elks_balance', status: 'error', summary: '46elks avvisar API-uppgifterna — SMS och telefoni är nere', detail: { http: 401, reason: 'invalid_credentials' } })
      } else if (!res.ok) {
        results.push({ key: 'elks_balance', status: 'warn', summary: `46elks svarade oväntat (HTTP ${res.status})`, detail: { http: res.status } })
      } else {
        const body = await res.json().catch(() => null)
        results.push(bedomElksSaldo(body, lasElksMinSek(env)))
      }
    } catch (err) {
      results.push(kraschade('elks_balance', '46elks', err))
    }
  }

  // 3. Anthropic-kredit — en riktig 1-token-probe. count_tokens är gratis
  // men avslöjar inte kreditstopp; det gör bara ett riktigt anrop.
  if (!env.ANTHROPIC_API_KEY) {
    results.push(saknas('anthropic_credit', 'Anthropic'))
  } else {
    try {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CREDIT_WATCH_PROBE_MODEL,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      const text = await res.text().catch(() => '')
      results.push(bedomAnthropicSvar(res.status, text))
    } catch (err) {
      results.push(kraschade('anthropic_credit', 'Anthropic', err))
    }
  }

  // 4. Stripe-nyckel — /v1/balance är det billigaste autentiserade anropet.
  if (!env.STRIPE_SECRET_KEY) {
    results.push(saknas('stripe_key', 'Stripe'))
  } else {
    try {
      const res = await fetchImpl('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      })
      const body = await res.json().catch(() => null)
      results.push(bedomStripeSvar(res.status, body))
    } catch (err) {
      results.push(kraschade('stripe_key', 'Stripe', err))
    }
  }

  return results
}

async function defaultDbProbe(): Promise<boolean> {
  const { getServerSupabase } = await import('@/lib/supabase')
  const { error } = await getServerSupabase().from('business_config').select('business_id').limit(1)
  return !error
}

// ─── Persistens (platform_health_check, sql/v191) ───────────────────────

export interface SparatKreditlage {
  saved: boolean
  reason?: 'schema_saknas' | 'db_error'
}

export async function sparaKreditlage(supabase: SupabaseClient, results: KontrollResultat[]): Promise<SparatKreditlage> {
  const checkedAt = new Date().toISOString()
  try {
    const { error } = await supabase.from('platform_health_check').upsert(
      results.map(r => ({
        check_key: r.key,
        status: r.status,
        summary: r.summary,
        detail: r.detail,
        checked_at: checkedAt,
      })),
      { onConflict: 'check_key' },
    )
    if (error) {
      if (arSchemaSaknas(error)) {
        console.warn('[credit-watch] platform_health_check saknas — kör sql/v191 för att /api/health ska visa kreditläget')
        return { saved: false, reason: 'schema_saknas' }
      }
      console.error('[credit-watch] kunde inte spara kreditläget:', error.message)
      return { saved: false, reason: 'db_error' }
    }
    return { saved: true }
  } catch (err) {
    console.error('[credit-watch] sparaKreditlage kastade:', err)
    return { saved: false, reason: 'db_error' }
  }
}

export interface LastKreditlage {
  available: boolean
  reason?: 'schema_saknas' | 'db_error' | 'aldrig_kord'
  checked_at: string | null
  stale: boolean
  overall: KontrollStatus | 'unknown'
  checks: Array<{ key: string; status: KontrollStatus; summary: string; checked_at: string }>
}

export async function lasKreditlage(supabase: SupabaseClient, nowMs: number = Date.now()): Promise<LastKreditlage> {
  const tom: LastKreditlage = { available: false, checked_at: null, stale: true, overall: 'unknown', checks: [] }
  try {
    const { data, error } = await supabase
      .from('platform_health_check')
      .select('check_key, status, summary, checked_at')
      .order('check_key', { ascending: true })
    if (error) {
      return { ...tom, reason: arSchemaSaknas(error) ? 'schema_saknas' : 'db_error' }
    }
    const rows = (data || []) as Array<{ check_key: string; status: KontrollStatus; summary: string | null; checked_at: string }>
    if (rows.length === 0) return { ...tom, reason: 'aldrig_kord' }
    const newest = rows.map(r => r.checked_at).sort().at(-1) || null
    const stale = !newest || !arFarsk(newest, nowMs)
    const { overall } = sammanfattaKreditlage(rows.map(r => ({ key: r.check_key as KontrollNyckel, status: r.status, summary: r.summary || '', detail: {} })))
    return {
      available: true,
      checked_at: newest,
      stale,
      overall,
      checks: rows.map(r => ({ key: r.check_key, status: r.status, summary: r.summary || '', checked_at: r.checked_at })),
    }
  } catch {
    return { ...tom, reason: 'db_error' }
  }
}
