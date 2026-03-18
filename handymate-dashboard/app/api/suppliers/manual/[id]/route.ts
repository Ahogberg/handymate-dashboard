import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PUT /api/suppliers/manual/[id] — Uppdatera leverantör
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  // Update supplier
  if (body.supplier) {
    await supabase
      .from('manual_suppliers')
      .update(body.supplier)
      .eq('id', params.id)
      .eq('business_id', business.business_id)
  }

  // Add product
  if (body.add_product) {
    const p = body.add_product
    await supabase.from('manual_supplier_products').insert({
      supplier_id: params.id,
      business_id: business.business_id,
      name: p.name,
      article_number: p.article_number || null,
      normal_price: p.normal_price || 0,
      current_price: p.current_price || p.normal_price || 0,
      unit: p.unit || 'st',
      category: p.category || null,
      watch_price: p.watch_price || false,
    })
  }

  // Update product price
  if (body.update_product) {
    const p = body.update_product
    const updates: Record<string, unknown> = { last_updated: new Date().toISOString() }
    if (p.name !== undefined) updates.name = p.name
    if (p.normal_price !== undefined) updates.normal_price = p.normal_price
    if (p.current_price !== undefined) updates.current_price = p.current_price
    if (p.watch_price !== undefined) updates.watch_price = p.watch_price
    if (p.unit !== undefined) updates.unit = p.unit

    // Check for price alert
    if (p.current_price !== undefined) {
      const { data: existing } = await supabase
        .from('manual_supplier_products')
        .select('normal_price, watch_price, name')
        .eq('id', p.id)
        .single()

      if (existing?.watch_price && existing.normal_price && p.current_price < existing.normal_price) {
        const discount = Math.round((1 - p.current_price / existing.normal_price) * 100)
        // Push notification
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
          await fetch(`${appUrl}/api/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: business.business_id,
              title: `${existing.name} — ${discount}% billigare`,
              body: `Priset är nu ${p.current_price} kr (normalt ${existing.normal_price} kr). Bra tid att beställa?`,
            }),
          })
        } catch { /* non-blocking */ }

        // Log
        await supabase.from('v3_automation_logs').insert({
          business_id: business.business_id,
          rule_name: 'supplier_price_alert',
          trigger_type: 'manual',
          action_type: 'push_notification',
          status: 'success',
          context: { product_name: existing.name, normal_price: existing.normal_price, current_price: p.current_price, discount_pct: discount },
        })
      }
    }

    await supabase
      .from('manual_supplier_products')
      .update(updates)
      .eq('id', p.id)
      .eq('business_id', business.business_id)
  }

  // Delete product
  if (body.delete_product_id) {
    await supabase
      .from('manual_supplier_products')
      .delete()
      .eq('id', body.delete_product_id)
      .eq('business_id', business.business_id)
  }

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/suppliers/manual/[id] — Ta bort leverantör
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  await supabase.from('manual_suppliers').delete().eq('id', params.id).eq('business_id', business.business_id)
  return NextResponse.json({ success: true })
}
