/**
 * Handymate Outreach Scraper — Google Places API + Firecrawl
 *
 * Scrapar hantverkare via Google Places Text Search.
 * Easoft-kunder via Firecrawl (hitta.se/foretagsfakta.se).
 * Exporterar till CSV, valfritt importerar till Supabase.
 *
 * Kör:  npx tsx scripts/scraping/scrape-craftsmen.ts
 * Med:  npx tsx scripts/scraping/scrape-craftsmen.ts --import
 */

import { Client, PlaceInputType } from '@googlemaps/google-maps-services-js'
import FirecrawlApp from '@mendable/firecrawl-js'
import * as fs from 'fs'
import * as path from 'path'
import { ScrapedLead, RawBusiness, SEARCH_QUERIES } from './types.js'

// ── Env ────────────────────────────────────────────────

try {
  const envPath = path.resolve(__dirname, '../../.env.local')
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
} catch { /* .env.local kanske inte finns */ }

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
if (!GOOGLE_KEY) {
  console.error('GOOGLE_MAPS_API_KEY saknas i .env.local eller miljövariabler')
  process.exit(1)
}

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY
const google = new Client({})
const firecrawlApp = FIRECRAWL_KEY ? new FirecrawlApp({ apiKey: FIRECRAWL_KEY }) : null
// SDK v1 uses .v1.scrapeUrl()
const firecrawl = firecrawlApp?.v1 ?? firecrawlApp

const MAX_LEADS = 100
const DELAY_MS = 500

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Telefonnummer ──────────────────────────────────────

function normalizePhone(phone: string): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[\s\-\(\)]/g, '')
  if (/^\+467\d{8}$/.test(cleaned)) return cleaned
  if (/^07\d{8}$/.test(cleaned)) return '+46' + cleaned.slice(1)
  if (/^467\d{8}$/.test(cleaned)) return '+' + cleaned
  // Acceptera även fasta nummer som leads (08-xxx etc)
  if (/^\+46[1-9]\d{7,9}$/.test(cleaned)) return cleaned
  if (/^0[1-9]\d{7,9}$/.test(cleaned)) return '+46' + cleaned.slice(1)
  return null
}

function isMobileNumber(phone: string): boolean {
  return /^\+467/.test(phone)
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+46|0)[\s\-]?[1-9]\d[\s\-]?\d{2,3}[\s\-]?\d{2}[\s\-]?\d{2}/g) || []
  return matches
}

function getFirstName(name: string): string {
  const parts = name.split(/[\s&,]/).filter(Boolean)
  const skip = ['AB', 'HB', 'KB', 'Bygg', 'El', 'VVS', 'Rör', 'Service', 'Företag', 'i', 'och', '&']
  const found = parts.find(p => p.length > 2 && !skip.includes(p) && /^[A-ZÅÄÖ]/.test(p))
  return found || 'du'
}

// ── System-detektion ───────────────────────────────────

const SYSTEM_SIGNATURES: Array<{ pattern: RegExp; system: string; label: string }> = [
  { pattern: /easoft\.se|powered by easoft|easoft/i, system: 'easoft', label: 'Easoft' },
  { pattern: /bokadirekt\.se|bokadirekt/i, system: 'bokadirekt', label: 'Bokadirekt' },
  { pattern: /bygglet\.se|bygglet/i, system: 'bygglet', label: 'Bygglet' },
  { pattern: /servicefinder\.se|servicefinder/i, system: 'servicefinder', label: 'ServiceFinder' },
  { pattern: /offerta\.se|offerta/i, system: 'offerta', label: 'Offerta' },
  { pattern: /fortnox\.se|fortnox/i, system: 'fortnox', label: 'Fortnox' },
  { pattern: /visma\.net|visma/i, system: 'visma', label: 'Visma' },
  { pattern: /wint\.se|wint/i, system: 'wint', label: 'Wint' },
  { pattern: /planacy|planacy\.com/i, system: 'planacy', label: 'Planacy' },
  { pattern: /housecall|housecallpro/i, system: 'housecallpro', label: 'Housecall Pro' },
]

