import { createHmac, timingSafeEqual } from 'node:crypto'
import { classify } from './action-contract'
import type { PreparedApprovalReview } from './prepare-review'
import { buildApprovalReview } from './review-contract'

const TTL = 10 * 60 * 1000
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
}
export function requireApprovalReview(input: {
  approval: { id: string; approval_type: string; title?: string; payload?: any; package_data?: any }
  businessId: string; actorId: string; body: Record<string, any>; prepared?: PreparedApprovalReview
}, secret: string, now = Date.now()) {
  const { approval, body } = input
  if (body.action === 'snooze') return null
  if (body.action === 'reject' && !input.prepared) return { status: 428, data: { error: 'Granska följderna av avvisningen först.' } }
  const klass = classify(approval.approval_type)
  if (body.action !== 'reject' && (klass === 'INFORMATIONAL' || klass === 'ACKNOWLEDGEMENT')) return null
  const payload = body.action === 'edit' ? { ...approval.payload, ...body.edited_payload, edited: true } : approval.payload
  const review = input.prepared?.review || buildApprovalReview({ ...approval, payload })
  if (review.open && !review.confirmLabel) return { status: 428, data: { review, code: 'approval_navigation_required' } }
  if (!review.confirmLabel) return { status: 422, data: { error: review.blockedReason, code: 'approval_review_unavailable', review } }
  if (!secret) return { status: 503, data: { error: 'Granskningen kunde inte verifieras. Försök igen senare.' } }
  const binding = canonical({ id: approval.id, businessId: input.businessId, actorId: input.actorId,
    type: approval.approval_type, payload, packageData: approval.package_data ?? null, action: body.action, overrides: body.action_overrides ?? null, snapshot: input.prepared?.snapshot ?? null, review })
  const sign = (expires: number) => createHmac('sha256', secret).update(`approval-review-v1\n${expires}\n${binding}`).digest('hex')
  const [expiry, signature] = typeof body.review_token === 'string' ? body.review_token.split('.') : []
  const expires = Number(expiry)
  if (Number.isSafeInteger(expires) && expires > now && expires <= now + TTL && /^[a-f0-9]{64}$/.test(signature || '') &&
      timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(expires), 'hex'))) return null
  const expiryAt = now + TTL
  return { status: 428, data: { code: 'approval_review_required', error: 'Granska hela innehållet och mottagarna innan du bekräftar.',
    review, review_token: `${expiryAt}.${sign(expiryAt)}` } }
}
