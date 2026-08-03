// ETAPP 2a (offert-masterplan.md): Modern pensionerad ur mallsträng-form —
// renderModernHtml (lib/quote-templates/render-react.tsx) kör dokumentmotorn
// (QuoteDocument) genom renderToStaticMarkup istället. Premium/Friendly
// fortsätter via sina mallsträngar tills nästa körning (ordning: Modern
// först, se planen).
import { renderModernHtml } from './render-react'
import { renderPremium } from './premium'
import { renderFriendly } from './friendly'
import type { TemplateRenderFn, TemplateStyle, TemplateMeta } from './types'

export type { QuoteTemplateData, TemplateStyle, TemplateMeta, TemplateRenderFn } from './types'
export { buildQuoteTemplateData } from './data-builder'
// TEMPLATE_META/getTemplateMeta bor i meta.ts (INTE här) — se kommentaren
// där för varför: den filen har noll beroende på react-dom/server, så
// klientkomponenter (QuoteStylePicker m.fl.) importerar därifrån direkt
// istället för denna barrel-fil.
export { TEMPLATE_META, getTemplateMeta } from './meta'

export const TEMPLATES: Record<TemplateStyle, TemplateRenderFn> = {
  modern: renderModernHtml,
  premium: renderPremium,
  friendly: renderFriendly,
}

export function selectTemplate(style: string | null | undefined): TemplateRenderFn {
  const key = (style || 'modern') as TemplateStyle
  return TEMPLATES[key] || TEMPLATES.modern
}
