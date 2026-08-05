/**
 * Ren bedömningskärna för drag-drop-/tilldelningsflödet i resurstavlan
 * (R2, tasks/resurs-masterplan.md, punkt 4). Återanvänder normalizeJobType
 * + resolveMemberSkills från lib/dispatch.ts — SAMMA sanningskälla som
 * suggestDispatch (specialties[] först, skills-JSONB fallback) — men gör
 * ingen I/O och skapar ingen approval. Ren funktion, facit-testbar i
 * tests/schedule-dispatch-assessment.spec.ts.
 *
 * Skiljer sig medvetet från suggestDispatch (lib/dispatch.ts):
 *  - suggestDispatch RANKAR alla aktiva medlemmar och skapar en approval
 *    för den bästa (används av auto-dispatch vid bokningsskapande).
 *  - assessDispatchCandidate bedömer EN specifik kandidat — den personen
 *    användaren redan dragit bokningen till (eller valt i mobil-sheeten).
 *    Resurstavlan låter användaren välja fritt; bedömningen VARNAR om
 *    kompetensen inte matchar eller det krockar, men BLOCKERAR aldrig
 *    (se tasks/resurs-masterplan.md, R2 punkt 4: "krock ... varnas
 *    TYDLIGT men blockerar inte").
 *
 * I/O-delen (hämta bokning/medlem/persondagen från Supabase) ligger i
 * app/api/schema/assign-preview/route.ts, som anropar denna funktion.
 */

import { normalizeJobType, resolveMemberSkills } from '@/lib/dispatch'
import { svDateStr } from '@/lib/dates'
import type { PersonDay, PersonDayShift } from './person-day'
import { computeFreeCapacity } from '@/lib/capacity/free-capacity'

export interface DispatchAssessment {
  jobSkills: string[]
  memberSkills: string[]
  matchedSkills: string[]
  /** true om minst en av jobSkills finns i memberSkills. */
  skillMatch: boolean
  /** true om medlemmen saknar specialties/skills helt (generalist). */
  isGeneralist: boolean
  /** Pass som tidsmässigt krockar med bokningens fönster denna dag. */
  conflictingShifts: PersonDayShift[]
  hasConflict: boolean
  /**
   * Fas 1 (kapacitets-primitiven): kandidatens lediga timmar bokningsdagen,
   * ur lib/capacity/free-capacity.ts (computeFreeCapacity) — "ledig 6 h den
   * dagen" i resurstavlans bedömning. Beräknad från SAMMA existingShifts
   * (+ isAbsent) anroparen redan har, inget extra DB-anrop härifrån.
   */
  freeHoursForDay: number
}

/** Halvöppet intervall — samma konvention som overlaps() i person-day.ts
 * (pass som bara nuddar varandra räknas inte som krock). */
function overlapsWindow(shift: PersonDayShift, startIso: string, endIso: string): boolean {
  const shiftStart = new Date(shift.start).getTime()
  const shiftEnd = new Date(shift.end).getTime()
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (![shiftStart, shiftEnd, start, end].every(Number.isFinite)) return false
  return shiftStart < end && start < shiftEnd
}

export function assessDispatchCandidate(params: {
  member: { skills: unknown; specialties?: unknown }
  /** Fritext att matcha mot job_types — normalt bokningens notes/titel. */
  jobText: string
  bookingStart: string
  bookingEnd: string
  /** Kandidatens befintliga pass samma dag (booking_id på den bokning som
   *  bedöms ska REDAN vara exkluderad av anroparen — se assign-preview-
   *  routen — så en omtilldelning till samma person inte krockar med sig
   *  själv). */
  existingShifts: PersonDayShift[]
  /** true om kandidatens dag är en frånvarodag (personDay.isAbsent) —
   *  ger freeHoursForDay: 0 oavsett existingShifts, samma regel som
   *  free-capacity-kärnan. Default false (okänt/inte skickat). */
  isAbsent?: boolean
}): DispatchAssessment {
  const jobSkills = normalizeJobType(params.jobText)
  const memberSkills = resolveMemberSkills(params.member)
  const matchedSkills = jobSkills.filter((js) => memberSkills.includes(js))
  const skillMatch = matchedSkills.length > 0
  const isGeneralist = memberSkills.length === 0

  const conflictingShifts = params.existingShifts.filter((s) => overlapsWindow(s, params.bookingStart, params.bookingEnd))

  // Fas 1 — ledig-timmar-för-dagen ur kärnan. Bygger en syntetisk PersonDay
  // av redan tillgänglig data (ingen ny hämtning) och kör den genom SAMMA
  // computeFreeCapacity som alla andra kanaler — inget eget uträkningssätt
  // här.
  const date = svDateStr(new Date(params.bookingStart))
  const syntheticPersonDay: PersonDay = {
    businessUserId: '__candidate__',
    date,
    shifts: params.existingShifts,
    isAbsent: params.isAbsent ?? false,
  }
  const freeCapacity = computeFreeCapacity([syntheticPersonDay], ['__candidate__'], { from: date, to: date })
  const freeHoursForDay = freeCapacity.people[0]?.days[0]?.freeHours ?? 0

  return {
    jobSkills,
    memberSkills,
    matchedSkills,
    skillMatch,
    isGeneralist,
    conflictingShifts,
    hasConflict: conflictingShifts.length > 0,
    freeHoursForDay,
  }
}
