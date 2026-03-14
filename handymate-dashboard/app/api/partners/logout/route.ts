import { NextResponse } from 'next/server'

/**
 * POST /api/partners/logout
 * Clears partner JWT cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('partner_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
