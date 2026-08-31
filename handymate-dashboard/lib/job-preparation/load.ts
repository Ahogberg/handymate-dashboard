import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, isOwnerOrAdmin, type BusinessUser } from '../permissions'
import { WON_QUOTE_STATUSES } from '../quotes/statuses'
import { PreparationError, type JobPreparation, type PreparationSection, type PreparationSelector, type PreparationItem } from './types'

const LIMIT = 12
const bookingColumns = 'booking_id,project_id,customer_id,scheduled_start,scheduled_end,status,job_status,completed_at'
const clean = (value: unknown, max = 400): string => typeof value === 'string' ? value.trim().slice(0, max) : ''
const pathId = (value: string) => encodeURIComponent(value)
const inactiveBooking = (row: any) => row.completed_at || ['cancelled', 'completed', 'no_show'].includes(row.status) || ['cancelled', 'completed'].includes(row.job_status)

/** Optional reads fail independently. Returned AND thrown errors remain unknown, never empty facts. */
async function read<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T | null; failed: boolean }> {
  try {
    const result = await query
    return { data: result.error ? null : result.data, failed: !!result.error }
  } catch { return { data: null, failed: true } }
}
function section(key: string, title: string, state: PreparationSection['state'], message: string, items: PreparationItem[] = [], truncated = false): PreparationSection {
  return { key, title, state, message, items, truncated }
}
async function rowsSection(key: string, title: string, empty: string, query: PromiseLike<any>, map: (row: any) => PreparationItem): Promise<PreparationSection> {
  const result = await read<any[]>(query)
  if (result.failed || !Array.isArray(result.data)) return section(key, title, 'unavailable', 'Underlaget kunde inte läsas. Försök igen.')
  const truncated = result.data.length > LIMIT
  const items = result.data.slice(0, LIMIT).map(map)
  return section(key, title, items.length ? 'available' : 'missing', items.length ? (truncated ? `Visar de första ${LIMIT}. Öppna källan för resten.` : `${items.length} ${items.length === 1 ? 'post' : 'poster'} i det lästa underlaget.`) : empty, items, truncated)
}

/**
 * Service role: tenancy + active membership + project access BEFORE child reads.
 * Do not reuse installations GET (it seeds drafts) or morning-brief (cache writes).
 * Explicit booking/project only: customer equality is NOT a project join.
 */