function detectSystem(html: string): string | null {
  for (const sig of SYSTEM_SIGNATURES) {
    if (sig.pattern.test(html)) return sig.system
  }
  return null
}

function getSystemLabel(system: string | null): string {
  if (!system) return 'Okänt'
  return SYSTEM_SIGNATURES.find(s => s.system === system)?.label || system
}

async function enrichWithSystemDetection(leads: ScrapedLead[]): Promise<void> {
  if (!firecrawl) {
    console.log('   Firecrawl ej konfigurerat — hoppar system-detektion')
    return
  }

  const withWebsite = leads.filter(l => l.website)
  console.log(`\n── System-detektion (${withWebsite.length} hemsidor) ──`)

  let detected = 0
  for (const lead of withWebsite) {
    try {
      const res = await (firecrawl as any).scrapeUrl(lead.website, {
        formats: ['markdown', 'html'],
        timeout: 10000,
      })

      if (res?.success) {
        // Sök i både HTML och markdown — signaturer gömmer sig ofta i HTML
        const searchText = (res.html || '') + '\n' + (res.markdown || '')
        const system = detectSystem(searchText)
        if (system) {
          lead.current_system = system
          lead.source = system === 'easoft' ? 'easoft' : lead.source
          lead.sms_text = generateSmsText(lead)
          detected++
          console.log(`   ✅ ${lead.name} → ${getSystemLabel(system)}`)
        }
      }
    } catch {
      // Timeout eller blockerad — fortsätt
    }
    await sleep(1500)
  }

  console.log(`   Detekterade system: ${detected}/${withWebsite.length}`)
}

// ── SMS-text ───────────────────────────────────────────

function generateSmsText(lead: { name: string; industry: string; source: string; current_system?: string | null }): string {
  const firstName = getFirstName(lead.name)

  if (lead.current_system === 'easoft') {
    return `Hej ${firstName}! Trött på Easoft? Handymate är ett modernare alternativ med AI som sköter hela back office automatiskt — offerter, fakturor, kundkontakt. Prova: handymate.se`
  }
  if (lead.current_system === 'bokadirekt') {
    return `Hej ${firstName}! Betalar du för Bokadirekt? Handymate har inbyggd bokning + AI som sköter offerter, fakturor och kundkontakt. Allt i ett. Prova: handymate.se`
  }
  if (lead.current_system === 'bygglet') {
    return `Hej ${firstName}! Använder du Bygglet? Handymate gör allt Bygglet gör + AI-telefonist som svarar kunder dygnet runt. Prova: handymate.se`
  }
  if (lead.current_system && lead.current_system !== 'fortnox') {
    return `Hej ${firstName}! Vi märkte att ni använder ${getSystemLabel(lead.current_system)}. Handymate ersätter det med AI som sköter allt automatiskt. Prova: handymate.se`
  }

  const branch = lead.industry.toLowerCase()
  return `Hej ${firstName}! Handymate hjälper ${branch} i Stockholm att slippa administrationen. Matte — vår AI — sköter offerter, fakturor och kundkontakt automatiskt. Prova: handymate.se`
}

// ── Google Places Text Search ──────────────────────────

