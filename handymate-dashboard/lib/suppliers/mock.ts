/**
 * Mock Supplier Adapter
 * Returnerar realistiska svenska byggprodukter för utveckling
 */

import {
  SupplierAdapter,
  SupplierProduct,
  ProductSearchParams,
  ProductSearchResult,
  PriceLookupResult
} from './types'

const MOCK_PRODUCTS: SupplierProduct[] = [
  // VVS
  { external_id: 'AH-001', sku: '4015234', ean: '7391008001001', rsk_number: '8601234', name: 'Kopparrör 15mm 5m', category: 'VVS', unit: 'm', purchase_price: 89, recommended_price: 119, in_stock: true, stock_quantity: 450 },
  { external_id: 'AH-002', sku: '4015235', ean: '7391008001002', rsk_number: '8601235', name: 'Kopparrör 22mm 5m', category: 'VVS', unit: 'm', purchase_price: 145, recommended_price: 195, in_stock: true, stock_quantity: 280 },
  { external_id: 'AH-003', sku: '4015300', ean: '7391008001003', rsk_number: '8601300', name: 'T-koppling 15mm koppar', category: 'VVS', unit: 'st', purchase_price: 32, recommended_price: 45, in_stock: true, stock_quantity: 1200 },
  { external_id: 'AH-004', sku: '4015301', ean: '7391008001004', rsk_number: '8601301', name: 'Vinkelkoppling 15mm 90°', category: 'VVS', unit: 'st', purchase_price: 28, recommended_price: 39, in_stock: true, stock_quantity: 980 },
  { external_id: 'AH-005', sku: '4018100', ean: '7391008001005', rsk_number: '8641100', name: 'Kulventil 15mm', category: 'VVS', unit: 'st', purchase_price: 95, recommended_price: 135, in_stock: true, stock_quantity: 320 },
  { external_id: 'AH-006', sku: '4018200', ean: '7391008001006', rsk_number: '8641200', name: 'Backventil 15mm', category: 'VVS', unit: 'st', purchase_price: 78, recommended_price: 110, in_stock: false, stock_quantity: 0 },
  { external_id: 'AH-007', sku: '4020100', ean: '7391008001007', rsk_number: '8660100', name: 'Golvbrunn 50mm rostfri', category: 'VVS', unit: 'st', purchase_price: 245, recommended_price: 349, in_stock: true, stock_quantity: 85 },
  { external_id: 'AH-008', sku: '4020200', ean: '7391008001008', rsk_number: '8660200', name: 'WC-anslutning excentrisk', category: 'VVS', unit: 'st', purchase_price: 125, recommended_price: 179, in_stock: true, stock_quantity: 160 },

  // El
  { external_id: 'AH-101', sku: '5010100', ean: '7391008002001', e_number: 'E1012345', name: 'Installationskabel EKK 3G1.5 100m', category: 'El', unit: 'rl', purchase_price: 489, recommended_price: 649, in_stock: true, stock_quantity: 200 },
  { external_id: 'AH-102', sku: '5010101', ean: '7391008002002', e_number: 'E1012346', name: 'Installationskabel EKK 3G2.5 100m', category: 'El', unit: 'rl', purchase_price: 789, recommended_price: 1049, in_stock: true, stock_quantity: 150 },
  { external_id: 'AH-103', sku: '5020100', ean: '7391008002003', e_number: 'E2012345', name: 'Vägguttag jordat 1-vägs', category: 'El', unit: 'st', purchase_price: 45, recommended_price: 65, in_stock: true, stock_quantity: 2000 },
  { external_id: 'AH-104', sku: '5020101', ean: '7391008002004', e_number: 'E2012346', name: 'Vägguttag jordat 2-vägs', category: 'El', unit: 'st', purchase_price: 79, recommended_price: 109, in_stock: true, stock_quantity: 1500 },
  { external_id: 'AH-105', sku: '5020200', ean: '7391008002005', e_number: 'E2022345', name: 'Strömbrytare 1-pol infälld vit', category: 'El', unit: 'st', purchase_price: 39, recommended_price: 55, in_stock: true, stock_quantity: 3000 },
  { external_id: 'AH-106', sku: '5020201', ean: '7391008002006', e_number: 'E2022346', name: 'Dimmer LED 5-300W infälld', category: 'El', unit: 'st', purchase_price: 295, recommended_price: 419, in_stock: true, stock_quantity: 120 },
  { external_id: 'AH-107', sku: '5030100', ean: '7391008002007', e_number: 'E3012345', name: 'Säkring automatsäkring C10', category: 'El', unit: 'st', purchase_price: 65, recommended_price: 89, in_stock: true, stock_quantity: 500 },
  { external_id: 'AH-108', sku: '5030101', ean: '7391008002008', e_number: 'E3012346', name: 'Jordfelsbrytare 2-pol 30mA', category: 'El', unit: 'st', purchase_price: 485, recommended_price: 649, in_stock: true, stock_quantity: 75 },

  // Verktyg
  { external_id: 'AH-201', sku: '6010100', ean: '7391008003001', name: 'Borrmaskin slagborr 18V', category: 'Verktyg', unit: 'st', purchase_price: 1890, recommended_price: 2495, in_stock: true, stock_quantity: 45 },
  { external_id: 'AH-202', sku: '6010200', ean: '7391008003002', name: 'Skruvdragare 18V kompakt', category: 'Verktyg', unit: 'st', purchase_price: 1290, recommended_price: 1695, in_stock: true, stock_quantity: 60 },
  { external_id: 'AH-203', sku: '6020100', ean: '7391008003003', name: 'Rörskärare 3-35mm', category: 'Verktyg', unit: 'st', purchase_price: 185, recommended_price: 249, in_stock: true, stock_quantity: 95 },
  { external_id: 'AH-204', sku: '6020200', ean: '7391008003004', name: 'Pressverktyg M-profil 15-28mm', category: 'Verktyg', unit: 'st', purchase_price: 4250, recommended_price: 5495, in_stock: false, stock_quantity: 0 },
  { external_id: 'AH-205', sku: '6030100', ean: '7391008003005', name: 'Vattenpass 60cm aluminium', category: 'Verktyg', unit: 'st', purchase_price: 145, recommended_price: 199, in_stock: true, stock_quantity: 180 },

  // Rör & Fittings
  { external_id: 'AH-301', sku: '4030100', ean: '7391008004001', rsk_number: '8701100', name: 'PEM-rör 32mm PE80 PN10 50m', category: 'Rör & Fittings', unit: 'rl', purchase_price: 1250, recommended_price: 1695, in_stock: true, stock_quantity: 40 },
  { external_id: 'AH-302', sku: '4030200', ean: '7391008004002', rsk_number: '8701200', name: 'PEM-koppling rak 32mm', category: 'Rör & Fittings', unit: 'st', purchase_price: 45, recommended_price: 65, in_stock: true, stock_quantity: 500 },
  { external_id: 'AH-303', sku: '4030300', ean: '7391008004003', rsk_number: '8701300', name: 'Avloppsrör PP 110mm 3m', category: 'Rör & Fittings', unit: 'st', purchase_price: 189, recommended_price: 259, in_stock: true, stock_quantity: 120 },
  { external_id: 'AH-304', sku: '4030400', ean: '7391008004004', rsk_number: '8701400', name: 'Avloppsgrenrör 110/110 45°', category: 'Rör & Fittings', unit: 'st', purchase_price: 65, recommended_price: 89, in_stock: true, stock_quantity: 250 },

  // Värme
  { external_id: 'AH-401', sku: '7010100', ean: '7391008005001', rsk_number: '8801100', name: 'Radiator C22 600x1000mm', category: 'Värme', unit: 'st', purchase_price: 1850, recommended_price: 2495, in_stock: true, stock_quantity: 25 },
  { external_id: 'AH-402', sku: '7010200', ean: '7391008005002', rsk_number: '8801200', name: 'Radiatorventil termostat RA-N 15', category: 'Värme', unit: 'st', purchase_price: 145, recommended_price: 199, in_stock: true, stock_quantity: 400 },
  { external_id: 'AH-403', sku: '7020100', ean: '7391008005003', rsk_number: '8821100', name: 'Golvvärmeslang PEX 16mm 200m', category: 'Värme', unit: 'rl', purchase_price: 2450, recommended_price: 3295, in_stock: true, stock_quantity: 30 },
  { external_id: 'AH-404', sku: '7020200', ean: '7391008005004', rsk_number: '8821200', name: 'Golvvärme fördelare 5 kretsar', category: 'Värme', unit: 'st', purchase_price: 1650, recommended_price: 2195, in_stock: true, stock_quantity: 18 },

  // Tätning & Isolering
  { external_id: 'AH-501', sku: '8010100', ean: '7391008006001', name: 'Sanitetssilikon transparent 300ml', category: 'Tätning & Isolering', unit: 'st', purchase_price: 65, recommended_price: 89, in_stock: true, stock_quantity: 600 },
  { external_id: 'AH-502', sku: '8010200', ean: '7391008006002', name: 'Rörisolering 15mm tjocklek 13mm 2m', category: 'Tätning & Isolering', unit: 'st', purchase_price: 25, recommended_price: 35, in_stock: true, stock_quantity: 800 },
  { external_id: 'AH-503', sku: '8010300', ean: '7391008006003', name: 'Golvbrunnstätning universell', category: 'Tätning & Isolering', unit: 'st', purchase_price: 89, recommended_price: 125, in_stock: true, stock_quantity: 350 },
  { external_id: 'AH-504', sku: '8010400', ean: '7391008006004', name: 'Teflontejp PTFE 12mm 12m', category: 'Tätning & Isolering', unit: 'st', purchase_price: 15, recommended_price: 25, in_stock: true, stock_quantity: 2000 },
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class MockAdapter implements SupplierAdapter {
  readonly key: string

  constructor(supplierKey: string) {
    this.key = supplierKey
  }

  async testConnection(_credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    await delay(500)
    return { success: true }
  }

  async searchProducts(_credentials: Record<string, string>, params: ProductSearchParams): Promise<ProductSearchResult> {
    await delay(300)

    const query = params.query.toLowerCase()
    const limit = params.limit || 20
    const offset = params.offset || 0

    let filtered = MOCK_PRODUCTS

    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.ean?.includes(query) ||
        p.rsk_number?.includes(query) ||
        p.e_number?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      )
    }

    if (params.category) {
      filtered = filtered.filter(p => p.category === params.category)
    }

    const total = filtered.length
    const products = filtered.slice(offset, offset + limit)

    return {
      products,
      total,
      hasMore: offset + limit < total
    }
  }

  async getProduct(_credentials: Record<string, string>, productId: string): Promise<SupplierProduct | null> {
    await delay(200)
    return MOCK_PRODUCTS.find(p => p.external_id === productId) || null
  }

  async getPrice(_credentials: Record<string, string>, productId: string): Promise<PriceLookupResult | null> {
    await delay(200)
    const product = MOCK_PRODUCTS.find(p => p.external_id === productId)
    if (!product) return null

    // Simulera prisvariation ±2%
    const variation = 1 + (Math.random() * 0.04 - 0.02)
    const price = product.purchase_price ? Math.round(product.purchase_price * variation * 100) / 100 : null

    return {
      product,
      price,
      currency: 'SEK',
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  }

  async getCategories(_credentials: Record<string, string>): Promise<string[]> {
    await delay(100)
    return Array.from(new Set(MOCK_PRODUCTS.map(p => p.category).filter(Boolean))) as string[]
  }
}
