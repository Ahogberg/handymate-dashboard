import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { createQuote } from '@/lib/quotes/create-quote'
import { createDiaryEntry } from '@/lib/diary/write'
import { createGoogleEvent, ensureValidToken } from '@/lib/google-calendar'

/**
 * POST /api/voice/execute
 * Tar emot en godkänd action → skapar posten i databasen.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Etapp 0 (multi-employee-parity-plan.md): denna route saknade helt
  // anställd-identitet innan — bara getAuthenticatedBusiness (business-
  // nivå). Routen har ingen egen/alternativ auth-mekanism (verifierat: den
  // enda auth-koden i filen var getAuthenticatedBusiness ovan, och ingen
  // caller av /api/voice/execute hittades i klient-koden i repot — den
  // körs bakom samma cookie/Bearer-session som allt annat), så detta
  // lägger till identitet utan att dubbel-autentisera eller blockera ett
  // annat flöde.
  const currentUser = await getCurrentUser(request)
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.action?.type) {
    return NextResponse.json({ error: 'Ingen action angiven' }, { status: 400 })
  }

  const { action } = body
  const supabase = getServerSupabase()
  const businessId = business.business_id

  try {
    switch (action.type) {

      case 'time_report': {
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)

        // Find active project for this customer
        const { data: project } = await supabase
          .from('project')
          .select('project_id')
          .eq('business_id', businessId)
          .eq('customer_id', customer.customer_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        const hours = Number(action.data.hours) || 0
        const entryId = 'te_' + Math.random().toString(36).substr(2, 9)

        const { error: teError } = await supabase.from('time_entry').insert({
          time_entry_id: entryId,
          business_id: businessId,
          // Etapp 1 Tier A (multi-employee-parity-plan.md): identiteten
          // finns redan direkt via currentUser efter Etapp 0 ovan — ingen
          // join behövs (till skillnad från checkin/approve och
          // time_attestation som bara har ett auth-uuid i payloaden).
          business_user_id: currentUser.id,
          customer_id: customer.customer_id,
          project_id: project?.project_id || null,
          description: action.data.description || '',
          duration_minutes: Math.round(hours * 60),
          work_date: action.data.date || new Date().toISOString().split('T')[0],
          is_billable: true,
        })
        if (teError) {
          console.error('[voice/execute] time_entry insert error:', teError)
          return NextResponse.json({ success: false, error: 'Kunde inte spara tidrapport' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Tidrapport skapad: ${hours} tim`,
          data: { time_entry_id: entryId, customer_id: customer.customer_id },
        })
      }

      case 'work_log': {
        // Byggdagboken (2026-09-02): raden måste ha ett projekt — order_id är
        // NOT NULL, och tidigare föll skrivningen på 23502 varje gång namnet
        // inte matchade. Nu: hitta projektet eller säg ifrån.
        const projekt = await resolveProject(supabase, businessId, action.data)
        if (!projekt) return projektSaknas()

        const dagbok = await createDiaryEntry(supabase, {
          business_id: businessId,
          order_id: projekt.project_id,
          business_user_id: currentUser.id,
          date: action.data.date || svIdag(),
          work_performed: action.data.description || '',
        })
        if (!dagbok.ok) {
          console.error('[voice/execute] work_log error:', dagbok.error)
          return NextResponse.json({ success: false, error: 'Kunde inte spara dagboksraden' }, { status: dagbok.status })
        }

        return NextResponse.json({
          success: true,
          message: dagbok.duplicate ? 'Dagboksraden fanns redan' : `Dagboksrad sparad på ${projekt.name}`,
          data: { log_id: dagbok.id, project_id: projekt.project_id },
        })
      }

      case 'material': {
        // Material bokförs som en dagboksrad på projektet (ingen egen
        // materialtabell i röstflödet) — materials_used är dagbokens fält.
        const projekt = await resolveProject(supabase, businessId, action.data)
        if (!projekt) return projektSaknas()
        const content = `Material: ${action.data.description || ''}\nBelopp: ${action.data.amount_sek || 0} kr`

        const dagbok = await createDiaryEntry(supabase, {
          business_id: businessId,
          order_id: projekt.project_id,
          business_user_id: currentUser.id,
          date: svIdag(),
          work_performed: content,
          materials_used: action.data.description || '',
        })
        if (!dagbok.ok) {
          console.error('[voice/execute] material error:', dagbok.error)
          return NextResponse.json({ success: false, error: 'Kunde inte logga material' }, { status: dagbok.status })
        }

        return NextResponse.json({
          success: true,
          message: `Material loggat på ${projekt.name}: ${action.data.amount_sek || 0} kr`,
          data: { log_id: dagbok.id, project_id: projekt.project_id },
        })
      }

      case 'invoice': {
        // Create a draft quote that can be converted to invoice.
        // Kanoniska byggaren — röstutkasten saknade tidigare både nummer och
        // sign_token och var därmed olänkbara och osynliga i listor.
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)
        const skapad = await createQuote(supabase, businessId, {
          customerId: customer.customer_id,
          title: action.data.description || 'Faktura (röstkommando)',
          source: 'voice',
        })
        if (!skapad.success) {
          console.error('[voice/execute] invoice draft insert error:', skapad.error)
          return NextResponse.json({ success: false, error: 'Kunde inte skapa faktura-utkast' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: 'Offert/faktura-utkast skapat',
          data: { quote_id: skapad.quoteId, customer_id: customer.customer_id },
        })
      }

      case 'quote': {
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)
        const amount = Number(action.data.estimated_amount) || 0

        // Beloppet blir en riktig rad i quote_items — inte bara ett total-fält
        // på huvudet som PDF:en ändå inte kan visa.
        const skapad = await createQuote(supabase, businessId, {
          customerId: customer.customer_id,
          title: action.data.description || 'Offert (röstkommando)',
          source: 'voice',
          items: amount > 0
            ? [{ description: action.data.description || 'Arbete enligt röstkommando', quantity: 1, unit: 'st', unit_price: amount }]
            : [],
        })
        if (!skapad.success) {
          console.error('[voice/execute] quote insert error:', skapad.error)
          return NextResponse.json({ success: false, error: 'Kunde inte skapa offert' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Offert ${skapad.quoteNumber} skapad: ${amount > 0 ? amount + ' kr' : 'utkast'}`,
          data: { quote_id: skapad.quoteId, customer_id: customer.customer_id },
        })
      }

      case 'note': {
        // Anteckningen lever i projektets byggdagbok (ingen fristående
        // anteckningstabell) — alltså måste den höra till ett projekt.
        const projekt = await resolveProject(supabase, businessId, action.data)
        if (!projekt) return projektSaknas()

        const dagbok = await createDiaryEntry(supabase, {
          business_id: businessId,
          order_id: projekt.project_id,
          business_user_id: currentUser.id,
          date: svIdag(),
          work_performed: action.data.title || 'Anteckning',
          description: action.data.content || '',
        })
        if (!dagbok.ok) {
          console.error('[voice/execute] note error:', dagbok.error)
          return NextResponse.json({ success: false, error: 'Kunde inte spara anteckning' }, { status: dagbok.status })
        }

        return NextResponse.json({
          success: true,
          message: dagbok.duplicate ? 'Anteckningen fanns redan' : `Anteckning sparad på ${projekt.name}`,
          data: { note_id: dagbok.id, log_id: dagbok.id, project_id: projekt.project_id },
        })
      }

      case 'sms': {
        // Find customer phone number
        const { data: customer } = await supabase
          .from('customer')
          .select('customer_id, phone_number, name')
          .eq('business_id', businessId)
          .ilike('name', `%${action.data.recipient_name || ''}%`)
          .limit(1)
          .maybeSingle()

        if (!customer?.phone_number) {
          return NextResponse.json({
            success: false,
            error: `Kunde inte hitta telefonnummer för "${action.data.recipient_name}"`,
          }, { status: 404 })
        }

        // ═══ OPT-OUT-SPÄRREN FÖRBIGICKS (2026-08-08) ═══
        //
        // Grenen anropade api.46elks.com direkt och hoppade därmed över allt
        // sendSmsViaElks gör: opt-out-kontrollen (en kund som avböjt SMS fick
        // ändå ett), E.164-normaliseringen och sms_log-raden. Ett utskick som
        // inte finns i loggen går inte att svara för i efterhand.
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const smsResult = await sendSmsViaElks({
          supabase,
          businessId,
          businessName: business.business_name,
          to: customer.phone_number,
          message: action.data.message || '',
          customerId: customer.customer_id,
          messageType: 'voice_action',
          recipient: 'customer',
          purpose: 'conversational',
        })

        if (!smsResult.success) {
          return NextResponse.json(
            { success: false, error: smsResult.error || 'SMS kunde inte skickas' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: `SMS skickat till ${customer.name}`,
        })
      }

      case 'calendar': {
        // Create calendar event via Google Calendar if connected
        try {
          const { data: connection } = await supabase
            .from('calendar_connection')
            .select('id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled')
            .eq('business_id', businessId)
            .eq('provider', 'google')
            .order('connected_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (!connection?.access_token || !connection.refresh_token || !connection.calendar_id || connection.sync_enabled === false) {
            return NextResponse.json({
              success: false,
              error: 'Google Calendar ej kopplad',
            }, { status: 400 })
          }

          const tokenResult = await ensureValidToken({
            id: connection.id,
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
            token_expires_at: connection.token_expires_at,
          })
          if (!tokenResult) {
            return NextResponse.json({ success: false, error: 'Google Calendar behöver återanslutas' }, { status: 400 })
          }
          if (tokenResult.access_token !== connection.access_token) {
            const { error: tokenSaveError } = await supabase
              .from('calendar_connection')
              .update({
                access_token: tokenResult.access_token,
                token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
                sync_error: null,
              })
              .eq('id', connection.id)
            if (tokenSaveError) throw tokenSaveError
          }

          const dateStr = action.data.date || new Date().toISOString().split('T')[0]
          const timeStr = action.data.time || '09:00'
          const durationHours = Number(action.data.duration_hours) || 1

          const start = new Date(`${dateStr}T${timeStr}:00`)
          const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

          const eventId = await createGoogleEvent(
            tokenResult.access_token,
            connection.calendar_id,
            {
              summary: action.data.title || 'Händelse (röstkommando)',
              start,
              end,
            }
          )

          return NextResponse.json({
            success: true,
            message: `Kalenderhändelse skapad: ${action.data.title}`,
            data: { event_id: eventId },
          })
        } catch (calErr) {
          console.error('[voice/execute] Calendar error:', calErr)
          return NextResponse.json({
            success: false,
            error: 'Kunde inte skapa kalenderhändelse',
          }, { status: 500 })
        }
      }

      default:
        return NextResponse.json({ error: `Okänd action: ${action.type}` }, { status: 400 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[voice/execute] Error:', message)
    return NextResponse.json({ error: 'Kunde inte utföra action' }, { status: 500 })
  }
}

/**
 * Hitta befintlig kund eller skapa ny baserat på namn.
 */
