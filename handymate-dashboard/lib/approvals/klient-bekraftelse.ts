'use client'
/**
 * Klientsidan av massutskicksgrinden (lib/approvals/massutskick.ts).
 *
 * Alla webbytor som godkänner kort går genom postKortbeslut. Svarar servern
 * 428 med requires_confirmation visas mellanskärmen — texten och antalet
 * mottagare — och beslutet skickas igen med confirm_recipients bara om
 * användaren sagt ja. Avbryt returnerar 428-svaret oförändrat, så anroparen
 * behandlar det som "inte skickat".
 */

export interface KortbeslutInit {
  headers: Record<string, string>
  body: Record<string, unknown>
  keepalive?: boolean
}

export function massutskickText(svar: { recipient_count: number; message: string; recipients_preview?: string[] }): string {
  const forsta = (svar.recipients_preview || []).slice(0, 3).join(', ')
  return [
    `Det här skickas till ${svar.recipient_count} kunder${forsta ? ` (bl.a. ${forsta})` : ''}.`,
    '',
    svar.message ? `"${svar.message}"` : '(ingen text)',
    '',
    `Skicka till alla ${svar.recipient_count}?`,
  ].join('\n')
}

export async function postKortbeslut(id: string, init: KortbeslutInit): Promise<Response> {
  const skicka = (body: Record<string, unknown>) => fetch(`/api/approvals/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
    ...(init.keepalive ? { keepalive: true } : {}),
  })
  const res = await skicka(init.body)
  if (res.status !== 428) return res
  const svar = await res.clone().json().catch(() => null)
  if (!svar?.requires_confirmation) return res
  const ja = typeof window !== 'undefined' && window.confirm(massutskickText(svar))
  if (!ja) return res
  return skicka({ ...init.body, [svar.confirm_field || 'confirm_recipients']: svar.recipient_count })
}
