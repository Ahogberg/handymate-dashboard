/**
 * Måndagskortet V1 (Måndagsmötet, etapp 1 — 2026-08-13).
 *
 * ═══ VAD DET ÄR ═══
 *
 * En veckovis, REN INFORMATIONELL sammanfattning av teamets läge, en gång i
 * veckan (måndag) i godkännande-kön. Fyra sektioner, alla ur RIKTIGA frågor
 * mot databasen — ingen uppskattad eller påhittad siffra, och en rad med
 * antal 0 tas aldrig med (samma n>0-regel som components/tour/CompanyScan.tsx
 * `buildScanRows`, se den filens huvudkommentar för bakgrunden).
 *
 * Är alla fyra sektioner tomma skapas inget kort den veckan — tystnad är det
 * ärliga svaret för ett nytt/lugnt konto, inte ett tomt kort.
 *
 * ═══ DE FYRA SEKTIONERNA ═══
 *
 *   1. Resultat   — månadens Value Ledger (lib/value/ledger.ts), oförändrad.
 *                    OBS: ledgern är kalendermånads-fönstrad, inte 7 dagar —
 *                    den filen rörs inte, och V1 behöver inget veckofönster.
 *   2. Lärdomar   — nya project_lesson-rader sedan senaste måndagen.
 *   3. Risker     — öppna Guardian-varningar (profitability_warning, pending).
 *   4. Förtroende — förtjänad autonomi som faktiskt beviljats (bara nycklar
 *                    med status='autonomous' visas — det här är "här har
 *                    teamet förtjänat förtroende", inte en påminnelselista).
 *
 * ═══ PURE/IO-SPLITTEN (samma mönster som byggManadsLedger/getManadsLedger) ═══
 *
 * `byggMandagskort` är ren — ingen I/O, inget `new Date()`, allt kommer via
 * `input`. `genereraMandagskort` gör hämtningen och kör den rena funktionen.
 * Facit: tests/mandagskort.spec.ts.
 *
 * ═══ MÅNDAGEN, ÅTERANVÄND ═══
 *
 * "Senaste måndagen" (svensk lokaltid, DST-säker) finns redan som
 * `currentWeekMonday()` i lib/capacity/week-capacity.ts — återanvänd
 * oförändrad i stället för en egen implementation. Samma modul avgör också
 * "är det måndag idag?" (cron-vakten i app/api/cron/morning-brief/route.ts):
 * `svDateStr() === currentWeekMonday()`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svStartOfDay } from '@/lib/dates'
import { currentWeekMonday } from '@/lib/capacity/week-capacity'
import { getManadsLedger, type ManadsLedgerSteg } from '@/lib/value/ledger'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import {
  isAutonomous,
  computeStreak,
  getAutonomyCap,
  AUTONOMY_META,
  DEFAULT_AUTONOMY_CAPS,
  type AutonomyKey,
} from '@/lib/autonomy/earned-autonomy'

// ── Typer ────────────────────────────────────────────────────────────────

/** Samma form som ManadsLedger — bara de fyra stegen, inte hela typen (så
 *  den rena funktionen inte behöver dra in lib/value/ledger.ts's fulla API). */
export interface ManadsLedgerLike {
  identifierat: ManadsLedgerSteg
  agerat: ManadsLedgerSteg
  fakturerat: ManadsLedgerSteg
  betalt: ManadsLedgerSteg
}

export interface MandagskortResultatRad {
  key: 'identifierat' | 'agerat' | 'fakturerat' | 'betalt'
  kr: number
  antal: number
}

export interface MandagskortLardomar {
  antal: number
}

export interface MandagskortRiskRad {
  project_id: string
  project_name: string
  /** null = kortet saknade fältet (gammalt/oväntat format) — visas utan procent, gissas aldrig. */
  cost_percent: number | null
  /** 'at_risk' | 'over_budget' (byggLonsamhetsVarning) — null om okänt. */
  status: string | null
}

