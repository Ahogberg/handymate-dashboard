import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { SERVICE_INTERVAL_SOURCE_LABEL, nextServiceDate, type InstallationRow, type ServiceIntervalSource } from '@/lib/installation/installation'

export const dynamic = 'force-dynamic'

interface PortalInstallationDto {
  installation_id: string
  project_id: string | null
  name: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  placement: string | null
  installed_at: string | null
  service_interval_months: number | null
  service_interval_source: ServiceIntervalSource | null
  service_source_label: string | null
  /** Beräknad ur installed_at + intervall — bara när båda finns och källan är känd. */
  next_service_at: string | null
  care_instructions: string | null
  site_address_line: string | null
  site_postal_code: string | null
  site_city: string | null
}

/**
 * GET /api/portal/[token]/installations — "Min bostad" (Fastighetspasset steg 3).
 * Bara bekräftade installationer (status 'confirmed'); utkast når aldrig
 * kunden. Serviceintervall visas alltid med sin källa (grind 4).
 * Fel svaras ärligt, aldrig som tom lista.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data, error } = await supabase
      .from('installation')
      .select('*')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .eq('status', 'confirmed')
      .order('installed_at', { ascending: false, nullsFirst: false })
    if (error) {
      console.error('[portal/installations] query error:', error)
      return NextResponse.json({ error: 'Kunde inte hämta installationerna just nu' }, { status: 500 })
    }

    const installations: PortalInstallationDto[] = ((data || []) as InstallationRow[]).map(r => {
      const hasInterval = Boolean(r.service_interval_months && r.service_interval_source)
      return {
        installation_id: r.installation_id,
        project_id: r.project_id,
        name: r.name,
        manufacturer: r.manufacturer,
        model: r.model,
        serial_number: r.serial_number,
        placement: r.placement,
        installed_at: r.installed_at,
        service_interval_months: hasInterval ? r.service_interval_months : null,
        service_interval_source: hasInterval ? r.service_interval_source : null,
        service_source_label: hasInterval && r.service_interval_source ? SERVICE_INTERVAL_SOURCE_LABEL[r.service_interval_source] : null,
        next_service_at: hasInterval ? nextServiceDate(r.installed_at, r.service_interval_months) : null,
        care_instructions: r.care_instructions,
        site_address_line: r.site_address_line,
        site_postal_code: r.site_postal_code,
        site_city: r.site_city,
      }
    })
    return NextResponse.json({ installations })
  } catch (error) {
    console.error('[portal/installations] oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