export async function loadJobPreparation(
  db: SupabaseClient, businessId: string, user: BusinessUser | null,
  selector: PreparationSelector, now = new Date(),
): Promise<JobPreparation> {
  if (!user || !user.is_active || user.business_id !== businessId) throw new PreparationError(403, 'Du saknar behörighet till förberedelsen.')
  let booking: any = null
  let projectId = selector.projectId
  if (selector.bookingId) {
    const result = await read<any>(db.from('booking').select(bookingColumns).eq('business_id', businessId).eq('booking_id', selector.bookingId).maybeSingle())
    if (result.failed) throw new PreparationError(503, 'Bokningen kunde inte läsas. Försök igen.')
    if (!result.data) throw new PreparationError(404, 'Bokningen hittades inte.')
    booking = result.data
    projectId = booking.project_id
    if (!projectId) throw new PreparationError(409, 'Bokningen saknar projektkoppling. Koppla den till rätt projekt först.')
  }
  if (!projectId) throw new PreparationError(400, 'Välj en bokning eller ett projekt.')
  // Being in the company / knowing an ID does not grant an employee project access.
  if (!hasPermission(user, 'see_all_projects')) {
    const access = await read<any[]>(db.from('project_assignment').select('id').eq('business_id', businessId).eq('project_id', projectId).eq('business_user_id', user.id).limit(1))
    if (access.failed) throw new PreparationError(503, 'Projektbehörigheten kunde inte kontrolleras.')
    if (!access.data?.length) throw new PreparationError(403, 'Du behöver vara tilldelad projektet för att läsa förberedelsen.')
  }
  const projectRead = await read<any>(db.from('project').select('project_id,customer_id,quote_id,name').eq('business_id', businessId).eq('project_id', projectId).maybeSingle())
  if (projectRead.failed) throw new PreparationError(503, 'Projektet kunde inte läsas. Försök igen.')
  const project = projectRead.data
  if (!project) throw new PreparationError(404, 'Projektet hittades inte.')
  if (!booking) {
    const next = await read<any[]>(db.from('booking').select(bookingColumns).eq('business_id', businessId).eq('project_id', projectId)
      .gte('scheduled_start', now.toISOString()).eq('status', 'confirmed').is('completed_at', null)
      .or('job_status.is.null,job_status.not.in.(cancelled,completed)').order('scheduled_start').order('booking_id').limit(2))
    if (next.failed || !Array.isArray(next.data)) throw new PreparationError(503, 'Nästa bokning kunde inte läsas. Försök igen.')
    if (!next.data.length) throw new PreparationError(409, 'Projektet har inget kommande bokat besök. Förberedelsen utgår från en bokning.')
    if (next.data.length === 2 && next.data[0].scheduled_start === next.data[1].scheduled_start) {
      throw new PreparationError(409, 'Flera besök börjar samtidigt. Öppna rätt bokning i kalendern för att förbereda just det besöket.')
    }
    booking = next.data[0]
  }
  if (inactiveBooking(booking)) throw new PreparationError(409, 'Besöket är avslutat eller avbokat. Välj en aktuell bokning.')
  if (!clean(booking.scheduled_start) || !Number.isFinite(Date.parse(booking.scheduled_start))) throw new PreparationError(409, 'Bokningen saknar en giltig starttid.')
  if (!project.customer_id || (booking.customer_id && booking.customer_id !== project.customer_id)) {
    throw new PreparationError(409, 'Kundkopplingen behöver kontrolleras mellan bokning och projekt. Ingen kundhistorik har hämtats.')
  }
  const customerRead = await read<any>(db.from('customer').select('customer_id,name').eq('business_id', businessId).eq('customer_id', project.customer_id).maybeSingle())
  if (customerRead.failed) throw new PreparationError(503, 'Kundkopplingen kunde inte kontrolleras.')
  if (!customerRead.data) throw new PreparationError(409, 'Projektets kundkoppling kunde inte verifieras.')

  const projectHref = `/dashboard/projects/${pathId(projectId)}`
  const sourceItem = (id: string, text: string, tab: string, source: string): PreparationItem => ({ id, text, source, href: `${projectHref}?tab=${tab}` })
  const financialAccess = hasPermission(user, 'see_financials')
  // Address comes ONLY from this project's won quote, never the customer's home address.
  const quoteRead = project.quote_id ? await read<any>(db.from('quotes').select('quote_id,status,project_address')
    .eq('business_id', businessId).eq('quote_id', project.quote_id).eq('customer_id', project.customer_id).maybeSingle()) : { data: null, failed: false }
  const wonQuote = quoteRead.data && WON_QUOTE_STATUSES.includes(quoteRead.data.status) ? quoteRead.data : null
  const address: JobPreparation['address'] = {
    text: wonQuote ? clean(wonQuote.project_address) || null : null,
    state: quoteRead.failed ? 'unavailable' : wonQuote && clean(wonQuote.project_address) ? 'available' : 'missing',
    source: 'Projektadress i projektets accepterade/signerade offert. Kontrollera att den gäller detta besök.',
  }
  const scope = !financialAccess
    ? section('scope', 'Överenskommet arbete', 'restricted', 'Offertunderlaget visas inte med din ekonomibehörighet. Be projektansvarig bekräfta omfattningen.')
    : quoteRead.failed ? section('scope', 'Överenskommet arbete', 'unavailable', 'Offertkopplingen kunde inte läsas.')
    : !wonQuote ? section('scope', 'Överenskommet arbete', 'missing', 'Ingen accepterad/signerad offert kunde verifieras via projektets offertkoppling.')
    : await rowsSection('scope', 'Överenskommet arbete', 'Inga synliga arbets-/materialrader hittades i den kopplade offerten.', db.from('quote_items')
      .select('id,description').eq('business_id', businessId).eq('quote_id', wonQuote.quote_id)
      .eq('is_hidden', false).in('item_type', ['item', 'option'])
      .or('item_type.neq.option,option_selected.eq.true').order('sort_order').order('id').limit(LIMIT + 1),
      row => sourceItem(row.id, clean(row.description) || 'Offertpost utan beskrivning', 'quote_spec', 'Accepterad/signerad offert — inte bevis på utfört arbete'))

  const sections = await Promise.all([
    Promise.resolve(scope),
    financialAccess ? rowsSection('changes', 'Ändringar och tillägg', 'Inga projektkopplade ÄTA-poster hittades.', db.from('project_change')
      .select('change_id,description,status,declined_at').eq('business_id', businessId).eq('project_id', projectId).order('created_at', { ascending: false }).order('change_id').limit(LIMIT + 1),
      row => {
        const state = row.declined_at ? 'Avböjd' : ({ approved: 'Godkänd — inte bevis på utfört', pending: 'Väntar på godkännande', draft: 'Utkast', sent: 'Skickad — inte godkänd', invoiced: 'Fakturerad — inte bevis på utfört', rejected: 'Avböjd', declined: 'Avböjd' } as Record<string, string>)[row.status] || 'Status behöver granskas'
        return sourceItem(row.change_id, `${state}: ${clean(row.description) || 'Ändring utan beskrivning'}`, 'changes', 'Projektets ÄTA-register')
      }) : Promise.resolve(section('changes', 'Ändringar och tillägg', 'restricted', 'ÄTA-underlaget kräver ekonomibehörighet. Bekräfta tilläggens omfattning med projektansvarig.')),
    rowsSection('checklists', 'Kontrollpunkter', 'Inga checklistor är kopplade till projektet. Det betyder inte att inga kontroller behövs.', db.from('project_checklist')
      .select('id,name,status,items').eq('business_id', businessId).eq('project_id', projectId).order('created_at', { ascending: false }).order('id').limit(LIMIT + 1),
      row => {
        // Existing confirmed playbook checkpoints already live here. No new proposals.
        const items = Array.isArray(row.items) ? row.items : []
        const open = items.filter((item: any) => item && item.checked === false && typeof item.text === 'string')
        const text = open.slice(0, 3).map((item: any) => clean(item.text, 160)).join('; ')
        return sourceItem(row.id, `${clean(row.name) || 'Checklista'}${text ? ` — Ej avbockat: ${text}${open.length > 3 ? ' …' : ''}` : ' — Öppna checklistan för aktuell status.'}`, 'checklists', 'Projektchecklista — avbockning är inte bevis på leverans')
      }),
    rowsSection('documents', financialAccess ? 'Handlingar' : 'Ritningar och foton', 'Inga handlingar inom denna behörighet hittades på projektet.', (() => {
      let query = db.from('project_document').select('id,name,category').eq('business_id', businessId).eq('project_id', projectId)
      if (!financialAccess) query = query.in('category', ['drawing', 'photo'])
      return query.order('created_at', { ascending: false }).order('id').limit(LIMIT + 1)
    })(), row => sourceItem(row.id, clean(row.name) || 'Dokument utan namn', 'documents', 'Projektets dokumentregister — innehållet har inte tolkats')),
    rowsSection('installations', 'Dokumenterade installationer', 'Inga bekräftade installationer hittades på just detta projekt.', db.from('installation')
      .select('installation_id,name,model,placement').eq('business_id', businessId).eq('project_id', projectId).eq('customer_id', project.customer_id).eq('status', 'confirmed')
      .order('created_at', { ascending: false }).order('installation_id').limit(LIMIT + 1),
      row => ({ id: row.installation_id, text: [clean(row.name), clean(row.model), clean(row.placement)].filter(Boolean).join(' · ') || 'Installation', source: 'Bekräftad installation på detta projekt', href: `${projectHref}/installationer` })),
    // Communications can contain private/financial content; project assignment alone is insufficient.
    isOwnerOrAdmin(user) ? rowsSection('communication', 'Projektkopplad kundkontakt', 'Ingen SMS-/e-postaktivitet med uttrycklig projektkoppling hittades. Kundens övriga samtal och meddelanden ingår inte.', db.from('customer_activity')
      .select('activity_id,title,created_at,activity_type').eq('business_id', businessId).eq('customer_id', project.customer_id).eq('metadata->>project_id', projectId)
      .in('activity_type', ['sms_sent', 'sms_received', 'email_sent', 'email_received']).order('created_at', { ascending: false }).order('activity_id').limit(LIMIT + 1),
      row => ({ id: row.activity_id, text: `${clean(row.created_at, 10)} · ${clean(row.title) || 'Kundkontakt'}`, source: 'Registrerad SMS-/e-postaktivitet med projekt-ID. Öppna tidslinjen för innehållet.', href: `/dashboard/customers/${pathId(project.customer_id)}?tab=timeline` }))
      : Promise.resolve(section('communication', 'Projektkopplad kundkontakt', 'restricted', 'Kundkommunikation visas bara för ägare/admin här. Be projektansvarig om besöksinstruktioner.')),
  ])
  return {
    version: 1, agent: 'lars', observedAt: now.toISOString(),
    booking: { id: booking.booking_id, start: booking.scheduled_start, end: booking.scheduled_end, href: `/dashboard/bookings/${pathId(booking.booking_id)}` },
    project: { id: project.project_id, name: clean(project.name) || 'Projekt', href: projectHref },
    customer: { id: customerRead.data.customer_id, name: clean(customerRead.data.name) || 'Kund' },
    address, sections,
  }
}
