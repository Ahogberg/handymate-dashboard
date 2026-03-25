/**
 * Handymate Outreach Scraper
 *
 * Scrapar hantverkare från Google Maps + Easoft-kunder via Firecrawl.
 * Exporterar till CSV, valfritt importerar till Supabase.
 *
 * Kör:  npx ts-node scripts/scraping/scrape-craftsmen.ts
 * Med:  npx ts-node scripts/scraping/scrape-craftsmen.ts --import
 */

import FirecrawlApp from '@mendable/firecrawl-js'
import * as fs from 'fs'
import * as path from 'path'
import { ScrapedLead, RawBusiness, SEARCH_QUERIES, EASOFT_QUERIES } from './types'

// Ladda .env.local
try {
  const envPath = path.resolve(__dirname, '../../.env.local')
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
} catch { /* .env.local kanske inte finns */ }

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY
if (!FIRECRAWL_KEY) {
  console.error('FIRECRAWL_API_KEY saknas i .env.local')
  process.exit(1)
}

const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_KEY })

async function scrapeUrl(url: string, opts: any): Promise<any> {
  // Handle different SDK versions
  if (typeof (firecrawl as any).scrapeUrl === 'function') return (firecrawl as any).scrapeUrl(url, opts)
  if (typeof (firecrawl as any).scrape === 'function') return (firecrawl as any).scrape(url, opts)
  throw new Error('Firecrawl SDK: varken scrapeUrl eller scrape hittades')
}
const MAX_LEADS = 50
const DELAY_MS = 2000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Svenska mobilnummer-validering ─────────────────────

function normalizePhone(phone: string): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[\s\-\(\)]/g, '')

  // +467X... format
  if (/^\+467\d{8}$/.test(cleaned)) return cleaned
  // 07X... format → +46
  if (/^07\d{8}$/.test(cleaned)) return '+46' + cleaned.slice(1)
  // 467X... utan +
  if (/^467\d{8}$/.test(cleaned)) return '+' + cleaned

  return null // Inte ett mobilnummer
}

