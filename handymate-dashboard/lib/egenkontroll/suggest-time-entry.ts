/**
 * Egenkontroll-agenten — Etapp 2a (v-plan tasks/easoft-gap-plan.md,
 * "Tidrapport-förslag", omskriven 2026-08-02 till PROJEKTNIVÅ efter
 * schemaverifiering; utökad 2026-08-02 med namn-vid-entydig-tilldelning).
 *
 * ⚠ VARFÖR PROJEKTNIVÅ, INTE PERSONNIVÅ: `booking` har inget
 * person-tilldelningsfält — en bokning hör till business+kund+ev. projekt,
 * aldrig till en namngiven anställd. Förslaget attribueras därför till
 * PROJEKTET ("Projektet Svensson hade en bokning i går men ingen
 * tidrapport än"), aldrig till en person, ANNARS UPPSTÅR EN GISSNING.
 *
 * ⚠ NYANS (2a-förfining): `project_assignment` (sql/business_users.sql)
 * kopplar business_user_id ↔ project_id med en riktig, existerande
 * tilldelning — inte en gissning. Om ETT projekt har EXAKT EN tilldelad
 * person där, är namnet ett FAKTUM och får läggas till (payload.
 * assigned_person_name + i titeln). Har projektet 0 eller 2+ tilldelade
 * personer sätts fältet ALDRIG — inget gissat namn, ingen lista av namn,
 * ingen "en av två personer"-formulering. Se pickUnambiguousAssignee/
 * fetchUnambiguousAssigneeName nedan, som är den enda källan till detta
 * namn i hela flödet (server- OCH klientsidan, se app/dashboard/projects/
 * [id]/page.tsx som återanvänder samma helper för projektvyns rad).
 *
 * Schema, verifierat mot faktisk kod (inte antaget):
 *  - `booking.status` (pending/confirmed/cancelled, se t.ex.
 *    app/api/agent/trigger/tool-router.ts createBooking) är BOKNINGENS
 *    livscykel — bekräftad eller ej. Säger INGET om arbetet faktiskt
 *    utfördes.
 *  - `booking.job_status` (scheduled [default/NULL] → in_progress →
 *    completed, satt av app/api/booking/start-job och
 *    .../complete-job/route.ts) är EXEKVERINGS-statusen. Det är den som
 *    avgör "genomförd" här — en bokning är genomförd (och borde alltså ha
 *    en tidrapport) när job_status === 'completed'. De två fälten
 *    motsäger INTE varandra (som ett första intryck av spretande kod på
 *    olika ställen i repot kan ge) — de är helt enkelt två olika
 *    dimensioner av samma rad.
 *  - `booking.project_id` kan vara NULL (kundbesök utan kopplat projekt,
 *    t.ex. första säljbesöket innan ett projekt skapats — se
 *    app/api/agent/trigger/tool-router.ts createBooking som INTE sätter
 *    project_id vid insert, det kopplas på senare av
 *    lib/projects/maybe-create-from-booking.ts). Bokningar utan
 *    project_id hoppas alltid över — inget projekt att koppla förslaget
 *    till.
 *  - `time_entry.project_id` + `time_entry.work_date` (DATE, 'YYYY-MM-DD')
 *    är vad som avgör om ett projekt redan "har rapporterat tid" en viss
 *    dag (samma par som checkin/approve och voice/execute redan skriver
 *    till).
 *
 * Ren kärna (findProjectsMissingTimeEntry) + fail-safe orkestrering
 * (suggestTimeEntriesForBusiness) — samma mönster som
 * lib/egenkontroll/analyze-and-queue.ts (etapp 1b) och
 * lib/egenkontroll/suggest-checklist.ts (etapp 1d).
 *
 * JURIDIK/AUTONOMI (hård regel från planen): ett tidsförslag är löne-/
 * fakturaunderlag. Godkännande är ALLTID explicit — ingen "förtjänad
 * autonomi"-koppling någonstans i denna kod. Andra approval-cases i
 * app/api/approvals/[id]/route.ts har ingen sådan autonomi-genväg-
 * mekanism att undvika (ingen hittad vid granskning) — regeln är alltså
 * redan uppfylld strukturellt, men dokumenteras här ändå eftersom planen
 * explicit kräver att den skrivs in.
 *
 * FAIL-SAFE (kritiskt, samma löfte som analyzeProjectPhoto/
 * suggestChecklistForProject): suggestTimeEntriesForBusiness() kastar
 * ALDRIG mot anroparen — hela kroppen ligger i ett try/catch som bara
 * console.error:ar. Anropas per business i en loop från
 * app/api/cron/tidrapport-forslag/route.ts — en trasig business får
 * aldrig stoppa cron-svepet för resten.
 */

