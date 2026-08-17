/**
 * Mission Learning-läslagret — organiska, räknade mönster ur avslutade
 * uppdrags facit (Etapp H, tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ INGEN KAUSALITET — BARA RÄKNADE FAKTA (Codex-precision 3) ═══
 *
 * Ingen sträng i den här filen — kommentar, kod eller genererad text — får
 * PÅSTÅ eller ANTYDA att en handling stod bakom ett bättre utfall SOM DESS
 * EFFEKT. Att konstatera "N av M mål nåddes" eller "X stod för flest
 * utförda steg i N uppdrag" är en observation ingen kan bestrida — den
 * beskriver bara vad som RÄKNADES. Ett verb som kopplar en agent eller en
 * åtgärdstyp till resultatet som dess ORSAK hör aldrig hemma här — varken i
 * genererad text eller i den här kommentaren.
 * tests/mission-learning.spec.ts låser det med en källkodsskanning (grep
 * efter ett par sådana verb, case-insensitive) — se testfilen för den
 * exakta ordlistan; den listas medvetet INTE här, för att listan själv inte
 * ska räknas som en förekomst (samma självreferensfälla som
 * lib/playbook/checkpoint-outcomes.ts undviker).
 *
 * ═══ MIN-DATA-GRINDEN (Codex-precision 2) ═══
 *
 * Bara mission-rader med learning_eligible===true räknas in — cancelled/
 * expired/active-uppdrag filtreras bort HÄR, en gång, i stället för att
 * varje formuleringsregel nedan behöver komma ihåg det själv. Färre än tre
 * jämförbara uppdrag av samma målstyp (goal_type) ger INGEN rad för den
 * målstypen — tre är den minsta mängd där "N av M" säger något om ett
 * mönster i stället för ett enskilt uppdrags utfall. Om INGEN målstyp når
 * tre → `forTidigt: true`, inga rader alls.
 *
 * ═══ FAKTURADEDUP ÖVER SLUTSATSER (Codex-precision 3) ═══
 *
 * `verifierat_betalt_kr` är redan fakturadedupat PER UPPDRAG av
 * mission-progress.ts:s attributionsloop (en faktura räknas högst en gång
 * inom sitt eget uppdrag). Den här filen adderar bara de redan uträknade
 * per-uppdrags-talen över FLERA uppdrag — den slår ALDRIG upp en fakturarad
 * på nytt och läser aldrig invoice-tabellen. En och samma faktura kan
 * alltså aldrig hamna i två olika slutsatser här, eftersom ingen faktura
 * någonsin läses här över huvud taget.
 */

import type { MissionFacit, AgentUtfall } from './mission-facit'

export interface LearningRow {
  text: string
  /** Underlaget bakom raden, t.ex. "5 avslutade uppdrag" — alltid en räknad mängd. */
  grund: string
}

/** Minsta antal jämförbara (learning_eligible) uppdrag av samma goal_type
    innan den målstypen får bidra med en rad. */
export const MIN_ELIGIBLE_PER_GOAL_TYPE = 3

function bestUtfordAgent(facit: MissionFacit[]): { agentKey: string; count: number } | null {
  const utfordaPerAgent = new Map<string, number>()
  for (const f of facit) {
    for (const a of f.per_agent as AgentUtfall[]) {
      utfordaPerAgent.set(a.agent_key, (utfordaPerAgent.get(a.agent_key) ?? 0) + a.utforda)
    }
  }
  let bestKey: string | null = null
  let bestCount = 0
  for (const [key, count] of Array.from(utfordaPerAgent.entries())) {
    if (count > bestCount) {
      bestKey = key
      bestCount = count
    }
  }
  return bestKey ? { agentKey: bestKey, count: bestCount } : null
}

/**
 * Bygger räknade, icke-kausala mönsterrader ur avslutade uppdrags facit.
 * Filtrerar internt till learning_eligible===true — anroparen skickar in
 * HELA historiken (inklusive avbrutna/utgångna/pågående), inte en
 * förfiltrerad lista.
 */
export function byggLearningRows(facit: MissionFacit[]): {
  rows: LearningRow[]
  forTidigt: boolean
  antalEligible: number
} {
  const eligible = facit.filter(f => f.learning_eligible)
  const antalEligible = eligible.length

  const perTyp = new Map<MissionFacit['goal_type'], MissionFacit[]>()
  for (const f of eligible) {
    const list = perTyp.get(f.goal_type) ?? []
    list.push(f)
    perTyp.set(f.goal_type, list)
  }

  const rows: LearningRow[] = []
  const godkanda: MissionFacit[] = []

  const pengamal = perTyp.get('money') ?? []
  if (pengamal.length >= MIN_ELIGIBLE_PER_GOAL_TYPE) {
    godkanda.push(...pengamal)
    const grund = `${pengamal.length} avslutade uppdrag`
    const natt = pengamal.filter(f => f.slutgap_kr === 0).length
    rows.push({ text: `${natt} av ${pengamal.length} pengamål nådde målet före deadline`, grund })

    const verifieratSumma = pengamal.reduce((summa, f) => summa + f.verifierat_betalt_kr, 0)
    rows.push({
      text: `Pengamål stod för ${verifieratSumma.toLocaleString('sv-SE')} kr verifierat betalt i ${pengamal.length} avslutade uppdrag`,
      grund,
    })
  }

  const kapacitetsmal = perTyp.get('capacity') ?? []
  if (kapacitetsmal.length >= MIN_ELIGIBLE_PER_GOAL_TYPE) {
    godkanda.push(...kapacitetsmal)
    const grund = `${kapacitetsmal.length} avslutade uppdrag`
    const natt = kapacitetsmal.filter(f => f.slutgap_hours === 0).length
    rows.push({ text: `${natt} av ${kapacitetsmal.length} kapacitetsmål nådde sin målveckas timmar`, grund })
  }

  if (godkanda.length > 0) {
    const bast = bestUtfordAgent(godkanda)
    if (bast) {
      const namn = bast.agentKey.charAt(0).toUpperCase() + bast.agentKey.slice(1)
      rows.push({
        text: `${namn} stod för flest utförda steg i ${godkanda.length} avslutade uppdrag`,
        grund: `${godkanda.length} avslutade uppdrag`,
      })
    }
  }

  return { rows, forTidigt: rows.length === 0, antalEligible }
}
