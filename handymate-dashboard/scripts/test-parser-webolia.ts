/**
 * test-parser-webolia.ts (engångs-skript, 2026-05-28).
 *
 * Kör befintliga gmail-lead-detection-parsern mot Andreas Webolia-
 * exempel-mail för att verifiera om Haiku hanterar:
 *   - Flera telefonnummer (hänvisning vs kund) → ska ta KUNDENS
 *   - Brus från Carinas hänvisningstext → ska ignoreras
 *   - Källa i fritext ("Förfrågan via X") → ska extrahera
 *
 * Säkerhetsprincip: tvetydigt nummer → tomt. Aldrig gissa.
 *
 * Körning: npx tsx scripts/test-parser-webolia.ts
 *
 * Kräver: ANTHROPIC_API_KEY i .env.local
 */

// Manuell .env.local-läsning (slipper extra dependency).
// Prova både inner och outer .env.local (Andreas har nästlad repo-struktur).
import { readFileSync } from 'fs'
import { resolve } from 'path'
for (const envPath of [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '..', '.env.local')]) {
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      // Hoppa över platshållar-värden, men låt riktiga värden vinna
      if (value === 'PASTE_KEY_HERE') continue
      if (!process.env[key] || process.env[key] === 'PASTE_KEY_HERE') process.env[key] = value
    }
  } catch {
    // ignorera om filen inte finns
  }
}

import type { EmailInput } from '../lib/gmail-lead-detection'

const exempelMail: EmailInput = {
  subject: 'Vidarebefordrat: Förfrågan via sodermalmsbyggentreprenader.se',
  from: 'Carina <carina@sodermalmsbyggentreprenader.se>',
  date: '2026-03-10T14:55:00Z',
  body: `Hej! Vi ber om ursäkt, men på grund av hög arbetsbelastning kan vi tyvärr inte ta på oss fler uppdrag just nu. Ett bra alternativ för dig är att vända dig till Christoffer Thanger på www.beeservice.se
Christoffer Thanger är med i denna konversation och du kan även nå dem direkt på 0700-45 63 57.
Önskar dig stort lycka till med projektet! mvh Carina

On 2026-03-10 14:51:45, Erik Svensson wrote:
Namn: Erik Svensson
Telefon: 0706372365
Email: ersv@outlook.com
Adress: Timmermansgatan 43, Stockholm
Meddelande: Hej Jag företräder en brf på Söder/Mariatorget som då och då är i behov av hjälp med byggprojekt, för närvarande gäller det igensättning av en dörröppning (brandklassad/EI60). Jag är intresserad av ett mer långsiktigt samarbete där vi enkelt kan kontakta en entreprenör för typ avrop mot budget. Ser fram mot er återkoppling! Mvh Erik
Förfrågan via sodermalmsbyggentreprenader.se`,
}

const FÖRVÄNTAT = {
  name: 'Erik Svensson',
  phone: '0706372365',
  email: 'ersv@outlook.com',
  address: 'Timmermansgatan 43, Stockholm',
  job_type_keywords: ['igensättning', 'dörröppning', 'brandklass', 'EI60', 'BRF'],
  // Källa ska extraheras strukturerat (inte bara hamna i description).
  // I detta mail: "Förfrågan via sodermalmsbyggentreprenader.se"
  source_keywords: ['sodermalmsbyggentreprenader', 'sodermalmsbygg'],
}

