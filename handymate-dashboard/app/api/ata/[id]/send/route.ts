import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { sendSmsViaElks } from '@/lib/sms-send'
import { canTransitionAta, ataTransitionError } from '@/lib/ata/lifecycle'
import { byggAtaSms } from '@/lib/ata/send-message'
import { normaliseraAtaRader } from '@/lib/ata/items'
import { beraknaAtaSummor } from '@/lib/ata/totals'

export const dynamic = 'force-dynamic'

/**
 * Gemensam upplösning för GET (förhandsvisning) och POST (skicka):
 * ÄTA → projekt → kund → signeringslänk → SMS-text. GET och POST måste
 * visa/skicka EXAKT samma text, därför bor allt i en funktion.
 */
async function losUtskick(request: NextRequest, changeId: string) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return { fel: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = getServerSupabase()

  // Two-query lookup — project_change.project_id och project.customer_id
  // är båda oconstrained TEXT (TD-7-pattern). Nested select föll tyst på
  // PGRST200 och kastade generisk "ÄTA hittades inte" oavsett rotorsak.
  const { data: ata, error: ataError } = await supabase
    .from('project_change')
    .select('*')
    .eq('change_id', changeId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (ataError) {
    console.error('[ata/send] fetch ata error:', ataError)
    return { fel: NextResponse.json({ error: ataError.message, code: ataError.code }, { status: 500 }) }
  }
  if (!ata) {
    return { fel: NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 }) }
  }
  if (!ata.sign_token) {
    return { fel: NextResponse.json({ error: 'ÄTA saknar signeringstoken' }, { status: 400 }) }
  }

  // Livscykeln gäller även här: en signerad/fakturerad ÄTA får inte
  // "skickas om" och därmed tappa sin signatur-status.
  if (!canTransitionAta(ata.status, 'sent')) {
    return { fel: NextResponse.json({ error: ataTransitionError(ata.status, 'sent') }, { status: 400 }) }
  }

  let project: { name: string | null; customer_id: string | null } | null = null
  if (ata.project_id) {
    const { data: p, error: pErr } = await supabase
      .from('project')
      .select('name, customer_id')
      .eq('project_id', ata.project_id)
      .eq('business_id', business.business_id)
      .maybeSingle()
    if (pErr) console.error('[ata/send] fetch project error:', pErr)
    else project = p
  }

  const customerId: string | null = ata.customer_id || project?.customer_id || null
  if (!customerId) {
    return { fel: NextResponse.json({ error: 'ÄTA:n saknar kund — koppla en kund till projektet först' }, { status: 400 }) }
  }

  const { data: customer, error: cErr } = await supabase
    .from('customer')
    .select('name, phone_number, email')
    .eq('customer_id', customerId)
    .eq('business_id', business.business_id)
    .maybeSingle()
  if (cErr) console.error('[ata/send] fetch customer error:', cErr)
  if (!customer) {
    return { fel: NextResponse.json({ error: 'ÄTA:n saknar kund — koppla en kund till projektet först' }, { status: 400 }) }
  }

  // Företagsnamn KRÄVS — kunden får aldrig ett SMS som refererar till
  // ett annat företagsnamn än hantverkarens egna.
  const companyName = (business.business_name || '').trim()
  if (!companyName) {
    return {
      fel: NextResponse.json(
        {
          error: 'Företagsnamn saknas i inställningar — fyll i under Inställningar → Företag innan du skickar ÄTA',
          field: 'business_name',
        },
        { status: 400 },
      ),
    }
  }

  // Kunden landar i portalen (projektfliken) där ÄTA:n signeras. Den
  // gamla reservlänken pekade på /api/ata/sign/{token} — ett JSON-svar,
  // inte en sida — så den är borttagen: utan portallänk blir det ett fel.
  const { getOrCreatePortalLink } = await import('@/lib/portal-link')
  const signUrl = await getOrCreatePortalLink(supabase, customerId, 'projects')
  if (!signUrl) {
    return { fel: NextResponse.json({ error: 'Kunde inte skapa kundens portallänk' }, { status: 500 }) }
  }

  const rader = normaliseraAtaRader(ata.items)
  const summor = beraknaAtaSummor(rader, Number(ata.vat_rate ?? 25), ata.change_type)
  const beloppInklMoms = rader.length > 0
    ? Math.abs(summor.totalt)
    : Math.abs(Number(ata.total ?? ata.amount ?? 0)) * (1 + Number(ata.vat_rate ?? 25) / 100)

  const message = byggAtaSms({
    fornamn: customer.name ? customer.name.split(' ')[0] : null,
    foretag: companyName,
    ataNummer: ata.ata_number ?? '?',
    beskrivning: ata.description || 'Tilläggsarbete',
    beloppInklMoms,
    url: signUrl,
  })

  return { business, supabase, ata, customerId, customer, signUrl, message }
}

