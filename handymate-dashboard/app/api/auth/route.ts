import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Generera en enkel token
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    if (action === 'login') {
      const { email, password } = data

      const { data: business, error: businessError } = await supabase
        .from('business_config')
        .select('business_id, business_name, contact_name')
        .eq('contact_email', email)
        .single()

      if (businessError || !business) {
        return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
      }

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

      const storedPassword = credentials.credential_data?.password_hash
      if (storedPassword !== password) {
        return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
      }

      const cookieStore = await cookies()
      cookieStore.set('business_id', business.business_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
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

    if (action === 'forgot_password') {
      const { email } = data

      // Hitta företaget
      const { data: business } = await supabase
        .from('business_config')
        .select('business_id, business_name, contact_name')
        .eq('contact_email', email)
        .single()

      // Returnera alltid success för att inte avslöja om e-posten finns
      if (!business) {
        return NextResponse.json({ success: true })
      }

      // Generera reset token
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 timme

      // Spara token i credentials
      const { error: tokenError } = await supabase
        .from('business_credentials')
        .upsert({
          business_id: business.business_id,
          credential_type: 'reset_token',
          credential_data: { token, expires_at: expiresAt },
          is_active: true,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'business_id,credential_type'
        })

      if (tokenError) {
        console.error('Token error:', tokenError)
        // Försök med insert istället om upsert misslyckas
        await supabase
          .from('business_credentials')
          .insert({
            business_id: business.business_id,
            credential_type: 'reset_token',
            credential_data: { token, expires_at: expiresAt },
            is_active: true,
            created_at: new Date().toISOString(),
          })
      }

      // Skicka e-post (för nu: logga länken)
      const resetUrl = `https://handymate-dashboard.vercel.app/reset-password?token=${token}`
      console.log('=== RESET PASSWORD LINK ===')
      console.log(`Email: ${email}`)
      console.log(`Link: ${resetUrl}`)
      console.log('===========================')

      // TODO: Skicka riktig e-post via Resend/SendGrid/etc
      // await sendEmail({
      //   to: email,
      //   subject: 'Återställ ditt lösenord - Handymate',
      //   html: `<p>Hej ${business.contact_name},</p><p>Klicka på länken för att återställa ditt lösenord:</p><a href="${resetUrl}">${resetUrl}</a>`
      // })

      return NextResponse.json({ success: true })
    }

    if (action === 'reset_password') {
      const { token, password } = data

      if (!token || !password) {
        return NextResponse.json({ error: 'Token och lösenord krävs' }, { status: 400 })
      }

      // Hitta token
      const { data: tokenData, error: tokenError } = await supabase
        .from('business_credentials')
        .select('business_id, credential_data')
        .eq('credential_type', 'reset_token')
        .eq('is_active', true)

      if (tokenError || !tokenData) {
        return NextResponse.json({ error: 'Ogiltig eller utgången länk' }, { status: 400 })
      }

      // Hitta matchande token
      const matchingToken = tokenData.find(t => t.credential_data?.token === token)

      if (!matchingToken) {
        return NextResponse.json({ error: 'Ogiltig eller utgången länk' }, { status: 400 })
      }

      // Kolla om token har gått ut
      const expiresAt = new Date(matchingToken.credential_data?.expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json({ error: 'Länken har gått ut. Begär en ny.' }, { status: 400 })
      }

      // Uppdatera lösenord
      const { error: updateError } = await supabase
        .from('business_credentials')
        .update({
          credential_data: { password_hash: password },
          updated_at: new Date().toISOString(),
        })
        .eq('business_id', matchingToken.business_id)
        .eq('credential_type', 'password')

      if (updateError) {
        console.error('Update error:', updateError)
        return NextResponse.json({ error: 'Kunde inte uppdatera lösenord' }, { status: 500 })
      }

      // Inaktivera reset token
      await supabase
        .from('business_credentials')
        .update({ is_active: false })
        .eq('business_id', matchingToken.business_id)
        .eq('credential_type', 'reset_token')

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error: any) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
