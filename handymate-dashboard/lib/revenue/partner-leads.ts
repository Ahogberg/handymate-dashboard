export const PARTNER_LEAD_STATUS = {
  assigned: 'Ny lead', accepted: 'Accepterad', contacted: 'Kontaktad', meeting: 'Möte bokat',
  won: 'Partnern rapporterar vunnen', lost: 'Förlorad', declined: 'Avböjd', revoked: 'Återkallad',
} as const
export type PartnerLead = {
  id: string
  partner_id?: string
  status: keyof typeof PARTNER_LEAD_STATUS
  snapshot: { company_name: string; org_number: string | null; city: string | null; industry: string | null; website: string | null; contact_name: string; contact_email: string | null; contact_phone: string | null; contact_role: string | null; contact_source_url: string | null }
  brief: string
  feedback: string | null
  next_action: string | null
  next_action_at: string | null
  version: number
  created_at: string
  updated_at: string
}
export function leadId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Ogiltig identifierare.')
  return value
}
export function leadVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Uppdatera sidan innan du sparar.')
  return value
}
export function leadDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) throw new Error('Ogiltig uppföljningstid.')
  return date.toISOString()
}
/** Keep a request key on an unknown network outcome; retry the exact action safely. */
export async function sendPartnerLead(url: string, input: Record<string, unknown>) {
  const fingerprint = JSON.stringify(input)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint))
  const key = 'hm-partner-lead:' + url + ':' + Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('')
  const requestId = sessionStorage.getItem(key) || crypto.randomUUID()
  sessionStorage.setItem(key, requestId)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, request_id: requestId }) })
  if (res.ok || [400, 401, 403, 404, 409].includes(res.status)) sessionStorage.removeItem(key)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Kunde inte spara leaden.')
  return body
}