async function scrapeGooglePlaces(): Promise<RawBusiness[]> {
  const results: RawBusiness[] = []

  for (const { query, industry } of SEARCH_QUERIES) {
    if (results.length >= MAX_LEADS) break
    console.log(`🔍 Google Places: "${query}"...`)

    try {
      const searchRes = await google.textSearch({
        params: {
          query,
          key: GOOGLE_KEY!,
          language: 'sv' as any,
          region: 'se',
        },
      })

      const places = searchRes.data.results || []
      console.log(`   ${places.length} resultat`)

      // Hämta detaljer för varje plats (telefon + hemsida)
      for (const place of places.slice(0, 20)) {
        if (results.length >= MAX_LEADS) break

        try {
          const detailRes = await google.placeDetails({
            params: {
              place_id: place.place_id!,
              key: GOOGLE_KEY!,
              fields: ['formatted_phone_number', 'international_phone_number', 'website', 'name', 'vicinity', 'user_ratings_total', 'types'],
              language: 'sv' as any,
            },
          })

          const d = detailRes.data.result
          if (!d) continue

          const phone = (d as any).international_phone_number || (d as any).formatted_phone_number
          results.push({
            name: d.name || place.name || 'Okänt',
            phone: phone || undefined,
            address: d.vicinity || place.formatted_address || undefined,
            website: d.website || undefined,
            reviews: d.user_ratings_total || place.user_ratings_total || undefined,
            industry,
          })
        } catch (err: any) {
          // Enstaka plats-fel — fortsätt
          if (err.response?.status === 429) {
            console.log('   Rate limit — väntar 5s...')
            await sleep(5000)
          }
        }

        await sleep(DELAY_MS)
      }
    } catch (err: any) {
      console.error(`   Fel: ${err.message}`)
    }

    await sleep(1000) // Mellan sökningar
  }

  return results
}

// ── Easoft-scraping borttagen ────────────────────────
// TODO: Lägg till Allabolag-berikning som steg 2 för att filtrera
// på faktiska anställda och identifiera vilka system företagen använder.
// Allabolag.se har företagsstorlek, omsättning och ibland systeminfo.

const MIN_REVIEWS = 10 // Minimum Google-recensioner (proxy för volym)

// ── Filter + dedup ─────────────────────────────────────

function deduplicateAndFilter(
  placesLeads: RawBusiness[]
): ScrapedLead[] {
  const seen = new Set<string>()
  const results: ScrapedLead[] = []

  function process(raw: RawBusiness) {
    const phone = normalizePhone(raw.phone || '')
    if (!phone) return
    if (seen.has(phone)) return
    // Filter: minimum recensioner
    if ((raw.reviews || 0) < MIN_REVIEWS) return
    seen.add(phone)

    const lead: ScrapedLead = {
      name: raw.name,
      phone,
      city: raw.address?.match(/Stockholm|Solna|Sundbyberg|Nacka|Huddinge|Södertälje|Bromma|Täby|Danderyd|Lidingö/i)?.[0] || 'Stockholm',
      industry: raw.industry || 'Hantverkare',
      source: 'google_maps',
      current_system: null,
      company_size: null, // TODO: berika via Allabolag
      sms_text: '',
      website: raw.website || null,
      reviews_count: raw.reviews || null,
    }
    lead.sms_text = generateSmsText(lead)
    results.push(lead)
  }

  for (const l of placesLeads) process(l)

  // Sortera: mobilnummer först, sen efter recensioner
  results.sort((a, b) => {
    const aMobile = isMobileNumber(a.phone) ? 0 : 1
    const bMobile = isMobileNumber(b.phone) ? 0 : 1
    if (aMobile !== bMobile) return aMobile - bMobile
    return (b.reviews_count || 0) - (a.reviews_count || 0)
  })

  return results.slice(0, MAX_LEADS)
}

// ── CSV ────────────────────────────────────────────────

