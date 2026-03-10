import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export interface LeadData {
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
  job_type: string | null
  description: string | null
  urgency: 'low' | 'medium' | 'high'
  estimated_value: number | null
  raw_text: string
}

export interface EmailInput {
  subject: string
  from: string
  body: string
  date: string
}

/**
 * Stage 1 (Haiku): Quick yes/no — is this email likely a service request / lead?
 * Returns true only if confident this is a potential customer requesting work.
 */
export async function isLikelyLead(
  email: EmailInput,
  approvedSenders: string[],
  blockedSenders: string[]
): Promise<boolean> {
  const fromEmail = extractEmailAddress(email.from)

  // Hard block
  if (blockedSenders.length > 0 && matchesSenderList(fromEmail, blockedSenders)) {
    return false
  }
  // Hard approve (known lead sources)
  const hardApproved = approvedSenders.length > 0 && matchesSenderList(fromEmail, approvedSenders)

  // Skip obvious no-reply / system emails
  const lowerFrom = fromEmail.toLowerCase()
  if (
    !hardApproved &&
    (lowerFrom.includes('noreply') ||
      lowerFrom.includes('no-reply') ||
      lowerFrom.includes('donotreply') ||
      lowerFrom.includes('postmaster') ||
      lowerFrom.includes('mailer-daemon') ||
      lowerFrom.includes('notifications@') ||
      lowerFrom.includes('support@handymate') ||
      lowerFrom.includes('info@handymate'))
  ) {
    return false
  }

  const prompt = hardApproved
    ? `The sender is pre-approved as a lead source. Always return YES.\nEmail: ${email.subject}`
    : `Du är ett snabbt filter. Svara BARA med "YES" eller "NO".

Är detta e-postmeddelande sannolikt en privatkund eller ett företag som söker hantverkstjänster?
(t.ex. el, VVS, målning, snickeri, golv, tak, städ, flytt, lås, trädgård, bygg)

Ämne: ${email.subject}
Från: ${email.from}
Text (första 400 tecken):
${email.body.slice(0, 400)}

Svar (YES/NO):`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (message.content[0] as any)?.text?.trim().toUpperCase() || ''
    return text.startsWith('YES')
  } catch (err) {
    console.error('[gmail-lead] Haiku detection error:', err)
    return false
  }
}

/**
 * Stage 2 (Sonnet): Full parsing of lead details from email.
 */
export async function parseLeadFromEmail(email: EmailInput): Promise<LeadData> {
  const prompt = `Du är en assistent som extraherar lead-information från e-postmeddelanden till svenska hantverkare.

Analysera detta e-postmeddelande och extrahera all relevant information. Returnera BARA ett JSON-objekt (inget annat).

E-post:
Ämne: ${email.subject}
Från: ${email.from}
Datum: ${email.date}
---
${email.body.slice(0, 2000)}
---

Returnera detta JSON-schema (använd null om info saknas):
{
  "name": "Fullständigt namn på avsändaren",
  "phone": "Telefonnummer (svenska format, t.ex. 0701234567)",
  "email": "E-postadress",
  "address": "Adress om nämnd",
  "job_type": "Typ av arbete (t.ex. 'el-installation', 'rörmokeri', 'målning', 'snickeri')",
  "description": "Kort beskrivning av önskat arbete (max 200 tecken)",
  "urgency": "low|medium|high (high = akut/snarast, medium = inom veckan, low = ingen brådska)",
  "estimated_value": null_eller_heltal_i_SEK_om_budget_nämns
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (message.content[0] as any)?.text?.trim() || '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    // Extract email from "From" header as fallback
    const fromEmail = extractEmailAddress(email.from)
    const fromName = extractDisplayName(email.from)

    return {
      name: parsed.name || fromName || null,
      phone: parsed.phone || null,
      email: parsed.email || fromEmail || null,
      address: parsed.address || null,
      job_type: parsed.job_type || null,
      description: parsed.description || null,
      urgency: ['low', 'medium', 'high'].includes(parsed.urgency) ? parsed.urgency : 'medium',
      estimated_value: typeof parsed.estimated_value === 'number' ? parsed.estimated_value : null,
      raw_text: `${email.subject}\n${email.body.slice(0, 500)}`,
    }
  } catch (err) {
    console.error('[gmail-lead] Sonnet parsing error:', err)
    // Fallback: at least capture from address
    return {
      name: extractDisplayName(email.from) || null,
      phone: null,
      email: extractEmailAddress(email.from) || null,
      address: null,
      job_type: null,
      description: email.subject.slice(0, 200),
      urgency: 'medium',
      estimated_value: null,
      raw_text: `${email.subject}\n${email.body.slice(0, 500)}`,
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase().trim()
}

function extractDisplayName(from: string): string {
  const match = from.match(/^([^<]+)</)
  return match ? match[1].trim().replace(/"/g, '') : ''
}

function matchesSenderList(email: string, list: string[]): boolean {
  const lower = email.toLowerCase()
  return list.some((entry) => {
    const e = entry.trim().toLowerCase()
    if (!e) return false
    // Match exact email or @domain.com / domain.com
    if (e.startsWith('@')) return lower.endsWith(e)
    if (e.includes('@')) return lower === e
    return lower.endsWith('@' + e) || lower.endsWith('.' + e)
  })
}
