import type { TemplateStyle, TemplateMeta } from './types'

export type { TemplateStyle, TemplateMeta } from './types'

/**
 * ETAPP 2a (offert-masterplan.md): TEMPLATE_META/getTemplateMeta flyttade hit
 * ur index.ts (barrel-filen). Anledning: index.ts exporterar numera
 * `TEMPLATES.modern` via lib/quote-templates/render-react.tsx, som importerar
 * react-dom/server (Node-only). QuoteStylePicker.tsx och
 * settings/quote-style/page.tsx är CLIENT-komponenter som bara behöver
 * tumnagel-metadatan — de importerar DENNA fil direkt (inte barreln) så
 * webpack aldrig drar in react-dom/server i klientbundeln. Servern
 * (PDF/preview-html-routorna) fortsätter importera från barreln som förut.
 */
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

export function getTemplateMeta(style: string | null | undefined): TemplateMeta {
  const key = (style || 'modern') as TemplateStyle
  return TEMPLATE_META.find(m => m.id === key) || TEMPLATE_META[0]
}