export interface MandagskortFortroendeInput {
  key: AutonomyKey
  autonomous: boolean
  streak: number
  cap_kr: number | null
}

export interface MandagskortFortroendeRad {
  key: AutonomyKey
  label: string
  agent: string
  agentName: string
  streak: number
  cap_kr: number | null
}

export interface Mandagskort {
  id: string
  business_id: string
  /** 'ÅÅÅÅ-MM-DD' — måndagen kortet gäller, svensk lokaltid. */
  monday: string
  iso_year: number
  iso_week: number
  resultat: MandagskortResultatRad[] | null
  lardomar: MandagskortLardomar | null
  risker: MandagskortRiskRad[] | null
  fortroende: MandagskortFortroendeRad[] | null
}

// ── Datum: ISO-vecka ur en given måndags-datumsträng ───────────────────────

/**
 * ISO 8601-veckonummer + isoår för en given måndag ('ÅÅÅÅ-MM-DD').
 *
 * Standardalgoritmen (torsdagen i samma vecka avgör isoåret; jan 4:e ligger
 * alltid i vecka 1). Ren kalenderaritmetik i UTC — ingen tidszon-tolkning
 * behövs eftersom indata redan är en kalenderdag-sträng (samma anchor-princip
 * som safeAnchor i lib/capacity/week-capacity.ts).
 */
export function isoWeekInfo(mondayDateStr: string): { isoYear: number; isoWeek: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mondayDateStr)
  if (!m) throw new Error(`isoWeekInfo: ogiltigt datum "${mondayDateStr}"`)
  const [, y, mo, d] = m
  const monday = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  const thursday = new Date(monday.getTime() + 3 * 86400_000) // torsdagen i samma vecka
  const isoYear = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7 // måndag=0 .. söndag=6
  const firstThursday = new Date(jan4.getTime() + (3 - jan4DayNum) * 86400_000)
  const isoWeek = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400_000))
  return { isoYear, isoWeek }
}

/** Deterministisk primärnyckel — dedupe sker via unik-constraint-insert, se genereraMandagskort. */
export function mandagskortId(businessId: string, mondayDateStr: string): string {
  const { isoYear, isoWeek } = isoWeekInfo(mondayDateStr)
  return `mbrief_${businessId}_${isoYear}-W${String(isoWeek).padStart(2, '0')}`
}

// ── Rena rad-byggare (n>0-regeln + validering, testbara utan DB) ──────────

export interface RawApprovalPayloadRow {
  payload: Record<string, unknown> | null
}

/**
 * Guardian-varningarna → risk-rader. Ett kort utan project_id/project_name
 * (oväntat format) hoppas tyst över — gissas aldrig fram.
 */
export function mapRiskWarnings(rows: RawApprovalPayloadRow[]): MandagskortRiskRad[] {
  const out: MandagskortRiskRad[] = []
  for (const r of rows) {
    const p = (r.payload || {}) as Record<string, unknown>
    const projectId = typeof p.project_id === 'string' ? p.project_id : null
    const projectName = typeof p.project_name === 'string' ? p.project_name : null
    if (!projectId || !projectName) continue
    out.push({
      project_id: projectId,
      project_name: projectName,
      cost_percent: typeof p.cost_percent === 'number' ? p.cost_percent : null,
      status: typeof p.status === 'string' ? p.status : null,
    })
  }
  return out
}

/**
 * Förtroende-raderna: BARA nycklar som faktiskt är autonoma tas med — en
 * nyckel kvar i manuellt/observationsläge utelämnas helt (det här är "här
 * har teamet förtjänat förtroende", inte en påminnelselista om vad som
 * saknas). Etikett/agent hämtas ur AUTONOMY_META, aldrig hårdkodat här.
 */
export function byggFortroendeRader(rows: MandagskortFortroendeInput[]): MandagskortFortroendeRad[] {
  return rows
    .filter(r => r.autonomous)
    .map(r => {
      const meta = AUTONOMY_META[r.key]
      return { key: r.key, label: meta.label, agent: meta.agent, agentName: meta.agentName, streak: r.streak, cap_kr: r.cap_kr }
    })
}

