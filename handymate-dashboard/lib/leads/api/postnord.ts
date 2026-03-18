/**
 * PostNord Print & Distribute — fysisk brevutskick
 * Mock-implementation tills API-nyckel finns.
 */

const POSTNORD_API_KEY = process.env.POSTNORD_API_KEY
const COST_PER_LETTER_SEK = 8

export interface SendLetterResult {
  success: boolean
  trackingId: string | null
  costSek: number
  error?: string
}

export async function sendLetter(
  pdfContent: Buffer | string,
  recipientAddress: string,
  senderName: string
): Promise<SendLetterResult> {
  if (!POSTNORD_API_KEY) {
    console.warn('[PostNord] API-nyckel saknas — simulerar brevutskick')
    const mockTrackingId = `PN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    return {
      success: true,
      trackingId: mockTrackingId,
      costSek: COST_PER_LETTER_SEK,
    }
  }

  // TODO: Implementera riktigt PostNord API-anrop
  // const url = 'https://api2.postnord.com/print'
  console.warn('[PostNord] Riktigt API ej implementerat ännu — simulerar')
  const mockTrackingId = `PN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  return {
    success: true,
    trackingId: mockTrackingId,
    costSek: COST_PER_LETTER_SEK,
  }
}

export function getCostPerLetter(): number {
  return COST_PER_LETTER_SEK
}
