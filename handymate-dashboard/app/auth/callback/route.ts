import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Exchange the code for a session (sets cookies automatically)
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to the next page
  return NextResponse.redirect(new URL(next, request.url))
}
