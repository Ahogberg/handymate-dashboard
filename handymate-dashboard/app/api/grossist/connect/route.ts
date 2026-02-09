import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAdapter, getDefinition } from '@/lib/suppliers/registry'

/**
 * POST /api/grossist/connect - Anslut till grossist
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { supplier_key, credentials } = body

    if (!supplier_key || !credentials) {
      return NextResponse.json({ error: 'supplier_key and credentials required' }, { status: 400 })
    }

    const definition = getDefinition(supplier_key)
    if (!definition) {
      return NextResponse.json({ error: 'Unknown supplier' }, { status: 400 })
    }

    if (!definition.available) {
      return NextResponse.json({ error: 'Denna grossist är inte tillgänglig ännu' }, { status: 400 })
    }

    // Validera required fields
    for (const field of definition.credentialFields) {
      if (field.required && !credentials[field.key]) {
        return NextResponse.json({ error: `${field.label} krävs` }, { status: 400 })
      }
    }

    // Testa anslutning
    const adapter = getAdapter(supplier_key)
    if (!adapter) {
      return NextResponse.json({ error: 'Adapter not found' }, { status: 500 })
    }

    const testResult = await adapter.testConnection(credentials)
    if (!testResult.success) {
      return NextResponse.json(
        { error: testResult.error || 'Anslutning misslyckades' },
        { status: 400 }
      )
    }

    // Upsert connection
    const { data: connection, error } = await supabase
      .from('supplier_connection')
      .upsert({
        business_id: business.business_id,
        supplier_key,
        supplier_name: definition.name,
        credentials,
        is_connected: true,
        connected_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_id,supplier_key'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, connection })

  } catch (error: any) {
    console.error('Connect grossist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/grossist/connect - Koppla bort grossist
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const supplierKey = request.nextUrl.searchParams.get('supplierKey')

    if (!supplierKey) {
      return NextResponse.json({ error: 'Missing supplierKey' }, { status: 400 })
    }

    // Ta bort cachade produkter
    await supabase
      .from('grossist_product')
      .delete()
      .eq('business_id', business.business_id)
      .eq('supplier_key', supplierKey)

    // Uppdatera connection
    const { error } = await supabase
      .from('supplier_connection')
      .update({
        is_connected: false,
        credentials: {},
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('business_id', business.business_id)
      .eq('supplier_key', supplierKey)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Disconnect grossist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
