import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { transitionProjectToCompleted } from '@/lib/projects/complete-project'

/**
 * POST /api/debug/e2e-lifecycle
 *
 * Rökprovar livscykelns ANDRA halva — fortsättningen på
 * app/api/debug/e2e-quote (kund → offert → signering → projekt → deal).
 * Den här endpointen tar vid där projektet redan finns och kör igenom:
 *
 * 1. Testkund
 * 2. Projekt (direkt, ingen offert i vägen)
 * 3. Tidrapporter (~10 h)
 * 4. ÄTA (project_change, signerad)
 * 5. Stängning — SAMMA byggstenar som app/api/projects/route.ts PUT gör
 *    på övergången till 'completed' (freezeProjectOutcome, getProjectOutcome,
 *    skapaDebriefKort) — men anropade direkt istället för via HTTP-PUT:en,
 *    eftersom server-till-server-auth mot den ruttmed cookies är krångligt
 *    att sätta upp här. Det gör att denna endpoint verifierar DATAKEDJAN,
 *    inte HTTP-lagret (four-eyes-gaten, advanceProjectStage, fireEvent,
 *    auto-fakturering m.m. i PUT-routen berörs alltså inte).
 * 6. Debrief-svar — skriver project_lesson-raderna med SAMMA fält som
 *    app/api/approvals/[id]/route.ts case 'project_debrief' skriver, och
 *    flippar godkännandekortet till 'approved' (simulerar inte HTTP av
 *    samma anledning som steg 5).
 * 7. Cirkeln — läser lärdomen tillbaka med EXAKT samma filter som
 *    fetchRecentLessons (lib/ai-quote-generator.ts) använder vid nästa
 *    offert av samma jobbtyp.
 * 8. Städning — till skillnad från e2e-quote (som medvetet lämnar sina
 *    rader) städar den här endpointen bort ALLT den skapade, barn före
 *    förälder. Städningen körs även vid tidigt avbrott (best effort) så
 *    ett misslyckat steg 3–7 inte lämnar halvfärdiga testrader kvar —
 *    det är den enda avsiktliga avvikelsen från e2e-quotes mönster.
 *
 * Testdata-prefix: 'test_'/'e2e_' + Date.now() på id:n som tillåter det,
 * och namnet 'E2E Livscykel'/'E2E Testkund' på resten — så lib/testdata.ts
 * (arTestId/arTestNamn) gömmer raderna från hemytan om något steg
 * misslyckas innan städningen hinner köra.
 */
export const maxDuration = 30

type StepStatus = 'ok' | 'fail'
interface StepLog {
  step: string
  status: StepStatus
  detail: string
  data?: unknown
}

interface CreatedIds {
  customer_id: string | null
  project_id: string | null
  time_entry_ids: string[]
  project_change_id: string | null
  approval_id: string | null
  project_outcome_id: string | null
  lesson_ids: string[]
}

