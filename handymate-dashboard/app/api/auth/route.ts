import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    if (action === 'login') {
      const { email, password } = data

      // Hitta företaget baserat på email
      const { data: business, error: businessError } = await supabase
        .from('business_config')
        .select('business_id, business_name, contact_name')
        .eq('contact_email', email)
        .single()

      if (businessError || !business) {
        return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
      }

      // Verifiera lösenord
      const { data: credentials, error: credError } = await supabase
        .from('business_credentials')
        .select('credential_data')
        .eq('business_id', business.business_id)
        .eq('credential_type', 'password')
        .eq('is_active', true)
        .single()

      if (credError || !credentials) {
        return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
      }

      // Kolla lösenord (i produktion: använd bcrypt.compare)
      const storedPassword = credentials.credential_data?.password_hash
      if (storedPassword !== password) {
        return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
      }

      // Sätt cookie med business_id
      const cookieStore = await cookies()
      cookieStore.set('business_id', business.business_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 dagar
        path: '/',
      })

      cookieStore.set('business_name', business.business_name, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      })

      return NextResponse.json({ 
        success: true, 
        businessId: business.business_id,
        businessName: business.business_name
      })
    }

    if (action === 'logout') {
      const cookieStore = await cookies()
      cookieStore.delete('business_id')
      cookieStore.delete('business_name')
      return NextResponse.json({ success: true })
    }

    if (action === 'check') {
      const cookieStore = await cookies()
      const businessId = cookieStore.get('business_id')?.value

      if (!businessId) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      const { data: business } = await supabase
        .from('business_config')
        .select('business_id, business_name, contact_name, contact_email')
        .eq('business_id', businessId)
        .single()

      if (!business) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      return NextResponse.json({ 
        authenticated: true, 
        business 
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error: any) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
