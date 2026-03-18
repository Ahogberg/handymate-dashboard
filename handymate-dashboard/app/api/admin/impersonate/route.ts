import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, logAdminAction } from '@/lib/admin-auth'

/**
 * POST /api/admin/impersonate — Starta impersonering
 * Sätter en cookie med target business_id
 */
export async function POST(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { business_id, business_name } = await request.json()
  if (!business_id) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
  }

  await logAdminAction('impersonate_start', adminCheck.userId!, business_id, { business_name })

  const response = NextResponse.json({ success: true })
  response.cookies.set('impersonate_business_id', business_id, {
    path: '/',
    httpOnly: false, // Needs to be readable by client
    maxAge: 60 * 60 * 4, // 4 hours
    sameSite: 'lax',
  })
  response.cookies.set('impersonate_business_name', encodeURIComponent(business_name || ''), {
    path: '/',
    httpOnly: false,
    maxAge: 60 * 60 * 4,
    sameSite: 'lax',
  })

  return response
}

/**
 * DELETE /api/admin/impersonate — Avsluta impersonering
 */
export async function DELETE(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  await logAdminAction('impersonate_end', adminCheck.userId!, null, {})

  const response = NextResponse.json({ success: true })
  response.cookies.delete('impersonate_business_id')
  response.cookies.delete('impersonate_business_name')

  return response
}