// ── Den rena härledningen ──────────────────────────────────────────────────

/**
 * Ren. Ingen I/O, inget datum-nu — allt kommer via `input`. Returnerar null
 * om alla fyra sektioner blir tomma (inget att rapportera den veckan).
 */
export function byggMandagskort(input: {
  businessId: string
  monday: string
  ledger: ManadsLedgerLike | null
  lessonsCount: number
  riskWarnings: MandagskortRiskRad[]
  fortroendeInput: MandagskortFortroendeInput[]
}): Mandagskort | null {
  const resultatRader: MandagskortResultatRad[] = []
  if (input.ledger) {
    const steg: Array<[MandagskortResultatRad['key'], ManadsLedgerSteg]> = [
      ['identifierat', input.ledger.identifierat],
      ['agerat', input.ledger.agerat],
      ['fakturerat', input.ledger.fakturerat],
      ['betalt', input.ledger.betalt],
    ]
    for (const [key, s] of steg) {
      if (s.antal > 0) resultatRader.push({ key, kr: s.kr, antal: s.antal })
    }
  }

  const lardomar: MandagskortLardomar | null = input.lessonsCount > 0 ? { antal: input.lessonsCount } : null
  const risker = input.riskWarnings.length > 0 ? input.riskWarnings : null
  const fortroendeRader = byggFortroendeRader(input.fortroendeInput)

  const resultat = resultatRader.length > 0 ? resultatRader : null
  const fortroende = fortroendeRader.length > 0 ? fortroendeRader : null

  if (!resultat && !lardomar && !risker && !fortroende) return null

  const { isoYear, isoWeek } = isoWeekInfo(input.monday)
  return {
    id: mandagskortId(input.businessId, input.monday),
    business_id: input.businessId,
    monday: input.monday,
    iso_year: isoYear,
    iso_week: isoWeek,
    resultat,
    lardomar,
    risker,
    fortroende,
  }
}

// ── Beskrivningsraden (kortets description) ────────────────────────────────

/** Svensk, teknikfri sammanfattning — samma stil som monthly_review-kortets beskrivning. */
export function mandagskortBeskrivning(kort: Mandagskort): string {
  const delar: string[] = []
  if (kort.resultat) delar.push('resultatet den här månaden')
  if (kort.lardomar) delar.push(`${kort.lardomar.antal} ny${kort.lardomar.antal === 1 ? '' : 'a'} lärdom${kort.lardomar.antal === 1 ? '' : 'ar'}`)
  if (kort.risker) delar.push(`${kort.risker.length} projekt att hålla koll på`)
  if (kort.fortroende) delar.push(`${kort.fortroende.length} sak${kort.fortroende.length === 1 ? '' : 'er'} teamet sköter själv`)
  return `Veckans sammanfattning: ${delar.join(', ')}.`
}

// ── I/O: hämtningen ──────────────────────────────────────────────────────

/**
 * Hämtar allt Måndagskortet behöver och kör den rena härledningen.
 * Kastar vid DB-fel — anroparen (cron) fångar per företag, se
 * app/api/cron/morning-brief/route.ts.
 */
