/**
 * Service-role Supabase-klient + DB-sanning-hjälpare för Golden Path-harnesset.
 *
 * Samma env-mönster som tests/auth.setup.ts (SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL
 * fallback-kedjan, SUPABASE_SERVICE_ROLE_KEY) — men kopierat, inte importerat,
 * så det här harnesset förblir helt oberoende av den befintliga specen
 * (se plan-filens Säkerhetsregler/Arkitektur: auth.setup.ts rörs aldrig).
 *
 * VIKTIGT — LAT validering: klienten skapas först vid FÖRSTA faktiska
 * användningen (getSupabaseAdmin()), inte vid modul-import. auth.setup.ts
 * gör samma sak genom att lägga sin env-kontroll inuti setup-callbacken.
 * Om vi istället kastade vid import (top-level) skulle `npx playwright test
 * tests/e2e-golden-path --list` krascha så fort en spec-fil importerar den
 * här modulen — även om ingen test faktiskt körs. `--list` KÖR modulernas
 * top-level-kod (det är så Playwright upptäcker test()-anropen), så bara
 * callback-kroppar får kasta på saknade secrets, aldrig import-tid.
 *
 * `waitForRow`/`assertRow` finns för att automationer (stage-flytt, Guardian-
 * kort, quote-tracking) delvis är asynkrona — en hård kontroll direkt efter
 * ett UI-klick kan race:a mot en bakgrundsskrivning. waitForRow pollar kort
 * (default 10s/500ms) innan den ger upp med ett tydligt felmeddelande.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Delade env-konstanter (samma default-kedja som beskrivs i planen) ──────
// Dessa har säkra defaults och kastar ALDRIG — får finnas på modul-toppnivå.

export const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'biz_0lovw5vcwzqn'
export const DEMO_OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL || 'demo@handymate.se'
export const E2E_TEST_PHONE = process.env.E2E_TEST_PHONE || '+46708379552'
export const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'andreashogberg93@gmail.com'

/** DEMO_OWNER_PASSWORD har medvetet INGEN default — kräver att Andreas satt den.
 *  Kastar bara när den FAKTISKT anropas (från en test-body), aldrig vid import. */
export function requireDemoOwnerPassword(): string {
  const pw = process.env.DEMO_OWNER_PASSWORD
  if (!pw) {
    throw new Error(
      '[golden-path] DEMO_OWNER_PASSWORD saknas i .env.test — kan inte utföra en riktig ' +
        'UI-inloggning som demo-ägaren (Station 1 kräver ett riktigt lösenord, ingen magic-link-genväg). ' +
        'Andreas måste bekräfta/sätta lösenordet för demo@handymate.se innan första skarpa körningen.',
    )
  }
  return pw
}

// ── Service-role-klient — LAT singleton (se filhuvudet för varför) ─────────

let cachedClient: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `[golden-path/db] SUPABASE_URL (${supabaseUrl ? 'SET' : 'MISSING'}) och ` +
        `SUPABASE_SERVICE_ROLE_KEY (${serviceKey ? 'SET' : 'MISSING'}) måste vara satta ` +
        `i .env.test för att köra Golden Path-harnesset. Dessa saknas medvetet på den här ` +
        `maskinen tills Andreas bekräftat värdena — se rapportens "Env-nycklar"-avsnitt.`,
    )
  }

  cachedClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedClient
}

// ── DB-sanning-hjälpare ──────────────────────────────────────────────────

export interface WaitForRowOptions<T> {
  /** Hur länge vi väntar totalt innan vi ger upp. Default 10s. */
  timeoutMs?: number
  /** Paus mellan pollningar. Default 500ms. */
  intervalMs?: number
  /** Extra villkor utöver eq-filtren — t.ex. att en statuskolumn bytt värde. */
  predicate?: (row: T) => boolean
  /** Läsbar etikett för felmeddelandet. */
  label?: string
}

/**
 * Pollar `table` tills en rad matchar `filters` (enkla eq-jämförelser) OCH
 * ett ev. `predicate`. Kastar med ett diagnostiskt fel (inkl. senaste sedda
 * rad) om tidsgränsen nås — aldrig en tyst `null`.
 */
export async function waitForRow<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown>,
  opts: WaitForRowOptions<T> = {},
): Promise<T> {
  const supabase = getSupabaseAdmin()
  const timeoutMs = opts.timeoutMs ?? 10_000
  const intervalMs = opts.intervalMs ?? 500
  const deadline = Date.now() + timeoutMs
  let lastRow: T | null = null
  let lastError: string | null = null

  while (Date.now() < deadline) {
    let query = supabase.from(table).select('*')
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value as never)
    }
    const { data, error } = await query.limit(1).maybeSingle()

    if (error) {
      lastError = error.message
    } else if (data) {
      lastRow = data as T
      if (!opts.predicate || opts.predicate(lastRow)) {
        return lastRow
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `[golden-path] waitForRow('${table}') gav upp efter ${timeoutMs}ms — ${
      opts.label || JSON.stringify(filters)
    }.\n` +
      `Senaste DB-fel: ${lastError || 'inget'}.\n` +
      `Senaste sedda rad: ${lastRow ? JSON.stringify(lastRow) : 'ingen rad matchade filtren alls'}.`,
  )
}

/** Engångskontroll (inget poll) — kastar med ett tydligt fel om raden saknas. */
export async function assertRow<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown>,
  label?: string,
): Promise<T> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from(table).select('*')
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value as never)
  }
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) {
    throw new Error(`[golden-path] assertRow('${table}') DB-fel: ${error.message}`)
  }
  if (!data) {
    throw new Error(
      `[golden-path] assertRow('${table}') — ingen rad matchade ${label || JSON.stringify(filters)}.`,
    )
  }
  return data as T
}

/** Hämtar EN rad fritt (godtycklig query-builder), utan poll — för fall där
 *  enkla eq-filter inte räcker (t.ex. "senaste offerten för denna kund"). */
export async function fetchLatest<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown>,
  orderBy: string,
): Promise<T | null> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from(table).select('*')
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value as never)
  }
  const { data, error } = await query.order(orderBy, { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`[golden-path] fetchLatest('${table}') DB-fel: ${error.message}`)
  return (data as T) ?? null
}

/** Räknar rader (för idempotens-/dedupe-bevis: "exakt EN rad, inte flera"). */
export async function countRows(table: string, filters: Record<string, unknown>): Promise<number> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value as never)
  }
  const { count, error } = await query
  if (error) throw new Error(`[golden-path] countRows('${table}') DB-fel: ${error.message}`)
  return count ?? 0
}
