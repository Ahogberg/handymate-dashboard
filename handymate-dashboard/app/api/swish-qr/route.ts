import { NextRequest, NextResponse } from 'next/server'
import { generateSwishQR } from '@/lib/swish-qr'

export const dynamic = 'force-dynamic'

/**
 * GET /api/swish-qr?number=1234567890&amount=47000&message=F-2026-031
 * Returns Swish QR code as base64 data URL (JSON).
 * Public route — no auth needed (used in portal + email).
 *
 * Tenant-svepet 2026-09-01: parametrarna gick rakt in i QR-nyttolasten.
 * Vem som helst kunde tillverka en betal-QR till ett godtyckligt nummer,
 * serverad från Handymates domän — perfekt för fakturabedrägeri. Nu:
 * strikt format på numret (Swish-nummer 123 xxx xx xx eller svenskt
 * mobilnummer), belopp inom rimligt spann, meddelande utan styrtecken.
 * Ingen bindning till tenant görs här (rutten har ingen), så formatet är
 * den enda grinden — den stoppar godtyckliga strängar, inte ett riktigt
 * nummer. Fakturans QR i portalen genereras server-side och går inte hit.
 */
const SWISH_AMOUNT_MAX_SEK = 150_000
const SWISH_NUMBER_RE = /^(123\d{7}|(\+46|0)7\d{8})$/
const SWISH_MESSAGE_RE = /^[\p{L}\p{N} .,:#/-]{0,50}$/u

function normaliseraSwishNummer(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/[\s-]/g, '')
  return SWISH_NUMBER_RE.test(s) ? s : null
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const number = normaliseraSwishNummer(searchParams.get('number'))
  const amount = Number(searchParams.get('amount')) || 0
  const message = searchParams.get('message') || ''

  if (!number) {
    return NextResponse.json({ error: 'Ogiltigt Swish-nummer' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > SWISH_AMOUNT_MAX_SEK) {
    return NextResponse.json({ error: 'Ogiltigt belopp' }, { status: 400 })
  }
  if (!SWISH_MESSAGE_RE.test(message)) {
    return NextResponse.json({ error: 'Ogiltigt meddelande' }, { status: 400 })
  }

  const qrDataUrl = await generateSwishQR(number, amount, message)

  if (!qrDataUrl) {
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }

  return NextResponse.json({ qr: qrDataUrl })
}
