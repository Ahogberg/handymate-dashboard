/**
 * sendApprovalPush — centraliserad push-notis-helper för pending_approvals.
 *
 * Anropas från call-sites som skapar pending_approvals (ATA-sign-route,
 * review-requests-cron, ev. quote-sign-route). Inte EN webhook-trigger
 * v1 — vi wirear manuellt i 3-4 call-sites. Centraliserad DB-trigger
 * blir relevant först vid 10+ businesses (TD post-launch).
 *
 * Bygger title/body/url från approval-payload via per-typ template,
 * anropar sedan /api/push/send som hanterar både web-push (PWA) och
 * Expo (mobile-app).
 *
 * Fire-and-forget från caller-side — fel loggas men kastas inte, så
 * en push-fail aldrig blockar approval-skapande.
 */

import { getServerSupabase } from '@/lib/supabase'
import { getAbsenceWindow, isAbsenceActive } from '@/lib/absence/absence-window'
import { classifyAbsenceEvent } from '@/lib/absence/escalation'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

interface ApprovalLike {
  business_id: string
  approval_type: string
  payload?: Record<string, unknown> | null
  /**
   * Owner Absence V1 (Etapp Å) — samma fält pending_approvals-raden redan
   * bär. Saknas den (äldre call-sites som bygger ett syntetiskt objekt utan
   * risk_level) tolkas som "ingen känd risknivå", ALDRIG som 'high' —
   * fail-closed mot att INTE eskalera, aldrig mot att pusha för mycket.
   */
  risk_level?: string | null
  /**
   * Etapp 4 (multi-employee-parity-plan.md) — business_users.id (INTE en
   * auth-uuid) för vem pushen ska riktas mot specifikt, om caller vet det
   * (t.ex. pending_approvals.routed_business_user_id, Etapp 3a-kolumnen).
   * sendApprovalPush slår upp business_users.user_id (auth-uuid) innan den
   * skickas vidare som target_user_id till /api/push/send — ALDRIG
   * getAuthenticatedBusiness().user_id, som alltid är ÄGARENS uuid oavsett
   * vem som faktiskt agerar (se lib/auth.ts).
   *
   * Ingen creation-site sätter routed_business_user_id ännu (Etapp 3b satte
   * bara routing_role) — detta fält är alltså strukturellt klart men no-op
   * (blast till hela businessen, oförändrat) i produktion tills en senare
   * körning börjar fylla i kolumnen.
   */
  routed_business_user_id?: string | null
}

interface PushTemplate {
  title: string
  body: string
  url: string
}

function formatKr(value: unknown): string {
  const num = Number(value) || 0
  return `${num.toLocaleString('sv-SE')} kr`
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  matte: 'Matte',
  karin: 'Karin',
  daniel: 'Daniel',
  lars: 'Lars',
  hanna: 'Hanna',
  lisa: 'Lisa',
}

function agentName(agentId?: unknown): string {
  const id = typeof agentId === 'string' ? agentId.toLowerCase() : ''
  return AGENT_DISPLAY_NAMES[id] || 'AI-teamet'
}

