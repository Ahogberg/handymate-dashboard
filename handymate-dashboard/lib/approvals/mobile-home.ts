// lib/approvals/mobile-home.ts
//
// Rena hjälpare för mobilens hem-feed (Mission Control mobil 4a, G2+G3).
// Pure/IO-split enligt husets mönster: allt här är deterministiskt och
// facit-testat i tests/mobile-home-feed.spec.ts; I/O bor i
// app/api/mobile/home/route.ts.

export interface FallbackKandidat {
  id: string
  risk_level: string | null
  created_at: string
  snoozed_until?: string | null
  status: string
}

const RISK_RANG: Record<string, number> = { high: 3, medium: 2, low: 1 }

/**
 * G2 — fallback-rangordning när dagens NBA-rad saknas (konton utan mål/
 * principer: NBA-motorn skriver medvetet ingenting där). Ordning:
 * risk_level (high→low) och därefter äldst först — ett gammalt kort som
 * ingen agerat på är mer angeläget än ett nyss skapat, inte mindre.
 * INGEN påhittad "rationale" sätts: fallback är en sortering, inte en
 * rekommendation, och UI:t ska inte låtsas något annat (sanningsregel).
 */
export function fallbackSortera<T extends FallbackKandidat>(kandidater: T[]): T[] {
  return [...kandidater].sort((a, b) => {
    const rank = (RISK_RANG[b.risk_level ?? ''] ?? 0) - (RISK_RANG[a.risk_level ?? ''] ?? 0)
    if (rank !== 0) return rank
    return a.created_at.localeCompare(b.created_at)
  })
}

/** Ett kort är aktivt (synligt i kön) om det inte är snoozat in i framtiden. */
export function arAktivt(k: Pick<FallbackKandidat, 'snoozed_until'>, nu: Date): boolean {
  if (!k.snoozed_until) return true
  return new Date(k.snoozed_until).getTime() <= nu.getTime()
}

/**
 * "I natt"-fönstrets start: senaste 18:00 svensk tid (Europe/Stockholm).
 * Klockan 03:00 natten mot måndag ⇒ söndag 18:00; klockan 19:30 ⇒ samma
 * dags 18:00. Deterministisk — `nu` injiceras, aldrig new Date() här.
 */
export function senasteKvallsgrans(nu: Date): Date {
  const sthlm = new Date(nu.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }))
  const offsetMs = nu.getTime() - sthlm.getTime()
  const gransSthlm = new Date(sthlm)
  gransSthlm.setHours(18, 0, 0, 0)
  if (sthlm.getHours() < 18) gransSthlm.setDate(gransSthlm.getDate() - 1)
  return new Date(gransSthlm.getTime() + offsetMs)
}
