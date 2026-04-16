import { NextResponse } from 'next/server'

/**
 * Returnerar ett säkert felmeddelande utan att läcka tekniska detaljer
 * (Supabase stacktraces, SQL-fel, file paths etc).
 *
 * I dev: loggar fullt fel till console
 * I produktion: användaren ser endast det vänliga meddelandet
 */
export function errorResponse(
  userMessage: string,
  error: unknown,
  options: { status?: number; context?: string } = {}
) {
  const { status = 500, context } = options
  const prefix = context ? `[${context}]` : '[error]'

  // Logga alltid fullt fel server-side
  if (error instanceof Error) {
    console.error(`${prefix} ${error.message}`, error.stack)
  } else {
    console.error(`${prefix}`, error)
  }

  // I dev: inkludera lite mer info för debugging
  const isDev = process.env.NODE_ENV !== 'production'
  const body: { error: string; debug?: string } = { error: userMessage }

  if (isDev && error instanceof Error) {
    body.debug = error.message
  }

  return NextResponse.json(body, { status })
}
