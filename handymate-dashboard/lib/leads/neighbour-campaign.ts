/**
 * Granneffekten — generera brev till grannar efter avslutat jobb.
 * Delar kvot med outbound-brev. 15 kr/brev för kund, 9.49 kr internt.
 */

import { getServerSupabase } from '@/lib/supabase'

const COST_PER_LETTER = 15

const JOB_TYPE_ANGLES: Record<string, string> = {
  badrum: 'Vi renoverade nyligen ett badrum i ditt område',
  el: 'Vi utförde en elinstallation på din gata',
  vvs: 'Vi jobbade med VVS hos din granne',
  bygg: 'Vi genomförde ett byggprojekt i ditt område',
  måleri: 'Vi målade nyligen ett hus i ditt grannskap',
  tak: 'Vi renoverade ett tak i ditt område',
  golv: 'Vi lade nyligen nytt golv hos din granne',
  mark: 'Vi utförde markarbete i ditt kvarter',
}

function getAngle(jobType: string): string {
  const lower = (jobType || '').toLowerCase()
  for (const [key, angle] of Object.entries(JOB_TYPE_ANGLES)) {
    if (lower.includes(key)) return angle
  }
  return 'Vi utförde nyligen ett hantverksarbete i ditt område'
}

/**
 * Generera brevinnehåll med Claude Haiku.
 */
export async function generateNeighbourLetter(params: {
  businessName: string
  contactName: string
  phone: string
  jobType: string
  address: string
}): Promise<string> {
  const angle = getAngle(params.jobType)
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, vänligt grannbrev (max 200 ord) från ${params.contactName} på ${params.businessName}.

Kontext: ${angle} på ${params.address}.
Jobbtyp: ${params.jobType}
Telefon: ${params.phone}

Brevet ska:
- Vara personligt och inte säljigt
- Nämna att vi nyligen jobbade i området
- Erbjuda kostnadsfri besiktning/konsultation
- Inkludera företagsnamn och telefon
- Sluta med en mjuk uppmaning

Skriv på svenska. Bara brevtexten, inget annat.`,
          }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text
        if (text) return text.trim()
      }
    } catch { /* fallback */ }
  }

  // Fallback
  return `Hej granne!

${angle} och ville passa på att presentera oss.

Vi på ${params.businessName} hjälper gärna till om du har behov av liknande tjänster. Vi erbjuder kostnadsfri besiktning.

Ring oss på ${params.phone} för ett förutsättningslöst samtal.

Med vänliga hälsningar,
${params.contactName}
${params.businessName}`
}

/**
 * Hämta kvot-status för innevarande månad (delar med outbound).
 */
export async function getQuotaStatus(businessId: string): Promise<{
  used: number
  quota: number
  remaining: number
  extraCostPerLetter: number
}> {
  const supabase = getServerSupabase()
  const month = new Date().toISOString().slice(0, 7) // YYYY-MM

  const { data: usage } = await supabase
    .from('leads_monthly_usage')
    .select('letters_sent, letters_quota, extra_letters')
    .eq('business_id', businessId)
    .eq('month', month)
    .maybeSingle()

  const quota = usage?.letters_quota || 20
  const used = (usage?.letters_sent || 0) + (usage?.extra_letters || 0)

  return {
    used,
    quota,
    remaining: Math.max(0, quota - used),
    extraCostPerLetter: COST_PER_LETTER,
  }
}

/**
 * Skapa en grannkampanj.
 */
export async function createNeighbourCampaign(params: {
  businessId: string
  jobId?: string
  jobType: string
  sourceAddress: string
  neighbourCount: number
  letterContent: string
}): Promise<{ id: string } | null> {
  const supabase = getServerSupabase()

  // Generera grann-adresser (mockade baserat på source)
  const addresses = generateMockNeighbourAddresses(params.sourceAddress, params.neighbourCount)

  const { data, error } = await supabase
    .from('leads_neighbour_campaigns')
    .insert({
      business_id: params.businessId,
      job_id: params.jobId || null,
      job_type: params.jobType,
      source_address: params.sourceAddress,
      neighbour_addresses: addresses,
      neighbour_count: params.neighbourCount,
      letter_content: params.letterContent,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[neighbour-campaign] Insert error:', error)
    return null
  }

  return data
}

/**
 * Generera mockade grann-adresser baserat på källadress.
 * I produktion: Google Maps Places API / Distance Matrix.
 */
function generateMockNeighbourAddresses(sourceAddress: string, count: number): string[] {
  // Extrahera gatunamn och nummer
  const match = sourceAddress.match(/^(.+?)\s+(\d+)/)
  if (!match) {
    return Array.from({ length: count }, (_, i) => `Grannvägen ${i + 1}`)
  }

  const street = match[1]
  const baseNum = parseInt(match[2])
  const addresses: string[] = []

  for (let i = 1; addresses.length < count; i++) {
    // Jämna/udda numrering
    const num1 = baseNum + i * 2
    const num2 = baseNum - i * 2
    if (num1 > 0 && num1 !== baseNum) addresses.push(`${street} ${num1}`)
    if (addresses.length < count && num2 > 0 && num2 !== baseNum) addresses.push(`${street} ${num2}`)
  }

  return addresses.slice(0, count)
}
