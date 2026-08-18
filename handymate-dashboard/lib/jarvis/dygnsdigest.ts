/**
 * "Senaste dygnet" — dygnsdigesten under besluten (Tur 4 etapp 6).
 *
 * ═══ VARFÖR 24 H RULLANDE, INTE MIDNATT ═══
 *
 * Klart idag filtrerade på midnatt: klockan 07:00 var listan nästan tom och
 * sa "teamet har inte gjort något" — när sanningen var att natten var full av
 * arbete (cronarna kör på natten). Hälsningens bevis räknar redan rullande
 * dygn (team-activity HOURS_BACK=24); digesten säger nu samma sak som
 * beviset. Rubriken säger "Senaste dygnet" — den ljuger inte om sitt fönster.
 *
 * ═══ GRINDARNA (facit i tests/dygnsdigest.spec.ts) ═══
 *
 * - description finns och status !== 'failed' (ett misslyckande är inte en
 *   utförd handling — de syns i driftlarmet, inte i digesten).
 * - Självpresentationer och analyser bort, deterministiskt: rader som börjar
 *   "Jag är" eller "Hej" är agentprat, och "Av N …" är aggregat som redan
 *   sägs bättre av Verksamheten/Värt att veta.
 * - Aggregerad samtalsrad prependas i DÅTID — "Lisa tog N samtal" — och
 *   påstår bokade besök BARA när siffran finns och är sann.
 *
 * `halsningsBevis` är hälsningens proof-rad: rullande dygn + ärligt besked
 * om huruvida något behövde ägaren ("Sedan igår" vore osant mot HOURS_BACK).
 */

export const DIGEST_TIMMAR = 24

export interface DigestAktivitet {
  id: string | number
  source?: string
  agent_id?: string | null
  description?: string | null
  status?: string | null
  created_at: string
  auto?: boolean
}

export interface DigestRad {
  key: string
  /** ISO — ytan formaterar klockslag. */
  tid: string
  agentId: string
  text: string
  auto: boolean
}

/** Agentprat och aggregat — deterministiska markörer, ingen AI-bedömning. */
function arBrus(text: string): boolean {
  return /^Jag är /.test(text) || /^Hej[ !,]/.test(text) || /^Av \d/.test(text)
}

export function byggDygnsdigest(input: {
  aktiviteter: DigestAktivitet[]
  /** Aggregat ur team-activity: samtal senaste dygnet + hur många som blev bokade besök. */
  samtal?: { antal: number; bokade: number } | null
  nu: Date
  /**
   * Owner Absence V1 (Etapp Å, lib/absence/franvarorapport.ts) — valfri
   * explicit fönsterstart som ERSÄTTER DIGEST_TIMMAR-bakåträkningen. Utan
   * detta fält (alla befintliga anrop) är beteendet exakt oförändrat:
   * "senaste dygnet" räknat bakåt från `nu`.
   */
  from?: Date
}): DigestRad[] {
  const sedan = input.from ? input.from.getTime() : input.nu.getTime() - DIGEST_TIMMAR * 3_600_000

  const rader: DigestRad[] = input.aktiviteter
    .filter(a => {
      const t = Date.parse(a.created_at)
      if (!Number.isFinite(t) || t < sedan || t > input.nu.getTime()) return false
      const text = typeof a.description === 'string' ? a.description.trim() : ''
      if (!text) return false
      if (a.status === 'failed') return false
      if (arBrus(text)) return false
      return true
    })
    .map(a => ({
      key: `${a.source || 'akt'}-${a.id}`,
      tid: a.created_at,
      agentId: a.agent_id || 'matte',
      text: String(a.description).trim(),
      auto: a.auto !== false,
    }))

  // Samtalen finns inte i aktivitetsloggen (de bor i agent_runs) — de
  // prependas som EN dåtidsrad. Bokade besök nämns bara när siffran är sann.
  if (input.samtal && input.samtal.antal > 0) {
    const { antal, bokade } = input.samtal
    rader.unshift({
      key: 'samtal-aggregat',
      tid: input.nu.toISOString(),
      agentId: 'lisa',
      text: bokade > 0
        ? `Lisa tog ${antal} samtal — ${bokade} blev bokade besök`
        : `Lisa tog ${antal} samtal`,
      auto: true,
    })
  }

  return rader
}

/**
 * Hälsningens bevisrad. `delar` är uppräkningen ("7 samtal, 2 offerter och
 * 1 bokning") — null när inget hänt, och då finns ingen rad att visa.
 */
export function halsningsBevis(delar: string | null, beslut: number): string | null {
  if (!delar) return null
  return beslut === 0
    ? `Senaste dygnet: ${delar} — inget behövde dig`
    : `Senaste dygnet: ${delar} — inget behövde dig förrän nu`
}