async function findOrCreateCustomer(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  name: string
): Promise<{ customer_id: string }> {
  if (!name) {
    // Return a placeholder — will still create a customer record
    name = 'Okänd kund'
  }

  const { data: existing } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
  const { data: created } = await supabase
    .from('customer')
    .insert({
      customer_id: customerId,
      business_id: businessId,
      name,
      created_at: new Date().toISOString(),
    })
    .select('customer_id')
    .single()

  return created || { customer_id: customerId }
}

/** Dagens datum i svensk tid (YYYY-MM-DD) — dagboken daterar efter bygget, inte UTC. */
function svIdag(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
}

/**
 * Löser projektet en dagboksrad hör till: `project_id` när klienten redan
 * vet det, annars namnsökning inom företaget. Returnerar null när inget
 * projekt går att peka ut — då får anroparen säga ifrån i stället för att
 * skriva en rad utan projekt (order_id är NOT NULL).
 */
async function resolveProject(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  data: { project_id?: unknown; project_name?: unknown } | null | undefined,
): Promise<{ project_id: string; name: string } | null> {
  const projectId = typeof data?.project_id === 'string' ? data.project_id.trim() : ''
  if (projectId) {
    const { data: byId } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (byId) return byId
  }
  const projectName = typeof data?.project_name === 'string' ? data.project_name.trim() : ''
  if (!projectName) return null
  const { data: byName } = await supabase
    .from('project')
    .select('project_id, name')
    .eq('business_id', businessId)
    .ilike('name', `%${projectName}%`)
    .limit(1)
    .maybeSingle()
  return byName ?? null
}

function projektSaknas() {
  return NextResponse.json(
    { success: false, error: 'Ange vilket projekt anteckningen gäller' },
    { status: 400 },
  )
}