function truncate(text: unknown, max: number): string {
  const s = (text || '').toString()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

/**
 * Bygg push-template per approval_type. Returnerar null om typen
 * inte ska generera push (default-case för okända typer).
 */
function buildPushTemplate(
  approvalType: string,
  payload: Record<string, any>,
): PushTemplate | null {
  switch (approvalType) {
    case 'four_eyes_quote': {
      return {
        title: `Offert kräver godkännande — ${formatKr(payload.quote_total)}`,
        body: `${truncate(payload.quote_title || 'Offert', 40)} (begärd av ${payload.requested_by || 'kollega'}) väntar på ditt godkännande`,
        url: payload.quote_id ? `/dashboard/quotes/${payload.quote_id}` : '/dashboard/approvals',
      }
    }

    case 'ata_signed_notification': {
      const name = payload.signed_by_name || 'Kund'
      const ataNumber = payload.ata_number ?? ''
      return {
        title: `✓ ${name} signerade ÄTA-${ataNumber}`.trim(),
        body: `${formatKr(payload.total)} — granska och skicka för fakturering`,
        url: payload.project_id
          ? `/projects/${payload.project_id}`
          : '/dashboard',
      }
    }

    case 'ata_declined_notification': {
      const ataNumber = payload.ata_number ?? ''
      const reason = (payload.declined_reason || '').toString().trim()
      return {
        title: `ÄTA-${ataNumber} avböjd`.trim(),
        body: reason ? `Anledning: ${reason}` : 'Kund avböjde tilläggsarbetet',
        url: payload.project_id
          ? `/projects/${payload.project_id}`
          : '/dashboard',
      }
    }

    case 'review_request': {
      const name = payload.customer_name || 'Kunden'
      return {
        title: 'Hanna har förberett en recensionsförfrågan',
        body: `${name} — godkänn för att skicka SMS`,
        url: '/approvals?filter=review_request',
      }
    }

    case 'quote_signed': {
      // Påkallas direkt från quote-public-route, inte via pending_approval
      // (commit 5 i Sprint Push-Wiring — quote_signed är info, inte action).
      // Helpern stödjer typen så test-endpoint kan simulera den.
      const name = payload.customer_name || 'Kund'
      return {
        title: `✓ ${name} signerade offert`,
        body: `${formatKr(payload.total)} — projektet är skapat`,
        url: payload.project_id
          ? `/projects/${payload.project_id}`
          : payload.quote_id
          ? `/quotes/${payload.quote_id}`
          : '/dashboard',
      }
    }

    case 'publish_microsite': {
      // Hemsida-nudgen (2026-07-25) — Hanna har byggt ett utkast till
      // hemsida (cron/hemsida-forslag) och väntar på publicerings-OK.
      const headline = payload.preview?.headline
      return {
        title: 'Hanna har byggt ett förslag på hemsida',
        body: headline
          ? `"${truncate(headline, 70)}" — godkänn för att publicera`
          : 'Förhandsgranska och publicera med ett klick',
        url: '/dashboard/approvals?filter=publish_microsite',
      }
    }

    case 'agent_observation': {
      // Observation med konkret suggestion → approval-rad skapad → action krävs.
      // Mobile-tap → /approvals?filter=agent_observation för granskning.
      const name = agentName(payload.agent_id)
      return {
        title: `${name} har en observation`,
        body: `${truncate(payload.observation || payload.title, 80)} — vill du agera?`,
        url: '/approvals?filter=agent_observation',
      }
    }

    case 'agent_insight': {
      // Ren info utan action — ingen approval-rad. Push triggas direkt
      // från cron med syntetiskt approval-objekt.
      const name = agentName(payload.agent_id)
      return {
        title: `${name} märkte något`,
        body: truncate(payload.observation || payload.title, 100),
        url: '/dashboard/insights',
      }
    }

    case 'payment_failed_signal': {
      // Owner Absence V1 (Etapp Å) — driftlarmets syntetiska ägar-push
      // under ett aktivt frånvarofönster (app/api/cron/driftlarm/route.ts).
      // Skapar ALDRIG en pending_approvals-rad; ops-mejlet är sanningen,
      // det här är bara en extra notis medan ägaren är borta.
      const amountDue = payload.amount_due
      const amountText = typeof amountDue === 'number' ? ` (${(amountDue / 100).toLocaleString('sv-SE')} kr)` : ''
      return {
        title: `Betalning misslyckades${amountText}`,
        body: 'En kunds betalning gick inte igenom — det här kan inte vänta till du är tillbaka.',
        url: '/dashboard',
      }
    }

    case 'external_delivery_failure_signal': {
      // Owner Absence V1 (Etapp Å) — se payment_failed_signal ovan.
      const beskrivning = truncate(payload.description || `${payload.automation_type || ''}/${payload.action || ''}`, 90)
      return {
        title: 'Något gick inte fram medan du var borta',
        body: beskrivning || 'En automatisk åtgärd misslyckades',
        url: '/dashboard',
      }
    }

    case 'monday_brief': {
      // Måndagsmötet (2026-08-13) — url pekar på startsidan, inte
      // godkännande-listan: JarvisHomes egen auto-öppningsgrind
      // (lib/jarvis/mandagsmote.ts) tar över därifrån och öppnar takeovern
      // direkt, se components/jarvis/JarvisHome.tsx.
      return {
        title: 'Ditt måndagsmöte är redo',
        body: 'Ta del av veckans sammanfattning från teamet',
        url: '/dashboard',
      }
    }

    case 'meeting_summary': {
      const isPhoneCall = payload.source === 'phone_call'
      return {
        title: isPhoneCall ? 'Lisa har sammanfattat ett samtal' : 'Matte har sammanfattat ett möte',
        body: truncate(payload.summary || 'Öppna sammanfattningen och se vad teamet föreslår.', 110),
        url: '/approvals?filter=meeting_summary',
      }
    }

    default:
      return null
  }
}

/**
 * Etapp 4: business_users.id → business_users.user_id (auth-uuid).
 * Returnerar null om businessUserId saknas, uppslaget missar, eller
 * DB-anropet failar — alla dessa fall ska falla tillbaka till oförändrat
 * businessblast i sendApprovalPush, inte kasta/blockera pushen.
 */
export async function resolveTargetUserId(businessUserId?: string | null): Promise<string | null> {
  if (!businessUserId) return null

  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_users')
      .select('user_id')
      .eq('id', businessUserId)
      .maybeSingle()

    if (error) {
      console.error('[approval-push] business_users-uppslag misslyckades:', error)
      return null
    }

    return data?.user_id || null
  } catch (err) {
    console.error('[approval-push] resolveTargetUserId threw:', err)
    return null
  }
}

