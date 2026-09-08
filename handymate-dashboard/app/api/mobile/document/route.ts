import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    const user = await getCurrentUser(request)
    if (!business || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.business_id !== business.business_id || !hasPermission(user, 'see_financials')) return NextResponse.json({ error: 'Du saknar behörighet till ekonomiska dokument.' }, { status: 403 })
    const kind = request.nextUrl.searchParams.get('kind')
    const id = request.nextUrl.searchParams.get('id') || ''
    if (!['quote', 'invoice'].includes(kind || '') || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Ogiltig dokumentreferens' }, { status: 400 })
    const db = getServerSupabase()
    const key = kind === 'quote' ? 'quote_id' : 'invoice_id'
    const { data: doc, error } = await db.from(kind === 'quote' ? 'quotes' : 'invoice').select('*').eq('business_id', business.business_id).eq(key, id).maybeSingle()
    if (error) return NextResponse.json({ error: 'Kunde inte läsa dokumentet' }, { status: 500 })
    if (!doc) return NextResponse.json({ error: 'Dokumentet kunde inte hittas' }, { status: 404 })
    let items = Array.isArray(doc.items) ? doc.items : []
    if (kind === 'quote') {
      const result = await db.from('quote_items').select('description, quantity, unit, unit_price, total, item_type, option_selected, is_hidden').eq('business_id', business.business_id).eq('quote_id', id).order('sort_order')
      if (result.error) return NextResponse.json({ error: 'Kunde inte läsa dokumentraderna' }, { status: 500 })
      items = result.data?.length ? result.data : items
    }
    const customer = doc.customer_id ? await db.from('customer').select('name').eq('business_id', business.business_id).eq('customer_id', doc.customer_id).maybeSingle() : null
    if (customer?.error) return NextResponse.json({ error: 'Kunde inte läsa kunden' }, { status: 500 })
    const numeric = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null
    return NextResponse.json({ document: {
      kind, id, title: kind === 'quote' ? (doc.title || 'Offert') : `Faktura ${doc.invoice_number || ''}`.trim(),
      number: doc[key.replace('_id', '_number')] || null, status: doc.status || null, customer: customer?.data?.name || null,
      date: kind === 'quote' ? doc.valid_until : doc.due_date,
      terms: ['introduction_text', 'conclusion_text', 'payment_terms'].flatMap(name => typeof doc[name] === 'string' && doc[name].trim() ? [{ name, text: doc[name] }] : []),
      amounts: ['subtotal', 'discount_amount', 'vat_amount', 'total', 'rot_rut_deduction', 'rot_deduction', 'rut_deduction', 'customer_pays', 'reminder_fee', 'penalty_interest'].map(name => ({ name, value: numeric(doc[name]) })),
      items: items.map((item: any) => ({ description: String(item.description || ''), quantity: numeric(item.quantity), unit: item.unit || '', unit_price: numeric(item.unit_price), total: numeric(item.total), type: item.item_type || 'item', option_selected: item.item_type === 'option' ? item.option_selected === true : null, hidden: item.is_hidden === true })),
    } })
  } catch { return NextResponse.json({ error: 'Kunde inte läsa dokumentet' }, { status: 500 }) }
}
