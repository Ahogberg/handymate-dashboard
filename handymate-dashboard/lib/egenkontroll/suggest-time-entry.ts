/**
 * Egenkontroll-agenten — Etapp 2a (v-plan tasks/easoft-gap-plan.md,
 * "Tidrapport-förslag", omskriven 2026-08-02 till PROJEKTNIVÅ efter
 * schemaverifiering; utökad 2026-08-02 med namn-vid-entydig-tilldelning;
 * utökad 2026-08-04 (tasks/resurs-masterplan.md, R1-D) med PERSONNIVÅ när
 * bokningen har en tilldelning).
 *
 * ⚠ HISTORIK — VARFÖR DET STOD "PROJEKTNIVÅ, INTE PERSONNIVÅ" HÄR: när
 * denna fil först skrevs saknade `booking` ett person-tilldelningsfält.
 * Det antagandet är sedan Storfirman-Etapp 5 (multi-employee-parity-plan.md)
 * INAKTUELLT — `booking.assigned_user_id` (sql/v17_dispatch.sql) finns nu.
 * Grupperingen är FORTFARANDE per projekt+dag (ett kort per saknat projekt,
 * oförändrat dedup-beteende) — det som är nytt är NAMNET i kortet: har
 * dagens genomförda bokningar för projektet EN entydig assigned_user_id
 * (pickUnambiguousBookingAssignee nedan) är namnet ett FAKTUM direkt från
 * bokningen — ett STARKARE signal än project_assignment eftersom det säger
 * vem som faktiskt var på JUST DE HÄR besöken, inte bara vem som är
 * tilldelad projektet i stort. Den signalen provas FÖRST. Saknas den
 * (0 bokningar har en tilldelning, eller flera olika personer är
 * tilldelade olika besök samma dag → tvetydigt) faller vi tillbaka på den
 * gamla project_assignment-logiken. Har INGENDERA ett entydigt svar
 * attribueras förslaget till projektet, precis som innan.
 *
 * ⚠ NYANS (2a-förfining, project_assignment-fallbacken): `project_assignment`
 * (sql/business_users.sql) kopplar business_user_id ↔ project_id med en
 * riktig, existerande tilldelning — inte en gissning. Om ETT projekt har
 * EXAKT EN tilldelad person där, är namnet ett FAKTUM och får läggas till
 * (payload.assigned_person_name + i titeln). Har projektet 0 eller 2+
 * tilldelade personer sätts fältet ALDRIG — inget gissat namn, ingen lista
 * av namn, ingen "en av två personer"-formulering. Se pickUnambiguousAssignee/
 * fetchUnambiguousAssigneeName nedan, som är den enda källan till detta
 * namn i hela flödet (server- OCH klientsidan, se app/dashboard/projects/
 * [id]/page.tsx som återanvänder samma helper för projektvyns rad).
 *
 * TITEL beror på VILKEN signal som gav namnet:
 *  - Bokningens tilldelning (starkast): "Ingen tidrapport för {namn} i
 *    går ({projekt})".
 *  - project_assignment-fallback (som innan): "Ingen tidrapport för
 *    {projekt} i går ({namn}) — förbered en?".
 *  - Ingendera: "Ingen tidrapport för {projekt} i går — förbered en?"
 *    (oförändrat).
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
  /** R1-D (resurs-masterplan.md): starkare signal än project_assignment
      när den finns — se filhuvudet. */
  assigned_user_id?: string | null
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
  /** R1-D: assigned_user_id (kan innehålla dubbletter/null-luckor) från
      alla bidragande bokningar, i den ordning de sågs. Konsumeras av
      pickUnambiguousBookingAssignee — rå data, inte redan deduplicerad,
      så anroparen avgör entydighet. */
  assigned_user_ids: string[]
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
        assigned_user_ids: b.assigned_user_id ? [b.assigned_user_id] : [],
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
    if (b.assigned_user_id) existing.assigned_user_ids.push(b.assigned_user_id)
  }

  return Array.from(byProject.values())
}

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 60000)
}

// ─────────────────────────────────────────────────────────────────
// pickUnambiguousBookingAssignee — ren, facit-testbar kärna (R1-D,
// resurs-masterplan.md). Bokningens EGEN tilldelning — starkare signal
// än project_assignment, se filhuvudet.
// ─────────────────────────────────────────────────────────────────

