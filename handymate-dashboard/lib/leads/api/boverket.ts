/**
 * Boverket API — energideklarationer
 * Mock-implementation tills API-nyckel finns.
 */

export interface EnergyData {
  address: string
  energyClass: string
  energyValue: number
}

const BOVERKET_API_KEY = process.env.BOVERKET_API_KEY

export async function fetchEnergyDeclarations(
  postalCodes: string[]
): Promise<EnergyData[]> {
  if (!BOVERKET_API_KEY) {
    console.warn('[Boverket] API-nyckel saknas — energiklass hämtas från lagfartsdata')
    return []
  }

  // TODO: Implementera riktigt API-anrop
  console.warn('[Boverket] Riktigt API ej implementerat ännu')
  return []
}
