/**
 * 46elks leveransrapport (`whendelivered`) — tolkningen av kroppen.
 *
 * Bodde till 2026-09-18 i app/api/sms/delivered/route.ts. Next.js 14 tillåter
 * bara ett fixt antal exporter ur en route-fil, och den exporterade tolken
 * fällde `npx tsc --noEmit` via `.next/types`. Funktionen är ren — den hör
 * hemma i lib och testas utan HTTP.
 *
 * ANTAGANDE OM FÄLTNAMN (dokumenterat, inte gissat i tysthet): 46elks
 * dokumentation var inte nåbar från byggmiljön (utgående trafik blockerad),
 * så parsern är tolerant. Den läser id ur `id`/`smsid`/`messageid`, status ur
 * `status`/`delivery_status` och tidpunkten ur `delivered`/`delivered_at`/
 * `created`, och tar både form-urlencoded och JSON. Okända statusvärden
 * ignoreras hellre än tolkas fel. Se tests/sms-leverans.spec.ts.
 */

/** `delivered` | `failed` — allt annat är okänt och skrivs inte. */
export type Leveransutfall = 'delivered' | 'failed'

export interface Leveransrapport {
  elksId: string | null
  utfall: Leveransutfall | null
  tidpunkt: string | null
}

/** Ren funktion, testbar utan HTTP: rå kropp → leveransfakta. */
export function tolkaLeveransrapport(rawBody: string, contentType?: string | null): Leveransrapport {
  let falt: Record<string, string> = {}
  const trimmad = (rawBody || '').trim()
  const serJsonUt = trimmad.startsWith('{') || (contentType || '').includes('application/json')
  if (serJsonUt) {
    try {
      const parsed = JSON.parse(trimmad)
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== null && v !== undefined && typeof v !== 'object') falt[k.toLowerCase()] = String(v)
        }
      }
    } catch { /* faller tillbaka på form-urlencoded nedan */ }
  }
  if (Object.keys(falt).length === 0) {
    new URLSearchParams(trimmad).forEach((v, k) => { falt[k.toLowerCase()] = v })
  }

  const elksId = falt['id'] || falt['smsid'] || falt['messageid'] || null

  const rått = (falt['status'] || falt['delivery_status'] || '').trim().toLowerCase()
  const utfall: Leveransutfall | null =
    rått === 'delivered' ? 'delivered'
    : rått === 'failed' || rått === 'notdelivered' || rått === 'undelivered' ? 'failed'
    : null

  const råTid = falt['delivered'] || falt['delivered_at'] || falt['created'] || ''
  const parsad = råTid ? new Date(råTid) : null
  const tidpunkt = parsad && Number.isFinite(parsad.getTime()) ? parsad.toISOString() : null

  return { elksId: elksId && elksId.trim() ? elksId.trim() : null, utfall, tidpunkt }
}
