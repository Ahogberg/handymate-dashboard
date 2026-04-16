import { NextRequest, NextResponse } from 'next/server'
import { loginPartner } from '@/lib/partners/auth'

/**
 * POST /api/partners/login
 * Login partner → sätter JWT-cookie (30 dagar).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Ogiltig request' }, { status: 400 })
    }

    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'E-post och lösenord krävs' }, { status: 400 })
    }

    const { token, partner, error } = await loginPartner(email, password)

    if (error || !token || !partner) {
      return NextResponse.json({ error: error || 'Inloggning misslyckades' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true, partner })

    // Set HTTP-only cookie
    response.cookies.set('partner_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[partner-login] Error:', error)
    return NextResponse.json({ error: 'Inloggning misslyckades' }, { status: 500 })
  }
}
