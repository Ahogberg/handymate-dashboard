import { NextRequest, NextResponse } from 'next/server'
import { generateSwishQR } from '@/lib/swish-qr'

/**
 * GET /api/swish-qr?number=1234567890&amount=47000&message=F-2026-031
 * Returns Swish QR code as base64 data URL (JSON).
 * Public route — no auth needed (used in portal + email).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const number = searchParams.get('number')
  const amount = Number(searchParams.get('amount')) || 0
  const message = searchParams.get('message') || ''

  if (!number) {
    return NextResponse.json({ error: 'Missing number' }, { status: 400 })
  }

  const qrDataUrl = await generateSwishQR(number, amount, message)

  if (!qrDataUrl) {
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }

  return NextResponse.json({ qr: qrDataUrl })
}