function extractPhones(text: string): string[] {
  const patterns = [
    /(?:\+46|0)[\s\-]?7\d[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
    /(?:\+46|0)7\d{8}/g,
  ]
  const found: string[] = []
  for (const p of patterns) {
    const matches = text.match(p)
    if (matches) found.push(...matches)
  }
  return found
}

function getFirstName(companyName: string): string {
  // Försök extrahera förnamn från företagsnamn
  const parts = companyName.split(/[\s&,]/).filter(Boolean)
  const common = ['AB', 'HB', 'KB', 'Bygg', 'El', 'VVS', 'Rör', 'Service', 'Företag', 'Hantverkare']
  const name = parts.find(p => p.length > 2 && !common.includes(p) && /^[A-ZÅÄÖ]/.test(p))
  return name || 'du'
}

// ── SMS-textgenerering ─────────────────────────────────

function generateSmsText(lead: { name: string; industry: string; source: string }): string {
  const firstName = getFirstName(lead.name)

  if (lead.source === 'easoft') {
    return `Hej ${firstName}! Trött på Easoft? Handymate är ett modernare alternativ med AI som sköter hela back office automatiskt — offerter, fakturor, kundkontakt. Prova: handymate.se`
  }

  const branchLower = lead.industry.toLowerCase()
  return `Hej ${firstName}! Handymate hjälper ${branchLower} i Stockholm att slippa administrationen. Matte — vår AI — sköter offerter, fakturor och kundkontakt automatiskt. Prova: handymate.se`
}

// ── Google Maps scraping ───────────────────────────────

async function scrapeGoogleMaps(): Promise<RawBusiness[]> {
  const results: RawBusiness[] = []

  for (const { query, industry } of SEARCH_QUERIES) {
    if (results.length >= MAX_LEADS) break

    console.log(`🔍 Söker: "${query}"...`)
    try {
      const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
      const response = await scrapeUrl(url, { formats: ['markdown'] })

      if (response.success && response.markdown) {
        const businesses = parseGoogleMapsMarkdown(response.markdown, industry)
        console.log(`   Hittade ${businesses.length} företag`)
        results.push(...businesses)
      } else {
        console.log(`   Inga resultat`)
      }
    } catch (err: any) {
      console.error(`   Fel: ${err.message}`)
    }

    await sleep(DELAY_MS)
  }

  return results
}

function parseGoogleMapsMarkdown(markdown: string, industry: string): RawBusiness[] {
  const businesses: RawBusiness[] = []
  const lines = markdown.split('\n')

  let current: Partial<RawBusiness> = {}
  for (const line of lines) {
    // Företagsnamn (vanligtvis bold eller header)
    const nameMatch = line.match(/^#{1,3}\s+(.+)/) || line.match(/\*\*(.+?)\*\*/)
    if (nameMatch && nameMatch[1].length > 3 && nameMatch[1].length < 80) {
      if (current.name && current.phone) {
        businesses.push({ ...current, industry } as RawBusiness)
      }
      current = { name: nameMatch[1].trim(), industry }
    }

    // Telefonnummer
    const phones = extractPhones(line)
    if (phones.length > 0 && !current.phone) {
      current.phone = phones[0]
    }

    // Adress (innehåller Stockholm, gata, väg etc.)
    if (/Stockholm|gatan|vägen|väg\s\d/i.test(line) && !current.address) {
      current.address = line.trim().replace(/[*#]/g, '').trim().slice(0, 100)
    }

    // Recensioner
    const reviewMatch = line.match(/(\d+)\s*(?:recension|review|omdöme)/i)
    if (reviewMatch) {
      current.reviews = parseInt(reviewMatch[1])
    }

    // Hemsida
    const urlMatch = line.match(/https?:\/\/(?:www\.)?([a-z0-9\-]+\.[a-z]{2,})/i)
    if (urlMatch && !current.website && !urlMatch[0].includes('google')) {
      current.website = urlMatch[0]
    }
  }

  // Sista företaget
  if (current.name) {
    businesses.push({ ...current, industry } as RawBusiness)
  }

  return businesses
}

// ── Easoft-kunder scraping ─────────────────────────────

async function scrapeEasoftCustomers(): Promise<RawBusiness[]> {
  const results: RawBusiness[] = []

  for (const query of EASOFT_QUERIES) {
    console.log(`🔍 Söker Easoft: "${query}"...`)
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      const response = await scrapeUrl(url, { formats: ['markdown'] })

      if (response.success && response.markdown) {
        // Extrahera företagsnamn och hemsidor från sökresultat
        const urlMatches = response.markdown.match(/https?:\/\/(?:www\.)?([a-z0-9\-]+\.[a-z]{2,})/gi) || []
        const uniqueUrls = Array.from(new Set(urlMatches) as Set<string>)
          .filter(u => !u.includes('google') && !u.includes('easoft') && !u.includes('facebook'))
          .slice(0, 10)

        for (const siteUrl of uniqueUrls) {
          if (results.length >= 15) break // Max 15 Easoft-leads

          console.log(`   Scrapar hemsida: ${siteUrl}`)
          try {
            const siteRes = await scrapeUrl(siteUrl, { formats: ['markdown'] })

            if (siteRes.success && siteRes.markdown) {
              const phones = extractPhones(siteRes.markdown)
              const mobilePhone = phones.find(p => normalizePhone(p))
              // Extrahera företagsnamn från title eller H1
              const titleMatch = siteRes.markdown.match(/^#\s+(.+)/m)
              const name = titleMatch?.[1]?.trim() || new URL(siteUrl).hostname.replace('www.', '')

              if (name) {
                results.push({
                  name,
                  phone: mobilePhone,
                  website: siteUrl,
                  industry: 'Hantverkare',
                })
              }
            }
          } catch { /* Fortsätt med nästa */ }

          await sleep(DELAY_MS)
        }
      }
    } catch (err: any) {
      console.error(`   Fel: ${err.message}`)
    }

    await sleep(DELAY_MS)
  }

  return results
}

// ── Deduplicering + filtrering ─────────────────────────

function deduplicateAndFilter(
  mapsLeads: RawBusiness[],
  easoftLeads: RawBusiness[]
): ScrapedLead[] {
  const seen = new Set<string>()
  const results: ScrapedLead[] = []

  function processLead(raw: RawBusiness, source: 'google_maps' | 'easoft') {
    const phone = normalizePhone(raw.phone || '')
    if (!phone) return // Bara mobilnummer
    if (seen.has(phone)) return // Dublett
    seen.add(phone)

    const lead: ScrapedLead = {
      name: raw.name,
      phone,
      city: raw.address?.match(/Stockholm|Solna|Sundbyberg|Nacka|Huddinge|Södertälje/i)?.[0] || 'Stockholm',
      industry: raw.industry || 'Hantverkare',
      source,
      sms_text: '',
      website: raw.website || null,
      reviews_count: raw.reviews || null,
    }

    lead.sms_text = generateSmsText(lead)
    results.push(lead)
  }

  // Easoft-kunder först (högre prioritet)
  for (const lead of easoftLeads) processLead(lead, 'easoft')
  // Sen Google Maps
  for (const lead of mapsLeads) processLead(lead, 'google_maps')

  return results.slice(0, MAX_LEADS)
}

// ── CSV-export ─────────────────────────────────────────

function exportToCsv(leads: ScrapedLead[]): string {
  const date = new Date().toISOString().split('T')[0]
  const filename = `leads-${date}.csv`
  const filepath = path.resolve(__dirname, 'output', filename)

  const header = 'name,phone,city,industry,source,sms_text,website,reviews_count'
  const rows = leads.map(l =>
    [
      `"${l.name.replace(/"/g, '""')}"`,
      l.phone,
      l.city,
      l.industry,
      l.source,
      `"${l.sms_text.replace(/"/g, '""')}"`,
      l.website || '',
      l.reviews_count ?? '',
    ].join(',')
  )

  fs.writeFileSync(filepath, [header, ...rows].join('\n'), 'utf-8')
  return filepath
}

// ── Supabase-import ────────────────────────────────────

async function importToSupabase(leads: ScrapedLead[]) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase-credentials saknas i .env.local')
    return
  }

  console.log(`\n📤 Importerar ${leads.length} leads till Supabase...`)

  let imported = 0
  let skipped = 0

  for (const lead of leads) {
    // Kolla om telefonnumret redan finns
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?phone=eq.${encodeURIComponent(lead.phone)}&select=lead_id`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    })
    const existing = await checkRes.json()
    if (existing.length > 0) {
      skipped++
      continue
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        lead_id: `lead_outreach_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        business_id: process.env.HANDYMATE_BUSINESS_ID || 'biz_al7pjuu5smi',
        name: lead.name,
        phone: lead.phone,
        source: 'outreach_scrape',
        status: 'new',
        pipeline_stage: 'new_inquiry',
        job_type: lead.industry,
        notes: `Source: ${lead.source}${lead.website ? ` | Web: ${lead.website}` : ''}${lead.reviews_count ? ` | ${lead.reviews_count} recensioner` : ''}`,
      }),
    })

    if (res.ok) imported++
    else console.error(`   Fel vid import av ${lead.name}: ${res.statusText}`)

    await sleep(200) // Rate limit
  }

  console.log(`✅ Importerat: ${imported}, Hoppade över (dubbletter): ${skipped}`)
}

