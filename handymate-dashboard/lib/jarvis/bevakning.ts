/**
 * "Teamet just nu" — bevakning, inte härledd aktivitet (Tur 4 etapp 3).
 *
 * ═══ SKILLNADEN MOT NÄRVAROBANDET ═══
 *
 * TeamPresenceBand härledde "vad har agenterna GJORT" ur observationer och
 * Klart idag — dåtid, och tomt när inget hänt. Bevakningen svarar på en annan
 * fråga: **vad HÅLLER teamet ögonen på just nu, och när säger de till?**
 * Det är löftet som gör att hantverkaren vågar lägga ner telefonen.
 *
 * ═══ REGLERNA (facit i tests/bevakning.spec.ts) ═══
 *
 * - En rad renderas ENDAST vid aktiv bevakning — det finns inga "vilar"-rader.
 *   Tom indata ger tom lista, och ytan renderar då ingenting.
 * - Grön puls (`aktiv: true`) bara på AKTIVT bevakande — något som kan hända
 *   när som helst. Mattes schemalagda veckosammanfattning pulserar inte, och
 *   Hannas mjuka fråga pulserar aldrig.
 * - Hanna får max EN fråga (`fraga: true`) — två frågor är ett formulär.
 * - Daniels uppföljningsdag kommer ur automation-inställningarna
 *   (quote_followup_days, default 5) — aldrig ett hårdkodat mockup-värde.
 * - Inga belopp någonstans: bevakningen bor på en yta hela personalen ser.
 *   Kronorna bor i ägargrindade "Att hämta" (etapp 5).
 */

export interface BevakningsRad {
  agentId: string
  rubrik: string
  detalj: string
  /** Grön puls — bara aktivt bevakande, aldrig schemalagt eller frågande. */
  aktiv: boolean
  /** Hannas mjuka fråga — renderas som fråga, aldrig med puls. */
  fraga?: boolean
}

export interface BevakningsIndata {
  /** Karin: antal skickade/förfallna fakturor under bevakning. */
  fakturor?: { bevakade: number } | null
  /** Daniel: öppna offerter + uppföljningsdagen ur inställningarna. */
  offerter?: { oppna: number; followupDagar: number } | null
  /** Lisa: telefonbevakningen aktiv (nummer tilldelat) + samtal senaste dygnet. */
  telefon?: { aktiv: boolean; samtal: number } | null
  /** Lars: nästa bekräftade bokning. */
  nastaBokning?: { start: string; kund?: string | null } | null
  /** Matte: veckosammanfattningen (generate-insights-cronen, söndag 06:00). */
  veckosammanfattning?: boolean
  /** Hanna: mjuka frågor — bara den första används. */
  hannaFragor?: string[] | null
}

/** "sön 14 juni 09:00" — deterministisk sv-SE, utan år. */
function bokningsEtikett(iso: string): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const dag = d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
  const tid = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  return `${dag} ${tid}`
}

export function byggBevakning(indata: BevakningsIndata): BevakningsRad[] {
  const rader: BevakningsRad[] = []

  // Karin — fakturabevakningen. Antal och löfte, aldrig belopp.
  if (indata.fakturor && indata.fakturor.bevakade > 0) {
    const n = indata.fakturor.bevakade
    rader.push({
      agentId: 'karin',
      rubrik: `Bevakar ${n} faktur${n === 1 ? 'a' : 'or'}`,
      detalj: 'säger till dagen efter förfallodatum',
      aktiv: true,
    })
  }

  // Daniel — öppna offerter + cadencen ur inställningarna (INTE mockupens 7).
  if (indata.offerter && indata.offerter.oppna > 0) {
    const n = indata.offerter.oppna
    rader.push({
      agentId: 'daniel',
      rubrik: `${n} öppn${n === 1 ? 'a offert' : 'a offerter'}`,
      detalj: `föreslår påminnelse på dag ${indata.offerter.followupDagar}`,
      aktiv: true,
    })
  }

  // Lisa — telefonbevakningen. Bara när numret faktiskt är kopplat.
  if (indata.telefon?.aktiv) {
    const n = indata.telefon.samtal
    rader.push({
      agentId: 'lisa',
      rubrik: 'Bevakar telefonen',
      detalj: n > 0 ? `${n} samtal senaste dygnet` : 'svarar när du inte kan',
      aktiv: true,
    })
  }

  // Lars — nästa bokning. Utan bokning finns ingen bevakning att påstå.
  if (indata.nastaBokning) {
    const nar = bokningsEtikett(indata.nastaBokning.start)
    if (nar) {
      const kund = indata.nastaBokning.kund?.trim()
      rader.push({
        agentId: 'lars',
        rubrik: `Nästa bokning ${nar}`,
        detalj: kund ? `hos ${kund} — påminner kunden dagen innan` : 'påminner kunden dagen innan',
        aktiv: true,
      })
    }
  }

  // Matte — schemalagd sammanfattning. Renderas, men pulserar inte:
  // ett kron-schema är ett löfte om en tidpunkt, inte ett vakande öga.
  if (indata.veckosammanfattning) {
    rader.push({
      agentId: 'matte',
      rubrik: 'Veckosammanfattning söndag 06:00',
      detalj: 'summerar veckan och lägger den här',
      aktiv: false,
    })
  }

  // Hanna — max EN mjuk fråga, aldrig puls. Två frågor är ett formulär.
  const fraga = (indata.hannaFragor || []).find(f => typeof f === 'string' && f.trim().length > 0)
  if (fraga) {
    rader.push({
      agentId: 'hanna',
      rubrik: fraga.trim(),
      detalj: 'svara när det passar — inget brådskar',
      aktiv: false,
      fraga: true,
    })
  }

  return rader
}
