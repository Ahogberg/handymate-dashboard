'use client'
import { postKortbeslut } from './klient-bekraftelse'
import type { ApprovalReview } from './review-contract'

let reviewing = false
interface ReviewDecision { confirmed: boolean; actionOverrides?: Record<string, 'approved' | 'rejected'> }
export function showApprovalReview(review: ApprovalReview, headers?: HeadersInit): Promise<ReviewDecision> {
  if (reviewing || typeof document === 'undefined') return Promise.resolve({ confirmed: false })
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
      if (message.html) {
        const frame = document.createElement('iframe'); frame.title = message.subject || 'E-postens innehåll'
        frame.setAttribute('sandbox', '')
        frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${message.html}`
        frame.style.width = '100%'; frame.style.height = '55vh'; dialog.append(frame)
      } else add('p', message.text)
    }
    const choiceState: Record<string, boolean> = Object.fromEntries((review.choices || []).map(choice => [choice.id, choice.defaultSelected]))
    for (const choice of review.choices || []) {
      const label = document.createElement('label')
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = choice.defaultSelected
      checkbox.onchange = () => { choiceState[choice.id] = checkbox.checked; updateConfirmState() }
      label.append(checkbox, document.createTextNode(` ${choice.label}`)); dialog.append(label)
      add('p', choice.description)
    }
    if (review.blockedReason) add('p', review.blockedReason)
    const objectUrls: string[] = []
    const attachmentChecks: HTMLInputElement[] = []
    let confirmButton: HTMLButtonElement | undefined
    const updateConfirmState = () => {
      if (confirmButton) confirmButton.disabled = (review.choices || []).some(choice => choice.required && !choiceState[choice.id]) || !attachmentChecks.every(check => check.checked && !check.disabled)
    }
    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) return
      settled = true; reviewing = false
      window.removeEventListener('pagehide', cancel); window.removeEventListener('popstate', cancel)
      objectUrls.forEach(url => URL.revokeObjectURL(url))
      dialog.remove(); previous?.focus(); resolve({ confirmed, ...(review.choices?.length ? { actionOverrides: Object.fromEntries(review.choices.map(choice => [choice.id, choiceState[choice.id] ? 'approved' : 'rejected'])) } : {}) })
    }
    const cancel = () => finish(false)
    const back = add('button', 'Tillbaka') as HTMLButtonElement
    back.type = 'button'; back.onclick = cancel
    back.style.padding = '12px 20px'
    if (review.open && /^\/dashboard\//.test(review.open.path)) {
      const open = add('button', review.open.label) as HTMLButtonElement
      open.type = 'button'; open.onclick = () => { finish(false); window.location.assign(review.open!.path) }
    }
    for (const attachment of review.attachments || []) {
      const status = add('p', `Laddar: ${attachment.label}`)
      const checkLabel = document.createElement('label')
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.disabled = true
      attachmentChecks.push(checkbox)
      checkLabel.append(checkbox, document.createTextNode(` Jag har granskat: ${attachment.label}`)); dialog.append(checkLabel)
      checkbox.onchange = () => { updateConfirmState() }
      if (!attachment.url.startsWith('/api/')) { status.textContent = 'Underlaget har en ogiltig adress.'; continue }
      void fetch(attachment.url, { headers }).then(async response => {
        if (!response.ok) throw new Error('Kunde inte läsa underlaget')
        const mime = response.headers.get('content-type') || ''
        // Raw PDFs do not reliably render in sandboxed frames. The document
        // endpoint must return rendered pages/HTML, never an empty PDF plugin.
        if (!mime.startsWith('image/') && !mime.includes('text/html')) throw new Error('Underlaget har fel format')
        const blob = await response.blob()
        if (settled) return
        const url = URL.createObjectURL(blob); objectUrls.push(url)
        const frame = document.createElement('iframe'); frame.title = attachment.label
        frame.setAttribute('sandbox', ''); frame.style.width = '100%'; frame.style.height = '65vh'
        frame.onload = () => { if (!settled) checkbox.disabled = false }
        frame.onerror = () => { checkbox.disabled = true; checkbox.checked = false; if (confirmButton) confirmButton.disabled = true }
        frame.src = url; status.replaceWith(frame)
      }).catch(() => { if (!settled) status.textContent = 'Underlaget kunde inte laddas. Beslutet kan inte bekräftas.' })
    }
    if (review.confirmLabel) {
      const confirm = add('button', review.confirmLabel) as HTMLButtonElement
      confirmButton = confirm
      confirm.type = 'button'; updateConfirmState()
      Object.assign(confirm.style, { padding: '12px 20px', marginLeft: '12px', background: '#0F766E', color: 'white', borderRadius: '12px' })
      confirm.onclick = () => { confirm.disabled = true; finish(true) }
    }
    dialog.addEventListener('cancel', e => { e.preventDefault(); cancel() })
    window.addEventListener('pagehide', cancel); window.addEventListener('popstate', cancel)
    document.body.append(dialog); dialog.showModal(); back.focus()
  })
}

// Notify readers after a submitted decision, including a lost response. Never resend.
export const APPROVAL_QUEUE_CHANGED = 'handymate:approval-queue-changed'
async function submitDecision(url: string, init: RequestInit): Promise<Response> {
  try {
    const match = /^\/api\/approvals\/([^/?#]+)$/.exec(url)
    if (match && init.method === 'POST') {
      return await postKortbeslut(match[1], {
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: JSON.parse(String(init.body || '{}')),
        keepalive: init.keepalive,
      })
    }
    return await fetch(url, init)
  }
  finally {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(APPROVAL_QUEUE_CHANGED))
  }
}

/** Explicit read-only preflight: an old server rejects `preview`, never sends. */
export async function reviewedApprovalFetch(url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init.body || '{}'))
  if (!['approve', 'edit', 'retry', 'reject'].includes(body.action)) return fetch(url, init)
  const preview = await fetch(url, { ...init, keepalive: false,
    body: JSON.stringify({ ...body, action: 'preview', decision_action: body.action }) })
  const data = await preview.clone().json().catch(() => null)
  if (preview.ok && data?.review_not_required === true) return submitDecision(url, init)
  if (!data?.review) return preview
  const decision = await showApprovalReview(data.review, init.headers)
  if (!decision.confirmed || !data.review_token || !data.review.confirmLabel) {
    return Response.json({ cancelled: true, error: 'Avbrutet. Ärendet ligger kvar.' }, { status: 499 })
  }
  // Never retry delivery on network error. A new click must start a fresh review.
  return submitDecision(url, { ...init, keepalive: false, body: JSON.stringify({ ...body, ...(decision.actionOverrides ? { action_overrides: { ...(body.action_overrides || {}), ...decision.actionOverrides } } : {}), review_token: data.review_token }) })
}
