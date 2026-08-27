import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { recordLearningEvent } from '@/lib/agent/learning-engine'
import { sendSmsViaElks } from '@/lib/sms-send'
import type { SmsPurpose } from '@/lib/outbound/sms-gate'
import { classifyExecutionResult, extractExecutionArtifacts } from '@/lib/approvals/execution-outcome'
import { canActOnApproval } from '@/lib/approvals/routing'
import { generatedQuoteToQuoteItems } from '@/lib/quotes/generated-to-quote-items'
import { resolveTimeEntryBusinessUserId } from '@/lib/egenkontroll/suggest-time-entry'
import { getBusinessPlanFromConfig } from '@/lib/auth'
import { checkSmsAllowance } from '@/lib/sms-usage'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classify, nonExecutableResult } from '@/lib/approvals/action-contract'
import { extractAgentId } from '@/lib/patterns/utils/extract-agent-id'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { halsning } from '@/lib/customers/namn'
import { completeProject } from '@/lib/projects/complete-project'
import { normalizeDueDateIso } from '@/lib/customer-facts/build-card'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

export const dynamic = 'force-dynamic'

// completeProject → autoInvoiceOnComplete kan nu (Etapp Q, TD-86) skicka
// fakturan på riktigt inline (sendInvoice, Chromium-PDF via
// buildInvoicePdfBuffer) via four_eyes_project_close-godkännandet — samma
// anledning som invoices/send/route.ts behöver 30s.
//
// 30 → 60 (2026-08-25, Reality Week Pass 2, verkligt repro): ett
// review_auto_invoice-godkännande fick 504 vid 30s — kall Chromium-start +
// PDF + mejl inline överskred gränsen. Värst är HALVLÄGET: CAS-flippen till
// 'approved' sker FÖRE exekveringen, så vid gateway-timeout ser användaren
// ett fel medan kortet redan är godkänt (retry-vägen finns, men 504:an i
// sig är exakt "klickade Godkänn, fick fel"-upplevelsen). 60s ger kall
// PDF-generering dubbel marginal; körbokens "försök igen"-råd kvarstår som
// sista utväg.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/approvals/[id]
 *
 * Hämtar ETT kort, business-scoped. Tillkom för OperatingExperiment Etapp 2
 * (2026-08-19): beslutssidan för 'operating_experiment_readout'
 * (app/dashboard/experiments/[approvalId]/page.tsx) behöver kortets fulla
 * payload (measurement, verdict, hypothesis) för att rendera de tre valen —
 * husets bulk-lista (GET /api/approvals) räcker inte för en djuplänkad sida.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    return NextResponse.json({ approval: data })
  } catch (error: any) {
    console.error('GET /api/approvals/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/approvals/[id]
 * Body: { action: 'approve' | 'reject' }
 *
 * On approve: execute the payload action (send SMS, quote, etc.)
 * On reject: mark as rejected
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Etapp 0 (multi-employee-parity-plan.md): identifierar VILKEN anställd
    // som agerar — tidigare kändes bara business_id, så resolved_by lagrade
    // ett business_id istället för en aktör. Notera: superadmin-
    // impersonation (getAuthenticatedBusiness._impersonation) har ingen
    // business_users-rad för admin-anvädaren i target-businessen, så
    // currentUser blir null och detta 401:ar impersonerade skriv-anrop mot
    // godkännande-kön — det fanns ingen tidigare write-spärr för
    // impersonation någonstans i API-lagret, så detta är en (avsedd,
    // ofarlig) sidoeffekt, inte en regression för vanliga anställda/ägare.
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, edited_payload, reject_reason, action_overrides } = body
    if (!action || !['approve', 'reject', 'edit', 'retry'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject, edit or retry' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    // Etapp 3a (multi-employee-parity-plan.md): stänger den bekräftade
    // luckan där execute-endpointen tidigare inte kollade NÅGON identitet/
    // behörighet utöver business_id-matchning — vilken inloggad anställd
    // som helst kunde godkänna/avvisa VILKET kort som helst för sitt
    // business, inklusive finansiella och löne-typer. routing_role har
    // default 'any' på alla rader idag (Etapp 3b sätter specifika buckets
    // vid skapande i en senare körning) så detta är i praktiken en no-op
    // för de flesta typer just nu — UTOM four_eyes_quote, där
    // canActOnApproval hårdkodat nekar självgodkännande oavsett bucket.
    const canAct = await canActOnApproval(supabase, currentUser, approval)
    if (!canAct) {
      return NextResponse.json(
        { error: 'Du saknar behörighet att agera på detta godkännande' },
        { status: 403 },
      )
    }

    // Fas 0-härdning (exec-chain-arvet, plan 2026-08-05): omkörning av en
    // godkänd rad vars exekvering misslyckades. Status-flippen till
    // 'approved' skedde redan vid godkännandet — det som körs om är ENDAST
    // payload-exekveringen. Utan detta är en misslyckad exekvering en
    // återvändsgränd: raden är godkänd, inget gick ut, och det enda sättet
    // att försöka igen är att agenten råkar skapa ett nytt kort.
    if (action === 'retry') {
      const prevExec = (approval.payload as Record<string, any> | null)?.execution_result
      const retryableOutcome = prevExec?.outcome === 'failed' || prevExec?.outcome === 'retrying'
      if (approval.status !== 'approved' || !retryableOutcome) {
        return NextResponse.json(
          { error: 'Endast godkända rader med misslyckat utförande kan köras om' },
          { status: 409 },
        )
      }

      // Dubbelklicksskydd, samma CAS-princip som pending→approved-flippen:
      // bara den request som lyckas flippa outcome 'failed'→'retrying' får
      // exekvera. 'retrying' med executed_at äldre än 10 min räknas som
      // strandad (servern dog mitt i) och får också flippas — ISO-8601-
      // strängar jämför korrekt lexikografiskt, så .lt på JSONB-textvärdet
      // är en riktig tidsjämförelse.
      const staleCutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: casRows, error: casError } = await supabase
        .from('pending_approvals')
        .update({
          payload: {
            ...approval.payload,
            execution_result: { ...prevExec, outcome: 'retrying', executed_at: new Date().toISOString() },
          },
        })
        .eq('id', params.id)
        .eq('business_id', business.business_id)
        .eq('status', 'approved')
        .or(
          `payload->execution_result->>outcome.eq.failed,and(payload->execution_result->>outcome.eq.retrying,payload->execution_result->>executed_at.lt.${staleCutoffIso})`,
        )
        .select('id')
      if (casError || !casRows || casRows.length === 0) {
        return NextResponse.json({ error: 'Omkörning pågår redan' }, { status: 409 })
      }

      const retryCookieHeader = request.headers.get('cookie')
      const retryAuthHeader = request.headers.get('authorization')
      let retryResult: Record<string, unknown> | null = null
      try {
        retryResult = await executeApprovalPayload(
          approval,
          business.business_id,
          undefined,
          retryCookieHeader,
          retryAuthHeader,
          currentUser.id,
        )
      } catch (execErr: any) {
        console.error(`[approvals/${params.id}] retry: executeApprovalPayload kastade okontrollerat:`, execErr)
        retryResult = { error: String(execErr?.message || execErr), ok: false }
      }

      const retryClassified = classifyExecutionResult(retryResult)
      // Värdeattribution (2026-08-12): en lyckad omkörning skapar precis
      // samma sortens artefakter som förstaförsöket (fakturan, ÄTA:n, osv)
      // — utan detta försvann artefakt-ID:na för alla kort som gick igenom
      // via retry-vägen, se extractExecutionArtifacts.
      const retryArtifacts = extractExecutionArtifacts(retryResult)
      const { error: retryPersistError } = await supabase
        .from('pending_approvals')
        .update({
          payload: {
            ...approval.payload,
            execution_result: {
              outcome: retryClassified.outcome,
              error_text: retryClassified.error_text,
              executed_at: new Date().toISOString(),
              retried: true,
              ...(retryArtifacts ? { artifacts: retryArtifacts } : {}),
            },
          },
        })
        .eq('id', params.id)
        .eq('business_id', business.business_id)
      if (retryPersistError) {
        console.error(`[approvals/${params.id}] retry: kunde inte spara execution_result:`, retryPersistError)
      }

      // TD-85 (2026-08-17): retry-vägen körde tidigare INTE uppfyllnadshooken
      // — en payload som bar promise_fact_id och lyckades först vid omkörning
      // (första försöket 'failed') stängde aldrig löftet, trots att
      // bevislänken (execution_result) fanns. Samma delade funktion som
      // primärvägen, samma semantik: bara outcome 'success', bara öppna löften.
      await fulfillPromiseIfPresent(
        supabase,
        params.id,
        business.business_id,
        approval.payload as Record<string, unknown> | null,
        retryClassified.outcome,
      )

      return NextResponse.json({
        success: true,
        action,
        execution: retryResult,
        execution_outcome: { outcome: retryClassified.outcome, error_text: retryClassified.error_text },
      })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 409 })
    }

    // For edit action: merge edited_payload into original payload
    // edited: true stämplas så streak-räkningen (förtjänad autonomi) inte räknar korrigerade förslag som blind tillit.
    const finalPayload = action === 'edit'
      ? { ...approval.payload, ...edited_payload, edited: true }
      : approval.payload

    // Update status
    const newStatus = action === 'reject' ? 'rejected' : 'approved'
    const updateData: Record<string, unknown> = {
      status: newStatus,
      resolved_at: new Date().toISOString(),
      // Etapp 0: currentUser.id (business_users.id), inte business_id —
      // resolved_by ska identifiera aktören, inte bara företaget.
      resolved_by: currentUser.id,
    }
    if (action === 'edit') {
      updateData.payload = finalPayload
    }

    // Atomisk compare-and-set: flippa BARA om raden fortfarande är 'pending'.
    // Utan .eq('status','pending') här är status-checken på rad 47 en ren
    // TOCTOU-läsning — två snabba klick (eller web+mobil samtidigt) läser båda
    // 'pending', passerar båda, och exekverar payloaden två gånger (dubbla
    // SMS/fakturor). Guarden gör att bara den request som faktiskt flippar
    // går vidare till executeApprovalPayload.
    const { data: flippedApproval, error: updateError } = await supabase
      .from('pending_approvals')
      .update(updateData)
      .eq('id', params.id)
      .eq('status', 'pending')
      .select('id')

    if (updateError) throw updateError
    if (!flippedApproval || flippedApproval.length === 0) {
      // En parallell request hann före oss mellan fetch och update.
      return NextResponse.json({ error: `Approval already resolved` }, { status: 409 })
    }

    // Record learning event (non-blocking)
    try {
      const agentSuggestion = approval.payload as Record<string, unknown>

      // SPÅR 1.1 (2026-08-06): RETURVÄRDET KONTROLLERAS NU.
      //
      // recordLearningEvent kastar aldrig — den fångar internt och returnerar
      // { success, error }. Den gamla koden ignorerade svaret och lät ett
      // try/catch ta hand om "fel", vilket betydde att en misslyckad insert
      // var helt osynlig här. Kombinerat med UUID/TEXT-buggen i reference_id
      // förlorades all inlärningsdata i månader utan att någon märkte det.
      //
      // Fortfarande non-blocking — ett förlorat inlärningshändelse får aldrig
      // fälla ett godkännande — men nu SYNLIGT non-blocking.
      const learning =
        action === 'approve'
          ? await recordLearningEvent(
              business.business_id, 'approval_accepted', params.id, 'approval', agentSuggestion, null,
            )
          : action === 'edit'
            ? await recordLearningEvent(
                business.business_id, 'approval_edited', params.id, 'approval', agentSuggestion,
                edited_payload || {},
              )
            : action === 'reject'
              ? await recordLearningEvent(
                  business.business_id, 'approval_rejected', params.id, 'approval', agentSuggestion,
                  reject_reason ? { reason: reject_reason } : null,
                )
              : null

      if (learning && !learning.success) {
        console.error(
          `[approvals/${params.id}] LARM: inlärningshändelsen (${action}) sparades inte — ` +
            `mätningen av agentens träffsäkerhet tappar den här datapunkten. ${learning.error}`,
        )
      }
    } catch (err) {
      // Skulle något ändå kasta får det inte fälla godkännandet — men det ska
      // synas. Tyst catch var halva orsaken till att buggen levde så länge.
      console.error('[approvals] LARM: inlärningshändelsen kastade oväntat:', err)
    }

    // Förtjänad autonomi (non-blocking): godkännande av allowlistad typ kan
    // trigga erbjudande vid 15 raka; avvisning nedgraderar + nollar streak
    // (streaken nollas implicit — den avvisade raden ligger nu i historiken).
    try {
      const { autonomyKeyFromApproval, maybeCreateOffer, revokeAutonomy } =
        await import('@/lib/autonomy/earned-autonomy')
      const autonomyKeyForRow = autonomyKeyFromApproval(approval)
      if (autonomyKeyForRow) {
        if (action === 'approve') {
          await maybeCreateOffer(supabase, business.business_id, autonomyKeyForRow)
        } else if (action === 'reject') {
          await revokeAutonomy(supabase, business.business_id, autonomyKeyForRow)
        }
      }
    } catch (autonomyErr) {
      console.error('[approvals] earned-autonomy hook error (non-blocking):', autonomyErr)
    }

    // Reject-side-effect: en avslagen fyra-ögon-offert måste tillbaka till
    // 'draft'. Utan detta fastnar den i 'pending_approval' — en status som
    // varken uppföljningen, expiry-cronen eller kundportalen känner igen, så
    // offerten blir osynlig för alla utom den som råkar leta efter den.
    // Godkännandevägen återställer redan (case 'four_eyes_quote').
    if (action === 'reject' && approval.approval_type === 'four_eyes_quote') {
      const rejectedQuoteId = (approval.payload as Record<string, unknown>)?.quote_id as string | undefined
      if (rejectedQuoteId) {
        const { error: resetErr } = await supabase
          .from('quotes')
          .update({ status: 'draft' })
          .eq('quote_id', rejectedQuoteId)
          .eq('business_id', business.business_id)
          .eq('status', 'pending_approval')
        if (resetErr) {
          console.error('[approvals/four_eyes_quote] kunde inte återställa offerten till utkast:', resetErr.message)
        }
      }
    }

    // Reject-side-effect för specifika types som behöver mer än status-flip
    if (action === 'reject' && approval.approval_type === 'lead_review') {
      const leadId = (approval.payload as Record<string, unknown>)?.lead_id as string | undefined
      if (leadId) {
        // Sanering 2026-08-05: 'declined' bröt mot leads status-CHECK
        // (new/contacted/qualified/quote_sent/won/lost) → updaten failade
        // tyst och leaden låg kvar som aktiv. 'lost' är det kanoniska
        // avvisad-värdet. Supabase kastar inte — läs error explicit.
        const { error: leadErr } = await supabase
          .from('leads')
          .update({ status: 'lost', updated_at: new Date().toISOString() })
          .eq('lead_id', leadId)
          .eq('business_id', business.business_id)
        if (leadErr) {
          console.error('[approvals/lead_review] Failed to mark lead lost:', leadErr.message)
        }
      }
    }

    // OperatingExperiment Etapp 2 (2026-08-19) — ett rakt "Avvisa"-klick i
    // kön (utan att besöka beslutssidan) är ett giltigt tredje val:
    // owner_decision='rejected'. Fail-soft mot v157 saknas (arSchemaSaknas —
    // täcker BÅDE 42P01 och PostgREST:s PGRST205, se driftlarm.ts) —
    // experimentet kan ju inte existera om tabellen inte gör det, och det
    // ska aldrig fälla den vanliga avvisnings-flippen ovan.
    if (action === 'reject' && approval.approval_type === 'operating_experiment_readout') {
      const experimentId = (approval.payload as Record<string, unknown>)?.experiment_id as string | undefined
      if (experimentId) {
        const { error: expRejectErr } = await supabase
          .from('operating_experiment')
          .update({ owner_decision: 'rejected', decided_at: new Date().toISOString() })
          .eq('id', experimentId)
          .eq('business_id', business.business_id)
        if (expRejectErr && !arSchemaSaknas(expRejectErr)) {
          console.error('[approvals/operating_experiment_readout] kunde inte avvisa försöket:', expRejectErr.message)
        }
      }
    }

    // If approved or edited, execute the payload action
    let executionResult: Record<string, unknown> | null = null
    // Fas 0-härdning: den klassade bedömningen följer med i HTTP-svaret så
    // klienterna slipper tolka execution-objektets fältvarianter själva —
    // approvals/page.tsx sa tidigare "Godkänt" även när utförandet misslyckats.
    let executionOutcome: { outcome: string; error_text: string | null } | null = null
    if (action === 'approve' || action === 'edit') {
      // Defense-in-depth: approval hämtades redan med .eq('business_id', business.business_id)
      // så detta ska aldrig kunna trigga, men explicit check förebygger framtida regressioner
      // där fetch-logiken ändras utan att vi tänker på cross-business-säkerhet.
      if (approval.business_id !== business.business_id) {
        console.error(
          `[approvals/${params.id}] CRITICAL: business_id mismatch — approval.business_id=${approval.business_id}, session=${business.business_id}`,
        )
        return NextResponse.json(
          { error: 'Approval business mismatch — säkerhetsfel' },
          { status: 403 },
        )
      }
      const approvalWithPayload = { ...approval, payload: finalPayload }
      // Audit-4 Fix DEF (2026-06-02): forward cookies så target-endpoints
      // (quotes/send, invoices/send, bookings, ai-generate) får giltig
      // auth-context via samma session som klickade Godkänn. Tidigare
      // failade alla server-side fetches med 401 → silent failure.
      const cookieHeader = request.headers.get('cookie')
      // B2-fix (2026-06-27): mobilen autentiserar med Authorization: Bearer
      // utan cookie → forwarda även den, annars 401 tyst på icke-SMS-actions.
      const authHeader = request.headers.get('authorization')

      // Utfalls-hårdning (juli-audit): executeApprovalPayload har idag ett
      // internt catch-all runt hela sin switch, men om den ändå skulle kasta
      // (t.ex. ett icke-Error-objekt kastas och err.message i det interna
      // catchet själv kraschar) fångar vi det HÄR — annars bubblar det till
      // det yttre catchet nedan och ger ett 500-svar med raden redan
      // status='approved' och INGENTING sparat. Det är precis den tysta
      // dubbel-lögnen (kunden trodde det gick ut, raden säger godkänt, DB
      // har inget spår) som denna hårdning ska stänga.
      try {
        executionResult = await executeApprovalPayload(
          approvalWithPayload,
          business.business_id,
          action_overrides as Record<string, string> | undefined,
          cookieHeader,
          authHeader,
          currentUser.id,
        )
      } catch (execErr: any) {
        console.error(`[approvals/${params.id}] executeApprovalPayload kastade okontrollerat:`, execErr)
        executionResult = { error: String(execErr?.message || execErr), ok: false }
      }

      // Persistera utfallet på raden — oavsett om execution lyckades,
      // misslyckades eller kastade. payload är JSONB så detta kräver ingen
      // schema-ändring. Utan detta finns felet BARA i HTTP-svaret ovan; om
      // klienten missar det (mobilkrasch, stängd flik) är det osynligt för
      // alltid och hantverkaren tror felaktigt att handlingen gick igenom.
      const classified = classifyExecutionResult(executionResult)
      const { outcome, error_text } = classified
      executionOutcome = classified
      // Värdeattributionens första brott (verifierat 2026-08-12): executor-
      // cases returnerar artefakt-ID:n (ata_id, invoice_id, quote_id, ...) i
      // HTTP-svaret, men bara outcome/error_text/executed_at persisterades
      // — kedjan kort→skapad artefakt var därför obevisbar i databasen.
      // extractExecutionArtifacts vitlistar vilka fält som får följa med
      // (aldrig en rå spread av executionResult, se lib/approvals/
      // execution-outcome.ts) så Value Ledger kan slå upp exakt vad ett
      // godkänt kort ledde till.
      const artifacts = extractExecutionArtifacts(executionResult)
      const { error: persistError } = await supabase
        .from('pending_approvals')
        .update({
          payload: {
            ...finalPayload,
            execution_result: {
              outcome,
              error_text,
              executed_at: new Date().toISOString(),
              ...(artifacts ? { artifacts } : {}),
            },
          },
        })
        .eq('id', params.id)
        .eq('business_id', business.business_id)

      if (persistError) {
        // Non-blocking — exekveringen har redan skett och svaret nedan
        // innehåller ändå det faktiska utfallet. Men loggas synligt så vi
        // upptäcker om persisteringen systematiskt failar.
        console.error(`[approvals/${params.id}] Kunde inte spara execution_result:`, persistError)
      }

      // Promise-to-Proof — uppfyllnadslänken (Etapp N, 2026-08-17, sql/v147;
      // delad med retry-vägen sedan TD-85, se fulfillPromiseIfPresent nedan):
      // VILKET kort som helst vars payload bär promise_fact_id och som
      // EXEKVERAR FRAMGÅNGSRIKT stänger löftet det restes för.
      await fulfillPromiseIfPresent(supabase, params.id, business.business_id, finalPayload, outcome)
    }

    return NextResponse.json({
      success: true,
      action,
      execution: executionResult,
      execution_outcome: executionOutcome,
    })
  } catch (error: any) {
    console.error('POST /api/approvals/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Promise-to-Proof — delad uppfyllnadshook (TD-85, 2026-08-17).
 *
 * Extraherad ur primärvägens (Etapp N, sql/v147) inline-block: BÅDA vägar
 * som kan exekvera en payload framgångsrikt — förstaförsöket (approve/edit)
 * OCH omkörningen (retry, efter ett tidigare misslyckat försök) — måste
 * stänga löftet det restes för. Innan denna extraktion körde bara
 * primärvägen hooken, så ett löfte som diskonterades via retry blev kvar
 * 'open' för alltid trots att bevislänken (execution_result) faktiskt fanns.
 *
 * Non-blocking, fail-soft pre-v147 (promise_status-kolumnen kan saknas) och
 * rör ALDRIG det avvisade tillståndet — bara godkännandet öppnar ett löfte
 * (case 'customer_fact'), och bara en människa som läser deadline-svepets
 * kort avgör om ett löfte bröts. Den här funktionen flyttar ENDAST öppna
 * löften till uppfyllda, och bara vid outcome 'success'.
 */
async function fulfillPromiseIfPresent(
  supabase: SupabaseClient,
  approvalId: string,
  businessId: string,
  payload: Record<string, unknown> | null,
  outcome: string,
): Promise<void> {
  const promiseFactId = (payload as Record<string, unknown> | null)?.promise_fact_id
  if (typeof promiseFactId !== 'string' || !promiseFactId || outcome !== 'success') return
  try {
    const { error: fulfillErr } = await supabase
      .from('customer_fact')
      .update({
        promise_status: 'fulfilled',
        fulfilled_by_ref: approvalId,
        fulfilled_at: new Date().toISOString(),
      })
      .eq('id', promiseFactId)
      .eq('business_id', businessId)
      .eq('promise_status', 'open')
    if (
      fulfillErr &&
      fulfillErr.code !== '42703' &&
      !/column .* does not exist|schema cache/i.test(fulfillErr.message || '')
    ) {
      console.error(`[approvals/${approvalId}] löftesuppfyllnad misslyckades (icke-blockerande):`, fulfillErr.message)
    }
  } catch (fulfillCatchErr: any) {
    console.error(
      `[approvals/${approvalId}] löftesuppfyllnad kastade (icke-blockerande):`,
      fulfillCatchErr?.message || fulfillCatchErr,
    )
  }
}

/**
 * Internal helper för SMS-baserade approval-cases (Audit-3 Fix A, 2026-06-01).
 *
 * Tidigare använde 9 cases `fetch(appUrl + /api/sms/send)` som FAILAR
 * server-side: /api/sms/send har getAuthenticatedBusiness-check som
 * returnerar 401 utan cookie/Authorization-header → silent failure
 * (status='approved' men SMS skickas aldrig).
 *
 * Lösning: kalla sendSmsViaElks direkt — bypassar route-layer-auth,
 * loggar i sms_log, returnerar { success, error }. Samma pattern som
 * review_request använde redan (rad 215-282 i originalfilen).
 *
 * Helpern är scoped till executeApprovalPayload via closure så
 * business_name fetchas lazy + bara EN gång per execution oavsett hur
 * många SMS-cases triggas (autopilot_package kan ha flera).
 */
async function fetchBusinessName(
  supabase: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()
  return data?.business_name || null
}

/**
 * Execute the payload action based on approval_type.
 * Returns result info (non-fatal — approval is already marked approved).
 *
 * TD: Status-flip ordning (Audit-3 Fix B framtida).
 * Status='approved' sätts i POST-handler INNAN denna funktion kallas.
 * Vid execution-fail kan vi inte återställa pending utan att skapa
 * edge-cases (SMS skickat men status fail-back, etc.). Bygg när vi
 * har pilot-data om vilka edge-cases som faktiskt händer.
 */
async function executeApprovalPayload(
  approval: { id: string; approval_type: string; payload: Record<string, unknown>; business_id: string; package_data?: any },
  businessId: string,
  actionOverrides?: Record<string, string>,
  cookieHeader?: string | null,
  authHeader?: string | null,
  // Project Debrief Capture (2026-08-12): confirmed_by på project_lesson-
  // raderna behöver identifiera VEM som svarade, inte bara vilket företag.
  // currentUser.id (business_users.id) — null när okänt (t.ex. retry-vägen
  // om den någon gång tappar sessionen).
  resolvedByUserId?: string | null,
): Promise<Record<string, unknown>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const { approval_type, payload } = approval
  // VP2 (gap 1): kortets id stämplas nedströms (sms_log via sendSms-closuren,
  // v3_automation_logs i case:en som loggar) — attributionskedjan kort→utfall.
  const approvalId = approval.id

  /**
   * Audit-4 Fix DEF (2026-06-02): bygger headers som forwardar
   * sessions-cookien till target-endpoints. Utan cookien fallbackar
   * getAuthenticatedBusiness till 401 → silent failure.
   */
  function forwardHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cookieHeader) h['Cookie'] = cookieHeader
    // B2-fix (2026-06-27): forwarda även Authorization — mobilen skickar Bearer
    // utan cookie → icke-SMS-actions (send_quote/send_invoice/create_booking)
    // failade TYST med 401 vid mobil-godkännande (status flippades till
    // 'approved' men handlingen skedde aldrig).
    // TD: ta bort i execution-chain Steg 6 (städning) — efter Steg 3 kör
    // execute.ts lib direkt utan HTTP-forward → forwardHeaders blir överflödig.
    if (authHeader) h['Authorization'] = authHeader
    return h
  }

  /**
   * Audit-4 Fix DEF (2026-06-02): klassificera target-endpoint-response
   * så UI kan visa kontext-känslig feedback istället för bara "ok=true/false".
   *
   * Kategorier:
   *   - permission_denied (HTTP 403): användaren saknar behörighet
   *   - four_eyes_required (HTTP 200 + requires_approval): högvärdes-flow
   *   - rate_limited (HTTP 429): för många försök
   *   - fail (HTTP 401/404/5xx eller body-success=false): hård fail
   */
  async function classifyResponse(
    res: Response,
  ): Promise<{
    ok: boolean
    reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
    error?: string
    metadata?: Record<string, unknown>
  }> {
    let data: any = null
    try { data = await res.json() } catch { /* ignore non-JSON */ }

    if (res.status === 401) {
      return { ok: false, reason: 'fail', error: 'Auth-fel — sessionen kanske gick ut. Logga in på nytt.' }
    }
    if (res.status === 403) {
      return { ok: false, reason: 'permission_denied', error: data?.error || 'Du saknar behörighet för denna handling.' }
    }
    if (res.status === 404) {
      return { ok: false, reason: 'fail', error: 'Endpoint hittades inte (404).' }
    }
    if (res.status === 429) {
      return { ok: false, reason: 'rate_limited', error: data?.error || 'För många försök, vänta en stund.' }
    }
    if (!res.ok) {
      return { ok: false, reason: 'fail', error: data?.error || `HTTP ${res.status}` }
    }

    // HTTP 200 — kolla body
    if (data?.requires_approval) {
      return {
        ok: false,
        reason: 'four_eyes_required',
        error: data.message || `Värdet kräver ny granskning. Ny approval skapad.`,
        metadata: { new_approval_id: data.approval_id },
      }
    }
    if (data && data.success === false) {
      const errMsg = Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.join('; ')
        : (data.error || 'Handlingen genomfördes inte fullt ut.')
      return { ok: false, reason: 'fail', error: errMsg }
    }

    return { ok: true, metadata: data || undefined }
  }

  // Lazy supabase + business_name — laddas bara om SMS-case triggas
  let supabaseClient: SupabaseClient | null = null
  let businessNameCache: string | null | undefined = undefined  // undefined = ej hämtad än
  async function getSupabase(): Promise<SupabaseClient> {
    if (!supabaseClient) supabaseClient = getServerSupabase()
    return supabaseClient
  }
  async function getBusinessName(): Promise<string | null> {
    if (businessNameCache === undefined) {
      businessNameCache = await fetchBusinessName(await getSupabase(), businessId)
    }
    return businessNameCache
  }

  // VP1 (gap 8, tasks/vilande-pengar-masterplan.md): agentvägens SMS gick
  // tidigare helt förbi SMS-kvoten/hardCap som /api/sms/send redan
  // kontrollerar. Planen (subscription_plan) hämtas lazy + cachas EN gång
  // per execution, samma mönster som businessNameCache ovan.
  let businessPlanCache: ReturnType<typeof getBusinessPlanFromConfig> | undefined = undefined
  async function getBusinessPlan() {
    if (businessPlanCache === undefined) {
      const supabase = await getSupabase()
      const { data } = await supabase
        .from('business_config')
        .select('subscription_plan')
        .eq('business_id', businessId)
        .maybeSingle()
      businessPlanCache = getBusinessPlanFromConfig(data || {})
    }
    return businessPlanCache
  }

  /**
   * Skicka SMS via sendSmsViaElks. Använder cachad supabase + business_name.
   * Returnerar standardiserad shape som varje case spreader in i sin
   * return-value: { sms_sent, sms_id?, elks_id?, error?, sms_status? }.
   *
   * VP1 (gap 8): kollar SMS-kvoten/hardCap FÖRE sändning — vid tak blockas
   * med ett ärligt fel ("SMS-kvoten för månaden är nådd") istället för att
   * skicka förbi kvoten. Detta är EN delad plats (alla approval-execution-
   * cases som skickar SMS går via denna helper — send_sms/quote_nudge/
   * proactive_care/warranty_followup/review_request/booking-förslag/
   * customer_reactivation/autopilot_package customer_sms/default-fallback)
   * så kvoten omfattar dem alla utan att varje case behöver egen kod.
   *
   * Etapp K (SMS-kvoten i strypunkten, 2026-08-17): förhandskollen nedan
   * är kvar (ärligt, tidigt fel i approval-svaret i stället för ett
   * generiskt sendSmsViaElks-fel), men UPPRÄKNINGEN (trackSmsSent) görs
   * inte längre här — sendSmsViaElks räknar upp sig själv efter en
   * faktiskt lyckad sändning nu. Ett eget anrop här hade dubbelräknat.
   */
  async function sendSms(opts: {
    to: string
    message: string
    customerId?: string | null
    relatedId?: string | null
    messageType: string
    purpose: Exclude<SmsPurpose, 'internal'>
  }): Promise<{
    sms_sent: boolean
    sms_id?: string
    elks_id?: string
    error?: string
    sms_status?: number | null
  }> {
    const supabase = await getSupabase()
    const businessName = await getBusinessName()
    const plan = await getBusinessPlan()

    const quota = await checkSmsAllowance(businessId, plan)
    if (!quota.allowed) {
      return { sms_sent: false, error: quota.error || 'SMS-kvoten för månaden är nådd' }
    }

    const result = await sendSmsViaElks({
      supabase,
      businessId,
      businessName,
      to: opts.to,
      message: opts.message,
      customerId: opts.customerId,
      relatedId: opts.relatedId,
      messageType: opts.messageType,
      approvalId,
      recipient: 'customer',
      purpose: opts.purpose,
    })

    // Etapp K (SMS-kvoten i strypunkten, 2026-08-17): sendSmsViaElks räknar
    // nu upp kvoten själv efter en lyckad sändning (och aldrig för en
    // idempotent omsändning — den early-returnar innan uppräkningen körs).
    // Ett eget trackSmsSent-anrop här hade dubbelräknat samma SMS.

    return {
      sms_sent: result.success,
      sms_id: result.smsId,
      elks_id: result.elksId,
      error: result.error,
      sms_status: result.status,
    }
  }
  // appUrl används fortfarande av icke-SMS-cases (send_quote, create_booking,
  // etc.) — separat audit för deras silent-failure-risk (TD).

  try {
    switch (approval_type) {
      case 'quote_nudge':
      case 'send_sms': {
        // Audit-3 Fix A (2026-06-01): sendSmsViaElks direkt istället för
        // internal fetch som failade server-side. Karin/Daniel/Lisa typed
        // actions går via denna case.
        const to = (payload.to as string | undefined) || (payload.customer_phone as string | undefined)
        const message = payload.message as string | undefined
        if (!to || !message) {
          return { action: 'send_sms', error: 'payload saknar to eller message' }
        }
        const r = await sendSms({
          to,
          message,
          customerId: (payload.customer_id as string | undefined) || null,
          relatedId: (payload.related_id as string | undefined) || null,
          messageType: approval_type,
          purpose: approval_type === 'quote_nudge' ? 'proactive' : 'conversational',
        })

        // Hanna v2 spel 4 (bärande princip #6): denna case delas av MÅNGA
        // producenter (Karin/Daniel/Lisa/generiska send_sms) — attribuera
        // bara när payloaden faktiskt bär en agent (extractAgentId, samma
        // policy som rate-limit/approve-rate använder), annars null i
        // stället för en gissning. quote_nudge-kort från Daniels offertjakt
        // bär agent_id='daniel' sedan tidigare (lib/autopilot/quote-nudge.ts).
        try {
          const agentIdForLog = extractAgentId({ payload })
          const supabaseQN = await getSupabase()
          const { error: qnLogErr } = await supabaseQN.from('v3_automation_logs').insert({
            business_id: businessId,
            agent_id: agentIdForLog,
            rule_name: approval_type,
            trigger_type: 'approval_executed',
            action_type: 'send_sms',
            approval_id: approvalId,
            status: r.sms_sent ? 'success' : 'failed',
            error_message: r.sms_sent ? null : (r.error || null),
            context: {
              customer_id: (payload.customer_id as string | undefined) || null,
              related_id: (payload.related_id as string | undefined) || null,
              quote_id: (payload.quote_id as string | undefined) || null,
            },
          })
          if (qnLogErr) {
            console.warn('[approvals/send_sms] v3-logg insert misslyckades (icke-blockerande):', qnLogErr.message)
          }
        } catch (logErr: any) {
          console.warn('[approvals/send_sms] v3-logg insert kastade (icke-blockerande):', logErr?.message || logErr)
        }

        return { action: 'send_sms', ...r }
      }

      case 'send_email': {
        // TD-52: motsvarighet till 'send_sms' ovan för agentens send_email-
        // verktyg när det köats för godkännande (system-triggerad, ej
        // förtjänad autonomi). Minimal — Resend direkt (lib/email.ts), ingen
        // Gmail-koppling här (den kräver OAuth-token-hantering som redan
        // sköts av tool-router:ns egen sendEmail för direkta skick).
        const to = payload.to as string | undefined
        const subject = payload.subject as string | undefined
        const bodyText = payload.body as string | undefined
        if (!to || !subject || !bodyText) {
          return { action: 'send_email', error: 'payload saknar to, subject eller body' }
        }
        const { sendEmail: sendEmailViaResend, logEmail } = await import('@/lib/email')
        const businessName = await getBusinessName()
        const r = await sendEmailViaResend({
          to,
          subject,
          html: bodyText.replace(/\n/g, '<br>'),
          fromName: businessName || 'Handymate',
        })
        await logEmail({
          businessId,
          customerId: (payload.customer_id as string | undefined) || undefined,
          to,
          subject,
          status: r.success ? 'sent' : 'failed',
          messageId: r.messageId,
        })
        return { action: 'send_email', ok: r.success, error: r.error, message_id: r.messageId }
      }

      case 'send_quote': {
        // Audit-4 Fix DEF (2026-06-02): tidigare URL `/api/quotes/[id]/send`
        // existerade aldrig — failade med 404 silent. Korrekt: `/api/quotes/send`
        // med body { quoteId, method }.
        if (!payload.quote_id) return { action: 'send_quote', skipped: 'no quote_id' }
        const res = await fetch(`${appUrl}/api/quotes/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            quoteId: payload.quote_id,
            method: (payload.method as string) || 'both',
            extraEmails: payload.extra_emails || [],
            bccEmails: payload.bcc_emails || [],
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'send_quote', ...r }
      }

      case 'send_invoice': {
        // Audit-4 Fix DEF (2026-06-02): tidigare URL `/api/invoices/[id]/send`
        // existerade aldrig — failade med 404 silent. Korrekt: `/api/invoices/send`
        // med body { invoice_id, send_email, send_sms }.
        if (!payload.invoice_id) return { action: 'send_invoice', skipped: 'no invoice_id' }
        const res = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            invoice_id: payload.invoice_id,
            send_email: payload.send_email !== false,
            send_sms: payload.send_sms !== false,
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'send_invoice', ...r }
      }

      case 'confirm_payment': {
        // Kundens "Jag har betalat"-bekräftelse (2026-07-12). Godkänn =
        // hantverkaren bekräftar att pengarna kommit in → markera betald via
        // delad apply-payment-kärna (samma som manuell mark-paid). Ingen
        // markedByUserId (bekräftas via kortet, inte en dashboard-användare).
        if (!payload.invoice_id) return { action: 'confirm_payment', skipped: 'no invoice_id' }
        const { applyInvoicePayment } = await import('@/lib/invoices/apply-payment')
        const r = await applyInvoicePayment({
          businessId,
          invoiceId: payload.invoice_id as string,
          markedByUserId: null,
          source: 'customer_confirmed',
        })
        return {
          action: 'confirm_payment',
          ok: r.ok,
          error: r.error,
          metadata: { already_paid: r.already_paid ?? false, transition: r.transition ?? null, remaining_rot_kr: r.remaining_rot_kr ?? 0 },
        }
      }

      case 'create_booking': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding så /api/bookings
        // POST inte returnerar 401.
        const res = await fetch(`${appUrl}/api/bookings`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({ ...payload, business_id: businessId }),
        })
        const r = await classifyResponse(res)
        return { action: 'create_booking', ...r }
      }

      case 'autonomy_offer': {
        // Beviljar förtjänad autonomi för en åtgärdstyp. Ingen extern effekt —
        // endast settings-skrivning (låg risk). Kräver att sql/v65 är körd.
        const { grantAutonomy, isAllowlistedKey } = await import('@/lib/autonomy/earned-autonomy')
        const key = payload.autonomy_key
        if (!isAllowlistedKey(key)) {
          return { action: 'autonomy_offer', ok: false, error: `Okänd autonomi-nyckel: ${String(key)}` }
        }
        const supabaseAO = (await import('@/lib/supabase')).getServerSupabase()
        try {
          await grantAutonomy(supabaseAO, businessId, key)
          return { action: 'autonomy_offer', ok: true, granted: true, autonomy_key: key }
        } catch (err: any) {
          return { action: 'autonomy_offer', ok: false, error: err?.message || 'Kunde inte spara' }
        }
      }

      // `scheduled_review_request` och `yearly_followup` har samma payload-form
      // (to + message) och skickades tidigare via SMS-gissningen i default.
      // De hör hit — en explicit hanterare i stället för fältgissning, så
      // beteendet bevaras utan att kön behöver gissa något.
      case 'scheduled_review_request':
      case 'yearly_followup':
      case 'review_request': {
        // A4 — auto-recensionsbegäran efter projekt-completion.
        // Går via den delade sendSms-helpern (Audit-3 Fix A-mönstret,
        // samma som send_sms/proactive_care nedan) — inte internal fetch
        // mot /api/sms/send (TD-lärdom: relativ URL fungerar inte server-
        // side i Next-routes, plus rate-limit/billing/auth-check är inte
        // relevant för system-triggade SMS). VP1 (gap 8): helpern kollar
        // nu SMS-kvoten/hardCap — tidigare gick denna case direkt via
        // sendSmsViaElks och förbi kvoten helt.
        const phone = payload.to as string | undefined
        const message = payload.message as string | undefined
        const customerId = (payload.customer_id as string | undefined) || null
        const projectId = (payload.project_id as string | undefined) || null

        if (!phone || !message) {
          return { action: 'review_request', error: 'payload saknar to eller message' }
        }

        const r = await sendSms({
          to: phone,
          message,
          customerId,
          relatedId: projectId,
          messageType: 'review_request',
          purpose: 'proactive',
        })

        // Hanna v2 spel 2 (bärande princip #6): logga utfallet till
        // v3_automation_logs med agent_id='hanna' — dessa tre typer är
        // alltid Hannas domän (recension/1-årsuppföljning) — så det syns
        // i scoreboard + veckodigest, samma mönster som proactive_care/
        // warranty_followup-casen ovan. Tidigare loggades exekveringen
        // inte alls här (bara cronens EGEN skapande-logg fanns).
        try {
          const supabaseRR = await getSupabase()
          const { error: rrLogErr } = await supabaseRR.from('v3_automation_logs').insert({
            business_id: businessId,
            agent_id: 'hanna',
            rule_name: approval_type,
            trigger_type: 'approval_executed',
            action_type: 'send_sms',
            approval_id: approvalId,
            status: r.sms_sent ? 'success' : 'failed',
            error_message: r.sms_sent ? null : (r.error || null),
            context: { customer_id: customerId, project_id: projectId },
          })
          if (rrLogErr) {
            console.warn('[approvals/review_request] v3-logg insert misslyckades (icke-blockerande):', rrLogErr.message)
          }
        } catch (logErr: any) {
          console.warn('[approvals/review_request] v3-logg insert kastade (icke-blockerande):', logErr?.message || logErr)
        }

        if (!r.sms_sent) {
          return {
            action: 'review_request',
            sms_sent: false,
            error: r.error || 'SMS kunde inte skickas',
            sms_status: r.sms_status,
          }
        }

        // Markera kunden så cron inte triggar igen inom 180d.
        // Non-blocking om UPDATE failar — SMS är redan ute, customer.flag
        // är spam-skydd. Logga warning men håll success-state.
        if (customerId) {
          const supabase = await getSupabase()
          const { error: updateErr } = await supabase
            .from('customer')
            .update({ review_request_sent_at: new Date().toISOString() })
            .eq('customer_id', customerId)
            .eq('business_id', businessId)

          if (updateErr) {
            console.warn('[review_request] customer.review_request_sent_at update failed (SMS already sent):', updateErr)
          }
        }

        return {
          action: 'review_request',
          sms_sent: true,
          sms_id: r.sms_id,
          elks_id: r.elks_id,
        }
      }

      case 'autopilot_package': {
        const packageData = approval.package_data
        if (!packageData?.actions) return { action: 'autopilot_package', skipped: 'no package_data' }

        const results: Record<string, unknown>[] = []
        const supabase = (await import('@/lib/supabase')).getServerSupabase()

        for (const act of packageData.actions as any[]) {
          // Kolla individuella overrides
          const override = actionOverrides?.[act.id]
          if (override === 'rejected') {
            results.push({ id: act.id, type: act.type, skipped: 'rejected' })
            continue
          }

          switch (act.type) {
            case 'project_info':
              results.push({ id: act.id, type: 'project_info', ok: true, info: true })
              break

            case 'booking_suggestion': {
              // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
              const bookRes = await fetch(`${appUrl}/api/bookings`, {
                method: 'POST',
                headers: forwardHeaders(),
                body: JSON.stringify({
                  business_id: businessId,
                  customer_id: act.data.customer_id,
                  scheduled_start: act.data.scheduled_start,
                  scheduled_end: act.data.scheduled_end,
                  notes: act.data.notes || '',
                }),
              })
              const br = await classifyResponse(bookRes)
              results.push({ id: act.id, type: 'booking', ...br })
              break
            }

            case 'customer_sms': {
              // Audit-3 Fix A (2026-06-01)
              const to = act.data.to as string | undefined
              const message = act.data.message as string | undefined
              if (!to || !message) {
                results.push({ id: act.id, type: 'sms', ok: false, error: 'no to/message' })
                break
              }
              const r = await sendSms({
                to,
                message,
                customerId: (act.data.customer_id as string | undefined) || null,
                messageType: 'autopilot_customer_sms',
                purpose: 'transactional',
              })
              results.push({ id: act.id, type: 'sms', ok: r.sms_sent, error: r.error })
              break
            }

            case 'material_list': {
              const materials = act.data.materials as any[]
              if (materials?.length > 0 && act.data.project_id) {
                for (const mat of materials) {
                  await supabase.from('project_material').insert({
                    material_id: 'mat_' + Math.random().toString(36).substr(2, 9),
                    project_id: act.data.project_id,
                    business_id: businessId,
                    name: mat.name,
                    quantity: mat.quantity,
                    unit: mat.unit,
                    purchase_price: mat.unit_price || 0,
                  })
                }
              }
              results.push({ id: act.id, type: 'materials', ok: true, count: materials?.length || 0 })
              break
            }

            default:
              results.push({ id: act.id, type: act.type, skipped: 'unknown action type' })
          }
        }

        // Utfalls-hårdning: paketet hade tidigare inget aggregerat ok/error-
        // fält — även om ALLA sub-actions misslyckades klassades hela
        // approval-raden som 'success' (results-arrayen fångades aldrig av
        // classifyExecutionResult). Speglar sub-resultatens ok-fält uppåt.
        const anyFailed = results.some((r) => r.ok === false)
        return {
          action: 'autopilot_package',
          results,
          ok: !anyFailed,
          error: anyFailed ? 'En eller flera delåtgärder i paketet misslyckades' : undefined,
        }
      }

      case 'dispatch_suggestion': {
        const supabaseDispatch = (await import('@/lib/supabase')).getServerSupabase()
        const plDispatch = payload as any
        const memberId = plDispatch.member_id
        const memberName = plDispatch.member_name
        const ctxType = plDispatch.context_type
        const ctxId = plDispatch.context_id

        // "Visa varför"-utrullning, Fall 4 (docs/design/SYNLIG-INTELLIGENS.md,
        // 2026-08-13): sparar ÖGONBLICKSBESLUTET — vem som var bäst lämpad
        // NÄR tilldelningen gjordes. Kan inte räknas om senare (poäng/
        // tillgänglighet ändras), måste alltså sparas här, inte härledas
        // live som Guardian gör. v130_dispatch_reasoning.sql.
        const dispatchReasoning = {
          reasons: plDispatch.reasons,
          score: plDispatch.score,
          alternatives: plDispatch.alternatives,
          week_utilization_pct: plDispatch.week_utilization_pct,
          certificates: plDispatch.certificates,
        }

        if (ctxType === 'booking' && ctxId) {
          await supabaseDispatch.from('booking').update({
            assigned_to: memberName,
            assigned_user_id: memberId,
            dispatch_reasoning: dispatchReasoning,
          }).eq('booking_id', ctxId)
        } else if (ctxType === 'work_order' && ctxId) {
          await supabaseDispatch.from('work_orders').update({
            assigned_to: memberName,
            dispatch_reasoning: dispatchReasoning,
          }).eq('id', ctxId)
        }

        return { action: 'dispatch_suggestion', assigned: memberName, context_type: ctxType }
      }

      case 'time_attestation': {
        const supabaseTime = (await import('@/lib/supabase')).getServerSupabase()
        const plTime = payload as any
        if (!plTime.checkin_id) return { action: 'time_attestation', skipped: 'no checkin_id' }

        // Approve the checkin via the approve API logic
        const minutes = plTime.duration_minutes || 0
        await supabaseTime.from('time_checkins').update({
          status: 'approved',
          approved_by: 'via godkännanden',
          approved_at: new Date().toISOString(),
          duration_minutes: minutes,
        }).eq('id', plTime.checkin_id)

        // Etapp 1 Tier A (multi-employee-parity-plan.md): payload.user_id är
        // checkin.user_id, dvs auth-UUID:n för den anställda vars tid det
        // gäller (INTE nödvändigtvis den som klickar Godkänn här) — matcha
        // mot business_users.user_id, samma mönster som checkin/approve.
        let timeAttestationBusinessUserId: string | null = null
        if (plTime.user_id) {
          const { data: attestedBusinessUser } = await supabaseTime
            .from('business_users')
            .select('id')
            .eq('user_id', plTime.user_id)
            .eq('business_id', businessId)
            .maybeSingle()
          timeAttestationBusinessUserId = attestedBusinessUser?.id ?? null
        }

        // Create time_entry. approval_status sätts explicit till 'approved'
        // — hantverkaren klickade just Godkänn på DET HÄR kortet, så raden
        // ska inte falla på DB-defaulten 'pending' och landa i "Att
        // attestera" igen (samma bugg och samma fix som app/api/checkin/
        // approve/route.ts redan gör, och som blockerade BillableView.tsx
        // från att räkna dessa timmar som fakturerbara). Funktionen har
        // ingen currentUser i scope — businessId som approved_by speglar
        // checkin/approve-mönstret.
        const entryId = 'te_' + Math.random().toString(36).substr(2, 9)
        await supabaseTime.from('time_entry').insert({
          time_entry_id: entryId,
          business_id: businessId,
          business_user_id: timeAttestationBusinessUserId,
          project_id: plTime.project_id || null,
          description: `Incheckning ${plTime.checked_in_at ? new Date(plTime.checked_in_at).toLocaleDateString('sv-SE') : ''}${plTime.project_name ? ' · ' + plTime.project_name : ''}`,
          duration_minutes: minutes,
          work_date: plTime.checked_in_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          is_billable: true,
          approval_status: 'approved',
          approved_by: businessId,
          approved_at: new Date().toISOString(),
        })

        return { action: 'time_attestation', time_entry_id: entryId, minutes }
      }

      case 'seasonal_campaign': {
        const supabase = (await import('@/lib/supabase')).getServerSupabase()
        const pl = payload as any
        const smsText = pl.sms_text || ''
        const customers = pl.customers || []

        if (customers.length === 0 || !smsText) {
          return { action: 'seasonal_campaign', skipped: 'no customers or sms text' }
        }

        // Skapa sms_campaign
        const campaignId = 'camp_' + Math.random().toString(36).substr(2, 9)
        await supabase.from('sms_campaign').insert({
          campaign_id: campaignId,
          business_id: businessId,
          name: `Säsong: ${pl.theme || pl.month_name}`,
          message: smsText,
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
          recipient_count: customers.length,
          campaign_type: 'broadcast',
        })

        // Skapa mottagare
        const recipients = customers.map((c: any) => ({
          campaign_id: campaignId,
          customer_id: c.customer_id,
          phone_number: c.phone_number,
          status: 'pending',
        }))
        await supabase.from('sms_campaign_recipient').insert(recipients)

        // Uppdatera seasonal_campaigns status
        if (pl.month && pl.year) {
          await supabase
            .from('seasonal_campaigns')
            .update({ status: 'approved' })
            .eq('business_id', businessId)
            .eq('year', pl.year)
            .eq('month', pl.month)
        }

        return { action: 'seasonal_campaign', campaign_id: campaignId, recipients: customers.length }
      }

      case 'meeting_followup': {
        // Meeting Intelligence Epic 2 (2026-08-11): mötesanalysens
        // uppföljningsfynd blir en task-rad NÄR hantverkaren godkänner
        // kortet — den explicita, granskningsbara formen som trär rådets
        // Promise Ledger-gate. Evidenscitatet följer med i beskrivningen
        // så tasken bär sitt eget "varför".
        const pl = payload as any
        if (!pl.title) {
          return { action: 'meeting_followup', ok: false, error: 'Kortet saknar titel.' }
        }
        const supabaseMF = await getSupabase()
        const beskrivning = [
          pl.description || null,
          pl.source_text ? `Ur mötet: "${pl.source_text}"` : null,
        ].filter(Boolean).join('\n\n')

        const { data: task, error: taskErr } = await supabaseMF
          .from('task')
          .insert({
            business_id: businessId,
            title: pl.title,
            description: beskrivning || null,
            status: 'pending',
            priority: pl.priority === 'urgent' || pl.priority === 'high' ? 'high' : 'medium',
            due_date: pl.due_date || null,
            customer_id: pl.customer_id || null,
            // null, inte en fejkad användare — visibility 'team' gör den
            // synlig för alla; private-filtret jämför created_by mot userId.
            created_by: null,
            visibility: 'team',
          })
          .select('id, title')
          .single()

        if (taskErr || !task) {
          return { action: 'meeting_followup', ok: false, error: taskErr?.message || 'Kunde inte skapa uppgiften.' }
        }
        return { action: 'meeting_followup', task_id: task.id, title: task.title }
      }

      case 'customer_fact': {
        // Customer Facts V1 (2026-08-12): säg-det-en-gång-minnet. Godkännande
        // skriver EN rad i customer_fact — samma mönster som meeting_followup
        // ovan, fältlokal skrivning. Tabellen skapas av sql/v122 (körs
        // senare av Andreas) — misslyckas inserten (t.ex. tabellen saknas
        // ännu) failar caset stängt med ett svenskt fel, aldrig en krasch.
        const pl = payload as any
        if (!pl.customer_id || !pl.content) {
          return { action: 'customer_fact', ok: false, error: 'Kortet saknar kund eller innehåll.' }
        }
        const factType = pl.fact_type || 'preference'
        const supabaseCF = await getSupabase()

        // Promise-to-Proof (Etapp N, 2026-08-17, sql/v147_promise_dates.sql):
        // bara ett BEKRÄFTAT commitment med ett giltigt datum blir ett
        // bevakat löfte — rådets breda "Promise Ledger" avvisades
        // (ACTIVE_ROADMAP.md:508, grinden vid :1029: aldrig ur rå
        // AI-extraktion). Det är DETTA klick — godkännandet — som aktiverar
        // bevakningen, aldrig extraktionens förslag på egen hand. Validerat
        // defensivt igen här (kortets payload är inte en trovärdig källa i
        // sig, samma princip som normalizeDueDateIso-anropet vid kortbygget).
        const promiseDueAt = factType === 'commitment' ? normalizeDueDateIso(pl.due_date_iso) : null

        const factInsert: Record<string, unknown> = {
          business_id: businessId,
          customer_id: pl.customer_id,
          fact_type: factType,
          content: pl.content,
          // Kanal härledd ur payloaden (Customer Memory V1.1, 2026-08-16):
          // e-postfakta bär email_conversation_id, tal-fakta (möte/telefon)
          // bär recording_id. Hårdkodningen 'meeting' gav e-postfakta fel
          // käll-etikett. Ingen CHECK på kolumnen (v122) — fri TEXT.
          source_type: pl.email_conversation_id ? 'email' : 'meeting',
          source_id: pl.recording_id ?? pl.email_conversation_id ?? null,
          evidence_quote: pl.evidence_quote ?? null,
          confidence: pl.confidence ?? null,
          confirmed_at: new Date().toISOString(),
        }
        // Samma insert-form som innan v147 för VARJE faktum utan datum —
        // bara ett daterat commitment får de nya kolumnerna alls, så ett
        // vanligt kundfaktum aldrig ens FÖRSÖKER skriva dem i en omigrerad
        // miljö (samma avvägning som Etapp F:s mission-insert).
        if (promiseDueAt) {
          factInsert.due_at = promiseDueAt
          factInsert.promise_status = 'open'
        }

        let { data: fact, error: factErr } = await supabaseCF
          .from('customer_fact')
          .insert(factInsert)
          .select('id')
          .single()

        // Fail-soft: v147-kolumnerna (due_at/promise_status) saknas ännu i
        // den här miljön — kör om UTAN dem i stället för att fälla hela
        // bekräftelsen. Ett kundfaktum måste gå att spara även om
        // löftesbevakningen inte är påkopplad än.
        if (
          factErr &&
          promiseDueAt &&
          (factErr.code === '42703' || /column .* does not exist|schema cache/i.test(factErr.message || ''))
        ) {
          delete factInsert.due_at
          delete factInsert.promise_status
          const retry = await supabaseCF.from('customer_fact').insert(factInsert).select('id').single()
          fact = retry.data
          factErr = retry.error
        }

        if (factErr || !fact) {
          console.error('[approvals/customer_fact] kunde inte spara faktumet:', factErr?.message)
          return { action: 'customer_fact', ok: false, error: 'Kunde inte spara — försök igen om en stund' }
        }

        // Supersede-regeln (PRELAUNCH_WAVE kandidat 5, 2026-08-12): "contact"
        // och "commitment" är typer där det senaste naturligt vinner (nytt
        // telefonnummer ersätter gammalt, nytt löfte ersätter gammalt) — där
        // markeras tidigare aktiva fakta av SAMMA kund+typ som ersatta av
        // den nya raden. "preference"/"constraint" behåller alla aktiva —
        // en kund kan vilja ha både ek OCH halkfritt golv samtidigt, och vi
        // kan inte avgöra motsägelse automatiskt utan en AI-gissning.
        // Egen try/catch: en trasig supersede får aldrig fälla ett redan
        // sparat och godkänt faktum.
        if (factType === 'contact' || factType === 'commitment') {
          try {
            const { error: supersedeErr } = await supabaseCF
              .from('customer_fact')
              .update({ superseded_by: fact.id })
              .eq('business_id', businessId)
              .eq('customer_id', pl.customer_id)
              .eq('fact_type', factType)
              .is('superseded_by', null)
              .neq('id', fact.id)
            if (supersedeErr) {
              console.error('[approvals/customer_fact] supersede misslyckades (icke-blockerande):', supersedeErr.message)
              await rapporteraTystFel(supabaseCF, businessId, 'approvals/customer_fact:supersede', supersedeErr.message, {
                factId: fact.id,
                customerId: pl.customer_id,
                factType,
              })
            }
          } catch (supersedeCatchErr: any) {
            console.error(
              '[approvals/customer_fact] supersede kastade (icke-blockerande):',
              supersedeCatchErr?.message || supersedeCatchErr,
            )
            await rapporteraTystFel(
              supabaseCF,
              businessId,
              'approvals/customer_fact:supersede-unexpected',
              supersedeCatchErr?.message ? String(supersedeCatchErr.message) : String(supersedeCatchErr),
              { factId: fact.id, customerId: pl.customer_id, factType },
            )
          }
        }

        return { action: 'customer_fact', ok: true, fact_id: fact.id }
      }

      case 'agent_memory_confirmation': {
        // Agentminnets härdning (Etapp U, 2026-08-18, sql/v149_agent_
        // memory_hardening.sql): kortet representerar EN redan sparad
        // agent_memories-rad (skriven unbekräftad vid extraktion, se
        // lib/agents/memory.ts saveExtractedMemory). Godkännande sätter
        // BARA confirmed_at på den raden — ingen ny rad, ingen gissning.
        // Samma fältlokala, tenant-scopade mönster som case 'customer_fact'
        // ovan.
        const pl = payload as any
        if (!pl.memory_id) {
          return { action: 'agent_memory_confirmation', ok: false, error: 'Kortet saknar minnes-id.' }
        }
        const supabaseAM = await getSupabase()
        const { data: mem, error: memErr } = await supabaseAM
          .from('agent_memories')
          .update({ confirmed_at: new Date().toISOString() })
          .eq('id', pl.memory_id)
          .eq('business_id', businessId)
          .select('id')
          .single()

        if (memErr || !mem) {
          console.error('[approvals/agent_memory_confirmation] kunde inte bekräfta minnet:', memErr?.message)
          return { action: 'agent_memory_confirmation', ok: false, error: 'Kunde inte bekräfta — försök igen om en stund' }
        }
        return { action: 'agent_memory_confirmation', ok: true, memory_id: mem.id }
      }

      case 'proactive_care': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'proactive_care', skipped: 'no phone or message' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.customer_phone,
          message: pl.suggested_sms,
          customerId: pl.customer_id || null,
          relatedId: pl.project_id || null,
          messageType: 'proactive_care',
          purpose: 'proactive',
        })

        // Logga i v3_automation_logs
        const supabasePC = await getSupabase()
        await supabasePC.from('v3_automation_logs').insert({
          business_id: businessId,
          // Attribuera till agenten som föreslog (Hanna proaktiv säljmotor) så
          // den syns i per-agent-scoreboardet; null för icke-agent-flöden.
          agent_id: pl.agent || null,
          rule_name: 'proactive_customer_care',
          trigger_type: 'approval_executed',
          action_type: 'send_sms',
          // VP2 (gap 1): kolumnen fanns sedan sql/v3_automation_logs.sql men
          // fylldes aldrig — utan den kan inget utfall attribueras till kortet.
          approval_id: approvalId,
          status: r.sms_sent ? 'success' : 'failed',
          context: {
            customer_id: pl.customer_id,
            customer_name: pl.customer_name,
            project_id: pl.project_id,
            job_type: pl.job_type,
            suggested_service: pl.suggested_service,
          },
        })

        return {
          action: 'proactive_care',
          sms_sent: r.sms_sent,
          error: r.error,
          customer: pl.customer_name,
          suggested_service: pl.suggested_service,
        }
      }

      case 'warranty_followup': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'warranty_followup', skipped: 'no phone or message' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.customer_phone,
          message: pl.suggested_sms,
          customerId: pl.customer_id || null,
          relatedId: pl.project_id || null,
          messageType: 'warranty_followup',
          purpose: 'proactive',
        })

        // Sanering 2026-08-05: skrev till "automation_logs" som inte finns
        // (heter v3_automation_logs) med kolumner (input/output) som inte
        // heller finns — exekveringsloggen försvann tyst. Nu samma form som
        // proactive_care-caset ovan, inkl. approval_id (VP2-attribution).
        const supabaseW = await getSupabase()
        const { error: wLogErr } = await supabaseW.from('v3_automation_logs').insert({
          business_id: businessId,
          agent_id: pl.agent || null,
          rule_name: 'warranty_followup',
          trigger_type: 'approval_executed',
          action_type: 'send_sms',
          approval_id: approvalId,
          status: r.sms_sent ? 'success' : 'failed',
          error_message: r.sms_sent ? null : (r.error || null),
          context: { project_id: pl.project_id, customer_id: pl.customer_id, customer_name: pl.customer_name },
        })
        if (wLogErr) {
          console.warn('[approvals/warranty_followup] v3-logg insert misslyckades (icke-blockerande):', wLogErr.message)
        }

        return { action: 'warranty_followup', sms_sent: r.sms_sent, error: r.error, customer: pl.customer_name }
      }

      case 'job_report': {
        const { approveJobReport } = await import('@/lib/job-report')
        const reportPayload = payload as any
        const result = await approveJobReport(businessId, reportPayload.projectId || '', reportPayload)
        return { action: 'job_report', ...result }
      }

      // ── V33 Matte approval types ──────────────────────────

      case 'propose_booking_times':
      case 'reschedule_request':
      case 'new_booking_request': {
        const pl = payload as any
        const message = pl.customer_reply_pending
          || (pl.available_slots?.length
            ? `Hej! Vi kan komma:\n${(pl.available_slots as any[]).map((s: any, i: number) => `${i + 1}. ${s.label}`).join('\n')}\nVilket passar bäst?`
            : null)

        if (!message || !pl.entity?.phone) {
          return { action: 'propose_booking_times', skipped: 'no message or phone' }
        }

        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message,
          customerId: pl.entity?.customerId || null,
          messageType: approval_type,
          purpose: 'conversational',
        })
        return {
          action: 'propose_booking_times',
          sms_sent: r.sms_sent,
          error: r.error,
          slots_count: pl.available_slots?.length || 0,
        }
      }

      case 'create_quote_draft':
      case 'quote_request':
      case 'quote_addition': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
        const pl = payload as any
        const textDescription = pl.description || pl.job_description || pl.customer_reply_pending

        // ═══ ETAPP B4 (2026-08-06): GODKÄNNANDET SPARAR DET HANTVERKAREN SÅG ═══
        //
        // Tidigare kördes ALLTID en ny AI-generering här, på samma fritext som
        // förslagsmotorn redan genererat ifrån. Hantverkaren såg alltså rader
        // och summa från generering A i kortet, tryckte Godkänn, och fick
        // generering B sparad — andra rader, andra priser, ibland en annan
        // ROT/RUT-typ. Kortets rubrik kom från A, offerten från B.
        //
        // Nu materialiseras `payload.preview` när den finns. Omgenerering är
        // kvar som RESERV för de kort som aldrig bär ett genererat resultat:
        // matte-korten (quote_request/quote_addition) och äldre kort som redan
        // låg i kön när det här deployades.
        const preview = pl.preview
        const previewUsable =
          preview && Array.isArray(preview.items) && preview.items.length > 0

        let generated: any
        if (previewUsable) {
          generated = {
            jobTitle: preview.job_title,
            jobDescription: preview.job_description ?? '',
            items: preview.items,
            options: Array.isArray(preview.options) ? preview.options : [],
            suggestedDeductionType: preview.suggested_deduction_type ?? 'none',
            confidence: preview.confidence,
          }
        } else {
          const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
            method: 'POST',
            headers: forwardHeaders(),
            body: JSON.stringify({
              textDescription,
              customerId: pl.entity?.customerId,
              businessId,
            }),
          })
          const r = await classifyResponse(res)
          if (!r.ok) {
            return { action: 'create_quote_draft', ...r }
          }

          // 2026-08-04 ("kritisk söm"-fixen): ai-generate returnerar bara ett
          // GENERERAT offertobjekt — sparar ingenting. Utan denna persistering
          // godkände hantverkaren kortet och INGET utkast skapades. Bygger
          // strukturerade quote_items (samma semantik som klientens
          // convertLegacyItems, se lib/quotes/generated-to-quote-items.ts) och
          // POSTar till POST /api/quotes så offerten faktiskt sparas.
          generated = (r.metadata as any)?.quote
          if (!generated) {
            return { action: 'create_quote_draft', ok: false, error: 'AI-genereringen gav inget offertunderlag.' }
          }
        }

        const quoteItems = generatedQuoteToQuoteItems(
          generated.items,
          generated.options,
          generated.suggestedDeductionType,
        )
        if (quoteItems.length === 0) {
          return { action: 'create_quote_draft', ok: false, error: 'AI-genereringen gav inga rader att spara.' }
        }

        const leadId = pl.lead_id || pl.entity?.leadId || undefined

        const createRes = await fetch(`${appUrl}/api/quotes`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            customer_id: pl.entity?.customerId || null,
            title: generated.jobTitle || 'Offert',
            description: generated.jobDescription || '',
            quote_items: quoteItems,
            rot_rut_type:
              generated.suggestedDeductionType && generated.suggestedDeductionType !== 'none'
                ? generated.suggestedDeductionType
                : null,
            ai_generated: true,
            ai_confidence: generated.confidence ?? null,
            source_transcript: textDescription || null,
            // B3: AI:ns förslag på vad som inte ingår följer med in i utkastet.
            // Hantverkaren ser dem i redigeraren och kan stryka det som inte
            // stämmer — men slipper börja från ett tomt fält, vilket är det
            // enskilda villkorsfält piloten oftast glömmer.
            ...(Array.isArray(preview?.not_included_suggestions) && preview.not_included_suggestions.length > 0
              ? { not_included: preview.not_included_suggestions.join('\n') }
              : {}),
            ...(leadId ? { lead_id: leadId } : {}),
            ...(pl.deal_id ? { deal_id: pl.deal_id } : {}),
          }),
        })
        const createR = await classifyResponse(createRes)
        if (!createR.ok) {
          // Ai-generate lyckades men sparandet failade — misslyckande, aldrig
          // en tyst success (godkännandet får inte se ut som att offerten
          // skapades när den inte gjorde det).
          return { action: 'create_quote_draft', ...createR }
        }

        const savedQuote = (createR.metadata as any)?.quote
        return {
          action: 'create_quote_draft',
          ok: true,
          quote_id: savedQuote?.quote_id,
          quote_number: savedQuote?.quote_number,
          total: savedQuote?.total,
        }
      }

      case 'create_ata_draft': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
        const pl = payload as any
        const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            textDescription: `ÄTA-tillägg: ${pl.description || ''}`,
            customerId: pl.entity?.customerId,
            businessId,
          }),
        })
        const r = await classifyResponse(res)
        if (!r.ok) {
          return { action: 'create_ata_draft', ...r }
        }

        // 2026-08-04 ("kritisk söm"-fixen): samma persistering som
        // create_quote_draft ovan — ai-generate returnerar bara ett
        // GENERERAT offertobjekt, sparar ingenting.
        const generated = (r.metadata as any)?.quote
        if (!generated) {
          return { action: 'create_ata_draft', ok: false, error: 'AI-genereringen gav inget ÄTA-underlag.' }
        }

        const quoteItems = generatedQuoteToQuoteItems(
          generated.items,
          generated.options,
          generated.suggestedDeductionType,
        )
        if (quoteItems.length === 0) {
          return { action: 'create_ata_draft', ok: false, error: 'AI-genereringen gav inga rader att spara.' }
        }

        // ═══ SISTA MILEN STÄNGD (Epic 2, 2026-08-11) ═══
        //
        // Tidigare skapade det här caset ALLTID en offert rubricerad "ÄTA"
        // — aldrig en project_change-rad — eftersom quotes saknar project_id
        // och kopplingen bara blev textuell. Nu: har kortet ett project_id
        // skapas en RIKTIG ÄTA (POST /api/ata → project_change i draft-läge,
        // full livscykel med kundsignering). Offertvägen finns kvar ENBART
        // som reserv när projekt saknas (t.ex. mötesfynd före projektstart).
        if (pl.project_id) {
          const ataItems = quoteItems.map((qi: any) => ({
            description: qi.description || qi.name || 'Arbete',
            quantity: qi.quantity ?? 1,
            unit: qi.unit || 'st',
            unit_price: qi.unit_price ?? qi.price ?? 0,
          }))
          const ataRes = await fetch(`${appUrl}/api/ata`, {
            method: 'POST',
            headers: forwardHeaders(),
            body: JSON.stringify({
              projectId: pl.project_id,
              changeType: 'addition',
              description: generated.jobDescription || pl.description || 'ÄTA-tillägg',
              items: ataItems,
              customerId: pl.entity?.customerId || null,
              notes: pl.source_text ? `Ur mötet/samtalet: "${pl.source_text}"` : null,
            }),
          })
          const ataR = await classifyResponse(ataRes)
          if (!ataR.ok) {
            return { action: 'create_ata_draft', ...ataR }
          }
          const ata = (ataR.metadata as any)?.ata
          // Rotorsaksfix (2026-08-12): project_change har ingen `id`-kolumn
          // — dess PK är `change_id` (sql/projects.sql rad 71). `ata?.id`
          // var därför ALLTID undefined och ata_id försvann tyst redan i
          // HTTP-svaret, långt innan persist-frågan ens uppstod. Utan denna
          // fix kan ÄTA→faktura-kedjan aldrig direktattribueras.
          return {
            action: 'create_ata_draft',
            ok: true,
            ata_id: ata?.change_id,
            project_id: pl.project_id,
            total: ata?.total,
          }
        }

        // Reservvägen (inget projekt): offert rubricerad ÄTA, som tidigare.
        let projectLabel: string | null = null
        let fallbackCustomerId: string | null = null

        const description = [
          generated.jobDescription || '',
          projectLabel ? `(ÄTA för ${projectLabel})` : null,
        ]
          .filter(Boolean)
          .join('\n\n')

        const createRes = await fetch(`${appUrl}/api/quotes`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            customer_id: pl.entity?.customerId || fallbackCustomerId || null,
            title: `ÄTA: ${generated.jobTitle || 'Tilläggsarbete'}`,
            description,
            quote_items: quoteItems,
            rot_rut_type:
              generated.suggestedDeductionType && generated.suggestedDeductionType !== 'none'
                ? generated.suggestedDeductionType
                : null,
            ai_generated: true,
            ai_confidence: generated.confidence ?? null,
            source_transcript: pl.description || null,
          }),
        })
        const createR = await classifyResponse(createRes)
        if (!createR.ok) {
          return { action: 'create_ata_draft', ...createR }
        }

        const savedQuote = (createR.metadata as any)?.quote
        return {
          action: 'create_ata_draft',
          ok: true,
          quote_id: savedQuote?.quote_id,
          quote_number: savedQuote?.quote_number,
          total: savedQuote?.total,
          project_link_limitation: 'quotes saknar project_id — kopplingen är endast textuell i beskrivningen',
        }
      }

      case 'send_matte_customer_reply': {
        const pl = payload as any
        const msg = pl.customer_reply_pending || pl.message
        if (!msg || !pl.entity?.phone) {
          return { action: 'send_matte_customer_reply', skipped: 'no message or phone' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message: msg,
          customerId: pl.entity?.customerId || null,
          messageType: 'matte_customer_reply',
          purpose: 'conversational',
        })
        return { action: 'send_matte_customer_reply', sms_sent: r.sms_sent, error: r.error }
      }

      case 'low_stock_alert': {
        return { action: 'low_stock_alert', acknowledged: true }
      }

      /**
       * Kundens fråga om en offert (idé 5). Kortet är en NOTIS, inte en
       * åtgärd — hantverkaren ringer eller skriver själv. Godkännandet
       * betyder "jag har sett och tagit hand om den".
       *
       * Har hantverkaren skrivit ett svar i redigeringsläget skickas det som
       * SMS. Utan svarstext görs ingenting mer än kvitteringen — vi hittar
       * aldrig på ett svar åt honom.
       */
      /**
       * Hantverkarens svar på ett kundmeddelande — både offertfrågor och
       * vanliga portalmeddelanden.
       *
       * Svaret skrivs i kundens portaltråd (där hela samtalet bor) och kunden
       * får ett kort SMS som drar tillbaka hen dit. Tidigare skickades hela
       * svaret som SMS, vilket splittrade samtalet: frågan i portalen, svaret
       * i telefonen, utan sammanhang.
       *
       * Texten kommer ur `payload.message` — den förifyllda mallen som
       * hantverkaren skrivit klart i "Redigera"-rutan. Är den orörd (bara
       * mallen) skickas inget; vi hittar aldrig på ett svar åt honom.
       */
      case 'customer_quote_question':
      case 'customer_message': {
        const pl = payload as any
        const reply = typeof pl.message === 'string' ? pl.message.trim() : ''
        const { buildReplyDraft } = await import('@/lib/portal/customer-thread')
        const untouchedDraft = buildReplyDraft(pl.customer_name || '').trim()
        const isUnansweredDraft = !reply || reply === untouchedDraft

        if (isUnansweredDraft || !pl.customer_id) {
          return {
            action: approval_type,
            acknowledged: true,
            customer: pl.customer_name || null,
            question: pl.question || null,
          }
        }

        const supabaseMsg = await getSupabase()
        const { sendCustomerReply, buildReplyNotificationSms } = await import('@/lib/portal/customer-thread')
        const written = await sendCustomerReply(supabaseMsg, {
          businessId,
          customerId: pl.customer_id,
          message: reply,
        })

        if (!written) {
          return { action: approval_type, error: 'Svaret kunde inte sparas i kundens tråd' }
        }

        // Avisering: kort SMS med portallänken. Går via sendSms-closuren så
        // VP1:s kvot och opt-out gäller — en kund som sagt STOPP får inget.
        let smsSent = false
        let smsError: string | undefined
        if (pl.customer_phone) {
          try {
            const { getOrCreatePortalLink } = await import('@/lib/portal-link')
            const portalUrl = await getOrCreatePortalLink(supabaseMsg, pl.customer_id, 'messages')
            if (portalUrl) {
              const r = await sendSms({
                to: pl.customer_phone,
                message: buildReplyNotificationSms(await getBusinessName(), portalUrl),
                customerId: pl.customer_id,
                relatedId: pl.quote_id || null,
                messageType: 'portal_reply_notice',
                purpose: 'conversational',
              })
              smsSent = r.sms_sent
              smsError = r.error
            }
          } catch (err: any) {
            smsError = err?.message || 'avisering misslyckades'
          }
        }

        return {
          action: approval_type,
          reply_saved: true,
          sms_sent: smsSent,
          error: smsError,
          customer: pl.customer_name || null,
        }
      }

      case 'four_eyes_quote': {
        const pl = payload as any
        if (!pl.quote_id) return { action: 'four_eyes_quote', skipped: 'no quote_id' }

        const supabase4e = (await import('@/lib/supabase')).getServerSupabase()

        // Återställ till draft — skaparen kan nu skicka
        await supabase4e
          .from('quotes')
          .update({ status: 'draft' })
          .eq('quote_id', pl.quote_id)

        // Etapp 4 (multi-employee-parity-plan.md): denna push är riktad
        // till SKAPAREN specifikt ("Offert godkänd" — du kan nu skicka den),
        // inte en generell businessnotis. pl.requested_by_user_id är
        // business_users.id (satt av app/api/quotes/send/route.ts, se
        // lib/approvals/routing.ts) — INTE en auth-uuid, så vi måste slå
        // upp business_users.user_id innan vi skickar target_user_id till
        // /api/push/send (som förväntar sig auth-uuid, matchande
        // push_subscriptions.user_id). ALDRIG business.user_id/
        // getAuthenticatedBusiness().user_id här — det är alltid ägarens
        // uuid, inte skaparens, se lib/auth.ts. Om uppslaget saknas eller
        // missar faller vi tillbaka till oförändrat businessblast (som
        // innan denna etapp).
        let targetUserId: string | null = null
        if (pl.requested_by_user_id) {
          const { data: requester, error: requesterErr } = await supabase4e
            .from('business_users')
            .select('user_id')
            .eq('id', pl.requested_by_user_id)
            .maybeSingle()

          if (requesterErr) {
            console.error('[four_eyes_quote/push] business_users-uppslag misslyckades:', requesterErr)
          } else if (requester?.user_id) {
            targetUserId = requester.user_id
          }
        }

        // Push-notis till skaparen. Fire-and-forget — fördröjer inte
        // approval-response, men loggar fel så vi kan upptäcka push-issues
        // (TD: bygg push-fail-monitoring-cron eller Sentry-integration).
        // Audit-4 Fix H (2026-06-02): ersatte `.catch(() => {})` med loggat
        // catch. /api/push/send har ingen auth-check, så cookie-forwarding
        // behövs ej här.
        fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: internalPushHeaders(),
          body: JSON.stringify({
            business_id: businessId,
            title: 'Offert godkänd',
            body: `Din offert på ${(pl.quote_total || 0).toLocaleString('sv-SE')} kr har godkänts — du kan nu skicka den`,
            url: `/dashboard/quotes/${pl.quote_id}`,
            ...(targetUserId ? { target_user_id: targetUserId } : {}),
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const errText = await r.text().catch(() => '<unparsable>')
              console.error(`[four_eyes_quote/push] HTTP ${r.status} from /api/push/send:`, errText)
            }
          })
          .catch((err) => {
            console.error('[four_eyes_quote/push] fetch failed:', err)
          })

        return { action: 'four_eyes_quote', ok: true, quote_id: pl.quote_id }
      }

      case 'propose_site_visit': {
        const pl = payload as any
        if (!pl.entity?.phone) return { action: 'propose_site_visit', skipped: 'no phone' }

        // Hämta lediga tider
        let slotsText = ''
        try {
          const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')
          const slots = await getAvailableSlots(businessId, 1)
          if (slots.length > 0) {
            slotsText = slots.map((s: any, i: number) => `${i + 1}) ${s.label}`).join('\n')
          }
        } catch { /* no calendar */ }

        const message = slotsText
          ? `${halsning(pl.entity?.customerName)} Vi skulle gärna komma och titta på jobbet. Passar någon av dessa tider?\n${slotsText}\nSvara med 1, 2 eller 3. //${pl.businessName || ''}`
          : pl.customer_reply_pending || `Hej! Vi vill gärna boka in ett platsbesök. Vilken tid passar dig? //${pl.businessName || ''}`

        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message,
          customerId: pl.entity?.customerId || null,
          messageType: 'propose_site_visit',
          purpose: 'conversational',
        })
        return { action: 'propose_site_visit', sms_sent: r.sms_sent, error: r.error }
      }

      case 'four_eyes_project_close': {
        const pl = payload as any
        if (!pl.project_id) return { action: 'four_eyes_project_close', skipped: 'no project_id' }

        const supabase4p = (await import('@/lib/supabase')).getServerSupabase()
        const closeout = await completeProject({
          supabase: supabase4p,
          businessId,
          projectId: pl.project_id,
          authorization: { kind: 'approved', approvalId: approval.id },
        })

        return {
          action: 'four_eyes_project_close',
          ok: closeout.ok && closeout.completed,
          error: closeout.ok ? undefined : closeout.error,
          project_id: pl.project_id,
          invoice_id: closeout.invoice_created?.invoice_id,
          total: closeout.invoice_created?.total,
          closeout,
          warnings: closeout.warnings,
        }
      }

      case 'price_adjustment': {
        // BUGFIX (2026-08-25, Codex-granskningens fynd 1, källverifierat):
        // producenten (lib/agent/price-analysis.ts, nattliga agentkörningen)
        // skickar `price_list_id` + `suggested_rate` och läser/föreslår mot
        // price_lists_v2.hourly_rate_normal — men caset här krävde
        // `item_id` + `suggested_price` och skrev till LEGACY-tabellen
        // price_list (0 rader i prod). Varje godkännande av ett riktigt
        // prisjusteringskort blev alltså ett tyst 'skipped' — användaren
        // godkände "Ändra pris" och inget pris ändrades, någonsin.
        const pl = payload as any
        const supabasePa = (await import('@/lib/supabase')).getServerSupabase()

        // Producentens verkliga kontrakt: timpriset på prislistan (v2).
        if (pl.price_list_id && pl.suggested_rate) {
          const { data: updatedPl, error: rateUpdateError } = await supabasePa
            .from('price_lists_v2')
            .update({ hourly_rate_normal: pl.suggested_rate, updated_at: new Date().toISOString() })
            .eq('id', pl.price_list_id)
            .eq('business_id', businessId)
            .select('id')
          if (rateUpdateError) {
            return { action: 'price_adjustment', ok: false, error: rateUpdateError.message }
          }
          if (!updatedPl || updatedPl.length === 0) {
            // Prislistan kan ha raderats sedan kortet skapades — ärligt fel,
            // inte tyst success.
            return { action: 'price_adjustment', ok: false, error: 'Prislistan hittades inte (kan ha tagits bort sedan förslaget skapades)' }
          }
          return { action: 'price_adjustment', ok: true, price_list_id: pl.price_list_id, new_rate: pl.suggested_rate }
        }

        // Legacy-form (item_id + suggested_price mot price_list) — behållen
        // för eventuella gamla pending-kort, men ingen nuvarande producent
        // skapar den formen.
        if (pl.item_id && pl.suggested_price) {
          const { error: priceUpdateError } = await supabasePa.from('price_list').update({
            unit_price: pl.suggested_price,
          }).eq('id', pl.item_id).eq('business_id', businessId)
          if (priceUpdateError) {
            return { action: 'price_adjustment', ok: false, error: priceUpdateError.message }
          }
          return { action: 'price_adjustment', ok: true }
        }

        // Utfalls-hårdning: dolt no-op får aldrig klassas som success.
        return { action: 'price_adjustment', skipped: 'payload saknar price_list_id/suggested_rate (och legacy item_id/suggested_price)' }
      }

      case 'profitability_warning': {
        // Godkänn = bekräfta att hantverkaren är medveten
        return { action: 'profitability_warning', acknowledged: true }
      }

      case 'customer_reactivation': {
        const pl = payload as any
        if (pl.customer_phone && pl.suggested_sms) {
          // Audit-3 Fix A (2026-06-01)
          const r = await sendSms({
            to: pl.customer_phone,
            message: pl.suggested_sms,
            customerId: pl.customer_id || null,
            messageType: 'customer_reactivation',
            purpose: 'proactive',
          })
          return { action: 'customer_reactivation', sms_sent: r.sms_sent, error: r.error }
        }
        return { action: 'customer_reactivation', skipped: 'no phone or message' }
      }

      case 'create_invoice_from_report': {
        // Navigerar — returnerar bara bekräftelse
        return { action: 'create_invoice_from_report', acknowledged: true, navigate_to: `/dashboard/invoices` }
      }

      case 'review_auto_invoice': {
        // Godkänn = skicka faktura till kund.
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding ersätter död
        // `_internal_business_id`-workaround (target-route har aldrig
        // läst det fältet → har failat 401 silent sedan epok).
        const invoiceId = (payload as any)?.invoice_id
        if (!invoiceId) return { action: 'review_auto_invoice', error: 'invoice_id saknas' }

        const sendRes = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            invoice_id: invoiceId,
            send_email: true,
            send_sms: true,
          }),
        })
        const r = await classifyResponse(sendRes)
        return {
          action: 'review_auto_invoice',
          invoice_id: invoiceId,
          navigate_to: `/dashboard/invoices/${invoiceId}`,
          ...r,
        }
      }

      case 'fakturera_projekt': {
        // ═══ GODKÄNN & SKICKA — kortet bar hela utkastet (Tur 4 etapp 2) ═══
        //
        // Enda intäktsfynd-varianten som får utföras (se ACTION_CONTRACT).
        // Kortet skapades bara när underlaget var komplett; här verifieras
        // det PÅ NYTT innan pengar rör sig:
        //   1. Idempotens — finns redan en faktura görs ingenting.
        //   2. Drift-vakt — underlaget byggs om; skiljer sig beloppet från
        //      kortets preview failar vi stängt. Kortet visade A; B skickas
        //      aldrig.
        //   3. Fakturan skapas som UTKAST, ÄTA källmarkeras.
        //   4. Sändningen går via /api/invoices/send med klickarens session
        //      (rutten grindar create_invoices). Misslyckas den ligger
        //      fakturan kvar som utkast och svaret säger det ärligt.
        const pl = payload as any
        const projectId = pl.project_id as string | undefined
        if (!projectId) return { action: 'fakturera_projekt', error: 'project_id saknas' }

        const supabaseFP = getServerSupabase()

        const { data: befintlig } = await supabaseFP
          .from('invoice')
          .select('invoice_id')
          .eq('business_id', businessId)
          .eq('project_id', projectId)
          .limit(1)
          .maybeSingle()
        if (befintlig) {
          return {
            action: 'fakturera_projekt',
            error: 'Projektet har redan en faktura — ingenting skickades.',
            navigate_to: `/dashboard/invoices/${befintlig.invoice_id}`,
          }
        }

        const { byggProjektFakturaUnderlag } = await import('@/lib/invoices/project-invoice-draft')
        const underlag = await byggProjektFakturaUnderlag(supabaseFP, businessId, projectId)
        if (!underlag.ok) {
          return {
            action: 'fakturera_projekt',
            error: 'Underlaget har ändrats sedan kortet skapades — öppna projektet och granska innan något skickas.',
            navigate_to: `/dashboard/projects/${projectId}`,
          }
        }

        const kortetsBelopp = Number(pl.preview?.customer_pays)
        if (!Number.isFinite(kortetsBelopp) || Math.round(underlag.customerPays) !== Math.round(kortetsBelopp)) {
          return {
            action: 'fakturera_projekt',
            error: 'Underlaget har ändrats sedan kortet skapades — öppna projektet och granska innan något skickas.',
            navigate_to: `/dashboard/projects/${projectId}`,
          }
        }

        const { data: cfgFP } = await supabaseFP
          .from('business_config')
          .select('default_payment_days')
          .eq('business_id', businessId)
          .maybeSingle()

        const { createInvoice } = await import('@/lib/invoices/create-invoice')
        let fakturaFP: { invoice_id: string; invoice_number: string }
        try {
          const created = await createInvoice(supabaseFP, {
            businessId,
            customerId: underlag.project.customer_id,
            items: underlag.items,
            subtotal: underlag.subtotal,
            vatRate: underlag.vatRate,
            vatAmount: underlag.vatAmount,
            total: underlag.total,
            rotRutType: underlag.rotRutType,
            rotRutDeduction: underlag.rotRutDeduction,
            customerPays: underlag.customerPays,
            projectId,
            quoteId: underlag.project.quote_id,
            invoiceType: 'standard',
            status: 'draft',
            dueDays: cfgFP?.default_payment_days || 30,
            personnummer: underlag.personnummer,
            fastighetsbeteckning: underlag.fastighetsbeteckning,
            selectClause: 'invoice_id, invoice_number, total, status',
          })
          fakturaFP = created.invoice
        } catch (createErr: any) {
          return { action: 'fakturera_projekt', error: `Fakturan kunde inte skapas: ${createErr.message}` }
        }

        if (underlag.ataChangeIds.length > 0) {
          const { markInvoiceSources } = await import('@/lib/invoices/mark-sources')
          const markering = await markInvoiceSources(supabaseFP, {
            businessId,
            invoiceId: fakturaFP.invoice_id,
            changeIds: underlag.ataChangeIds,
          })
          if (!markering.ok) {
            console.error('[approvals/fakturera_projekt] kunde inte källmarkera ÄTA:', markering.errors, {
              project_id: projectId,
              invoice_id: fakturaFP.invoice_id,
            })
          }
        }

        const sendResFP = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            invoice_id: fakturaFP.invoice_id,
            send_email: true,
            send_sms: true,
          }),
        })
        const rFP = await classifyResponse(sendResFP)
        if (!rFP.ok) {
          return {
            action: 'fakturera_projekt',
            invoice_id: fakturaFP.invoice_id,
            navigate_to: `/dashboard/invoices/${fakturaFP.invoice_id}`,
            ...rFP,
            error: rFP.error
              ? `Fakturan är skapad som utkast men kunde inte skickas: ${rFP.error}`
              : 'Fakturan är skapad som utkast men kunde inte skickas — öppna och skicka själv.',
          }
        }
        return {
          action: 'fakturera_projekt',
          invoice_id: fakturaFP.invoice_id,
          navigate_to: `/dashboard/invoices/${fakturaFP.invoice_id}`,
          ...rFP,
        }
      }

      case 'lead_review': {
        // Email-forwarding-flöde (2026-05-28): leaden skapades av
        // /api/email/inbound i status='pending_review' utan deal.
        // Vid approve aktiverar vi den via Golden Path-helpern —
        // status='new', deal skapas i pipeline, SMS + fireEvent.
        const leadId = payload.lead_id as string | undefined
        if (!leadId) return { action: 'lead_review', error: 'payload.lead_id saknas' }

        const { activatePendingLead } = await import('@/lib/leads/golden-path')
        try {
          const result = await activatePendingLead(
            leadId,
            (await import('@/lib/supabase')).getServerSupabase(),
          )
          if (result.dealError) {
            console.error('[approvals/lead_review] Deal skapades inte:', result.dealError)
          }
          return {
            action: 'lead_review',
            lead_id: leadId,
            deal_id: result.dealId,
            deal_error: result.dealError ?? null,
            // Utfalls-hårdning: deal_error surfades tidigare bara under sitt
            // eget fältnamn — classifyExecutionResult (och UI:t) läser
            // 'error', så en misslyckad deal-skapelse klassades som success.
            error: result.dealError ?? undefined,
            navigate_to: result.dealId ? `/dashboard/pipeline` : `/dashboard/leads/${leadId}`,
          }
        } catch (err: any) {
          return { action: 'lead_review', error: err.message }
        }
      }

      case 'invoice_reminder': {
        // Fakturapåminnelse gatad genom godkännande (cron/send-reminders skapar
        // denna för företag som ännu inte förtjänat autonomi). Vid godkännande
        // levereras påminnelsen via SAMMA delade helper som den autonoma
        // cron-vägen — avgift/ränta muteras BARA här, aldrig vid skapandet.
        const pl = payload as any
        const delivery = pl.delivery
        if (!delivery?.invoiceId) {
          return { action: 'invoice_reminder', error: 'payload saknar delivery-data' }
        }
        const { deliverInvoiceReminder } = await import('@/lib/invoice-reminder-send')
        const supabaseIR = getServerSupabase()
        const r = await deliverInvoiceReminder(supabaseIR, delivery)
        // ═══ EN SKIPPAD LEVERANS ÄR ETT FEL, INTE EN TYSTNAD (2026-08-10) ═══
        //
        // Returnerade tidigare bara sent:false — inget `error`, inget
        // `executed`. classifyExecutionResult råkade fånga sms_sent:false,
        // men Klart idag-raden läser `executed`/`note` och sa "skickade: …"
        // om en påminnelse som aldrig lämnade huset. Andreas godkände mot
        // sin egen testkund och ingenting kom fram — utan att ytan sa det.
        if (r.skipped) {
          return {
            action: 'invoice_reminder',
            sent: false,
            sms_sent: false,
            email_sent: false,
            executed: false,
            error: `Påminnelsen skickades inte — ${r.orsak || 'ingen kanal nådde kunden'}.`,
            note: `Påminnelsen skickades inte — ${r.orsak || 'ingen kanal nådde kunden'}.`,
          }
        }
        return {
          action: 'invoice_reminder',
          sent: true,
          executed: true,
          sms_sent: r.smsSent,
          email_sent: r.emailSent,
          fee_added: r.feeAdded,
          interest_added: r.interestAdded,
        }
      }

      case 'publish_microsite': {
        // Hemsida-nudgen (2026-07-25): kortet erbjuder hantverkaren en
        // redan genererad hemsida (utkast, is_published=false) — se
        // app/api/cron/hemsida-forslag/route.ts. Godkänn = publicera.
        // Avvisa = inget händer, utkastet ligger kvar (kan publiceras
        // manuellt senare via /dashboard/website).
        const pl = payload as any
        if (!pl.storefront_id) {
          return { action: 'publish_microsite', error: 'payload saknar storefront_id' }
        }
        const supabasePM = (await import('@/lib/supabase')).getServerSupabase()
        const { error: publishError } = await supabasePM
          .from('storefront')
          .update({ is_published: true, updated_at: new Date().toISOString() })
          .eq('id', pl.storefront_id)
          .eq('business_id', businessId)

        if (publishError) {
          return { action: 'publish_microsite', ok: false, error: publishError.message }
        }
        return {
          action: 'publish_microsite',
          ok: true,
          slug: pl.slug,
          public_url: pl.public_url,
          navigate_to: pl.public_url || (pl.slug ? `/site/${pl.slug}` : '/dashboard/website'),
        }
      }

      case 'egenkontroll_foto': {
        // Egenkontroll-agenten (etapp 1b, tasks/easoft-gap-plan.md). Skapas
        // av systemkod (lib/egenkontroll/analyze-and-queue.ts) — INTE av ett
        // agent-verktyg — så tool-definitions.ts/tool-router.ts rörs
        // medvetet inte (agentregeln i CLAUDE.md gäller nya tools, inte nya
        // approval_types som bara systemkoden själv skapar).
        //
        // Godkänn = markera de föreslagna punkterna som klara + lägg en
        // spårbar notering på checklistan (bevis vid besiktning/ÄTA-tvist).
        // Progress beräknas on-read i GET /checklists (items.filter(checked))
        // — inget separat progress-fält att uppdatera här.
        const pl = payload as any
        const checklistId = pl.checklist_id as string | undefined
        const forslag = (pl.forslag as Array<{ punkt_id: string; text: string }>) || []
        if (!checklistId || forslag.length === 0) {
          return { action: 'egenkontroll_foto', skipped: 'no checklist_id or forslag' }
        }

        const supabaseEk = getServerSupabase()
        const { data: checklist, error: fetchClErr } = await supabaseEk
          .from('project_checklist')
          .select('items, notes')
          .eq('id', checklistId)
          .eq('business_id', businessId)
          .maybeSingle()

        if (fetchClErr || !checklist) {
          return { action: 'egenkontroll_foto', ok: false, error: fetchClErr?.message || 'Checklista hittades inte' }
        }

        const punktIds = new Set(forslag.map(f => f.punkt_id))
        const items = ((checklist.items as any[]) || []).map(it =>
          punktIds.has(it.id) ? { ...it, checked: true } : it,
        )

        const today = new Date().toLocaleDateString('sv-SE')
        const notering = `Styrkt med foto ${pl.photo_ref || ''} ${today}`.trim()
        const notes = checklist.notes ? `${checklist.notes}\n${notering}` : notering

        const { error: updateClErr } = await supabaseEk
          .from('project_checklist')
          .update({ items, notes })
          .eq('id', checklistId)
          .eq('business_id', businessId)

        if (updateClErr) {
          return { action: 'egenkontroll_foto', ok: false, error: updateClErr.message }
        }

        return { action: 'egenkontroll_foto', ok: true, checklist_id: checklistId, marked_count: forslag.length }
      }

      case 'egenkontroll_avvikelse': {
        // Motsatt fall av 'egenkontroll_foto' ovan — samma systemkod-
        // ursprung, samma medvetna undantag från agentregeln.
        //
        // Godkänn = kvittera avvikelsen. Kortet ÄR informationen (Lars
        // flaggade att fotot motsäger punkten) — ingen datamutation, bara
        // en bekräftelse att hantverkaren sett den. Precis som
        // 'profitability_warning' ovan.
        return { action: 'egenkontroll_avvikelse', acknowledged: true }
      }

      case 'checklist_forslag': {
        // Egenkontroll-agenten (etapp 1d, tasks/easoft-gap-plan.md). Skapas
        // av systemkod (lib/egenkontroll/suggest-checklist.ts) — INTE av
        // ett agent-verktyg — samma medvetna undantag från agentregeln som
        // 'egenkontroll_foto'/'egenkontroll_avvikelse' ovan (agentregeln i
        // CLAUDE.md gäller nya tools, inte approval_types som bara
        // systemkoden själv skapar).
        //
        // Godkänn = skapa checklistan i project_checklist med mallens
        // punkter som startvärde — samma INSERT-form som POST
        // /api/projects/[id]/checklists (återanvänds INTE via internt
        // HTTP-anrop, skrivs direkt här som övriga cases i filen). checked
        // nollställs alltid explicit, oavsett vad payload råkar innehålla —
        // samma försiktighet som checklist-POST-routen redan har.
        const pl = payload as any
        const projectId = pl.project_id as string | undefined
        const templateItems = (pl.template_items as any[]) || []
        if (!projectId || templateItems.length === 0) {
          return { action: 'checklist_forslag', skipped: 'no project_id or template_items' }
        }

        const supabaseCf = getServerSupabase()
        const checklistId = `cl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const items = templateItems.map((it: any) => ({ ...it, checked: false }))

        const { error: insertCfErr } = await supabaseCf.from('project_checklist').insert({
          id: checklistId,
          project_id: projectId,
          business_id: businessId,
          name: pl.template_name || 'Checklista',
          items,
          status: 'in_progress',
        })

        if (insertCfErr) {
          return { action: 'checklist_forslag', ok: false, error: insertCfErr.message }
        }

        return { action: 'checklist_forslag', ok: true, checklist_id: checklistId, project_id: projectId }
      }

      case 'tidrapport_forslag': {
        // Egenkontroll-agenten — Etapp 2a (tasks/easoft-gap-plan.md).
        // Skapas av systemkod (lib/egenkontroll/suggest-time-entry.ts) —
        // INTE av ett agent-verktyg — samma medvetna undantag från
        // agentregeln som 'egenkontroll_foto'/'checklist_forslag' ovan.
        //
        // HÅRD REGEL FRÅN PLANEN: ett tidsförslag är löne-/fakturaunderlag,
        // så det finns ingen "förtjänad autonomi"-genväg för den här typen
        // — godkännande sker alltid via den här POST:en, aldrig autonomt av
        // cronen som skapade kortet. (Granskning av filens övriga cases
        // hittade ingen generell autonomi-auto-approve-mekanism att
        // medvetet hoppa över här — regeln är alltså redan strukturellt
        // uppfylld, men dokumenteras enligt planens krav.)
        //
        // Godkänn = skapa time_entry, samma fält-form som 'time_attestation'
        // ovan (project_id/work_date/duration_minutes/description/
        // is_billable) fast med data från förslaget istället för en
        // incheckning.
        const plTe = payload as any
        const projectIdTe = plTe.project_id as string | undefined
        const bookingDate = plTe.booking_date as string | undefined
        const suggestedMinutes = Number(plTe.suggested_minutes) || 0
        if (!projectIdTe || !bookingDate) {
          return { action: 'tidrapport_forslag', skipped: 'no project_id or booking_date' }
        }

        // R1-D (resurs-masterplan.md): se resolveTimeEntryBusinessUserId
        // (lib/egenkontroll/suggest-time-entry.ts) för fullständig motivering
        // — payload.assigned_user_id är redan ett business_users.id, satt
        // bara när attributionSource var bokningens EGEN tilldelning. Saknas
        // fältet: null, exakt tidigare beteende (ingen gissning).
        const assignedUserIdTe = resolveTimeEntryBusinessUserId(plTe)

        // approval_status sätts explicit till 'approved' — samma bugg och
        // samma fix som 'time_attestation'-caset ovan (och som
        // checkin/approve/route.ts redan dokumenterar): utan detta faller
        // raden på DB-defaulten 'pending', hamnar i "Att attestera" igen
        // och räknas inte som fakturerbar i BillableView.tsx trots att
        // hantverkaren just godkänt kortet.
        const supabaseTe = getServerSupabase()
        const entryIdTe = 'te_' + Math.random().toString(36).substr(2, 9)
        const { error: insertTeErr } = await supabaseTe.from('time_entry').insert({
          time_entry_id: entryIdTe,
          business_id: businessId,
          business_user_id: assignedUserIdTe,
          project_id: projectIdTe,
          work_date: bookingDate,
          duration_minutes: suggestedMinutes,
          description: plTe.project_name
            ? `Tidrapport-förslag · ${plTe.project_name}`
            : 'Tidrapport-förslag',
          is_billable: true,
          approval_status: 'approved',
          approved_by: businessId,
          approved_at: new Date().toISOString(),
        })

        if (insertTeErr) {
          return { action: 'tidrapport_forslag', ok: false, error: insertTeErr.message }
        }

        return {
          action: 'tidrapport_forslag',
          ok: true,
          time_entry_id: entryIdTe,
          project_id: projectIdTe,
          minutes: suggestedMinutes,
        }
      }

      case 'cert_expiry_reminder': {
        // Certifikatpåminnelsen (R3, tasks/resurs-masterplan.md). Cronen
        // (app/api/cron/cert-expiry-check) har redan gjort sitt jobb genom
        // att SKAPA kortet — godkännande är ren kvittens ("sett, hanterar
        // förnyelsen själv utanför systemet"). Ingen certifikatrad muteras
        // här; explicit case (istället för att låta den falla igenom till
        // default) så avsikten är dokumenterad och inte av misstag råkar
        // matcha default-casets SMS-sniffing om payloaden någon gång får
        // ett 'message'-fält.
        return { action: 'cert_expiry_reminder', acknowledged: true }
      }

      case 'automation': {
        // En v3-automationsregel med requires_approval skapar denna approval och
        // lägger rule_action_type/rule_action_config i payloaden. Utan detta case
        // föll den till default → no-op (åtgärden utfördes ALDRIG vid godkännande).
        const pl = payload as any
        const actionType = pl.rule_action_type
        if (!actionType) {
          return { action: 'automation', acknowledged: true, note: 'Ingen åtgärd i payload' }
        }
        // ═══ SJÄLVREFERENSEN STOPPAS (2026-08-10, Andreas fynd) ═══
        //
        // Ett kort som SKAPADES av en create_approval-regel ("Ring kund om
        // offert") bär rule_action_type 'create_approval'. Att "utföra" den
        // åtgärden igen vid godkännande skapade ett NYTT tomt kort
        // ("Godkännande krävs", utan config) — varje godkännande födde ett
        // spökkort. Kortet är en uppmaning till MÄNNISKAN (ring-knappen bor
        // på ytan); godkännandet kvitterar, ingenting utförs.
        if (actionType === 'create_approval') {
          return {
            action: 'automation',
            acknowledged: true,
            executed: false,
            note: 'Noterat. Ingenting skickades — kortet var en uppmaning till dig.',
          }
        }
        const { runApprovedAutomationAction } = await import('@/lib/automation-engine')
        const supabaseAuto = getServerSupabase()
        const res = await runApprovedAutomationAction(
          supabaseAuto, businessId, actionType, (pl.rule_action_config || {}) as Record<string, unknown>, pl,
        )
        return { action: 'automation', action_type: actionType, ...res }
      }

      case 'project_debrief': {
        // Project Debrief Capture (2026-08-12): svaren kommer via
        // edited_payload.answers (klienten skickar action:'edit' — det är
        // den enda action som faktiskt slår ihop edited_payload in i
        // `payload` innan den når hit, se finalPayload ovan). Nyckeln i
        // `answers` är frågetexten, värdet svaret — samma frågor som ligger
        // i payload.questions (lib/debrief/build-debrief-questions.ts).
        const pl = payload as any
        const raSvar = (pl.answers && typeof pl.answers === 'object') ? pl.answers as Record<string, unknown> : {}
        const ifyllda = Object.entries(raSvar)
          .map(([fraga, svar]) => ({ fraga, text: typeof svar === 'string' ? svar.trim() : '' }))
          .filter(s => s.text.length > 0)

        // Tomt debrief (allt hoppat över) är ett helt giltigt godkännande —
        // inget att spara, men det ska inte se ut som ett fel.
        if (ifyllda.length === 0) {
          return { action: 'project_debrief', ok: true, saved: 0 }
        }

        if (!pl.project_id) {
          return { action: 'project_debrief', ok: false, error: 'Kortet saknar projekt-koppling.' }
        }

        const supabasePD = await getSupabase()
        const { error: lessonErr } = await supabasePD.from('project_lesson').insert(
          ifyllda.map(s => ({
            business_id: businessId,
            project_id: pl.project_id,
            quote_id: pl.quote_id ?? null,
            job_type: pl.job_type ?? null,
            lesson_text: s.text,
            impact_hint: s.fraga,
            source: 'debrief',
            confirmed_by: resolvedByUserId ?? null,
          })),
        )

        if (lessonErr) {
          console.error('[approvals/project_debrief] kunde inte spara lärdomar:', lessonErr.message)
          return { action: 'project_debrief', ok: false, error: 'Kunde inte spara — försök igen om en stund' }
        }

        return { action: 'project_debrief', ok: true, saved: ifyllda.length }
      }

      case 'playbook_pattern_confirmation': {
        // Playbook Pattern Confirmation V1 (2026-08-16 natt): godkännande
        // skriver EN rad i business_knowledge (knowledge_type='pattern')
        // — samma tabell Daniels offertmotor redan läser för business_rule
        // (fetchBusinessRules, lib/ai-quote-generator.ts), nu utökad med
        // job_type så fetchConfirmedPatterns kan filtrera per jobbtyp.
        // Avvisning kräver ingen skrivning här — dedup-logiken i
        // lib/playbook/propose-pattern.ts (wasRecentlyRejected) läser
        // direkt ur pending_approvals-historiken, ingen egen tabell.
        const pl = payload as any
        if (!pl.job_type || !pl.pattern_text) {
          return { action: 'playbook_pattern_confirmation', ok: false, error: 'Kortet saknar jobbtyp eller mönstertext.' }
        }
        const supabasePP = await getSupabase()
        const { data: knowledge, error: knowledgeErr } = await supabasePP
          .from('business_knowledge')
          .insert({
            business_id: businessId,
            agent_id: 'daniel',
            knowledge_type: 'pattern',
            job_type: pl.job_type,
            title: `Mönster: ${pl.job_type}`,
            observation: pl.pattern_text,
            confidence: pl.confidence ?? null,
            data_basis: {
              evidence_lesson_ids: pl.evidence_lesson_ids ?? [],
              sample_count: pl.sample_count ?? null,
            },
            status: 'active',
            related_approval_id: approvalId,
          })
          .select('id')
          .single()

        if (knowledgeErr || !knowledge) {
          console.error('[approvals/playbook_pattern_confirmation] kunde inte spara mönstret:', knowledgeErr?.message)
          return { action: 'playbook_pattern_confirmation', ok: false, error: 'Kunde inte spara — försök igen om en stund' }
        }

        // OperatingExperiment Etapp 2 (2026-08-19): SAMMA flöde, fire-and-
        // forget — minsta ärliga ingrepp (se lib/experiment/propose.ts
        // filhuvud för varför inte cronen). Fail-soft i sig (kastar aldrig),
        // outer try/catch är bara ett extra säkerhetsbälte: ett förlorat
        // experimentförslag får ALDRIG fälla en lyckad mönsterbekräftelse.
        try {
          const { proposeExperiment } = await import('@/lib/experiment/propose')
          await proposeExperiment(supabasePP, businessId, {
            jobType: pl.job_type,
            hypothesis: pl.pattern_text,
            sourcePatternId: knowledge.id,
          })
        } catch (proposeErr) {
          console.error('[approvals/playbook_pattern_confirmation] experimentförslag misslyckades (fail-safe):', proposeErr)
        }

        return { action: 'playbook_pattern_confirmation', ok: true, knowledge_id: knowledge.id }
      }

      case 'playbook_kickoff_suggestion': {
        // Playbook Kickoff Copilot V1 (tasks/todo.md, 2026-08-17):
        // godkännande skriver EN kontrollpunkt i project_checklist —
        // samma tabellform som 'checklist_forslag' ovan (id/project_id/
        // business_id/name/items/status), med pattern_text som
        // checklistpunktens text. Avvisning kräver ingen skrivning här —
        // dedup-logiken i lib/playbook/kickoff-candidates.ts
        // (hasExistingKickoffCard) läser direkt ur pending_approvals-
        // historiken oavsett status, ingen egen tabell.
        const plKo = payload as any
        const projectIdKo = plKo.project_id as string | undefined
        const patternTextKo = plKo.pattern_text as string | undefined
        if (!projectIdKo || !patternTextKo) {
          return { action: 'playbook_kickoff_suggestion', ok: false, error: 'Kortet saknar projekt eller kontrollpunkt.' }
        }

        const supabaseKo = await getSupabase()
        const checklistIdKo = `cl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const itemsKo = [{
          id: `ci_${Math.random().toString(36).substring(2, 9)}`,
          text: patternTextKo,
          required: false,
          checked: false,
        }]

        const { error: insertKoErr } = await supabaseKo.from('project_checklist').insert({
          id: checklistIdKo,
          project_id: projectIdKo,
          business_id: businessId,
          name: `Kontrollpunkt: ${plKo.job_type || ''}`.trim(),
          items: itemsKo,
          status: 'in_progress',
        })

        if (insertKoErr) {
          return { action: 'playbook_kickoff_suggestion', ok: false, error: insertKoErr.message }
        }

        // OperatingExperiment Etapp 2 (2026-08-19): skriver in projektet i ett
        // matchande AKTIVT försök om plats/fönster tillåter — se
        // lib/experiment/enroll.ts filhuvud. Aldrig blockerande: kontroll-
        // punkten ovan är redan skapad oavsett vad som händer här.
        try {
          const { maybeEnrollProject } = await import('@/lib/experiment/enroll')
          await maybeEnrollProject(supabaseKo, businessId, projectIdKo, plKo.job_type || '')
        } catch (enrollErr) {
          console.error('[approvals/playbook_kickoff_suggestion] experiment-inskrivning misslyckades (fail-safe):', enrollErr)
        }

        return { action: 'playbook_kickoff_suggestion', ok: true, checklist_id: checklistIdKo, project_id: projectIdKo }
      }

      case 'operating_experiment_proposal': {
        // OperatingExperiment Etapp 2 (2026-08-19): godkännande INSERTar EN
        // rad i operating_experiment (status='active') med kortets
        // föreslagna värden — samma form propose.ts skrev till payload.
        // Avvisning kräver ingen skrivning här — dedup-logiken i
        // lib/experiment/propose.ts (hasPendingOrPastProposal) läser direkt
        // ur pending_approvals-historiken, ingen egen tabell för det.
        const plExp = payload as any
        if (!plExp.job_type || !plExp.hypothesis || !plExp.guard_rails || !plExp.planned_change || !Array.isArray(plExp.measures)) {
          return { action: 'operating_experiment_proposal', ok: false, error: 'Kortet saknar underlag för att starta försöket.' }
        }

        const supabaseExp = await getSupabase()
        const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const nowIsoExp = new Date().toISOString()

        const { error: expInsertErr } = await supabaseExp.from('operating_experiment').insert({
          id: experimentId,
          business_id: businessId,
          hypothesis: plExp.hypothesis,
          agent_key: plExp.agent_id || 'lars',
          job_type: plExp.job_type,
          source_pattern_id: plExp.source_pattern_id ?? null,
          source_project_ids: [],
          planned_change: plExp.planned_change,
          guard_rails: plExp.guard_rails,
          measures: plExp.measures,
          min_comparable_projects: plExp.min_comparable_projects ?? 3,
          enrolled_project_ids: [],
          status: 'active',
          confirmed_at: nowIsoExp,
        })

        if (expInsertErr) {
          if (arSchemaSaknas(expInsertErr)) {
            return { action: 'operating_experiment_proposal', ok: false, error: 'Försöket kan inte startas ännu.' }
          }
          console.error('[approvals/operating_experiment_proposal] kunde inte starta försöket:', expInsertErr.message)
          return { action: 'operating_experiment_proposal', ok: false, error: 'Kunde inte starta försöket — försök igen om en stund' }
        }

        return { action: 'operating_experiment_proposal', ok: true, experiment_id: experimentId }
      }

      case 'operating_experiment_readout': {
        // OperatingExperiment Etapp 2 (2026-08-19): redovisningskortet.
        // Beslutet kommer via edited_payload.decision (klienten skickar
        // action:'edit' från beslutssidan, app/dashboard/experiments/
        // [approvalId]/page.tsx — samma idiom som project_debrief:s
        // edited_payload.answers). Ett rakt "Avvisa" i kön (action:'reject')
        // täcks av reject-side-effect-blocket ovan, INTE här (switchen körs
        // aldrig för action==='reject').
        const plRo = payload as any
        const experimentIdRo = plRo.experiment_id as string | undefined
        const decisionRo = plRo.decision as string | undefined

        if (!experimentIdRo) {
          return { action: 'operating_experiment_readout', ok: false, error: 'Kortet saknar koppling till försöket.' }
        }
        if (decisionRo !== 'continue_testing' && decisionRo !== 'made_standard') {
          return { action: 'operating_experiment_readout', ok: false, error: 'Välj ett av alternativen — fortsätt testa eller gör till standard.' }
        }

        const supabaseRo = await getSupabase()
        const nowIsoRo = new Date().toISOString()

        if (decisionRo === 'made_standard') {
          // Samma form som case 'playbook_pattern_confirmation' ovan — en
          // bekräftad regel formar Daniels offertmotor.
          const { data: knowledgeRo, error: knowledgeErrRo } = await supabaseRo
            .from('business_knowledge')
            .insert({
              business_id: businessId,
              agent_id: 'lars',
              knowledge_type: 'pattern',
              job_type: plRo.job_type,
              title: `Mönster (bekräftat via försök): ${plRo.job_type}`,
              observation: plRo.hypothesis,
              confidence: null,
              data_basis: {
                source_experiment_id: experimentIdRo,
                source_pattern_id: plRo.source_pattern_id ?? null,
              },
              status: 'active',
              related_approval_id: approvalId,
            })
            .select('id')
            .single()

          if (knowledgeErrRo || !knowledgeRo) {
            console.error('[approvals/operating_experiment_readout] kunde inte spara regeln:', knowledgeErrRo?.message)
            return { action: 'operating_experiment_readout', ok: false, error: 'Kunde inte spara — försök igen om en stund' }
          }

          const { error: expUpdateErrRo } = await supabaseRo
            .from('operating_experiment')
            .update({ owner_decision: 'made_standard', decided_at: nowIsoRo, resulting_rule_id: knowledgeRo.id })
            .eq('id', experimentIdRo)
            .eq('business_id', businessId)

          if (expUpdateErrRo) {
            if (arSchemaSaknas(expUpdateErrRo)) {
              return { action: 'operating_experiment_readout', ok: false, error: 'Försöket kan inte startas ännu.' }
            }
            console.error('[approvals/operating_experiment_readout] regeln sparades men försöket kunde inte uppdateras:', expUpdateErrRo.message)
          }

          return { action: 'operating_experiment_readout', ok: true, decision: decisionRo, resulting_rule_id: knowledgeRo.id }
        }

        // continue_testing — ärver hypotes/jobbtyp/källmönster/mått, ett
        // helt nytt förslagskort (samma dedupe-funktion, men medvetet
        // förbikopplad — se lib/experiment/propose.ts opts.allowDuplicate).
        const { error: expUpdateContRo } = await supabaseRo
          .from('operating_experiment')
          .update({ owner_decision: 'continue_testing', decided_at: nowIsoRo })
          .eq('id', experimentIdRo)
          .eq('business_id', businessId)

        if (expUpdateContRo) {
          if (arSchemaSaknas(expUpdateContRo)) {
            return { action: 'operating_experiment_readout', ok: false, error: 'Försöket kan inte startas ännu.' }
          }
          return { action: 'operating_experiment_readout', ok: false, error: 'Kunde inte spara beslutet — försök igen om en stund' }
        }

        try {
          const { proposeExperiment } = await import('@/lib/experiment/propose')
          const inheritedMeasures = Array.isArray(plRo.measurement?.measures)
            ? (plRo.measurement.measures as Array<{ measure: string }>).map(m => m.measure as any)
            : undefined
          await proposeExperiment(
            supabaseRo, businessId,
            {
              jobType: plRo.job_type,
              hypothesis: plRo.hypothesis,
              sourcePatternId: plRo.source_pattern_id ?? null,
              measures: inheritedMeasures,
            },
            { allowDuplicate: true },
          )
        } catch (continueErr) {
          console.error('[approvals/operating_experiment_readout] nytt förslag misslyckades (fail-safe):', continueErr)
        }

        return { action: 'operating_experiment_readout', ok: true, decision: decisionRo }
      }

      default: {
        // ═══ OKÄND TYP FAILAR STÄNGT (N5, 2026-08-07) ═══
        //
        // Här stod tidigare en gissning: om payloaden råkade ha något som såg ut
        // som ett meddelande och något som såg ut som ett telefonnummer
        // (`pl.message || pl.suggested_sms || pl.sms_text` mot
        // `pl.to || pl.customer_phone || pl.entity?.phone`) skickades ett riktigt
        // SMS till kunden — för en korttyp ingen skrivit en hanterare för.
        // Annars returnerades "Godkänt utan specifik åtgärd", en tyst
        // nollhandling som såg ut som att något hänt.
        //
        // Elva av producenternas korttyper hamnade här, bland dem
        // `manual_project_create` (ett reparationskort som aldrig skulle prata
        // med kunden) och `missad_intakt` (som intäktsåtervinningen bygger på).
        //
        // Nu avgör kontraktet. Ett kort som bara berättar något kvitteras ärligt,
        // ett som kräver granskning säger det, och en typ vi inte känner igen
        // går inte att godkänna alls.
        const klass = classify(approval_type)

        if (klass === null) {
          throw new Error(
            `Kortet "${approval_type}" saknar beskrivning av vad ett godkännande ska göra. Det går därför inte att godkänna härifrån.`,
          )
        }

        if (klass === 'EXECUTABLE_ACTION') {
          // Klassad som utförande men utan gren ovan — någon har lagt till en typ
          // i kontraktet utan att skriva hanteraren. Failar hellre stängt än
          // låtsas att den utfördes.
          throw new Error(
            `Kortet "${approval_type}" ska utföra något, men åtgärden är inte färdigbyggd. Ingenting har skickats.`,
          )
        }

        return nonExecutableResult(approval_type)
      }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}
