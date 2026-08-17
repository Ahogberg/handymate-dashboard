/**
 * Fakturaberedskap (Etapp D1b, design-integrationsplanen 2026-08-17).
 *
 * Ren aggregatfunktion över data projektsidan REDAN har i state — inga
 * nya API-anrop, ingen DB. Svarar på mockupens fråga "Redo att fakturera?"
 * med den ärliga versionen av underlaget vi faktiskt har:
 *
 *   tidrapport    Fanns tidrapport för gårdagens avslutade bokningar?
 *                 (binär — sidans yesterdayTimeGap-uppslag; vi VET inte
 *                 hur många tidrapporter som "borde" finnas totalt, så
 *                 mockupens "5 av 6" går inte att räkna ärligt)
 *   delmoment     Klara delmoment X av Y (milestones.status === 'completed')
 *   egenkontroll  Avbockade punkter X av Y över pågående + klara
 *                 checklistor (items[].checked)
 *   underlag      Finns något ofakturerat att ta betalt för? (binär,
 *                 summary.uninvoiced_revenue — null utan see_financials,
 *                 delen utesluts då)
 *
 * VIKTNING (låst av tests/fakturaberedskap.spec.ts):
 *   - Lika vikt per TILLGÄNGLIG del: pct = medel av done/total, avrundat.
 *   - Delar utan underlag (null-uppslag, inga delmoment, inga checklist-
 *     punkter, ingen behörighet) UTESLUTS ur nämnaren — de räknas aldrig
 *     som klara. OBS: checklistor hämtas först när Dokumentation-gruppen
 *     öppnas; tills dess deltar egenkontroll-delen inte (hellre en ärlig
 *     delmängd än ett hittat värde — inga nya fetches per bindande regel).
 *   - Inga delar alls → null. UI:t visar då "Underlag saknas" — aldrig
 *     en fejkad 100 %.
 *   - varsta_blocker = delen med lägst andel klar (< 100 %), formulerad
 *     i klarspråk; vid lika vinner den som kommer först i delordningen
 *     (tidrapport → delmoment → egenkontroll → underlag).
 */

export interface FakturaberedskapDel {
  key: 'tidrapport' | 'delmoment' | 'egenkontroll' | 'underlag'
  label: string
  done: number
  total: number
}

export interface FakturaberedskapInput {
  /** Sidans yesterdayTimeGap — null när uppslaget inte kunnat göras. */
  tidrapportGap: { missing: boolean } | null
  milestones: Array<{ status: string }>
  /** Projektets checklistor med items[] — [] tills Dokumentation öppnats. */
  checklists: Array<{ status: string; items?: Array<{ checked: boolean }> }>
  /** summary.uninvoiced_revenue — null utan see_financials eller innan laddning. */
  uninvoicedKr: number | null
}

export interface Fakturaberedskap {
  /** 0–100, medel av tillgängliga delars andel klar. */
  pct: number
  delar: FakturaberedskapDel[]
  varsta_blocker: string | null
}

function blockerText(del: FakturaberedskapDel): string {
  const kvar = del.total - del.done
  switch (del.key) {
    case 'tidrapport':
      return '1 tidrapport saknas'
    case 'delmoment':
      return `${kvar} delmoment kvar`
    case 'egenkontroll':
      return `${kvar} egenkontrollpunkt${kvar === 1 ? '' : 'er'} kvar`
    case 'underlag':
      return 'Inget ofakturerat underlag ännu'
  }
}

export function beraknaFakturaberedskap(input: FakturaberedskapInput): Fakturaberedskap | null {
  const delar: FakturaberedskapDel[] = []

  if (input.tidrapportGap != null) {
    delar.push({
      key: 'tidrapport',
      label: 'Tidrapport i går',
      done: input.tidrapportGap.missing ? 0 : 1,
      total: 1,
    })
  }

  if (input.milestones.length > 0) {
    delar.push({
      key: 'delmoment',
      label: 'Delmoment klara',
      done: input.milestones.filter(m => m.status === 'completed').length,
      total: input.milestones.length,
    })
  }

  const aktiva = input.checklists.filter(
    cl => (cl.status === 'in_progress' || cl.status === 'completed') && (cl.items?.length ?? 0) > 0,
  )
  const punkterTotal = aktiva.reduce((s, cl) => s + (cl.items?.length ?? 0), 0)
  if (punkterTotal > 0) {
    delar.push({
      key: 'egenkontroll',
      label: 'Egenkontroll',
      done: aktiva.reduce((s, cl) => s + (cl.items ?? []).filter(i => i.checked).length, 0),
      total: punkterTotal,
    })
  }

  if (input.uninvoicedKr != null) {
    delar.push({
      key: 'underlag',
      label: 'Fakturerbart underlag',
      done: input.uninvoicedKr > 0 ? 1 : 0,
      total: 1,
    })
  }

  if (delar.length === 0) return null

  const pct = Math.round(
    (delar.reduce((s, d) => s + d.done / d.total, 0) / delar.length) * 100,
  )

  const varst = delar
    .filter(d => d.done < d.total)
    .reduce<FakturaberedskapDel | null>(
      (v, d) => (v == null || d.done / d.total < v.done / v.total ? d : v),
      null,
    )

  return { pct, delar, varsta_blocker: varst ? blockerText(varst) : null }
}
