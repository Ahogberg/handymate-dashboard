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

interface ApprovalLike {
  business_id: string
  approval_type: string
  payload?: Record<string, unknown> | null
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

/**
 * Bygg push-template per approval_type. Returnerar null om typen
 * inte ska generera push (default-case för okända typer).
 */
function buildPushTemplate(
  approvalType: string,
  payload: Record<string, any>,
): PushTemplate | null {
  switch (approvalType) {
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

    default:
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
 */
export async function sendApprovalPush(approval: ApprovalLike): Promise<void> {
  const payload = (approval.payload || {}) as Record<string, any>
  const template = buildPushTemplate(approval.approval_type, payload)

  if (!template) {
    console.warn('[approval-push] no template for approval_type:', approval.approval_type)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  try {
    const res = await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: approval.business_id,
        title: template.title,
        body: template.body,
        url: template.url,
        tag: `approval:${approval.approval_type}`,
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
