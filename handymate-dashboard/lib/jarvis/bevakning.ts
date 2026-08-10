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
 * - HELA teamet syns när dess områdesdata FINNS (produktbeslut Andreas
 *   2026-08-10 — "hela teamets kollegor syns inte" var fel känsla). Utan
 *   händelser blir raden en ÄRLIG standby ("inga obetalda just nu"), aldrig
 *   påhittad aktivitet. Saknas områdesdatat helt (fältet inte satt) finns
 *   ingen rad — vi påstår aldrig bevakning vi inte kan se.
 * - Grön puls (`aktiv: true`) bara på AKTIVT bevakande — något som kan hända
 *   när som helst. Mattes schemalagda veckosammanfattning pulserar inte,
 *   Hannas rader pulserar aldrig, och en okopplad telefon pulserar inte.
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

/**
 * Fynd-pekaren: "1 nytt fynd ↓" på agentens bevakningskort (2026-08-10).
 *
 * Fynden BOR i "Värt att veta" (tre grindar, en sanning) — kortet får en
 * PEKARE dit, aldrig en kopia. Att duplicera fyndtexten in i korten vore
 * gamla närvarobandets felklass: samma sak på två ställen gör att man
 * slutar läsa båda. anchorId pekar på agentens första synliga nyhetsrad;
 * ytan scrollar dit (samma mönster som "väntar ovan" i Att hämta).
 */
export interface FyndPekare {
  antal: number
  anchorId: string
}

export function fyndPerAgent(
  nyheter: Array<{ id: string; agent_id: string | null | undefined }>,
): Record<string, FyndPekare> {
  const ut: Record<string, FyndPekare> = {}
  for (const n of nyheter) {
    if (!n.agent_id || !n.id) continue
    const p = ut[n.agent_id]
    if (p) p.antal += 1
    else ut[n.agent_id] = { antal: 1, anchorId: `nyhet-${n.id}` }
  }
  return ut
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

  // Karin — fakturabevakningen. Antal och löfte, aldrig belopp. Noll
  // obetalda är fortfarande bevakning — Karin tittar på varje ny faktura.
  if (indata.fakturor) {
    const n = indata.fakturor.bevakade
    rader.push(n > 0
      ? {
          agentId: 'karin',
          rubrik: `Bevakar ${n} faktur${n === 1 ? 'a' : 'or'}`,
          detalj: 'säger till dagen efter förfallodatum',
          aktiv: true,
        }
      : {
          agentId: 'karin',
          rubrik: 'Bevakar fakturorna',
          detalj: 'inga obetalda just nu',
          aktiv: true,
        })
  }

  // Daniel — öppna offerter + cadencen ur inställningarna (INTE mockupens 7).
  if (indata.offerter) {
    const n = indata.offerter.oppna
    rader.push(n > 0
      ? {
          agentId: 'daniel',
          rubrik: `${n} öppn${n === 1 ? 'a offert' : 'a offerter'}`,
          detalj: `föreslår påminnelse på dag ${indata.offerter.followupDagar}`,
          aktiv: true,
        }
      : {
          agentId: 'daniel',
          rubrik: 'Bevakar offerterna',
          detalj: 'inga öppna just nu',
          aktiv: true,
        })
  }

  // Lisa — telefonbevakningen. En okopplad telefon är ingen bevakning:
  // raden säger det ärligt och pulserar aldrig.
  if (indata.telefon) {
    rader.push(indata.telefon.aktiv
      ? {
          agentId: 'lisa',
          rubrik: 'Bevakar telefonen',
          detalj: indata.telefon.samtal > 0 ? `${indata.telefon.samtal} samtal senaste dygnet` : 'svarar när du inte kan',
          aktiv: true,
        }
      : {
          agentId: 'lisa',
          rubrik: 'Telefonen är inte kopplad ännu',
          detalj: 'Lisa svarar så fort ett nummer finns',
          aktiv: false,
        })
  }

  // Lars — nästa bokning. null = kollat och inget bokat (ärlig standby);
  // undefined = datat saknas, då påstås ingenting. Trasigt datum ger standby
  // i stället för en gissad tid.
  if (indata.nastaBokning !== undefined) {
    const nar = indata.nastaBokning ? bokningsEtikett(indata.nastaBokning.start) : null
    if (nar) {
      const kund = indata.nastaBokning!.kund?.trim()
      rader.push({
        agentId: 'lars',
        rubrik: `Nästa bokning ${nar}`,
        detalj: kund ? `hos ${kund} — påminner kunden dagen innan` : 'påminner kunden dagen innan',
        aktiv: true,
      })
    } else {
      rader.push({
        agentId: 'lars',
        rubrik: 'Bevakar schemat',
        detalj: 'inget bokat framåt just nu',
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
  // Tom lista (kollat, inget att fråga) ger ärlig standby; undefined ger inget.
  if (indata.hannaFragor !== undefined && indata.hannaFragor !== null) {
    const fraga = indata.hannaFragor.find(f => typeof f === 'string' && f.trim().length > 0)
    rader.push(fraga
      ? {
          agentId: 'hanna',
          rubrik: fraga.trim(),
          detalj: 'svara när det passar — inget brådskar',
          aktiv: false,
          fraga: true,
        }
      : {
          agentId: 'hanna',
          rubrik: 'Inget att fråga om just nu',
          detalj: 'hör av sig när något är värt att lyfta',
          aktiv: false,
        })
  }

  return rader
}