function check(label: string, actual: any, expected: string | null, contains?: string[]) {
  if (expected === null) {
    console.log(`  ${label}: ${JSON.stringify(actual)}`)
    return
  }
  const actualStr = String(actual || '').toLowerCase()
  const expectedStr = expected.toLowerCase()
  let pass = false
  if (contains) {
    pass = contains.some(k => actualStr.includes(k.toLowerCase()))
  } else {
    pass = actualStr === expectedStr || actualStr.includes(expectedStr)
  }
  const symbol = pass ? '✅' : '❌'
  console.log(`  ${symbol} ${label}: ${JSON.stringify(actual)}`)
  if (!pass) console.log(`     FÖRVÄNTAT: ${expected}${contains ? ` (eller innehåller: ${contains.join(', ')})` : ''}`)
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'PASTE_KEY_HERE') {
    console.error('FEL: ANTHROPIC_API_KEY saknas i .env.local')
    process.exit(1)
  }

  // Dynamic import EFTER env-laddning — annars instansieras Anthropic() utan key
  const { isLikelyLead, parseLeadFromEmail } = await import('../lib/gmail-lead-detection')

  console.log('=== STAGE 1: isLikelyLead ===')
  const likely = await isLikelyLead(exempelMail, [], [])
  console.log(`  Resultat: ${likely ? 'YES' : 'NO'}`)
  if (!likely) {
    console.log('  ⚠️ Mailet klassades som icke-lead → Stage 2 körs inte i produktion')
  }

  console.log('\n=== STAGE 2: parseLeadFromEmail ===')
  const parsed = await parseLeadFromEmail(exempelMail)

  console.log('\nKritiska fält (mot förväntat):')
  check('name    ', parsed.name, FÖRVÄNTAT.name)
  check('phone   ', parsed.phone, FÖRVÄNTAT.phone)
  check('email   ', parsed.email, FÖRVÄNTAT.email)
  check('address ', parsed.address, FÖRVÄNTAT.address)
  check('job_type', parsed.job_type, null, FÖRVÄNTAT.job_type_keywords)
  check('description', parsed.description, null, FÖRVÄNTAT.job_type_keywords)
  check('source  ', parsed.source, null, FÖRVÄNTAT.source_keywords)

  console.log('\nÖvriga fält:')
  console.log(`  urgency: ${parsed.urgency}`)
  console.log(`  estimated_value: ${parsed.estimated_value}`)

  console.log('\n=== FÄLLOR-CHECK ===')
  const numCarina = '0700-45 63 57'
  const numErik = '0706372365'
  const phoneStr = String(parsed.phone || '').replace(/[\s-]/g, '')

  if (phoneStr === '') {
    console.log(`  ⚠️  Phone tomt — säker default (manuell granskning). OK om parsern var osäker.`)
  } else if (phoneStr.includes('0700456357') || phoneStr.includes('070045 6357')) {
    console.log(`  ❌ KRITISK: parsern tog HÄNVISNINGS-numret (0700-45 63 57), inte kundens!`)
  } else if (phoneStr === numErik) {
    console.log(`  ✅ Phone: tog Eriks (kundens) nummer, inte hänvisningens`)
  } else {
    console.log(`  ❓ Oklar phone-extraktion: ${parsed.phone}`)
  }

  const nameStr = String(parsed.name || '').toLowerCase()
  if (nameStr.includes('carina') || nameStr.includes('christoffer')) {
    console.log(`  ❌ KRITISK: parsern tog avsändarens/hänvisningens namn, inte Eriks!`)
  } else if (nameStr.includes('erik')) {
    console.log(`  ✅ Name: tog Eriks namn (kunden)`)
  } else {
    console.log(`  ❓ Oklar name: ${parsed.name}`)
  }

  const sourceStr = String(parsed.source || '').toLowerCase()
  if (sourceStr === '') {
    console.log(`  ❌ Source TOMT — manuell granskning krävs för attribution.`)
  } else if (sourceStr.includes('beeservice') || sourceStr.includes('christoffer')) {
    console.log(`  ❌ KRITISK: parsern tog Bee Service som källa — det är förmedlaren, inte ursprunget!`)
  } else if (sourceStr.includes('sodermalmsbygg')) {
    console.log(`  ✅ Source: tog ursprungs-domänen (sodermalmsbyggentreprenader.se)`)
  } else if (sourceStr.includes('webolia')) {
    console.log(`  ✅ Source: identifierade Webolia-mönster`)
  } else {
    console.log(`  ❓ Oklar source: ${parsed.source}`)
  }

  console.log('\n=== HEL JSON ===')
  console.log(JSON.stringify(parsed, null, 2))
}

main().catch(err => {
  console.error('FEL:', err)
  process.exit(1)
})
