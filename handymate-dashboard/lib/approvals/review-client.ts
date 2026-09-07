'use client'
import type { ApprovalReview } from './review-contract'

let reviewing = false
export function showApprovalReview(review: ApprovalReview): Promise<boolean> {
  if (reviewing || typeof document === 'undefined') return Promise.resolve(false)
  reviewing = true
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.createElement('dialog')
    dialog.setAttribute('aria-label', 'Granska handlingen')
    Object.assign(dialog.style, { width: 'min(640px, 94vw)', maxHeight: '90dvh', border: '1px solid #CBD5E1', borderRadius: '20px', padding: '24px', color: '#0F172A', background: 'white' })
    const add = (tag: string, text: string) => {
      const el = document.createElement(tag); el.textContent = text
      Object.assign(el.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: '16px' })
      dialog.append(el); return el
    }
    add('h2', review.title)
    add('p', review.effect)
    for (const detail of review.details || []) { add('h3', detail.label); add('p', detail.text) }
    for (const message of review.messages) {
      add('h3', `${message.channel} · ${message.recipients.length} mottagare`)
      for (const recipient of message.recipients) add('p', recipient)
      if (message.subject) add('h3', `Ämne: ${message.subject}`)
      add('p', message.text)
    }
    if (review.blockedReason) add('p', review.blockedReason)
    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) return
      settled = true; reviewing = false
      window.removeEventListener('pagehide', cancel); window.removeEventListener('popstate', cancel)
      dialog.remove(); previous?.focus(); resolve(confirmed)
    }
    const cancel = () => finish(false)
    const back = add('button', 'Tillbaka') as HTMLButtonElement
    back.type = 'button'; back.onclick = cancel
    back.style.padding = '12px 20px'
    if (review.confirmLabel) {
      const confirm = add('button', review.confirmLabel) as HTMLButtonElement
      confirm.type = 'button'
      Object.assign(confirm.style, { padding: '12px 20px', marginLeft: '12px', background: '#0F766E', color: 'white', borderRadius: '12px' })
      confirm.onclick = () => { confirm.disabled = true; finish(true) }
    }
    dialog.addEventListener('cancel', e => { e.preventDefault(); cancel() })
    window.addEventListener('pagehide', cancel); window.addEventListener('popstate', cancel)
    document.body.append(dialog); dialog.showModal(); back.focus()
  })
}

/** Explicit read-only preflight: an old server rejects `preview`, never sends. */
export async function reviewedApprovalFetch(url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init.body || '{}'))
  if (!['approve', 'edit', 'retry'].includes(body.action)) return fetch(url, init)
  const preview = await fetch(url, { ...init, keepalive: false,
    body: JSON.stringify({ ...body, action: 'preview', decision_action: body.action }) })
  const data = await preview.clone().json().catch(() => null)
  if (preview.ok && data?.review_not_required === true) return fetch(url, init)
  if (!data?.review) return preview
  const confirmed = await showApprovalReview(data.review)
  if (!confirmed || !data.review_token || !data.review.confirmLabel) {
    return Response.json({ cancelled: true, error: 'Avbrutet. Ärendet ligger kvar.' }, { status: 499 })
  }
  // Never retry delivery on network error. A new click must start a fresh review.
  return fetch(url, { ...init, keepalive: false, body: JSON.stringify({ ...body, review_token: data.review_token }) })
}
