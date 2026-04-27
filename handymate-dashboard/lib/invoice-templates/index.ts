import { renderModern } from './modern'
import { renderPremium } from './premium'
import { renderFriendly } from './friendly'
import type {
  InvoiceTemplateRenderFn,
  InvoiceTemplateStyle,
  InvoiceTemplateMeta,
} from './types'

export type {
  InvoiceTemplateData,
  InvoiceTemplateStyle,
  InvoiceTemplateMeta,
  InvoiceTemplateRenderFn,
  InvoiceStatus,
} from './types'
export { buildInvoiceTemplateData } from './data-builder'

export const INVOICE_TEMPLATES: Record<InvoiceTemplateStyle, InvoiceTemplateRenderFn> = {
  modern: renderModern,
  premium: renderPremium,
  friendly: renderFriendly,
}

export const INVOICE_TEMPLATE_META: InvoiceTemplateMeta[] = [
  {
    id: 'modern',
    name: 'Modern',
    tagline: 'Ren och tidlös',
    bestFor: 'Allround service och bygg — passar de flesta',
    previewBgColor: '#FFFFFF',
    previewAccentColor: '#0F766E',
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Påkostad och exklusiv',
    bestFor: 'Renovering, specialbygg, premium-tjänster',
    previewBgColor: '#0F2E2A',
    previewAccentColor: '#D97706',
  },
  {
    id: 'friendly',
    name: 'Friendly',
    tagline: 'Varm och tillgänglig',
    bestFor: 'Service och konsumentnära hantverk',
    previewBgColor: '#F0FDFA',
    previewAccentColor: '#0F766E',
  },
]

export function selectInvoiceTemplate(style: string | null | undefined): InvoiceTemplateRenderFn {
  const key = (style || 'modern') as InvoiceTemplateStyle
  return INVOICE_TEMPLATES[key] || INVOICE_TEMPLATES.modern
}
