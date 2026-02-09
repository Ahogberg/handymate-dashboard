/**
 * Ahlsell API Adapter (Stub)
 * Förberedd för framtida implementation när API-avtal finns
 */

import {
  SupplierAdapter,
  SupplierProduct,
  ProductSearchParams,
  ProductSearchResult,
  PriceLookupResult
} from './types'

const AHLSELL_API_BASE = 'https://api.ahlsell.com'

export class AhlsellAdapter implements SupplierAdapter {
  readonly key = 'ahlsell'

  async testConnection(credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    if (!credentials.api_key || !credentials.customer_number) {
      return { success: false, error: 'API-nyckel och kundnummer krävs' }
    }

    try {
      const response = await fetch(`${AHLSELL_API_BASE}/v1/health`, {
        headers: {
          'Authorization': `Bearer ${credentials.api_key}`,
          'X-Customer-Number': credentials.customer_number
        }
      })

      if (response.ok) {
        return { success: true }
      }
      return { success: false, error: `API svarade med status ${response.status}` }
    } catch {
      return {
        success: false,
        error: 'Kunde inte nå Ahlsell API. Kontrollera API-nyckel och försök igen.'
      }
    }
  }

  async searchProducts(_credentials: Record<string, string>, _params: ProductSearchParams): Promise<ProductSearchResult> {
    throw new Error(
      'Ahlsell API-integration ej konfigurerad. Sätt USE_MOCK_SUPPLIERS=true i .env.local för utveckling.'
    )
  }

  async getProduct(_credentials: Record<string, string>, _productId: string): Promise<SupplierProduct | null> {
    throw new Error(
      'Ahlsell API-integration ej konfigurerad. Sätt USE_MOCK_SUPPLIERS=true i .env.local för utveckling.'
    )
  }

  async getPrice(_credentials: Record<string, string>, _productId: string): Promise<PriceLookupResult | null> {
    throw new Error(
      'Ahlsell API-integration ej konfigurerad. Sätt USE_MOCK_SUPPLIERS=true i .env.local för utveckling.'
    )
  }

  async getCategories(_credentials: Record<string, string>): Promise<string[]> {
    throw new Error(
      'Ahlsell API-integration ej konfigurerad. Sätt USE_MOCK_SUPPLIERS=true i .env.local för utveckling.'
    )
  }
}
