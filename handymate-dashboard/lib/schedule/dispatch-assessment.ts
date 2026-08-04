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
import type { PersonDayShift } from './person-day'

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
}): DispatchAssessment {
  const jobSkills = normalizeJobType(params.jobText)
  const memberSkills = resolveMemberSkills(params.member)
  const matchedSkills = jobSkills.filter((js) => memberSkills.includes(js))
  const skillMatch = matchedSkills.length > 0
  const isGeneralist = memberSkills.length === 0

  const conflictingShifts = params.existingShifts.filter((s) => overlapsWindow(s, params.bookingStart, params.bookingEnd))

  return {
    jobSkills,
    memberSkills,
    matchedSkills,
    skillMatch,
    isGeneralist,
    conflictingShifts,
    hasConflict: conflictingShifts.length > 0,
  }
}
