import QRCode from 'qrcode'

/**
 * Formats a Swish number to digits only (strips spaces, dashes).
 * Swedish mobile: 07XXXXXXXX → 07XXXXXXXX
 * Swish business: 123 XXX XX XX → 123XXXXXXXX
 */
export function normalizeSwishNumber(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Builds the Swish QR payload according to the Swish specification:
 * C{recipient};{amount};{message};0
 *
 * - C  = commerce (works for both personal and business Swish)
 * - amount = whole krona (no decimals needed for invoice use)
 * - message = invoice number (shown in recipient's Swish app)
 * - trailing 0 = amount is locked (not editable by payer)
 */
export function buildSwishQRData(swishNumber: string, amount: number, message: string): string {
  const digits = normalizeSwishNumber(swishNumber)
  const amountStr = Math.round(amount).toString()
  // Swish message max 50 chars, strip special chars
  const safeMsg = message.replace(/[;&]/g, '').slice(0, 50)
  return `C${digits};${amountStr};${safeMsg};0`
}

/**
 * Generates a Swish QR code as a base64 PNG data URL.
 * Returns null if swish_number is not set.
 */
export async function generateSwishQR(
  swishNumber: string | null | undefined,
  amount: number,
  invoiceNumber: string
): Promise<string | null> {
  if (!swishNumber) return null

  const data = buildSwishQRData(swishNumber, amount, invoiceNumber)

  try {
    const dataUrl = await QRCode.toDataURL(data, {
      width: 200,
      margin: 1,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
    return dataUrl
  } catch (err) {
    console.error('[swish-qr] Failed to generate QR:', err)
    return null
  }
}