import { getServerSupabase } from '@/lib/supabase'
import { svDateStr, svDateStrPlusDays, svStartOfDay, svTimeStr } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────
// Typer
// ─────────────────────────────────────────────────────────────────

/** Delmängd av booking-kolumner som matchningskärnan behöver. */
export interface BookingForTimeMatch {
  booking_id: string
  project_id: string | null
  job_status: string | null
  scheduled_start: string
  scheduled_end: string | null
}

/** Delmängd av time_entry-kolumner som matchningskärnan behöver. */
export interface TimeEntryForTimeMatch {
  project_id: string | null
}

export interface MissingTimeEntryProject {
  project_id: string
  booking_date: string
  /** Tidigaste scheduled_start bland dagens genomförda bokningar för projektet. */
  scheduled_start: string
  /** Senaste scheduled_end bland dagens genomförda bokningar för projektet. */
  scheduled_end: string
  /** Summan av (scheduled_end - scheduled_start) i minuter över alla
      genomförda bokningar för projektet den dagen — inte bara spannet
      tidigaste start→senaste slut, som skulle räkna in eventuella luckor
      mellan flera besök samma dag. */
  suggested_minutes: number
}

/** Den enda job_status som räknas som "genomförd" — se filhuvudet. */
const COMPLETED_JOB_STATUS = 'completed'

// ─────────────────────────────────────────────────────────────────
// findProjectsMissingTimeEntry — ren, facit-testbar kärna
// ─────────────────────────────────────────────────────────────────

/**
 * Går igenom en dags bokningar och avgör vilka DISTINKTA projekt som
 * saknar en matchande time_entry-rad för samma dag. Ren funktion — ingen
 * I/O, inget Supabase.
 *
 * Regler:
 *  - Bokning utan project_id → hoppas över (inget projekt att koppla
 *    förslaget till).
 *  - Bokning vars job_status !== 'completed' → hoppas över (inte
 *    genomförd, inget att rapportera tid för än).
 *  - Projekt som redan har minst en time_entry i timeEntries-listan
 *    (anroparen ansvarar för att bara skicka in rader för rätt dag) →
 *    hoppas över.
 *  - Flera genomförda bokningar för samma projekt samma dag → EN post i
 *    resultatet, med scheduled_start/scheduled_end vidgat till hela
 *    spannet och suggested_minutes summerat över alla bokningarna.
 */
export function findProjectsMissingTimeEntry(
  bookings: BookingForTimeMatch[],
  timeEntries: TimeEntryForTimeMatch[],
  referenceDate: string,
): MissingTimeEntryProject[] {
  const projectsWithTimeEntry = new Set(
    timeEntries.map(te => te.project_id).filter((id): id is string => !!id),
  )

  const byProject = new Map<string, MissingTimeEntryProject>()

  for (const b of bookings) {
    if (!b.project_id) continue
    if (b.job_status !== COMPLETED_JOB_STATUS) continue
    if (projectsWithTimeEntry.has(b.project_id)) continue

    const end = b.scheduled_end || b.scheduled_start
    const minutes = minutesBetween(b.scheduled_start, end)

    const existing = byProject.get(b.project_id)
    if (!existing) {
      byProject.set(b.project_id, {
        project_id: b.project_id,
        booking_date: referenceDate,
        scheduled_start: b.scheduled_start,
        scheduled_end: end,
        suggested_minutes: minutes,
      })
      continue
    }

    if (new Date(b.scheduled_start).getTime() < new Date(existing.scheduled_start).getTime()) {
      existing.scheduled_start = b.scheduled_start
    }
    if (new Date(end).getTime() > new Date(existing.scheduled_end).getTime()) {
      existing.scheduled_end = end
    }
    existing.suggested_minutes += minutes
  }

  return Array.from(byProject.values())
}

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 60000)
}

