/**
 * Margin Guardian (2026-08-12) — bygger lönsamhetsvarningen ur den kanoniska
 * ekonomimotorn (compute-economics.ts) i stället för de gamla `project.actual_*`
 * -snapshotkolumnerna.
 *
 * Ärlighetsprincip: varna bara på det vi VET. `kostnader.arbete_kr` kan vara
 * `null` (intern timkostnad ej konfigurerad) — då räknar vi ändå med golvet
 * (material + extra), vilket gör varningen KONSERVATIV, aldrig fabricerad.
 *
 * Ren funktion — inget I/O. Facit: tests/margin-guardian.spec.ts.
 */

import type { ProjectEconomics } from './compute-economics'

export interface GuardianOrsak {
  text: string
  kind: 'KÄNT' | 'UPPSKATTAT'
  amount_kr?: number
  /** Kortet raden syftar på — sätts bara på ÄTA-väntar-raden, för deeplink. */
  approval_id?: string
}

export interface GuardianProjekt {
  project_id: string
  name: string
  budget_hours: number
}

/** Ålder på äldsta obesvarade ÄTA-förslags-kort för projektet, i dagar. */
export interface GuardianAtaSignal {
  aldsta_dagar: number | null
  /** Kortets id — så orsaksraden kan länka direkt till det. */
  approval_id?: string | null
}

export interface LonsamhetsVarning {
  status: 'at_risk' | 'over_budget'
  cost_percent: number
  margin_percent: number | null
  projected_overrun: number
  orsaker: GuardianOrsak[]
  /**
   * Finns osäkrad ÄTA-intäkt (skickad men osignerad, eller ett förslag som
   * väntat på svar) som skulle kunna täcka överskridningen? Styr om ytan får
   * föreslå "Skapa ÄTA" — ett rent kostnadsöverdrag utan ÄTA-underlag (t.ex.
   * ineffektivt arbete) har inget att fakturera för, och ett sådant kort ska
   * INTE peka mot ÄTA-fliken.
   */
  ata_signal: boolean
}

function formatKr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`
}

function formatTimmar(h: number): string {
  return (Math.round(h * 10) / 10).toLocaleString('sv-SE')
}

export function byggLonsamhetsVarning(
  economics: ProjectEconomics,
  projekt: GuardianProjekt,
  ataSignal: GuardianAtaSignal,
): LonsamhetsVarning | null {
  const { intakter, kostnader, marginal } = economics

  const bas = intakter.budget_amount + intakter.ata_signerat_kr
  if (bas <= 0) return null

  // GOLV: när arbete_kr är null (intern timkostnad ej konfigurerad) räknas
  // den bort helt — verklig kostnad är bara högre, aldrig lägre. Det gör
  // varningen konservativ i stället för fabricerad.
  const kandKostnad = (kostnader.arbete_kr ?? 0) + kostnader.material_inkop_kr + kostnader.extra_kr
  const costPercent = Math.round((kandKostnad / bas) * 100)

  let status: 'at_risk' | 'over_budget'
  if (costPercent > 95) status = 'over_budget'
  else if (costPercent > 75) status = 'at_risk'
  else return null

  // Prognos kräver minst 10% timförbrukning mot budget — under det är
  // extrapoleringen för brusig för att visa som en siffra.
  let projectedOverrun = 0
  if (projekt.budget_hours > 0 && kostnader.arbete_timmar / projekt.budget_hours > 0.10) {
    const framdrift = Math.min(kostnader.arbete_timmar / projekt.budget_hours, 1)
    const projicerad = kandKostnad / framdrift
    projectedOverrun = Math.max(0, Math.round(projicerad - bas))
  }

  const orsaker: GuardianOrsak[] = []

  if (projekt.budget_hours > 0 && kostnader.arbete_timmar > 0) {
    orsaker.push({
      text: `Arbete: ${formatTimmar(kostnader.arbete_timmar)} h av ${formatTimmar(projekt.budget_hours)} h budgeterade`,
      kind: 'KÄNT',
    })
  }
  if (kostnader.arbete_kr === null && kostnader.arbete_timmar > 0) {
    orsaker.push({
      text: 'Intern timkostnad ej konfigurerad — arbetskostnaden ingår inte i siffran',
      kind: 'KÄNT',
    })
  }
  if (kostnader.material_inkop_kr > 0) {
    orsaker.push({
      text: `Materialinköp: ${formatKr(kostnader.material_inkop_kr)}`,
      kind: 'KÄNT',
      amount_kr: kostnader.material_inkop_kr,
    })
  }
  if (kostnader.extra_kr > 0) {
    orsaker.push({
      text: `Övriga kostnader: ${formatKr(kostnader.extra_kr)}`,
      kind: 'KÄNT',
      amount_kr: kostnader.extra_kr,
    })
  }
  if (intakter.ata_pending_kr > 0) {
    orsaker.push({
      text: `Skickad men osignerad ÄTA: ${formatKr(intakter.ata_pending_kr)} — intäkt som inte är säkrad`,
      kind: 'KÄNT',
      amount_kr: intakter.ata_pending_kr,
    })
  }
  if (ataSignal.aldsta_dagar != null && ataSignal.aldsta_dagar >= 5) {
    orsaker.push({
      text: `Ett ÄTA-förslag har väntat ${ataSignal.aldsta_dagar} dagar utan svar`,
      kind: 'KÄNT',
      ...(ataSignal.approval_id ? { approval_id: ataSignal.approval_id } : {}),
    })
  }
  if (projectedOverrun > 0) {
    orsaker.push({
      text: `Prognos: ~${formatKr(projectedOverrun)} över kalkylen om takten håller i sig`,
      kind: 'UPPSKATTAT',
      amount_kr: projectedOverrun,
    })
  }

  return {
    status,
    cost_percent: costPercent,
    margin_percent: marginal.marginal_pct,
    projected_overrun: projectedOverrun,
    orsaker,
    ata_signal: intakter.ata_pending_kr > 0 || ataSignal.aldsta_dagar != null,
  }
}
