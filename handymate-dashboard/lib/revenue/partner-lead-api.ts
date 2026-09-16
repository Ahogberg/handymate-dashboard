import { NextRequest, NextResponse } from 'next/server'
export async function leadBody(request: NextRequest): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) throw new Error('Ogiltigt ursprung.')
  const raw = await request.text()
  if (raw.length > 20000) throw new Error('För mycket innehåll.')
  const body = JSON.parse(raw)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Ogiltigt innehåll.')
  return body
}
export function leadError(error: unknown) {
  const code = (error as { code?: string })?.code
  const status = code === '42501' ? 403 : ['PT409','23505'].includes(code || '') ? 409 : code === '22023' || error instanceof Error && !code ? 400 : 500
  const message = status === 500 ? 'Kunde inte hämta eller spara leads. Försök igen.' : (error as { message?: string })?.message || 'Åtgärden misslyckades.'
  return NextResponse.json({ error: message }, { status })
}
