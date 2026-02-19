import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/export - Universal CSV export för alla moduler
 * Query: module (customers|invoices|quotes|bookings|time_entries|warranties|products)
 *        startDate, endDate (valfritt)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const module = request.nextUrl.searchParams.get('module')
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')

    if (!module) {
      return NextResponse.json({ error: 'module krävs' }, { status: 400 })
    }

    let csvHeader = ''
    let csvRows = ''
    let filename = ''

    switch (module) {
      case 'customers': {
        const { data } = await supabase
          .from('customer')
          .select('*')
          .eq('business_id', business.business_id)
          .order('name')

        csvHeader = 'Namn;Telefon;E-post;Adress;Typ;Org.nummer;Kontaktperson;Personnummer;Skapad'
        csvRows = (data || []).map((c: any) => [
          c.name || '',
          c.phone_number || '',
          c.email || '',
          (c.address_line || '').replace(/;/g, ','),
          c.customer_type === 'company' ? 'Företag' : c.customer_type === 'brf' ? 'BRF' : 'Privat',
          c.org_number || '',
          c.contact_person || '',
          c.personal_number || '',
          c.created_at?.split('T')[0] || '',
        ].join(';')).join('\n')
        filename = 'kunder'
        break
      }

      case 'invoices': {
        let query = supabase
          .from('invoice')
          .select(`*, customer:customer_id (name)`)
          .eq('business_id', business.business_id)
          .order('invoice_date', { ascending: false })

        if (startDate) query = query.gte('invoice_date', startDate)
        if (endDate) query = query.lte('invoice_date', endDate)

        const { data } = await query

        csvHeader = 'Fakturanummer;Kund;Fakturadatum;Förfallodatum;Delsumma;Moms;Totalt;ROT/RUT;Avdrag;Att betala;Status'
        csvRows = (data || []).map((i: any) => [
          i.invoice_number || '',
          (i.customer?.name || '').replace(/;/g, ','),
          i.invoice_date || '',
          i.due_date || '',
          i.subtotal || 0,
          i.vat_amount || 0,
          i.total || 0,
          i.rot_rut_type?.toUpperCase() || '',
          i.rot_rut_deduction || 0,
          i.customer_pays || i.total || 0,
          i.status || '',
        ].join(';')).join('\n')
        filename = 'fakturor'
        break
      }

      case 'quotes': {
        let query = supabase
          .from('quotes')
          .select(`*, customer:customer_id (name)`)
          .eq('business_id', business.business_id)
          .order('created_at', { ascending: false })

        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        const { data } = await query

        csvHeader = 'Kund;Skapad;Giltig till;Arbete;Material;Totalt;ROT/RUT;Avdrag;Att betala;Status'
        csvRows = (data || []).map((q: any) => [
          (q.customer?.name || '').replace(/;/g, ','),
          q.created_at?.split('T')[0] || '',
          q.valid_until || '',
          q.labor_total || 0,
          q.material_total || 0,
          q.total || 0,
          q.rot_rut_type?.toUpperCase() || '',
          q.rot_rut_deduction || 0,
          q.customer_pays || q.total || 0,
          q.status || '',
        ].join(';')).join('\n')
        filename = 'offerter'
        break
      }

      case 'bookings': {
        let query = supabase
          .from('booking')
          .select(`*, customer:customer_id (name, phone_number)`)
          .eq('business_id', business.business_id)
          .order('scheduled_start', { ascending: false })

        if (startDate) query = query.gte('scheduled_start', startDate)
        if (endDate) query = query.lte('scheduled_start', endDate)

        const { data } = await query

        csvHeader = 'Datum;Starttid;Sluttid;Kund;Telefon;Tjänst;Status;Anteckningar'
        csvRows = (data || []).map((b: any) => [
          b.scheduled_start?.split('T')[0] || '',
          b.scheduled_start ? new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '',
          b.scheduled_end ? new Date(b.scheduled_end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '',
          (b.customer?.name || '').replace(/;/g, ','),
          b.customer?.phone_number || '',
          b.service_type || '',
          b.status || '',
          (b.notes || '').replace(/;/g, ',').replace(/\n/g, ' '),
        ].join(';')).join('\n')
        filename = 'bokningar'
        break
      }

      case 'time_entries': {
        let query = supabase
          .from('time_entry')
          .select(`*, customer:customer_id (name)`)
          .eq('business_id', business.business_id)
          .order('work_date', { ascending: false })

        if (startDate) query = query.gte('work_date', startDate)
        if (endDate) query = query.lte('work_date', endDate)

        const { data } = await query

        csvHeader = 'Datum;Kund;Starttid;Sluttid;Timmar;Rast (min);Timpris;Summa;Fakturerbar;Beskrivning'
        csvRows = (data || []).map((e: any) => {
          const hours = (e.duration_minutes || 0) / 60
          return [
            e.work_date || '',
            (e.customer?.name || '').replace(/;/g, ','),
            e.start_time || '',
            e.end_time || '',
            hours.toFixed(1),
            e.break_minutes || 0,
            e.hourly_rate || 0,
            Math.round(hours * (e.hourly_rate || 0)),
            e.is_billable ? 'Ja' : 'Nej',
            (e.description || '').replace(/;/g, ',').replace(/\n/g, ' '),
          ].join(';')
        }).join('\n')
        filename = 'tidrapporter'
        break
      }

      case 'warranties': {
        const { data } = await supabase
          .from('warranty')
          .select(`*, customer:customer_id (name)`)
          .eq('business_id', business.business_id)
          .order('end_date')

        csvHeader = 'Titel;Kund;Typ;Startdatum;Slutdatum;Status;Beskrivning'
        csvRows = (data || []).map((w: any) => [
          (w.title || '').replace(/;/g, ','),
          (w.customer?.name || '').replace(/;/g, ','),
          w.warranty_type || '',
          w.start_date || '',
          w.end_date || '',
          w.status || '',
          (w.description || '').replace(/;/g, ',').replace(/\n/g, ' '),
        ].join(';')).join('\n')
        filename = 'garantier'
        break
      }

      case 'products': {
        const { data } = await supabase
          .from('supplier_product')
          .select(`*, supplier:supplier_id (name)`)
          .eq('business_id', business.business_id)
          .order('name')

        csvHeader = 'Artikelnummer;Namn;Kategori;Leverantör;Enhet;Inköpspris;Försäljningspris;Påslag %'
        csvRows = (data || []).map((p: any) => [
          p.sku || '',
          (p.name || '').replace(/;/g, ','),
          p.category || '',
          (p.supplier?.name || '').replace(/;/g, ','),
          p.unit || '',
          p.purchase_price || 0,
          p.sell_price || 0,
          p.markup_percent || 0,
        ].join(';')).join('\n')
        filename = 'produkter'
        break
      }

      default:
        return NextResponse.json({ error: 'Ogiltig modul' }, { status: 400 })
    }

    const BOM = '\uFEFF'
    const csv = BOM + csvHeader + '\n' + csvRows

    const dateStr = startDate && endDate ? `-${startDate}-${endDate}` : `-${new Date().toISOString().split('T')[0]}`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}${dateStr}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('Export error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
