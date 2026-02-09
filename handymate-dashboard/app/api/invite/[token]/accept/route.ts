import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/invite/[token]/accept - Acceptera inbjudan och skapa konto
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()

    const { password, name } = body

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Lösenord krävs (minst 6 tecken)' }, { status: 400 })
    }

    // Hämta inbjudan
    const { data: invite, error: inviteError } = await supabase
      .from('business_users')
      .select('*')
      .eq('invite_token', params.token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Ogiltig inbjudan' }, { status: 404 })
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: 'Inbjudan redan accepterad' }, { status: 400 })
    }

    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Inbjudan har gått ut' }, { status: 400 })
    }

    // Skapa auth user med admin client
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true
    })

    if (authError) {
      // Om användaren redan finns, försök logga in
      if (authError.message?.includes('already been registered')) {
        const anonSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data: signInData, error: signInError } = await anonSupabase.auth.signInWithPassword({
          email: invite.email,
          password
        })

        if (signInError || !signInData.user) {
          return NextResponse.json({ error: 'Kontot finns redan. Logga in med rätt lösenord.' }, { status: 400 })
        }

        // Uppdatera business_users med user_id
        await supabase
          .from('business_users')
          .update({
            user_id: signInData.user.id,
            name: name || invite.name,
            accepted_at: new Date().toISOString(),
            invite_token: null,
            invite_expires_at: null
          })
          .eq('id', invite.id)

        return NextResponse.json({
          success: true,
          session: signInData.session
        })
      }

      throw authError
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Kunde inte skapa konto' }, { status: 500 })
    }

    // Uppdatera business_users med user_id
    const { error: updateError } = await supabase
      .from('business_users')
      .update({
        user_id: authData.user.id,
        name: name || invite.name,
        accepted_at: new Date().toISOString(),
        invite_token: null,
        invite_expires_at: null
      })
      .eq('id', invite.id)

    if (updateError) throw updateError

    // Logga in användaren för att ge dem en session
    const anonSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: session } = await anonSupabase.auth.signInWithPassword({
      email: invite.email,
      password
    })

    return NextResponse.json({
      success: true,
      session: session?.session || null
    })

  } catch (error: any) {
    console.error('Accept invite error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
