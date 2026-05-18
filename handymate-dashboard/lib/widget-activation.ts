/**
 * Validering + prompt-formatering för chatbot-aktivering.
 *
 * Källan till sanning för:
 * - "Är widget redo att aktiveras?" (canActivateWidget)
 * - Hur knowledge-base + guardrails formateras till systempromppt
 *   (formatKnowledgeForPrompt, formatGuardrailsForPrompt)
 *
 * Strikt tröskel beslutad 2026-05-18 — målet är att tvinga genomtänkt setup
 * snarare än att möjliggöra "snabb-aktivering utan boundaries".
 */

import type { KnowledgeBase } from '@/components/widget/KnowledgeEditor'
import type { WidgetGuardrails } from '@/components/widget/GuardrailsEditor'

export interface ActivationCheck {
  ok: boolean
  missing: ActivationMissing[]
}

export interface ActivationMissing {
  area: 'knowledge' | 'guardrails'
  field: string
  message: string
}

/**
 * Avgör om widget får aktiveras (sätta widget_enabled=true). Strikt tröskel:
 *   Knowledge: bransch + ≥1 tjänst + ≥1 FAQ + ≥1 ifylld policy
 *   Guardrails: custom_instructions + (≥1 blocked_topic ELLER ≥1 allowed_topic)
 */
export function canActivateWidget(
  kb: KnowledgeBase | null | undefined,
  guardrails: WidgetGuardrails | null | undefined,
): ActivationCheck {
  const missing: ActivationMissing[] = []

  // Knowledge-villkor
  if (!kb || !kb.industry || kb.industry.trim() === '') {
    missing.push({ area: 'knowledge', field: 'industry', message: 'Välj bransch' })
  }
  const hasService = !!(kb?.services?.some(s => s.name && s.name.trim()))
  if (!hasService) {
    missing.push({ area: 'knowledge', field: 'services', message: 'Lägg till minst 1 tjänst' })
  }
  const hasFaq = !!(kb?.faqs?.some(f => f.question && f.question.trim() && f.answer && f.answer.trim()))
  if (!hasFaq) {
    missing.push({ area: 'knowledge', field: 'faqs', message: 'Lägg till minst 1 FAQ' })
  }
  const hasPolicy = !!(
    kb?.policies && (
      (kb.policies.quote && kb.policies.quote.trim()) ||
      (kb.policies.payment && kb.policies.payment.trim()) ||
      (kb.policies.warranty && kb.policies.warranty.trim()) ||
      (kb.policies.cancellation && kb.policies.cancellation.trim())
    )
  )
  if (!hasPolicy) {
    missing.push({ area: 'knowledge', field: 'policies', message: 'Fyll i minst 1 policy (offert, betalning, garanti eller avbokning)' })
  }

  // Guardrails-villkor
  if (!guardrails || !guardrails.custom_instructions || guardrails.custom_instructions.trim() === '') {
    missing.push({ area: 'guardrails', field: 'custom_instructions', message: 'Beskriv vad boten får svara om' })
  }
  const hasAllowed = !!(guardrails?.allowed_topics?.some(t => t && t.trim()))
  const hasBlocked = !!(guardrails?.blocked_topics?.some(t => t && t.trim()))
  if (!hasAllowed && !hasBlocked) {
    missing.push({ area: 'guardrails', field: 'topics', message: 'Lägg till minst 1 blockerat eller tillåtet ämne' })
  }

  return { ok: missing.length === 0, missing }
}

interface KnowledgeBaseJson {
  industry?: string
  services?: Array<{ name?: string; description?: string; price_indication?: string; typical_duration?: string }>
  faqs?: Array<{ question?: string; answer?: string }>
  emergency_situations?: string[]
  policies?: { quote?: string; payment?: string; warranty?: string; cancellation?: string }
}

/**
 * Konverterar knowledge_base JSONB → naturligt språk för Claude-prompten.
 * Tomma sektioner hoppas över så prompten inte fylls med rubriker utan innehåll.
 */
export function formatKnowledgeForPrompt(kb: KnowledgeBaseJson | null | undefined): string {
  if (!kb || typeof kb !== 'object') return ''
  const sections: string[] = []

  if (kb.industry) {
    sections.push(`Bransch: ${kb.industry}`)
  }

  if (Array.isArray(kb.services) && kb.services.length > 0) {
    const lines = kb.services
      .filter(s => s && s.name)
      .map(s => {
        const parts: string[] = []
        if (s.description) parts.push(s.description)
        if (s.price_indication) parts.push(`Pris: ${s.price_indication}`)
        if (s.typical_duration) parts.push(`Tid: ${s.typical_duration}`)
        const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
        return `- ${s.name}${detail}`
      })
    if (lines.length > 0) sections.push(`Tjänster vi erbjuder:\n${lines.join('\n')}`)
  }

  if (Array.isArray(kb.faqs) && kb.faqs.length > 0) {
    const lines = kb.faqs
      .filter(f => f && f.question && f.answer)
      .map(f => `- F: ${f.question}\n  S: ${f.answer}`)
    if (lines.length > 0) sections.push(`Vanliga frågor och svar:\n${lines.join('\n')}`)
  }

  if (Array.isArray(kb.emergency_situations) && kb.emergency_situations.length > 0) {
    const lines = kb.emergency_situations.filter(s => s && s.trim()).map(s => `- ${s}`)
    if (lines.length > 0) sections.push(`Akuta situationer (be kunden ringa direkt):\n${lines.join('\n')}`)
  }

  if (kb.policies) {
    const p = kb.policies
    const policyLines: string[] = []
    if (p.quote) policyLines.push(`- Offert: ${p.quote}`)
    if (p.payment) policyLines.push(`- Betalning: ${p.payment}`)
    if (p.warranty) policyLines.push(`- Garanti: ${p.warranty}`)
    if (p.cancellation) policyLines.push(`- Avbokning: ${p.cancellation}`)
    if (policyLines.length > 0) sections.push(`Policyer:\n${policyLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

interface WidgetGuardrailsJson {
  custom_instructions?: string
  allowed_topics?: string[]
  blocked_topics?: string[]
  fallback_response?: string
}

/**
 * Konverterar widget_guardrails JSONB → systempromppt-block som tydligt
 * instruerar Claude om scope. Custom_instructions kommer först (botens
 * "scope-deklaration"), sedan tillåtna/blockerade ämnen som listor.
 */
export function formatGuardrailsForPrompt(g: WidgetGuardrailsJson | null | undefined): string {
  if (!g || typeof g !== 'object') return ''
  const sections: string[] = []

  if (g.custom_instructions && g.custom_instructions.trim()) {
    sections.push(`SCOPE: ${g.custom_instructions.trim()}`)
  }

  const allowed = (g.allowed_topics || []).filter(t => t && t.trim())
  if (allowed.length > 0) {
    sections.push(`Tillåtna ämnen (svara gärna): ${allowed.join(', ')}`)
  }

  const blocked = (g.blocked_topics || []).filter(t => t && t.trim())
  if (blocked.length > 0) {
    sections.push(`Blockerade ämnen (svara INTE på dessa — använd standardsvaret nedan): ${blocked.join(', ')}`)
  }

  if (g.fallback_response && g.fallback_response.trim()) {
    sections.push(`Standardsvar utanför scope: "${g.fallback_response.trim()}"`)
  } else if (allowed.length > 0 || blocked.length > 0 || (g.custom_instructions && g.custom_instructions.trim())) {
    sections.push('Standardsvar utanför scope: "Det är utanför vad jag kan hjälpa med — vill du lämna dina uppgifter så hör vi av oss?"')
  }

  return sections.join('\n')
}