/** Kastas för att hoppa till cleanup+svar när ett steg redan loggat sitt fel. */
class StepFailure extends Error {}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Endast för admin i produktion' }, { status: 403 })
    }
  }

  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const steps: StepLog[] = []
  const ids: CreatedIds = {
    customer_id: null,
    project_id: null,
    time_entry_ids: [],
    project_change_id: null,
    approval_id: null,
    project_outcome_id: null,
    lesson_ids: [],
  }

  // Städar allt som skapats hittills, barn före förälder. Best-effort —
  // en misslyckad DELETE stoppar inte städningen av resten, den samlas
  // bara upp i den returnerade listan så Andreas kan städa manuellt.
  async function cleanup(): Promise<string[]> {
    const leftover: string[] = []

    if (ids.lesson_ids.length > 0) {
      const { error } = await supabase.from('project_lesson').delete().in('id', ids.lesson_ids)
      if (error) leftover.push(...ids.lesson_ids.map((id) => `project_lesson:${id}`))
    }
    if (ids.approval_id) {
      const { error } = await supabase.from('pending_approvals').delete().eq('id', ids.approval_id)
      if (error) leftover.push(`pending_approvals:${ids.approval_id}`)
    }
    if (ids.project_outcome_id) {
      const { error } = await supabase.from('project_outcome').delete().eq('id', ids.project_outcome_id)
      if (error) leftover.push(`project_outcome:${ids.project_outcome_id}`)
    }
    if (ids.project_change_id) {
      const { error } = await supabase.from('project_change').delete().eq('change_id', ids.project_change_id)
      if (error) leftover.push(`project_change:${ids.project_change_id}`)
    }
    if (ids.time_entry_ids.length > 0) {
      const { error } = await supabase.from('time_entry').delete().in('time_entry_id', ids.time_entry_ids)
      if (error) leftover.push(...ids.time_entry_ids.map((id) => `time_entry:${id}`))
    }
    if (ids.project_id) {
      const { error } = await supabase.from('project').delete().eq('project_id', ids.project_id)
      if (error) leftover.push(`project:${ids.project_id}`)
    }
    if (ids.customer_id) {
      const { error } = await supabase.from('customer').delete().eq('customer_id', ids.customer_id)
      if (error) leftover.push(`customer:${ids.customer_id}`)
    }
    return leftover
  }

  try {
    // ── STEG 1: Testkund ──
    const customerId = 'test_' + Date.now()
    const { error: custErr } = await supabase.from('customer').insert({
      customer_id: customerId,
      business_id: business.business_id,
      name: 'E2E Testkund',
      phone_number: business.phone_number || '0700000000',
    })
    if (custErr) {
      steps.push({ step: '1. Testkund', status: 'fail', detail: custErr.message })
      throw new StepFailure()
    }
    ids.customer_id = customerId
    steps.push({
      step: '1. Testkund',
      status: 'ok',
      detail: `Skapade testkund: E2E Testkund (${customerId})`,
      data: { customer_id: customerId },
    })

    // ── STEG 2: Projekt (direkt, ingen offert) ──
    // project_id genereras av DB-defaulten (gen_random_uuid()::text) — den
    // bär inget 'test_'/'e2e_'-prefix, så det är NAMNET ('E2E Livscykel')
    // som gör raden filtrerbar via arTestNamn tills städningen kört.
    const { data: projectRow, error: projErr } = await supabase
      .from('project')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        name: 'E2E Livscykel',
        job_type: 'badrum',
        status: 'active',
        budget_amount: 50000,
        budget_hours: 40,
      })
      .select('project_id, name, status')
      .single()

    if (projErr || !projectRow) {
      steps.push({ step: '2. Projekt', status: 'fail', detail: projErr?.message || 'Inget projekt returnerades' })
      throw new StepFailure()
    }
    const projectId = projectRow.project_id as string
    ids.project_id = projectId
    steps.push({
      step: '2. Projekt',
      status: 'ok',
      detail: `Skapade projekt "${projectRow.name}" (${projectId}), status ${projectRow.status}, budget 50 000 kr / 40 h`,
      data: { project_id: projectId },
    })

    // ── STEG 3: Tidrapporter (~10 h) ──
    const timeEntrySeeds = [
      { minutes: 360, desc: 'E2E tidrapport — dag 1' },
      { minutes: 240, desc: 'E2E tidrapport — dag 2' },
    ]
    for (const t of timeEntrySeeds) {
      const { data: teRow, error: teErr } = await supabase
        .from('time_entry')
        .insert({
          business_id: business.business_id,
          project_id: projectId,
          customer_id: customerId,
          description: t.desc,
          work_date: new Date().toISOString().slice(0, 10),
          duration_minutes: t.minutes,
          work_category: 'work',
          is_billable: true,
        })
        .select('time_entry_id')
        .single()

      if (teErr || !teRow) {
        steps.push({ step: '3. Tidrapporter', status: 'fail', detail: teErr?.message || 'Ingen tidrapport-rad returnerades' })
        throw new StepFailure()
      }
      ids.time_entry_ids.push(teRow.time_entry_id as string)
    }
    steps.push({
      step: '3. Tidrapporter',
      status: 'ok',
      detail: `Skapade ${ids.time_entry_ids.length} tidrapporter, 10 h totalt`,
      data: { time_entry_ids: ids.time_entry_ids },
    })

    // ── STEG 4: ÄTA (project_change), signerad ──
    const { data: changeRow, error: changeErr } = await supabase
      .from('project_change')
      .insert({
        business_id: business.business_id,
        project_id: projectId,
        customer_id: customerId,
        change_type: 'addition',
        description: 'E2E ÄTA — extra rivningsarbete',
        amount: 5000,
        hours: 2,
        total: 5000,
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_by_name: 'E2E Test',
      })
      .select('change_id')
      .single()

    if (changeErr || !changeRow) {
      steps.push({ step: '4. ÄTA', status: 'fail', detail: changeErr?.message || 'Ingen ÄTA-rad returnerades' })
      throw new StepFailure()
    }
    ids.project_change_id = changeRow.change_id as string
    steps.push({
      step: '4. ÄTA',
      status: 'ok',
      detail: `Skapade signerad ÄTA på 5 000 kr (${ids.project_change_id})`,
      data: { change_id: ids.project_change_id },
    })

    // ── STEG 5: Stäng projektet — samma byggstenar som PUT-routens
    //    stängningsgren, anropade direkt (se filhuvudet) ──
    const closeTransition = await transitionProjectToCompleted(
      supabase,
      business.business_id,
      projectId,
    )

    if (!closeTransition.ok) {
      steps.push({
        step: '5. Stäng projektet',
        status: 'fail',
        detail: closeTransition.error || 'Statusövergången misslyckades',
      })
      throw new StepFailure()
    }

    const { freezeProjectOutcome } = await import('@/lib/efterkalkyl/freeze-outcome')
    await freezeProjectOutcome(supabase, business.business_id, projectId)

    const { getProjectOutcome } = await import('@/lib/efterkalkyl/get-project-outcome')
    const outcome = await getProjectOutcome(supabase, business.business_id, projectId)

    const { data: outcomeRow, error: outcomeSelErr } = await supabase
      .from('project_outcome')
      .select('id')
      .eq('business_id', business.business_id)
      .eq('project_id', projectId)
      .maybeSingle()

    if (outcomeSelErr || !outcomeRow) {
      steps.push({
        step: '5. Stäng projektet',
        status: 'fail',
        detail: `project_outcome-raden hittades inte efter frysning: ${outcomeSelErr?.message || 'ingen rad'}`,
      })
      throw new StepFailure()
    }
    ids.project_outcome_id = outcomeRow.id as string

    const { skapaDebriefKort } = await import('@/lib/debrief/create-debrief-card')
    await skapaDebriefKort(supabase, business.business_id, {
      project_id: projectId,
      project_name: 'E2E Livscykel',
      quote_id: null,
      job_type: outcome.job_type ?? 'badrum',
      hours_diff_pct: outcome.hours_diff_pct,
      amount_diff_pct: outcome.amount_diff_pct,
      margin_pct: outcome.margin_pct,
    })

    const { data: approvalRow, error: approvalSelErr } = await supabase
      .from('pending_approvals')
      .select('id, title')
      .eq('business_id', business.business_id)
      .eq('approval_type', 'project_debrief')
      .contains('payload', { project_id: projectId })
      .maybeSingle()

    if (approvalSelErr || !approvalRow) {
      steps.push({
        step: '5. Stäng projektet',
        status: 'fail',
        detail: `Debriefkortet hittades inte efter stängning: ${approvalSelErr?.message || 'ingen rad'}`,
      })
      throw new StepFailure()
    }
    ids.approval_id = approvalRow.id as string

    steps.push({
      step: '5. Stäng projektet',
      status: 'ok',
      detail: `Projekt stängt, utfall fruset (marginal ${outcome.margin_pct ?? 'okänd'} %), debriefkort skapat: "${approvalRow.title}"`,
      data: { project_outcome_id: ids.project_outcome_id, approval_id: ids.approval_id },
    })

    // ── STEG 6: Besvara debriefen — samma fält som approvals-caset skriver ──
    const { data: lessonRows, error: lessonErr } = await supabase
      .from('project_lesson')
      .insert([
        {
          business_id: business.business_id,
          project_id: projectId,
          quote_id: null,
          job_type: 'badrum',
          lesson_text: 'E2E-testlärdom: rivningen tog längre tid',
          impact_hint: 'Vad tog längre tid än planerat?',
          source: 'debrief',
          confirmed_by: null,
        },
      ])
      .select('id')

    if (lessonErr || !lessonRows || lessonRows.length === 0) {
      steps.push({ step: '6. Besvara debriefen', status: 'fail', detail: lessonErr?.message || 'Ingen lärdomsrad skapades' })
      throw new StepFailure()
    }
    ids.lesson_ids.push(...lessonRows.map((r) => r.id as string))

    const { error: approveErr } = await supabase
      .from('pending_approvals')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', ids.approval_id)
      .eq('status', 'pending')

    if (approveErr) {
      steps.push({ step: '6. Besvara debriefen', status: 'fail', detail: approveErr.message })
      throw new StepFailure()
    }

    steps.push({
      step: '6. Besvara debriefen',
      status: 'ok',
      detail: 'Sparade bekräftad lärdom och godkände debriefkortet',
      data: { lesson_ids: ids.lesson_ids },
    })

    // ── STEG 7: Verifiera cirkeln — samma filter som fetchRecentLessons ──
    const { data: circleRows, error: circleErr } = await supabase
      .from('project_lesson')
      .select('lesson_text, impact_hint')
      .eq('business_id', business.business_id)
      .eq('job_type', 'badrum')
      .order('created_at', { ascending: false })
      .limit(3)

    const circleFound = (circleRows || []).some((r) => r.lesson_text === 'E2E-testlärdom: rivningen tog längre tid')

    if (circleErr || !circleFound) {
      steps.push({
        step: '7. Verifiera cirkeln',
        status: 'fail',
        detail: circleErr?.message || 'E2E-lärdomen syns inte via business_id + job_type-filtret nästa offert skulle använda',
      })
      throw new StepFailure()
    }
    steps.push({
      step: '7. Verifiera cirkeln',
      status: 'ok',
      detail: 'Lärdomen är läsbar med exakt samma filter som nästa offert av jobbtypen badrum skulle läsa',
    })

    // ── STEG 8: Städning ──
    const leftover = await cleanup()
    if (leftover.length > 0) {
      steps.push({
        step: '8. Städning',
        status: 'fail',
        detail: `${leftover.length} rad(er) kunde inte raderas`,
        data: { leftover },
      })
      return NextResponse.json({
        success: false,
        steps,
        error: 'Städningen misslyckades delvis — se leftover_ids',
        leftover_ids: leftover,
        ids,
      })
    }

    steps.push({
      step: '9. Städat — inga spår kvar',
      status: 'ok',
      detail: 'Raderade lärdom, godkännandekort, utfall, ÄTA, tidrapporter, projekt och kund',
    })

    return NextResponse.json({ success: true, steps, ids })
  } catch (err) {
    if (!(err instanceof StepFailure)) {
      steps.push({ step: 'Oväntat fel', status: 'fail', detail: err instanceof Error ? err.message : String(err) })
    }

    // Avvikelse från e2e-quote (som medvetet lämnar sina rader): den här
    // endpointens hela poäng är att inte lämna spår, så vi städar även vid
    // ett tidigt avbrott — best effort, döljer aldrig det ursprungliga felet.
    const leftover = await cleanup().catch(() => [] as string[])
    const lastFail = [...steps].reverse().find((s) => s.status === 'fail')

    return NextResponse.json(
      {
        success: false,
        steps,
        error: lastFail?.detail || 'Okänt fel',
        ...(leftover.length > 0 ? { leftover_ids: leftover } : {}),
      },
      { status: 500 },
    )
  }
}
