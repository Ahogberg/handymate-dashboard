/**
 * 46elks-saldot — läses av driftlarmet.
 *
 * Bakgrund (docs/audits/WOW_GENOMLYSNING_2026-09-05.md, avsnitt 5): SMS gick
 * inte ut mellan 13 augusti och 5 september. 85 utskick föll på
 * "Not enough credits", däribland fakturapåminnelser ägaren godkänt, och
 * ingenting i systemet sa "saldot är slut" — felraderna drunknade bland
 * andra fel i driftlarmets digest. Saldot ska därför läsas rakt av och stå
 * ÖVERST när det inte räcker.
 *
 * 46elks GET /a1/me svarar med `balance` i tiotusendelar av valutan (samma
 * enhet som `cost` på ett skickat SMS: 3500 = 0,35 kr). Omvandlingen är
 * uttrycklig här, och driftlarmet visar även råvärdet så ett fel i
 * antagandet syns i mejlet i stället för att dölja sig bakom en snygg siffra.
 *
 * Fail-soft: saknade nycklar eller ett nätverksfel ger `{ ok:false, reason }`
 * — aldrig ett kastat fel som stoppar resten av driftlarmet.
 */

export const ELKS_ENHETER_PER_KRONA = 10_000

export type ElksSaldo =
  | { ok: true; kr: number; raw: number; currency: string }
  | { ok: false; reason: string }

export async function hamta46elksSaldo(
  fetchFn: typeof fetch = fetch,
  user: string | undefined = process.env.ELKS_API_USER,
  password: string | undefined = process.env.ELKS_API_PASSWORD,
): Promise<ElksSaldo> {
  if (!user || !password) return { ok: false, reason: '46elks-nycklar saknas' }
  try {
    const res = await fetchFn('https://api.46elks.com/a1/me', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64') },
    })
    if (!res.ok) return { ok: false, reason: `46elks svarade ${res.status}` }
    const data = (await res.json()) as { balance?: unknown; currency?: unknown }
    const raw = Number(data.balance)
    if (!Number.isFinite(raw)) return { ok: false, reason: 'saldot saknades i svaret' }
    return {
      ok: true,
      raw,
      kr: Math.round((raw / ELKS_ENHETER_PER_KRONA) * 100) / 100,
      currency: typeof data.currency === 'string' ? data.currency : 'SEK',
    }
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'nätverksfel' }
  }
}

/** Golv i kronor: under detta larmar vi oavsett förbrukning. */
export const SALDO_GOLV_KR = 50

/**
 * Ren bedömning: räcker saldot en vecka till? Veckoförbrukningen härleds ur
 * antalet skickade SMS senaste 7 dagarna gånger ett antaget styckpris
 * (0,35 kr — 46elks listpris för Sverige, medvetet tilltaget hellre än
 * snålt). Golvet gäller alltid, även för ett konto som inte skickat något.
 */
export function bedomSaldo(saldoKr: number, skickadeSenasteVeckan: number, styckprisKr = 0.35): {
  racker: boolean
  veckoforbrukningKr: number
  granKr: number
} {
  const veckoforbrukningKr = Math.round(skickadeSenasteVeckan * styckprisKr * 100) / 100
  const granKr = Math.max(SALDO_GOLV_KR, veckoforbrukningKr)
  return { racker: saldoKr >= granKr, veckoforbrukningKr, granKr }
}
