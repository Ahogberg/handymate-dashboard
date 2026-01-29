import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    if (action === 'create_business') {
      const { business_name, contact_name, email, phone, branch, password } = data

      // Generera business_id
      const businessId = business_name
        .toLowerCase()
        .replace(/[åä]/g, 'a')
        .replace(/[ö]/g, 'o')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 30) + '_' + Math.random().toString(36).substr(2, 6)

      // Kolla om email redan finns
      const { data: existing } = await supabase
        .from('business_config')
        .select('business_id')
        .eq('contact_email', email)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'E-postadressen är redan registrerad' }, { status: 400 })
      }

      // Skapa business_config
      const { error: configError } = await supabase
        .from('business_config')
        .insert({
          business_id: businessId,
          business_name: business_name,
          contact_name: contact_name,
          contact_email: email,
          phone_number: phone,
          services_offered: [branch],
          timezone: 'Europe/Stockholm',
          is_active: true,
          onboarding_status: 'pending',
          subscription_status: 'trial',
          subscription_plan: 'starter',
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        })

      if (configError) {
        console.error('Config error:', configError)
        throw new Error('Kunde inte skapa företagskonfiguration')
      }

      // Skapa credentials med rätt struktur
      const { error: credError } = await supabase
        .from('business_credentials')
        .insert({
          business_id: businessId,
          credential_type: 'password',
          credential_data: { password_hash: password }, // I produktion: hasha med bcrypt
          is_active: true,
          created_at: new Date().toISOString(),
        })

      if (credError) {
        console.error('Credentials error:', credError)
        await supabase.from('business_config').delete().eq('business_id', businessId)
        throw new Error('Kunde inte skapa inloggningsuppgifter')
      }

      return NextResponse.json({ 
        success: true, 
        businessId,
        message: 'Konto skapat!'
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error: any) {
    console.error('Onboarding error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