/**
 * Skicka push-notis för en approval. Fire-and-forget — fel loggas
 * men kastas inte.
 *
 * Kan också anropas direkt med ett "syntetiskt" approval-objekt för
 * events som INTE skapar pending_approval-rad (t.ex. quote_signed —
 * kunden behöver veta men inte agera).
 *
 * ═══ OWNER ABSENCE V1 (Etapp Å) — DEN ENDA STRYPPUNKTEN ═══
 *
 * sendApprovalPush är den EN chokepoint alla pushar redan går igenom (varje
 * call-site i huset anropar den här, aldrig /api/push/send direkt för en
 * approval). Under ett aktivt frånvarofönster (lib/absence/absence-window.ts)
 * släpps ENDAST eskaleringsklassade händelser igenom (lib/absence/
 * escalation.ts classifyAbsenceEvent) — övriga pushar undertrycks HÄR.
 * Approval-raden/köandet är redan gjort av anroparen INNAN detta anrop och
 * rörs inte — bara själva push-notisen hålls tillbaka. Utan ett aktivt
 * fönster (den överväldigande majoriteten av anrop) är beteendet exakt
 * oförändrat: en extra, snabb (fail-open) läsning, sedan samma väg som idag.
 */
export async function sendApprovalPush(approval: ApprovalLike): Promise<void> {
  const payload = (approval.payload || {}) as Record<string, any>
  const template = buildPushTemplate(approval.approval_type, payload)

  if (!template) {
    console.warn('[approval-push] no template for approval_type:', approval.approval_type)
    return
  }

  try {
    const window = await getAbsenceWindow(approval.business_id)
    if (isAbsenceActive(window, new Date())) {
      const cls = classifyAbsenceEvent({
        kind: 'pending_approval',
        approvalType: approval.approval_type,
        riskLevel: approval.risk_level ?? null,
        payload,
      })
      if (cls === 'samlas') {
        // Undertryckt, inte tappad — kortet ligger kvar precis som vanligt
        // i pending_approvals/kön. Bara pushen hålls tillbaka.
        return
      }
    }
  } catch (err) {
    // Fail-open mot AVSAKNAD av frånvarofönster (dvs. dagens beteende) —
    // en trasig frånvaro-läsning får aldrig blockera en push som annars
    // skulle gått iväg. (Motsatsen — fail-closed mot ATT ge mer behörighet
    // — gäller inte här: push är inte en exekveringsväg.)
    console.error('[approval-push] frånvarokontrollen kastade (fail-open, pushar som vanligt):', err)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  // Etapp 4: slå upp auth-uuid:n för routed_business_user_id (om satt) så
  // pushen kan riktas mot en enskild person. Fel/miss här är icke-fatalt —
  // faller tillbaka till oförändrat businessblast, precis som innan detta
  // fält fanns.
  const targetUserId = await resolveTargetUserId(approval.routed_business_user_id)

  try {
    const res = await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: internalPushHeaders(),
      body: JSON.stringify({
        business_id: approval.business_id,
        title: template.title,
        body: template.body,
        url: template.url,
        tag: `approval:${approval.approval_type}`,
        ...(targetUserId ? { target_user_id: targetUserId } : {}),
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[approval-push] /api/push/send failed:', {
        status: res.status,
        approval_type: approval.approval_type,
        business_id: approval.business_id,
        body: errBody.slice(0, 200),
      })
    }
  } catch (err) {
    console.error('[approval-push] fetch error:', {
      approval_type: approval.approval_type,
      business_id: approval.business_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
