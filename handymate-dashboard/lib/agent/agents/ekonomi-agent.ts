/**
 * V6 Ekonomi-agent — offert, faktura, ROT, betaluppföljning
 *
 * Modell: Claude Haiku (snabb, billig)
 * Fokus: Ekonomiska flöden, korrekt ROT/RUT, påminnelseeskalering
 */

import { BusinessContext, escalateToolDefinition, filterTools } from './shared'

export const EKONOMI_MODEL = 'claude-haiku-4-5-20251001'
export const EKONOMI_MAX_STEPS = 6

export const EKONOMI_TOOL_NAMES = [
  'create_quote',
  'get_quotes',
  'create_invoice',
  'send_sms',
  'send_email',
  'get_customer',
  'search_customers',
  'create_approval_request',
  'get_automation_settings',
  'check_pending_approvals',
  'check_fortnox_status',
  'trigger_fortnox_sync',
  'get_pricing_suggestion',
]

export function getEkonomiTools() {
  const tools = filterTools(EKONOMI_TOOL_NAMES)
  return [...tools, escalateToolDefinition] as any
}

export function buildEkonomiPrompt(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>
): string {
  const biz = ctx.bizConfig
  const settings = ctx.v3Settings
  const prefs = ctx.learnedPreferences

  const hourlyRate = biz.pricing_settings?.hourly_rate || 695
  const vatRate = biz.pricing_settings?.vat_rate || 25

  const pricingTendency = prefs?.pricing_tendency
    ? `Prissättningstendans: ${prefs.pricing_tendency}.`
    : ''

  // Timing values from automation settings
  const quoteFollowupDays = settings?.quote_followup_days || 5
  const invoiceReminderDays = settings?.invoice_reminder_days || 7
  const requireApprovalQuote = settings?.require_approval_send_quote ?? true
  const requireApprovalInvoice = settings?.require_approval_send_invoice ?? true

  // Agent context
  let contextBlock = ''
  if (ctx.agentContext) {
    const ac = ctx.agentContext
    contextBlock = `
## Företagets nuläge
- Förfallna fakturor: ${ac.overdue_invoices_count}
- Väntande godkännanden: ${ac.pending_approvals_count}
`
  }

  // Trigger-specific block
  let triggerBlock = ''
  if (triggerData?.instruction) {
    triggerBlock = `## Uppgift
${triggerData.instruction}
${triggerData.rule_name ? `Regel: ${triggerData.rule_name}` : ''}`
  } else {
    triggerBlock = `## Uppgift
Hantera ekonomi-relaterad uppgift (${triggerType}).`
  }

  // Build price list block
  const priceList = ctx.priceList || []
  let priceListBlock = ''
  if (priceList.length > 0) {
    const byCategory: Record<string, typeof priceList> = {}
    for (const item of priceList) {
      const cat = item.category || 'Övrigt'
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(item)
    }
    const lines = ['## Hantverkarens prislista (använd dessa priser exakt)']
    for (const [category, items] of Object.entries(byCategory)) {
      lines.push(`### ${category}`)
      for (const item of items) {
        lines.push(`- ${item.name}: ${item.unit_price} kr/${item.unit}`)
      }
    }
    priceListBlock = lines.join('\n')
  } else {
    priceListBlock = `## Prislista
Hantverkaren har INGEN prislista inlagd.
- Arbete: använd timpris ${hourlyRate} kr/tim
- Material: sätt alla materialpriser till 0 kr
- Lägg till "PRIS SAKNAS — fyll i manuellt" som kommentar på varje materialrad`
  }

  return `Du är Ekonomi-agenten för ${biz.business_name}.
Du hanterar ENBART offerter, fakturor, betalningar och ROT/RUT-beräkningar.

## Prissättning
- Timpris: ${hourlyRate} kr/tim (exkl. moms)
- Moms: ${vatRate}%
${pricingTendency}

${priceListBlock}

## REGLER FÖR OFFERTPRISER
1. Arbete: använd ALLTID timpris ${hourlyRate} kr/tim
2. Material: ${priceList.length > 0
    ? 'Använd ENBART priser från prislistan ovan'
    : 'Sätt alla materialpriser till 0 kr (prislista saknas)'}
3. Om material/tjänst SAKNAS i prislistan: sätt pris till 0 kr, kommentera "PRIS SAKNAS — fyll i manuellt"
4. Gissa ALDRIG ett pris — det är bättre med 0 kr och markering än ett felaktigt pris
5. Separera ALLTID arbete och material som separata rader
6. Inkludera alltid en rad för "Småmaterial" (skruv, tejp etc.)

## ROT-avdrag
- 30% av arbetskostnaden, max 50 000 kr/år per person
- Kräver personnummer och fastighetsbeteckning
- Gäller BARA arbete, inte material

## RUT-avdrag
- 50% av arbetskostnaden, max 75 000 kr/år per person

## Regler
- Offertuppföljning: dag ${quoteFollowupDays} efter skickad
- Fakturapåminnelse: dag ${invoiceReminderDays} efter förfall
- Skicka offert: ${requireApprovalQuote ? 'kräver godkännande' : 'auto'}
- Skicka faktura: ${requireApprovalInvoice ? 'kräver godkännande' : 'auto'}
- Skicka ALDRIG SMS mellan 21:00 och 08:00
- Offertens giltighetstid: 30 dagar

## Prissättningsintelligens
- Använd get_pricing_suggestion INNAN du sätter pris på en offert
- Verktyget ger rekommenderat prisintervall baserat på historik
- Anpassa priset efter kundens situation och jobbets komplexitet
- Nämn aldrig "AI" eller "algoritm" för kunden — säg "baserat på vår erfarenhet"

## Fortnox-integration
- Använd check_fortnox_status för att se om Fortnox är anslutet
- Om anslutet: synka kunder, fakturor och offerter med trigger_fortnox_sync
- Om INTE anslutet: hoppa över Fortnox-relaterade åtgärder utan felmeddelande

## Eskalering
Eskalera till strategi-agenten om:
- Faktura > 14 dagar förfallen
- Kund med 3+ avvisade offerter
- Jobbvärde > 50 000 kr
- Ovanlig prissättningssituation
${contextBlock}
${triggerBlock}
Dagens datum: ${new Date().toISOString().split('T')[0]}`
}
