/**
 * V6 Strategi-agent — komplexa beslut, höga värden, eskaleringar
 *
 * Modell: Claude Sonnet (smartare, grundligare)
 * Kallas bara för komplexa situationer — aldrig direkt från events.
 * Returnerar ALLTID create_approval — agerar aldrig utan godkännande.
 */

import { toolDefinitions } from '@/app/api/agent/trigger/tool-definitions'
import { BusinessContext } from './shared'

export const STRATEGI_MODEL = 'claude-sonnet-4-20250514'
export const STRATEGI_MAX_STEPS = 10

export function getStrategiTools() {
  // Full tillgång till alla 22 tools — ingen filtrering
  return toolDefinitions as any
}

export function buildStrategiPrompt(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>,
  escalation?: { reason: string; findings: string; recommendedAction?: string }
): string {
  const biz = ctx.bizConfig
  const settings = ctx.v3Settings
  const prefs = ctx.learnedPreferences

  const branchMap: Record<string, string> = {
    electrician: 'Elektriker', plumber: 'Rörmokare', carpenter: 'Snickare',
    painter: 'Målare', hvac: 'VVS-tekniker', locksmith: 'Låssmed',
    cleaning: 'Städföretag', other: 'Hantverkare',
  }
  const branch = branchMap[biz.branch] || biz.branch || 'Hantverkare'
  const hourlyRate = biz.pricing_settings?.hourly_rate || 695

  // Preferences block
  let prefsBlock = ''
  if (prefs) {
    const lines: string[] = []
    if (prefs.communication_tone) lines.push(`Kommunikationston: ${prefs.communication_tone}`)
    if (prefs.pricing_tendency) lines.push(`Prissättningstendans: ${prefs.pricing_tendency}`)
    if (prefs.preferred_sms_length) lines.push(`SMS-längd: ${prefs.preferred_sms_length}`)
    if (prefs.lead_response_style) lines.push(`Lead-hantering: ${prefs.lead_response_style}`)
    if (lines.length > 0) {
      prefsBlock = `\n## Inlärda preferenser\n${lines.map(l => `- ${l}`).join('\n')}`
    }
  }

  // Agent context
  let contextBlock = ''
  if (ctx.agentContext) {
    const ac = ctx.agentContext
    const insights = Array.isArray(ac.key_insights)
      ? ac.key_insights.map((i: any) => `- ${i.message}`).join('\n')
      : ''
    contextBlock = `
## Företagets nuläge
- Hälsa: ${ac.business_health}
- Öppna leads: ${ac.open_leads_count}
- Förfallna fakturor: ${ac.overdue_invoices_count}
- Väntande godkännanden: ${ac.pending_approvals_count}
${insights ? `\n### Insikter\n${insights}` : ''}
`
  }

  // Escalation context from Haiku agent
  let escalationBlock = ''
  if (escalation) {
    escalationBlock = `
## Eskalering från subagent
**Orsak:** ${escalation.reason}
**Subagentens analys:** ${escalation.findings}
${escalation.recommendedAction ? `**Subagentens förslag:** ${escalation.recommendedAction}` : ''}

Du har eskalering — ta ett välinformerat beslut baserat på subagentens analys.`
  }

  // Trigger block
  let triggerBlock = ''
  if (triggerData?.instruction) {
    triggerBlock = `## Uppgift
${triggerData.instruction}
${triggerData.rule_name ? `Regel: ${triggerData.rule_name}` : ''}`
  } else {
    triggerBlock = `## Uppgift
Komplex situation som kräver strategiskt beslut (${triggerType}).`
  }

  return `Du är Strategi-agenten för ${biz.business_name}, ett ${branch.toLowerCase()}företag.
Du kallas ENBART för komplexa beslut som kräver eftertanke.

## Företag
- ${biz.business_name} (${branch})
- Område: ${biz.service_area || 'Sverige'}
- Timpris: ${hourlyRate} kr/tim (exkl. moms)

## Automationsinställningar
${settings ? `- Arbetstider: ${settings.work_start}–${settings.work_end}
- Offert: ${settings.require_approval_send_quote ? 'kräver godkännande' : 'auto'}
- Faktura: ${settings.require_approval_send_invoice ? 'kräver godkännande' : 'auto'}` : '(Inga inställningar)'}

## ROT/RUT
- ROT: 30% av arbete, max 50 000 kr/år
- RUT: 50% av arbete, max 75 000 kr/år

## KRITISK REGEL
Du MÅSTE alltid använda create_approval_request med risk_level 'high'.
Du agerar ALDRIG utan hantverkarens godkännande.
Beskriv tydligt vad du vill göra och varför i approval-begäran.
${prefsBlock}
${contextBlock}
${escalationBlock}
${triggerBlock}
Dagens datum: ${new Date().toISOString().split('T')[0]}`
}
