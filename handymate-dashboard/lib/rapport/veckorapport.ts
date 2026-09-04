import type { WeeklyValue } from '@/lib/weekly-value'

/**
 * Veckorapporten som SMS (Pass C, del 1 —
 * docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 6 —
 * "en anställd som rapporterar"). Ren funktion: samma sanning som
 * lib/weekly-value.ts, ingen ny beräkning, bara en svensk mening av den.
 *
 * ═══ VARFÖR AGENT+ETIKETT, INTE BARA AGENT ═══
 *
 * confirmed_items har redan en `agent`, men den ensam räcker inte för att
 * ärligt säga "Karin bevakade N fakturor" — Karins kort (invoice_reminder)
 * KAN i teorin bara attribuera en invoice_paid-händelse (DIRECT_ONLY i
 * lib/value/recovered-revenue.ts), men att lita blint på det vore att gissa
 * en regel i en annan fil. Etiketten (`label`, satt av
 * getRecoveredRevenue: "Faktura … betald" / "Offert accepterad …") är den
 * FAKTISKA händelsetypen — filtret nedan är alltså agent OCH etikett,
 * "hellre missad än falsk" (samma regel som recovered-revenue.ts själv).
 *
 * Lisa har inget kort att bevaka — calls_captured räknar agent_runs direkt
 * (phone_call/incoming_sms), sant oavsett vem som skulle attribuerat en
 * krona.
 */

function karinFakturor(v: WeeklyValue): number {
  return v.confirmed_items.filter(i => i.agent === 'karin' && /^Faktura/.test(i.label)).length
}

function danielOfferter(v: WeeklyValue): number {
  return v.confirmed_items.filter(i => i.agent === 'daniel' && /^Offert/.test(i.label)).length
}

/**
 * Finns det något alls att säga? Route-nivån använder den här (plus
 * `vantandeKort`) för att avgöra om veckan ska skickas — tystnad är
 * ärligare än "inget hände" (planens egen regel).
 */
export function harVeckobevis(v: WeeklyValue): boolean {
  return karinFakturor(v) + danielOfferter(v) + v.calls_captured > 0
}

/**
 * Bygger SMS-texten. Bara sanna rader: en agent utan händelser nämns inte,
 * noll väntande kort ⇒ ingen "väntar"-mening, `confirmed_kr` 0 ⇒ ingen
 * kronsumma. Anropas bara när `harVeckobevis(v) || vantandeKort > 0` —
 * annars skickas inget SMS alls (se app/api/cron/veckorapport/route.ts).
 */
export function byggVeckorapportSms(v: WeeklyValue, vantandeKort: number): string {
  const karinAntal = karinFakturor(v)
  const danielAntal = danielOfferter(v)
  const lisaAntal = v.calls_captured

  const agentRader: string[] = []
  if (karinAntal > 0) {
    agentRader.push(`Karin bevakade ${karinAntal} ${karinAntal === 1 ? 'faktura' : 'fakturor'}`)
  }
  if (danielAntal > 0) {
    agentRader.push(`Daniel följde upp ${danielAntal} ${danielAntal === 1 ? 'offert' : 'offerter'}`)
  }
  if (lisaAntal > 0) {
    agentRader.push(`Lisa fångade ${lisaAntal} samtal`)
  }

  const meningar: string[] = []
  if (agentRader.length > 0) meningar.push(agentRader.join(', ') + '.')
  if (v.confirmed_kr > 0) meningar.push(`${v.confirmed_kr.toLocaleString('sv-SE')} kr bekräftat.`)
  if (vantandeKort > 0) {
    meningar.push(`${vantandeKort} förslag väntar på dig.`)
  }

  const kropp = meningar.length > 0 ? meningar.join(' ') : 'Ingen aktivitet den här veckan.'
  return `Din vecka med Handymate: ${kropp} /Matte`
}

/**
 * ISO 8601-veckonyckel ("2026-W36") för ett givet ögonblick — dedupe-
 * nyckeln i automation_activity.metadata.vecka. Samma standardalgoritm som
 * getISOWeek i lib/overtime.ts, fristående här (ingen anledning att en ren
 * datumfunktion ska importera lönemodulen) och utökad med isoåret, som
 * skiljer sig från kalenderåret runt årsskiftet.
 */
export function isoVeckaNyckel(datum: Date): string {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()))
  const dagNum = d.getUTCDay() || 7 // måndag=1 .. söndag=7
  d.setUTCDate(d.getUTCDate() + 4 - dagNum) // torsdagen i samma vecka avgör isoåret
  const arsStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const vecka = Math.ceil(((d.getTime() - arsStart.getTime()) / 86400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(vecka).padStart(2, '0')}`
}
