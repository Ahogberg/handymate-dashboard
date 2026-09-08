import type { GeneratedQuote } from '../ai-quote-generator'

export interface WorkSample {
  version: 1
  source: string
  title: string
  description: string
  createdAt: string
  items: Array<{ description: string; quantity: number; unit: string; type: 'labor' | 'material' | 'service' }>
}

export function readWorkSample(value: unknown): WorkSample | null {
  if (!value || typeof value !== 'object') return null
  const s = value as WorkSample
  if (s.version !== 1 || typeof s.source !== 'string' || s.source.length < 8 || s.source.length > 4000
    || typeof s.title !== 'string' || s.title.length > 200 || typeof s.description !== 'string' || s.description.length > 6000
    || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt))
    || !Array.isArray(s.items) || s.items.length < 1 || s.items.length > 40) return null
  if (!s.items.every(r => r && typeof r.description === 'string' && r.description.length > 0 && r.description.length <= 500
    && typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0 && r.quantity <= 100000
    && typeof r.unit === 'string' && r.unit.length > 0 && r.unit.length <= 20
    && ['labor', 'material', 'service'].includes(r.type))) return null
  // Allowlist: prices, customer IDs, links and product references never cross this boundary.
  return { version: 1, source: s.source, title: s.title, description: s.description, createdAt: s.createdAt,
    items: s.items.map(r => ({ description: r.description, quantity: r.quantity, unit: r.unit, type: r.type })) }
}

export function buildWorkSample(source: string, quote: GeneratedQuote, now = new Date()): WorkSample {
  const sample = readWorkSample({ version: 1, source, title: quote.jobTitle, description: quote.jobDescription,
    createdAt: now.toISOString(), items: quote.items.map(r => ({ description: r.description, quantity: r.quantity, unit: r.unit, type: r.type })) })
  if (!sample) throw new Error('Underlaget kunde inte färdigställas. Förtydliga förfrågan och försök igen.')
  return sample
}

/** Keep the prepared scope. Prices are deliberately reviewed in the real editor. */
export function workSampleDraft(sample: WorkSample) {
  return { jobTitle: sample.title, jobDescription: sample.description,
    items: sample.items.map((r, i) => ({ ...r, id: `work-sample-${i}`, unitPrice: 0, confidence: 0,
      note: 'Mängdförslag från arbetsprovet. Kontrollera mängd, pris och avdrag.', fromPriceList: false })),
    options: [], suggestedDeductionType: 'none', rules: [], lessons: [], customerFacts: [],
    reasoning: 'Arbetsprovet är förberett från din förfrågan. Mängder är förslag. Priser och avdrag behöver granskas.' }
}