function exportToCsv(leads: ScrapedLead[]): string {
  const date = new Date().toISOString().split('T')[0]
  const filepath = path.resolve(__dirname, 'output', `leads-${date}.csv`)

  const header = 'name,phone,city,industry,source,current_system,sms_text,website,reviews_count'
  const rows = leads.map(l =>
    [
      `"${l.name.replace(/"/g, '""')}"`,
      l.phone,
      l.city,
      l.industry,
      l.source,
      l.current_system || '',
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
    console.error('Supabase-credentials saknas')
    return
  }

  console.log(`\n📤 Importerar ${leads.length} leads till Supabase...`)
  let imported = 0, skipped = 0

  for (const lead of leads) {
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?phone=eq.${encodeURIComponent(lead.phone)}&select=lead_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    })
    const existing = await checkRes.json()
    if (existing.length > 0) { skipped++; continue }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        lead_id: `lead_out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        business_id: process.env.HANDYMATE_BUSINESS_ID || 'biz_al7pjuu5smi',
        name: lead.name, phone: lead.phone, source: 'outreach_scrape',
        status: 'new', pipeline_stage: 'new_inquiry', job_type: lead.industry,
        notes: `Source: ${lead.source}${lead.website ? ` | ${lead.website}` : ''}${lead.reviews_count ? ` | ${lead.reviews_count} recensioner` : ''}`,
      }),
    })
    if (res.ok) imported++
    else console.error(`   Fel: ${lead.name} — ${res.statusText}`)
    await sleep(200)
  }

  console.log(`✅ Importerat: ${imported}, Hoppade över: ${skipped}`)
}

// ── Main ───────────────────────────────────────────────

async function main() {
  const shouldImport = process.argv.includes('--import')

  console.log('🚀 Handymate Outreach Scraper (Google Places)')
  console.log(`   Max leads: ${MAX_LEADS} | Min recensioner: ${MIN_REVIEWS}`)
  console.log(`   Import: ${shouldImport ? 'JA' : 'NEJ'}`)
  console.log(`   Google API: ${GOOGLE_KEY ? '✅' : '❌'}`)
  console.log(`   Firecrawl: ${FIRECRAWL_KEY ? '✅ (system-detektion)' : '⏭ (hoppar system-detektion)'}`)
  console.log('')

  // Google Places
  console.log('── Google Places ────────────────')
  const placesLeads = await scrapeGooglePlaces()
  console.log(`\nTotalt från Places: ${placesLeads.length} råleads`)
  console.log(`  Med telefon: ${placesLeads.filter(l => l.phone).length}`)
  console.log(`  Med ≥${MIN_REVIEWS} recensioner: ${placesLeads.filter(l => (l.reviews || 0) >= MIN_REVIEWS).length}`)

  // Filter
  console.log('\n── Filtrering ──────────────────')
  const leads = deduplicateAndFilter(placesLeads)
  const mobileCount = leads.filter(l => isMobileNumber(l.phone)).length
  console.log(`Filtrerade leads: ${leads.length}`)
  console.log(`  Mobilnummer: ${mobileCount}`)
  console.log(`  Fasta nummer: ${leads.length - mobileCount}`)

  // System-detektion via hemsida-scraping
  await enrichWithSystemDetection(leads)

  const systemCounts: Record<string, number> = {}
  for (const l of leads) {
    const sys = l.current_system || 'okänt'
    systemCounts[sys] = (systemCounts[sys] || 0) + 1
  }

  console.log('\n── System-fördelning ────────────')
  for (const [sys, count] of Object.entries(systemCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${getSystemLabel(sys)}: ${count}`)
  }

  // CSV
  const csvPath = exportToCsv(leads)
  console.log(`\n📁 CSV: ${csvPath}`)

  // Import
  if (shouldImport) await importToSupabase(leads)

  // Preview
  const knownSystemLeads = leads.filter(l => l.current_system && l.current_system !== 'fortnox')
  if (knownSystemLeads.length > 0) {
    console.log(`\n── 🎯 Identifierade system (${knownSystemLeads.length}) ──`)
    for (const lead of knownSystemLeads) {
      const mobile = isMobileNumber(lead.phone) ? '📱' : '☎️'
      console.log(`  ${mobile} ${lead.name} [${getSystemLabel(lead.current_system)}] | ${lead.phone}`)
    }
  }

  console.log('\n── Topp 10 leads ───────────────')
  for (const lead of leads.slice(0, 10)) {
    const mobile = isMobileNumber(lead.phone) ? '📱' : '☎️'
    const sys = lead.current_system ? ` [${getSystemLabel(lead.current_system)}]` : ''
    console.log(`  ${mobile} ${lead.name}${sys} | ${lead.phone} | ${lead.industry} | ⭐${lead.reviews_count ?? '—'}`)
  }

  console.log(`\n✅ Klart! ${leads.length} leads (${mobileCount} mobil).`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
