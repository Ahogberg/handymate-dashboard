export class InvalidPaymentCommandKey extends Error {}

/** Reject malformed keys rather than collapsing two different commands by sanitization. */
export function paymentCommandId(header: string | null, body: unknown): string {
  const value = header ?? body ?? crypto.randomUUID()
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(value)) throw new InvalidPaymentCommandKey('Ogiltig Idempotency-Key')
  return value
}