// ─────────────────────────────────────────────────────────────────
// pickUnambiguousAssignee — ren, facit-testbar namn-kärna (2a-förfining)
// ─────────────────────────────────────────────────────────────────

/** Delmängd av business_users-kolumner (via project_assignment-join) som
    namnvalet behöver — se sql/business_users.sql, kolumnen heter `name`. */
export interface AssigneeNameRow {
  name: string | null
}

/**
 * Väljer ett projekts entydiga tilldelade person, om en sådan finns. Ren
 * funktion — ingen I/O, inget Supabase.
 *
 * Ärlighetsregel: EXAKT EN rad → det namnet (ett faktum, inte en gissning
 * — se filhuvudet). 0 rader ELLER 2+ rader → null. Aldrig en lista, aldrig
 * "en av två" — bara ett sant namn eller inget alls. Tom/null `name` på
 * den enda raden räknas också som "inget namn" (kan inte påstå ett namn
 * vi inte faktiskt har).
 */
export function pickUnambiguousAssignee(assignments: AssigneeNameRow[]): string | null {
  if (assignments.length !== 1) return null
  const name = assignments[0].name
  return name && name.trim().length > 0 ? name.trim() : null
}

/**
 * I/O-wrappern runt pickUnambiguousAssignee — slår upp project_assignment
 * för ETT projekt och returnerar namnet om tilldelningen är entydig.
 * Delad mellan suggestTimeEntriesForBusiness (nedan) och projektvyns
 * "Ingen tidrapport i går"-rad (app/dashboard/projects/[id]/page.tsx,
 * Etapp 2b) så namnlogiken aldrig behöver skrivas på två ställen.
 *
 * Kastar aldrig — ett DB-fel behandlas som "ingen entydig tilldelning"
 * (samma fail-safe-hållning som resten av filen), aldrig som ett gissat
 * namn.
 */