/**
 * GET /api/ata/[id]/send — förhandsvisning för "Skicka ÄTA"-dialogen:
 * mottagare, kundnamn och exakt den text som POST kommer att skicka.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const r = await losUtskick(request, params.id)
    if ('fel' in r) return r.fel
    return NextResponse.json({
      to: r.customer.phone_number || null,
      customer_name: r.customer.name || null,
      message: r.message,
      signUrl: r.signUrl,
    })
  } catch (error: any) {
    console.error('GET /api/ata/[id]/send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/ata/[id]/send — Skicka ÄTA till kund för signering
 * Body: { method: 'sms' | 'email', to?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const { method = 'sms', to } = body

    const r = await losUtskick(request, params.id)
    if ('fel' in r) return r.fel
    const { business, supabase, ata, customerId, customer, signUrl, message } = r

    if (method === 'email') {
      // E-postutskick av ÄTA är inte implementerat än. Markera ALDRIG som
      // skickad utan att kunden faktiskt fått länken — det dolde tidigare ett
      // tyst leveransfel. Be användaren skicka via SMS tills e-post finns.
      return NextResponse.json(
        { error: 'E-postutskick av ÄTA är inte tillgängligt än — skicka via SMS istället.' },
        { status: 501 },
      )
    }

    const rawPhone = to || customer.phone_number
    if (!rawPhone) {
      return NextResponse.json({ error: 'Inget telefonnummer att skicka till' }, { status: 400 })
    }

    // E.164-validering här i routen ger snabb 400 vid garbage-input.
    // sendSmsViaElks normaliserar igen för säkerhet (idempotent).
    const phone = normalizeSwedishPhone(rawPhone)
    if (!phone || !phone.startsWith('+')) {
      return NextResponse.json({ error: `Ogiltigt telefonnummer: "${rawPhone}"` }, { status: 400 })
    }

    // Direkt 46elks-anrop via shared helper (strypunkten).
    const smsResult = await sendSmsViaElks({
      supabase,
      businessId: business.business_id,
      businessName: business.business_name,
      to: phone,
      message,
      customerId,
      relatedId: ata.change_id,
      messageType: 'ata_send',
      recipient: 'customer',
      purpose: 'transactional',
    })

    if (!smsResult.success) {
      return NextResponse.json(
        { error: smsResult.error || 'SMS kunde inte skickas', sms_status: smsResult.status },
        { status: 500 },
      )
    }

    // SMS bekräftat skickat (sms_log INSERT redan gjord av helpern) →
    // uppdatera ÄTA-status. Om UPDATE failar har kunden ändå fått SMS:et;
    // logga warning men returnera 200 för att inte ljuga om leveransen.
    const sentAt = new Date().toISOString()
    const { data: uppdaterad, error: updateErr } = await supabase
      .from('project_change')
      .update({
        status: 'sent',
        sent_at: sentAt,
        sent_to_phone: phone,
      })
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .select('*')
      .maybeSingle()

    if (updateErr) {
      console.error('[ata/send] update after sms-success failed:', updateErr)
    }

    // Fire event (non-blocking)
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'ata_sent', business.business_id, {
        change_id: params.id,
        project_id: ata.project_id,
        ata_number: ata.ata_number,
        total: ata.total,
        customer_name: customer.name,
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      signUrl,
      ata: uppdaterad || { ...ata, status: 'sent', sent_at: sentAt, sent_to_phone: phone },
    })
  } catch (error: any) {
    console.error('POST /api/ata/[id]/send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
