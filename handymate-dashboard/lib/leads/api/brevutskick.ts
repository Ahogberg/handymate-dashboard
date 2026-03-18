/**
 * DR.se — brevutskick (tryck + porto)
 * Mock-implementation tills API-nyckel finns.
 */

const DR_API_KEY = process.env.DR_API_KEY
const COST_INTERNAL_SEK = 9.49
const COST_CUSTOMER_SEK = 15

export interface SendLetterResult {
  success: boolean
  trackingId: string | null
  costInternal: number
  costCustomer: number
  status: 'queued' | 'sent' | 'delivered'
  error?: string
}

export async function sendLetter(
  pdfContent: Buffer | string,
  recipientAddress: string,
  senderName: string
): Promise<SendLetterResult> {
  if (!DR_API_KEY) {
    console.warn('[DR.se] API-nyckel saknas — simulerar brevutskick')
    const mockTrackingId = `DR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    return {
      success: true,
      trackingId: mockTrackingId,
      costInternal: COST_INTERNAL_SEK,
      costCustomer: COST_CUSTOMER_SEK,
      status: 'queued',
    }
  }

  // TODO: Implementera riktigt DR.se API-anrop
  console.warn('[DR.se] Riktigt API ej implementerat ännu — simulerar')
  const mockTrackingId = `DR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  return {
    success: true,
    trackingId: mockTrackingId,
    costInternal: COST_INTERNAL_SEK,
    costCustomer: COST_CUSTOMER_SEK,
    status: 'queued',
  }
}

export function getCostPerLetter(): number {
  return COST_CUSTOMER_SEK
}
