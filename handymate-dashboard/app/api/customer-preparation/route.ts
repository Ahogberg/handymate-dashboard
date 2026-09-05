import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { preparationOwner, BUCKET } from '@/lib/customer-preparation/server'
import { isTemplate } from '@/lib/customer-preparation/contract'
export const dynamic = 'force-dynamic'
const failure = () => NextResponse.json({ error: 'Kunde inte hantera förberedelserna. Försök igen.' }, { status: 503 })

export async function GET(request: NextRequest) {
  try {
    const business = await preparationOwner(request)
    if (!business) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
    const customerId = request.nextUrl.searchParams.get('customer_id')
    if (!customerId) return NextResponse.json({ error: 'Kund krävs' }, { status: 400 })
    const db = getServerSupabase()
    const { data, error } = await db.from('customer_preparation').select('*')
      .eq('business_id', business.business_id).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50)
    if (error) return failure()
    const rows = await Promise.all((data || []).map(async row => {
      const images = Array.isArray(row.images) ? row.images : []
      const paths = images.filter((path: unknown): path is string => typeof path === 'string' && path.startsWith(`${business.business_id}/${row.id}/`))
      const signed = paths.length ? await db.storage.from(BUCKET).createSignedUrls(paths, 300) : null
      if (signed?.error) throw signed.error
      if (signed?.data?.some(file => !file.signedUrl)) throw new Error('Bildlänk saknas')
      return { ...row, image_urls: signed?.data?.map(file => file.signedUrl) || [] }
    }))
    return NextResponse.json({ preparations: rows }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return failure() }
}

export async function POST(request: NextRequest) {
  try {
    const business = await preparationOwner(request)
    if (!business) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
    const body = await request.json()
    if (!isTemplate(body.template) || typeof body.customer_id !== 'string' || typeof body.context !== 'string' || !body.context.trim() || body.context.length > 600) {
      return NextResponse.json({ error: 'Välj mall, kund och beskriv arbetet (högst 600 tecken).' }, { status: 400 })
    }
    if (body.due_date && (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date) || !Number.isFinite(Date.parse(body.due_date)) || new Date(body.due_date).toISOString().slice(0,10) !== body.due_date)) {
      return NextResponse.json({ error: 'Kontrollera svarsdatumet.' }, { status: 400 })
    }
    const db = getServerSupabase()
    const { data: customer, error: customerError } = await db.from('customer').select('customer_id')
      .eq('business_id', business.business_id).eq('customer_id', body.customer_id).maybeSingle()
    if (customerError) return failure()
    if (!customer) return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
    const { data, error } = await db.from('customer_preparation').insert({
      business_id: business.business_id, customer_id: customer.customer_id,
      template: body.template, context: body.context.trim(), due_date: body.due_date || null,
    }).select('id,token').single()
    if (error) return failure()
    return NextResponse.json({ preparation: data }, { status: 201 })
  } catch { return failure() }
}

export async function PATCH(request: NextRequest) {
  try {
    const business = await preparationOwner(request)
    if (!business) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
    const body = await request.json()
    if (typeof body.id !== 'string' || !['reviewed', 'cancelled'].includes(body.status)) return NextResponse.json({ error: 'Ogiltig ändring' }, { status: 400 })
    const { data, error } = await getServerSupabase().from('customer_preparation')
      .update({ status: body.status, ...(body.status === 'reviewed' ? { reviewed_at: new Date().toISOString() } : {}) })
      .eq('business_id', business.business_id).eq('id', body.id)
      .in('status', body.status === 'reviewed' ? ['submitted'] : ['open', 'submitted', 'reviewed'])
      .select('id').maybeSingle()
    if (error) return failure()
    if (!data) return NextResponse.json({ error: 'Underlaget har ändrats. Läs in igen.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch { return failure() }
}
