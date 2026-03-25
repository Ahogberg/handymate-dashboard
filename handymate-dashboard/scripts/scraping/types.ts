export interface ScrapedLead {
  name: string
  phone: string
  city: string
  industry: string
  source: 'google_maps' | 'easoft' | 'manual'
  current_system: string | null  // easoft, bokadirekt, bygglet, servicefinder, offerta, okänt
  company_size: string | null    // TODO: berika via Allabolag.se
  sms_text: string
  website: string | null
  reviews_count: number | null
}

export interface RawBusiness {
  name: string
  phone?: string
  address?: string
  website?: string
  reviews?: number
  industry?: string
}

export const SEARCH_QUERIES = [
  { query: 'elektriker Stockholm', industry: 'Elektriker' },
  { query: 'rörmokare Stockholm', industry: 'VVS' },
  { query: 'byggföretag Stockholm', industry: 'Bygg' },
  { query: 'målare Stockholm', industry: 'Måleri' },
  { query: 'VVS Stockholm', industry: 'VVS' },
]

export const EASOFT_QUERIES = [
  'site:easoft.se kunder',
  '"Powered by Easoft" hantverkare',
]
