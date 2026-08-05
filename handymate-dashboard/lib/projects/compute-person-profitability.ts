/**
 * Lönsamhet per person — R4-E (tasks/resurs-masterplan.md).
 *
 * Ren, I/O-fri beräkningskärna (samma designprincip som
 * lib/projects/compute-economics.ts): personmängden definieras av vilka
 * som har `business_user_id` satt på en fakturarad i projektet (ärvt från
 * time_entry.business_user_id när raden byggdes, se app/api/invoices/
 * from-time-entries/route.ts — "performed_by" i uppdragsspråket).
 * Rapporterade timmar hämtas separat per person för SAMMA projekt.
 *
 * Ärlighetsprincipen (samma som compute-economics.ts/EfterkalkylCard):
 * saknas en resolverbar intern timkostnad för en person (varken satt på
 * medlemmen eller business-default) rapporteras kostnad/marginal som
 * `null` för just den raden — vi gissar aldrig fram en kostnad.
 *
 * ENDAST owner/admin ska nå denna data — rollkontrollen görs server-side
 * i route-lagret (app/api/projects/[id]/profitability/per-person/route.ts),
 * INTE här. Denna funktion är ren beräkning utan behörighetslogik.
 */

export interface InvoiceItemForPersonProfitability {
  business_user_id: string | null
  total: number | null
}

export interface TimeEntryForPersonProfitability {
  business_user_id: string | null
  duration_minutes: number | null
}

export interface MemberForPersonProfitability {
  id: string
  name: string
  color: string | null
  internal_hourly_cost: number | null
}

export interface PersonProfitabilityRow {
  business_user_id: string
  name: string
  color: string | null
  fakturerat_kr: number
  timmar: number
  /** null om ingen resolverbar intern timkostnad finns för personen. */
  kostnad_kr: number | null
  /** null om kostnad_kr är null (ärlighetsprincipen — gissar aldrig). */
  marginal_kr: number | null
  kostnad_konfigurerad: boolean
}

/**
 * Avgör intern timkostnad för en person. Prioritet:
 * 1. Medlemmens egna internal_hourly_cost (om satt)
 * 2. Business default_internal_hourly_cost (om satt)
 * 3. null → kostnad ej konfigurerad för personen
 */
function resolveMemberCost(
  memberId: string,
  memberCostMap: Map<string, number | null>,
  defaultCost: number | null,
): number | null {
  const memberCost = memberCostMap.get(memberId)
  if (memberCost != null) return memberCost
  return defaultCost
}

/**
 * computePersonProfitability — sammanställer fakturerat/timmar/kostnad/
 * marginal per person för ETT projekt.
 *
 * Personmängden = alla distinkta business_user_id som förekommer på minst
 * en fakturarad (invoiceItems) i projektet. Personer som bara har
 * time_entry men ingen fakturarad ännu ingår INTE (medvetet — spegling av
 * "vem har fakturerat vad", inte en generell teamlista).
 */
export function computePersonProfitability(
  invoiceItems: InvoiceItemForPersonProfitability[],
  timeEntries: TimeEntryForPersonProfitability[],
  members: MemberForPersonProfitability[],
  defaultInternalHourlyCost: number | null,
): PersonProfitabilityRow[] {
  const memberById = new Map(members.map(m => [m.id, m]))
  const memberCostMap = new Map(members.map(m => [m.id, m.internal_hourly_cost]))

  // 1. Fakturerat per person — endast rader med business_user_id satt.
  const fakturerat = new Map<string, number>()
  for (const item of invoiceItems) {
    if (!item.business_user_id) continue
    const prev = fakturerat.get(item.business_user_id) || 0
    fakturerat.set(item.business_user_id, prev + Number(item.total || 0))
  }

  // 2. Timmar per person — alla time_entry-rader i projektet med
  //    business_user_id satt (oavsett om de redan fakturerats).
  const minutesByPerson = new Map<string, number>()
  for (const entry of timeEntries) {
    if (!entry.business_user_id) continue
    const prev = minutesByPerson.get(entry.business_user_id) || 0
    minutesByPerson.set(entry.business_user_id, prev + Number(entry.duration_minutes || 0))
  }

  const rows: PersonProfitabilityRow[] = []
  for (const [businessUserId, fakturaKr] of Array.from(fakturerat.entries())) {
    const member = memberById.get(businessUserId)
    const timmar = Math.round(((minutesByPerson.get(businessUserId) || 0) / 60) * 100) / 100

    const hourlyCost = resolveMemberCost(businessUserId, memberCostMap, defaultInternalHourlyCost)
    const kostnadKonfigurerad = hourlyCost != null
    const kostnadKr = kostnadKonfigurerad ? Math.round(timmar * (hourlyCost as number)) : null
    const marginalKr = kostnadKr != null ? Math.round(fakturaKr - kostnadKr) : null

    rows.push({
      business_user_id: businessUserId,
      name: member?.name || 'Okänd',
      color: member?.color ?? null,
      fakturerat_kr: Math.round(fakturaKr),
      timmar,
      kostnad_kr: kostnadKr,
      marginal_kr: marginalKr,
      kostnad_konfigurerad: kostnadKonfigurerad,
    })
  }

  rows.sort((a, b) => b.fakturerat_kr - a.fakturerat_kr || a.name.localeCompare(b.name, 'sv'))

  return rows
}
