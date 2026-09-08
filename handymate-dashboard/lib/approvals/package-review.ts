import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'

type PackageAction = { id: string; type: string; title?: string; description?: string; data: Record<string, any> }
type PackageResult = { id?: string; type?: string; ok?: boolean; info?: boolean; skipped?: string; delivery_state?: string; [key: string]: unknown }

/** Freeze every selected package part against current tenant-scoped rows. */
export async function prepareAutopilotPackageReview(
  db: SupabaseClient,
  businessId: string,
  approval: { id: string; title?: string; package_data?: any; payload?: any },
  overrides?: Record<string, string>,
  retrying = false,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: Record<string, unknown>; executionEvidence: Record<string, unknown> }> {
  const raw = approval.package_data?.actions
  if (!Array.isArray(raw) || !raw.length || new Set(raw.map((item: any) => item?.id)).size !== raw.length) throw new Error('Paketet saknar ett entydigt åtgärdsurval.')
  const previous: PackageResult[] = Array.isArray(approval.payload?.execution_result?.results) ? approval.payload.execution_result.results : []
  if (retrying && previous.some(item => item.delivery_state === 'unknown')) throw new Error('Ett tidigare SMS har osäkert leveransläge. Kontrollera leverantören innan något körs om.')
  const previousById = new Map(previous.map(item => [item.id, item]))
  const details: { label: string; text: string }[] = []
  const messages: ApprovalReview['messages'] = []
  const actions: PackageAction[] = []
  const priorResults: PackageResult[] = []
  const seenPrior = new Set<string>()
  const remember = (result: PackageResult) => { const id = String(result.id || ''); if (!seenPrior.has(id)) { priorResults.push(result); seenPrior.add(id) } }

  for (const item of raw as PackageAction[]) {
    if (!item?.id || !item.type || !item.data || typeof item.data !== 'object') throw new Error('En delåtgärd saknar id, typ eller underlag.')
    const prior = previousById.get(item.id)
    if (retrying && prior && (prior.ok === true || prior.info || prior.skipped)) { remember(prior); details.push({ label: item.title || item.type, text: 'Redan utförd eller vald bort — körs inte igen' }); continue }
    if (!retrying && (item.type === 'project_info' || overrides?.[item.id] === 'rejected')) {
      remember({ id: item.id, type: item.type, ...(item.type === 'project_info' ? { ok: true, info: true } : { skipped: 'rejected' }) })
      details.push({ label: item.title || item.type, text: item.type === 'project_info' ? JSON.stringify(item.data) : 'Vald bort' })
      continue
    }
    const data = { ...item.data }
    if (item.type === 'customer_sms') {
      if (!data.customer_id || typeof data.message !== 'string' || !data.message.trim()) throw new Error('SMS-delen saknar verifierbar kund eller fullständig text.')
      const { data: customer, error } = await db.from('customer').select('customer_id, name, phone_number')
        .eq('customer_id', data.customer_id).eq('business_id', businessId).maybeSingle()
      if (error || !customer?.phone_number || !/^\+?[0-9 ()-]{7,20}$/.test(customer.phone_number)) throw new Error('SMS-mottagaren kunde inte verifieras i företaget.')
      data.to = customer.phone_number
      messages.push({ channel: 'SMS', recipients: [customer.phone_number], text: data.message })
      details.push({ label: item.title || 'Kund-SMS', text: `Skickas till ${customer.name || customer.phone_number}` })
    } else if (item.type === 'booking_suggestion') {
      if (!data.customer_id) throw new Error('Bokningsdelen saknar kund.')
      const { data: customer, error } = await db.from('customer').select('customer_id, name').eq('customer_id', data.customer_id).eq('business_id', businessId).maybeSingle()
      const projectResult = data.project_id ? await db.from('project').select('project_id, name').eq('project_id', data.project_id).eq('business_id', businessId).maybeSingle() : { data: null, error: null }
      const start = new Date(data.scheduled_start), end = new Date(data.scheduled_end)
      if (error || !customer || projectResult.error || (data.project_id && !projectResult.data) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error('Bokningens kund, projekt eller tidsintervall kunde inte verifieras.')
      data.notes = `${data.notes || ''}\n[kort:${approval.id}:${item.id}]`.trim()
      details.push({ label: item.title || 'Bokning', text: `${customer.name || 'Kund'} · ${start.toISOString()}–${end.toISOString()}` })
      details.push({ label: 'Projekt', text: projectResult.data?.name || 'Ingen projektkoppling' })
      details.push({ label: 'Bokningsföljd', text: 'Skapar kalenderbokningen och kopplar angivet projekt; inget kundmeddelande eller faktura skickas av paketdelen' })
    } else if (item.type === 'material_list') {
      const { data: project, error } = await db.from('project').select('project_id, name').eq('project_id', data.project_id).eq('business_id', businessId).maybeSingle()
      if (error || !project || !Array.isArray(data.materials) || !data.materials.length) throw new Error('Materialens projekt eller rader kunde inte verifieras.')
      data.materials.forEach((material: any) => { if (!material?.name || !Number.isFinite(material.quantity) || material.quantity <= 0 || !Number.isFinite(material.unit_price ?? 0)) throw new Error('En materialrad har ogiltigt namn, antal eller pris.') })
      details.push({ label: item.title || 'Material', text: `${data.materials.length} rader registreras på ${project.name || project.project_id}` })
    } else throw new Error(`Delåtgärden ${item.title || item.type} saknar en säker exekveringsväg.`)
    actions.push({ id: item.id, type: item.type, title: item.title, description: item.description, data })
  }
  if (retrying && !actions.length) throw new Error('Det finns ingen säkert misslyckad paketdel kvar att köra om.')
  const evidence = { kind: 'autopilot_package', actions, priorResults, retrying }
  return {
    executionPayload: evidence,
    executionEvidence: evidence,
    snapshot: { package: evidence },
    review: {
      title: retrying ? `Försök igen — ${approval.title || 'paket'}` : approval.title || 'Granska paketet',
      effect: retrying ? 'Kör endast om paketdelar som säkert misslyckades. Redan utförda eller valda bort delar körs inte igen.' : 'Utför endast de visade och valda delarna. Varje del får ett eget beständigt utfall.',
      confirmLabel: retrying ? 'Kör om misslyckade delar' : 'Utför de granskade delarna', messages, details,
    },
  }
}
