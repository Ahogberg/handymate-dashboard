import { PUSH_POLICY } from '@/lib/notifications/push-policy'
// One provider request per frozen registration; no broadcast or fallback channel.
export async function sendReviewedPush(table: string, registration: any, message: { title: string; body: string; url: string }, tag: string): Promise<{state: string; reference?: string; error?: string}> {
  if (table === 'push_tokens') {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type':'application/json', Accept:'application/json' }, body: JSON.stringify([{
        to: registration.token, title: message.title, body: message.body, sound:'default',
        data: { url: message.url, tag }, ttl: PUSH_POLICY.beslut.ttlSeconds, priority: PUSH_POLICY.beslut.priority,
      }]) })
      if (!response.ok) return { state: 'unknown', error: 'Expo gav inget säkert leveransbesked.' }
      const body = await response.json(), ticket = Array.isArray(body.data) ? body.data[0] : body.data
      if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id) return { state:'accepted', reference:ticket.id }
      if (ticket?.status === 'error') return { state:'failed', error:'Expo avvisade pushförsöket.' }
      return { state:'unknown', error:'Expo-kvittensen är ofullständig.' }
    } catch { return { state:'unknown', error:'Expo-svaret förlorades.' } }
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return { state:'failed', error:'Webbpush saknar konfiguration. Inget anrop gjordes.' }
  let webpush: typeof import('web-push')
  try {
    webpush = await import('web-push')
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@handymate.se', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  } catch { return { state:'failed', error:'Webbpush kunde inte förberedas. Inget anrop gjordes.' } }
  try {
    const response = await webpush.sendNotification({ endpoint:registration.endpoint, keys:{ p256dh:registration.p256dh, auth:registration.auth } }, JSON.stringify({ ...message, tag }), { TTL:PUSH_POLICY.beslut.ttlSeconds, urgency:'high' })
    return response.statusCode >= 200 && response.statusCode < 300 ? { state:'accepted', reference:String(response.statusCode) } : { state:'unknown', error:'Webbpush saknar säkert acceptansbesked.' }
  } catch (error: any) {
    return [404,410,429].includes(error?.statusCode) ? { state:'failed', error:'Pushtjänsten avvisade webbpushen.' } : { state:'unknown', error:'Webbpushens utfall är osäkert.' }
  }
}