export async function fetchUnambiguousAssigneeName(
  supabase: ReturnType<typeof getServerSupabase> | any,
  businessId: string,
  projectId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('project_assignment')
      .select('business_user:business_user_id (name)')
      .eq('business_id', businessId)
      .eq('project_id', projectId)

    if (error || !data) return null
    return pickUnambiguousAssignee(
      (data as { business_user: { name: string | null } | null }[]).map(row => ({
        name: row.business_user?.name ?? null,
      })),
    )
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────
// suggestTimeEntriesForBusiness — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

/**
 * Hittar gårdagens (Europe/Stockholm-datum) genomförda projektbokningar
 * utan matchande time_entry, och skapar ETT pending_approvals-kort PER
 * SAKNAT PROJEKT. Fail-safe, anropas per business från cronen.
 *
 * Dedup: inget nytt kort om ett pending 'tidrapport_forslag'-kort redan
 * finns för samma project_id + booking_date.
 */
export async function suggestTimeEntriesForBusiness(businessId: string): Promise<void> {
  try {
    const supabase = getServerSupabase()

    // ── Gårdagens Stockholm-datum + UTC-intervall för scheduled_start ──
    // (samma svStartOfDay-metod som andra dagliga crons i repot, se
    // lib/dates.ts — robust över DST-gränser eftersom offsetet läses av
    // verklig Intl-formattering, aldrig antas som ett fast tal).
    const yesterday = svDateStrPlusDays(-1)
    const today = svDateStr()
    const rangeStart = svStartOfDay(new Date(`${yesterday}T12:00:00Z`))
    const rangeEnd = svStartOfDay(new Date(`${today}T12:00:00Z`))

    // ── 1. Gårdagens genomförda bokningar med projekt ─────────────
    const { data: bookings, error: bookingErr } = await supabase
      .from('booking')
      .select('booking_id, project_id, job_status, scheduled_start, scheduled_end')
      .eq('business_id', businessId)
      .eq('job_status', COMPLETED_JOB_STATUS)
      .not('project_id', 'is', null)
      .gte('scheduled_start', rangeStart.toISOString())
      .lt('scheduled_start', rangeEnd.toISOString())

    if (bookingErr) {
      console.error('[egenkontroll/suggest-time-entry] kunde inte hämta bokningar:', bookingErr)
      return
    }
    if (!bookings || bookings.length === 0) return // inga genomförda projektbokningar i går

    const projectIds = Array.from(
      new Set(bookings.map(b => b.project_id).filter((id): id is string => !!id)),
    )

    // ── 2. Gårdagens time_entry för samma projekt ──────────────────
    const { data: timeEntries, error: teErr } = await supabase
      .from('time_entry')
      .select('project_id')
      .eq('business_id', businessId)
      .eq('work_date', yesterday)
      .in('project_id', projectIds)

    if (teErr) {
      console.error('[egenkontroll/suggest-time-entry] kunde inte hämta tidrapporter:', teErr)
      return
    }

    // ── 3. Ren matchning ────────────────────────────────────────────
    const missing = findProjectsMissingTimeEntry(
      bookings as BookingForTimeMatch[],
      (timeEntries || []) as TimeEntryForTimeMatch[],
      yesterday,
    )
    if (missing.length === 0) return

    // ── 4. Projektnamn (för titel/payload — ärlighetsregeln: aldrig ett
    // personnamn, bara projektets) ──────────────────────────────────
    const { data: projects, error: projErr } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .in('project_id', missing.map(m => m.project_id))

    if (projErr) {
      console.error('[egenkontroll/suggest-time-entry] kunde inte hämta projektnamn:', projErr)
      return
    }
    const nameByProject = new Map<string, string>(
      (projects || []).map((p: { project_id: string; name: string | null }) => [
        p.project_id,
        p.name || 'Projektet',
      ]),
    )

    // ── 5. Ett kort per saknat projekt, dedupat ─────────────────────
    for (const m of missing) {
      const projectName = nameByProject.get(m.project_id) || 'Projektet'

      const { count, error: dedupErr } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('approval_type', 'tidrapport_forslag')
        .eq('status', 'pending')
        .contains('payload', { project_id: m.project_id, booking_date: m.booking_date })

      if (dedupErr) {
        console.error('[egenkontroll/suggest-time-entry] dedup-koll misslyckades:', dedupErr, {
          project_id: m.project_id,
        })
        continue // inte fatalt för resten av businessens projekt
      }
      if (count && count > 0) continue

      // ── 5b. Entydig tilldelning? (2a-förfining, se filhuvudet) ────
      // Ett FAKTUM från project_assignment, aldrig en gissning — utelämnas
      // helt (payload.assigned_person_name sätts inte) om 0 eller 2+
      // personer är tilldelade projektet.
      const assignedPersonName = await fetchUnambiguousAssigneeName(supabase, businessId, m.project_id)

      const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const timeSpan = `${svTimeStr(new Date(m.scheduled_start))}–${svTimeStr(new Date(m.scheduled_end))}`
      const title = assignedPersonName
        ? `Ingen tidrapport för ${projectName} i går (${assignedPersonName}) — förbered en?`
        : `Ingen tidrapport för ${projectName} i går — förbered en?`

      const { error: insertErr } = await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: businessId,
        approval_type: 'tidrapport_forslag',
        title,
        description: `Bokning ${timeSpan} i går, ingen tidrapport hittad än.`,
        status: 'pending',
        risk_level: 'low',
        payload: {
          routed_agent: 'lars',
          project_id: m.project_id,
          project_name: projectName,
          booking_date: m.booking_date,
          scheduled_start: m.scheduled_start,
          scheduled_end: m.scheduled_end,
          suggested_minutes: m.suggested_minutes,
          ...(assignedPersonName ? { assigned_person_name: assignedPersonName } : {}),
        },
      })

      if (insertErr) {
        console.error('[egenkontroll/suggest-time-entry] kunde inte skapa förslag:', insertErr, {
          project_id: m.project_id,
        })
      }
    }
  } catch (err) {
    // Fail-safe: cronen som loopar alla businesses får ALDRIG krascha för
    // att en enda business trasslar. Se filhuvudet.
    console.error(
      '[egenkontroll/suggest-time-entry] oväntat fel (sväljs, cronen får aldrig krascha):',
      err,
    )
  }
}