export async function genereraMandagskort(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Mandagskort | null> {
  const monday = currentWeekMonday()
  const period = monday.slice(0, 7) // 'ÅÅÅÅ-MM' — manadsfonster (lib/value/vardekvitto.ts)

  // 1) Resultat — EXISTERANDE ledger, orörd. Kalendermånads-fönstrad med
  //    flit (se filhuvudet) — inget nytt 7-dagarsfönster uppfinns här.
  const ledger = await getManadsLedger(supabase, businessId, period)

  // 2) Lärdomar — project_lesson sedan senaste måndagen 00:00 (svensk lokaltid).
  const mondayStartIso = svStartOfDay(new Date(`${monday}T12:00:00Z`)).toISOString()
  const { count: lessonsCount, error: lessonErr } = await supabase
    .from('project_lesson')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', mondayStartIso)
  if (lessonErr) throw new Error(`project_lesson-uppslag misslyckades: ${lessonErr.message}`)

  // 3) Risker — öppna Guardian-varningar, direkt mot pending_approvals (samma
  //    inline-stil som checkProfitabilityWarnings i lib/profitability.ts —
  //    ingen egen helper finns för läsvägen).
  const { data: riskRows, error: riskErr } = await supabase
    .from('pending_approvals')
    .select('payload')
    .eq('business_id', businessId)
    .eq('approval_type', 'profitability_warning')
    .eq('status', 'pending')
  if (riskErr) throw new Error(`pending_approvals (profitability_warning)-uppslag misslyckades: ${riskErr.message}`)
  const riskWarnings = mapRiskWarnings((riskRows || []) as RawApprovalPayloadRow[])

  // 4) Förtroende — bara nycklarna med en beloppsgräns (DEFAULT_AUTONOMY_CAPS)
  //    prövas, exakt som specen pekar ut. Streak/cap slås bara upp om nyckeln
  //    verkligen är autonom — ingen anledning att räkna streak för en nyckel
  //    som inte visas ändå.
  const autonomyKeys = Object.keys(DEFAULT_AUTONOMY_CAPS) as AutonomyKey[]
  const fortroendeInput: MandagskortFortroendeInput[] = []
  for (const key of autonomyKeys) {
    const autonomous = await isAutonomous(supabase, businessId, key)
    if (!autonomous) {
      fortroendeInput.push({ key, autonomous: false, streak: 0, cap_kr: null })
      continue
    }
    const [streak, capKr] = await Promise.all([
      computeStreak(supabase, businessId, key),
      getAutonomyCap(supabase, businessId, key),
    ])
    fortroendeInput.push({ key, autonomous: true, streak, cap_kr: capKr })
  }

  return byggMandagskort({
    businessId,
    monday,
    ledger,
    lessonsCount: lessonsCount || 0,
    riskWarnings,
    fortroendeInput,
  })
}

// ── I/O: insert (dedupe via PK-krock, se filhuvudet) ────────────────────────

/**
 * Infogar kortet som `pending_approvals`. Deterministisk id
 * (`mbrief_{businessId}_{isoÅr}-W{isoVecka}`) gör dubbel-infogning för samma
 * företag+vecka ofarlig — unik-constraint-krocken (23505) fångas här och
 * rapporteras som 'duplicate', inte som ett fel.
 */
export async function insertMandagskort(
  supabase: SupabaseClient,
  kort: Mandagskort,
): Promise<'inserted' | 'duplicate'> {
  const { error } = await supabase.from('pending_approvals').insert({
    id: kort.id,
    business_id: kort.business_id,
    approval_type: 'monday_brief',
    title: `Måndagskortet — vecka ${kort.iso_week}`,
    description: mandagskortBeskrivning(kort),
    payload: {
      agent_id: 'matte',
      monday: kort.monday,
      iso_year: kort.iso_year,
      iso_week: kort.iso_week,
      resultat: kort.resultat,
      lardomar: kort.lardomar,
      risker: kort.risker,
      fortroende: kort.fortroende,
    },
    status: 'pending',
    risk_level: 'low',
  })
  if (error) {
    if (error.code === '23505') return 'duplicate' // samma företag+vecka — förväntat, inte ett fel
    throw new Error(`pending_approvals insert (monday_brief) misslyckades: ${error.message}`)
  }

  // Fire-and-forget, samma mönster som saveAndPush (lib/agents/shared/
  // save-and-push.ts) — en push-miss får aldrig fälla kort-skapandet, som
  // redan lyckades ovan. Bara på 'inserted', aldrig på 'duplicate'.
  void sendApprovalPush({
    business_id: kort.business_id,
    approval_type: 'monday_brief',
    payload: {},
  })

  return 'inserted'
}