/**
 * Väljer den entydiga assigned_user_id bland en dags bidragande bokningar
 * för ett projekt, om en sådan finns. Ren funktion — ingen I/O.
 *
 * Ärlighetsregel, samma som pickUnambiguousAssignee: EXAKT EN DISTINKT
 * icke-null id → det idet (ett faktum — alla dagens besök för projektet
 * gjordes av samma person). 0 ELLER 2+ DISTINKTA id:n → null (ingen
 * gissning när flera olika personer var på olika besök samma dag, eller
 * ingen av bokningarna hade en tilldelning alls).
 */
export function pickUnambiguousBookingAssignee(assignedUserIds: string[]): string | null {
  const distinct = Array.from(new Set(assignedUserIds.filter((id): id is string => !!id)))
  return distinct.length === 1 ? distinct[0] : null
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
      .select('booking_id, project_id, job_status, scheduled_start, scheduled_end, assigned_user_id')
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

    // ── 4b. Namn för entydiga BOKNINGS-tilldelningar (R1-D — starkare
    // signal än project_assignment, se filhuvudet). En batch-fråga för
    // alla kandidat-id:n istället för en fråga per projekt.
    const bookingAssigneeByProject = new Map<string, string | null>(
      missing.map(m => [m.project_id, pickUnambiguousBookingAssignee(m.assigned_user_ids)]),
    )
    const candidateUserIds = Array.from(
      new Set(Array.from(bookingAssigneeByProject.values()).filter((id): id is string => !!id)),
    )
    const nameByUserId = new Map<string, string>()
    if (candidateUserIds.length > 0) {
      const { data: users, error: usersErr } = await supabase
        .from('business_users')
        .select('id, name')
        .eq('business_id', businessId)
        .in('id', candidateUserIds)

      if (usersErr) {
        console.error('[egenkontroll/suggest-time-entry] kunde inte hämta tilldelade personers namn:', usersErr)
        // Inte fatalt — faller tillbaka på project_assignment-logiken per
        // projekt nedan, precis som om bokningen saknade tilldelning.
      } else {
        for (const u of (users || []) as { id: string; name: string | null }[]) {
          if (u.name && u.name.trim().length > 0) nameByUserId.set(u.id, u.name.trim())
        }
      }
    }

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

      // ── 5b. Entydig tilldelning? Bokningens EGEN tilldelning provas
      // FÖRST (starkare signal — se filhuvudet), project_assignment är
      // fallback. Ingendera → inget personnamn alls (ärlighetsregeln,
      // oförändrat).
      const bookingAssigneeId = bookingAssigneeByProject.get(m.project_id) ?? null
      const bookingAssigneeName = bookingAssigneeId ? nameByUserId.get(bookingAssigneeId) ?? null : null

      let assignedPersonName: string | null = null
      let attributionSource: 'booking' | 'project_assignment' | null = null

      if (bookingAssigneeName) {
        assignedPersonName = bookingAssigneeName
        attributionSource = 'booking'
      } else {
        assignedPersonName = await fetchUnambiguousAssigneeName(supabase, businessId, m.project_id)
        if (assignedPersonName) attributionSource = 'project_assignment'
      }

      const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const timeSpan = `${svTimeStr(new Date(m.scheduled_start))}–${svTimeStr(new Date(m.scheduled_end))}`
      const title =
        attributionSource === 'booking' && assignedPersonName
          ? `Ingen tidrapport för ${assignedPersonName} i går (${projectName})`
          : assignedPersonName
            ? `Ingen tidrapport för ${projectName} i går (${assignedPersonName}) — förbered en?`
            : `Ingen tidrapport för ${projectName} i går — förbered en?`

      const { error: insertErr } = await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: businessId,
        approval_type: 'tidrapport_forslag',
        // Etapp 3b (multi-employee-parity-plan.md): kö-routing.
        routing_role: 'can_approve_time',
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
          ...(assignedPersonName ? { assigned_person_name: assignedPersonName, attribution_source: attributionSource } : {}),
          ...(attributionSource === 'booking' && bookingAssigneeId ? { assigned_user_id: bookingAssigneeId } : {}),
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
