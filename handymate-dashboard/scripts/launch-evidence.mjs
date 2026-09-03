#!/usr/bin/env node
/**
 * Skapar en bevisprotokollfil för en lanseringskörning.
 *
 * Codex definierade formatet i docs/launch/LAUNCH_TEST_SUITE.md §3. Det som
 * saknades var något som SKAPAR filen — ett protokoll som skrivs för hand
 * riskerar fel SHA, och en release-SHA som inte stämmer gör hela beviset
 * värdelöst.
 *
 * Stationerna läses ur testsviten (rubrikerna ### N.N) i stället för att
 * dupliceras här. Ändrar Codex sviten följer protokollet med automatiskt —
 * två listor som kan glida isär är en list för mycket.
 *
 *   npm run evidence:new
 *   npm run evidence:new -- --miljo=preview
 *
 * Vägrar skriva över en befintlig fil: ett bevisprotokoll får aldrig tyst
 * ersättas av en ny körning.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(process.argv[1], '..', '..')
const SVIT = path.join(ROOT, 'docs', 'launch', 'LAUNCH_TEST_SUITE.md')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'launch', 'evidence')

const arg = (namn, fallback) => {
  const t = process.argv.find(a => a.startsWith(`--${namn}=`))
  return t ? t.split('=').slice(1).join('=') : fallback
}

function git(kommando, fallback = 'okänd') {
  try {
    return execSync(kommando, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return fallback
  }
}

/** Datum och tid i Europe/Stockholm — protokollet är svenskt, inte UTC. */
function stockholm(date = new Date()) {
  const d = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
  return d.replace(' ', ' kl. ')
}

function datumdel(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(date)
}

/** Stationerna ur testsviten: varje "### N.N Rubrik" blir en protokollrad. */
function lasStationer() {
  if (!fs.existsSync(SVIT)) {
    console.error(`Hittar inte testsviten: ${SVIT}`)
    process.exit(1)
  }
  const rader = fs.readFileSync(SVIT, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const stationer = []
  let avsnitt = ''
  for (const rad of rader) {
    const h2 = rad.match(/^## (\d+)\.\s+(.*)$/)
    if (h2) avsnitt = `${h2[1]}. ${h2[2]}`
    const h3 = rad.match(/^### (\d+\.\d+)\s+(.*)$/)
    if (h3) stationer.push({ nummer: h3[1], rubrik: h3[2], avsnitt })
  }
  return stationer
}

function protokollBlock(station) {
  return `### ${station.nummer} ${station.rubrik}

\`\`\`text
Station: ${station.nummer} ${station.rubrik}
Release-SHA:
Miljö:
Körd datum/tid (Europe/Stockholm):
Ansvarig:
Testföretag/business_id:
Handling:
Förväntat utfall:
Observerat utfall:
Databas-/leverantörsbevis:
Skärmbild eller skärminspelning:
Status: EJ KÖRD
Avvikelse och ägare:
Omtestad datum/tid:
\`\`\`
`
}

function main() {
  const miljo = arg('miljo', 'prod')
  const sha = git('git rev-parse HEAD')
  const kortSha = sha === 'okänd' ? 'okand' : sha.slice(0, 8)
  const tagg = git(`git describe --tags --exact-match ${sha}`, '')
  const datum = datumdel()

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const fil = path.join(EVIDENCE_DIR, `${datum}-${kortSha}.md`)

  if (fs.existsSync(fil)) {
    console.error(`Filen finns redan: ${path.relative(ROOT, fil)}`)
    console.error('Ett bevisprotokoll skrivs aldrig över. Radera den medvetet, eller lås en ny SHA.')
    process.exit(1)
  }

  const stationer = lasStationer()

  // SHA-låsningen: ett protokoll mot en obunden main är värdelöst, eftersom
  // main hinner röra sig medan proven körs. Varna högt, blockera inte —
  // ibland är en snabb sondering mot main precis vad man vill.
  const taggRad = tagg
    ? `**Release-tagg:** \`${tagg}\``
    : `> ⚠️ **Ingen tagg pekar på den här committen.** Proven bör köras mot en låst\n> release-tagg, inte mot \`main\` — main rör sig medan protokollet fylls i.\n> \`git tag -a release-prov-${datum} -m "Lanseringsprov ${datum}" && git push origin release-prov-${datum}\``

  const innehall = `# Bevisprotokoll — lanseringsprov ${datum}

**Release-SHA:** \`${sha}\`
${taggRad}
**Miljö:** ${miljo}
**Skapad:** ${stockholm()}
**Testsvit:** \`docs/launch/LAUNCH_TEST_SUITE.md\`

## Så här fylls protokollet i

- \`BLOCKERAD\` räknas **aldrig** som \`PASS\`.
- Den som kör en station bokför inte sitt eget PASS — utfallet verifieras mot
  kod, databas och leverantörsloggar av den som äger beviskedjan.
- Ett \`FAIL\` som rättas kräver ny SHA och omkörning av de stationer som
  beslutats i förväg — bestäm vilka innan provet startar, annars blir
  slutfasen oändlig.

## Förkrav

Kör \`GET /api/admin/launch-preflight\` som admin och klistra in utfallet här
**innan** första stationen körs. Sonden gör läsande kontroller mot 46elks,
Stripe, Anthropic, Resend, Google, Fortnox, databasen och lagringshinkarna.

\`\`\`text
(klistra in svaret från /api/admin/launch-preflight)
\`\`\`

Blockerade stationer enligt sonden får inte påbörjas — de bokförs som
\`BLOCKERAD\` med sondens orsak direkt.

---

## Stationer (${stationer.length} st, ur testsviten)

${stationer.map(protokollBlock).join('\n')}
---

## Sammanställning

| | Antal |
|---|---|
| PASS | |
| FAIL | |
| BLOCKERAD | |
| EJ KÖRD | ${stationer.length} |

**P0 (omedelbart NO-GO):**

**P1 (måste lösas före lansering):**

**P2 (kan dokumenteras efter lansering):**

## Slutligt GO/NO-GO

**Beslut:**
**Fattat av:**
**Datum/tid:**
**Motivering:**
`

  fs.writeFileSync(fil, innehall, 'utf8')
  console.log(`Protokoll skapat: ${path.relative(ROOT, fil)}`)
  console.log(`  Release-SHA: ${sha}`)
  console.log(`  Tagg:        ${tagg || '(ingen — se varningen i filen)'}`)
  console.log(`  Miljö:       ${miljo}`)
  console.log(`  Stationer:   ${stationer.length}`)
  console.log('')
  console.log('Nästa steg: kör GET /api/admin/launch-preflight och klistra in utfallet överst.')
}

main()
