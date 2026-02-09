import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/invite/[token] - Validera inbjudningstoken
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()

    const { data: invite, error } = await supabase
      .from('business_users')
      .select(`
        id, email, name, role, title,
        invite_expires_at, accepted_at,
        business_id
      `)
      .eq('invite_token', params.token)
      .single()

    if (error || !invite) {
      return NextResponse.json({ valid: false, error: 'Ogiltig inbjudan' }, { status: 404 })
    }

    // Redan accepterad?
    if (invite.accepted_at) {
      return NextResponse.json({ valid: false, error: 'Inbjudan redan accepterad' }, { status: 400 })
    }

    // Utgången?
    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Inbjudan har gått ut' }, { status: 400 })
    }

    // Hämta business-namn
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', invite.business_id)
      .single()

    return NextResponse.json({
      valid: true,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      title: invite.title,
      business_name: business?.business_name || 'Okänt företag'
    })

  } catch (error: any) {
    console.error('Validate invite error:', error)
    return NextResponse.json({ valid: false, error: error.message }, { status: 500 })
  }
}
