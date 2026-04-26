import { renderModern } from './modern'
import { renderPremium } from './premium'
import { renderFriendly } from './friendly'
import type { TemplateRenderFn, TemplateStyle, TemplateMeta } from './types'

export type { QuoteTemplateData, TemplateStyle, TemplateMeta, TemplateRenderFn } from './types'
export { buildQuoteTemplateData } from './data-builder'

export const TEMPLATES: Record<TemplateStyle, TemplateRenderFn> = {
  modern: renderModern,
  premium: renderPremium,
  friendly: renderFriendly,
}

export const TEMPLATE_META: TemplateMeta[] = [
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

export function selectTemplate(style: string | null | undefined): TemplateRenderFn {
  const key = (style || 'modern') as TemplateStyle
  return TEMPLATES[key] || TEMPLATES.modern
}

export function getTemplateMeta(style: string | null | undefined): TemplateMeta {
  const key = (style || 'modern') as TemplateStyle
  return TEMPLATE_META.find(m => m.id === key) || TEMPLATE_META[0]
}