// ── Main ───────────────────────────────────────────────

async function main() {
  const shouldImport = process.argv.includes('--import')

  console.log('🚀 Handymate Outreach Scraper')
  console.log(`   Max leads: ${MAX_LEADS}`)
  console.log(`   Import: ${shouldImport ? 'JA' : 'NEJ'}`)
  console.log('')

  // Steg 1: Scrapa Google Maps
  console.log('── Google Maps ──────────────────')
  const mapsLeads = await scrapeGoogleMaps()
  console.log(`\nTotalt från Maps: ${mapsLeads.length} råleads`)

  // Steg 2: Scrapa Easoft-kunder
  console.log('\n── Easoft-kunder ────────────────')
  const easoftLeads = await scrapeEasoftCustomers()
  console.log(`\nTotalt från Easoft: ${easoftLeads.length} råleads`)

  // Steg 3: Filtrera och dedupplicera
  console.log('\n── Filtrering ──────────────────')
  const leads = deduplicateAndFilter(mapsLeads, easoftLeads)
  console.log(`Filtrerade leads: ${leads.length}`)
  console.log(`  - Google Maps: ${leads.filter(l => l.source === 'google_maps').length}`)
  console.log(`  - Easoft: ${leads.filter(l => l.source === 'easoft').length}`)

  // Steg 4: Exportera CSV
  const csvPath = exportToCsv(leads)
  console.log(`\n📁 CSV exporterad: ${csvPath}`)

  // Steg 5: Importera till Supabase
  if (shouldImport) {
    await importToSupabase(leads)
  }

  // Visa preview
  console.log('\n── Preview (första 3) ──────────')
  for (const lead of leads.slice(0, 3)) {
    console.log(`  ${lead.name} | ${lead.phone} | ${lead.industry} | ${lead.source}`)
    console.log(`  SMS: "${lead.sms_text.slice(0, 80)}..."`)
    console.log('')
  }

  console.log(`\n✅ Klart! ${leads.length} leads redo.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
