import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Facit för demoseedarens täckning (2026-09-10, Andreas: "allt som finns
// byggt behöver finnas där med demodatan").
//
// Mätt mot produktionsdatan på demokontot biz_0lovw5vcwzqn före passet:
//
//   v3_automation_rules   0   ← inga agentautomationer ALLS
//   leads                 0   ← men 11 affärer
//   quote_templates       0
//   checklist_template    0
//   lead_scoring_rules    0
//   quote_standard_texts  0
//   reservation_texts     0
//   reservation_triggers  0
//   products             86   (fanns)
//   service_agreement_type 4  (fanns)
//
// Två luckor, med olika karakär:
//
//   1. Grundinställningarna som en RIKTIG kund får vid finalize seedades
//      aldrig på demot. Följden var att Lisa, Daniel och Karin inte hade
//      någonting att köra — på det konto som ska visa att de gör saker.
//   2. leads fanns inte. Golden Path skapar lead → affär, så en riktig
//      webbförfrågan bär alltid ett lead_id på sin affär. Demon hade bara
//      affärer, och hela vägen in var osynlig.
//
// Provet vaktar båda, plus den invariant som gör dem säkra att köra om:
// allt som seedas måste antingen raderas av RPC:n eller vara idempotent.
// Annars ackumulerar demot dubbletter för varje reset.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const SEEDARE = 'lib/demo/seed-demo-account.ts'
const RPC = 'sql/v158_demo_reset_v3.sql'

test('demot får samma grundinställningar som ett riktigt konto vid finalize', () => {
  const src = read(SEEDARE)
  // Poängen är att INTE hitta på demospecifika regler: då kan demon glida
  // isär från produkten. Samma funktion som POST /api/onboarding kör.
  expect(src, 'seedaren kör inte seedAllDefaults').toContain('seedAllDefaults(')
  const onboarding = read('app/api/onboarding/route.ts')
  expect(onboarding, 'onboardingen kör inte seedAllDefaults — jämförelsen är meningslös')
    .toContain('seedAllDefaults(')
})

test('ett halvt seedat demokonto räknas som misslyckat', () => {
  // seedAllDefaults returnerar { total, succeeded, failed } och sväljer sina
  // egna fel i Promise.allSettled. Läses inte failed blir en halv seedning
  // tyst — presentatören ser en yta som saknar hälften av det den lovar,
  // utan att veta vilken hälft.
  const src = read(SEEDARE)
  const anrop = src.indexOf('seedAllDefaults(')
  expect(anrop).toBeGreaterThan(-1)
  const efter = src.slice(anrop, anrop + 600)
  expect(efter, 'utfallet från seedAllDefaults kontrolleras inte').toMatch(/\.failed\s*>\s*0/)
  expect(efter, 'ett misslyckande avbryter inte resetten').toContain('failReset')
})

test('leads seedas, och de webbkällade affärerna bär lead_id', () => {
  const src = read(SEEDARE)
  expect(src, 'inga leads seedas').toContain("from('leads')")
  // Formen måste vara Golden Paths, annars demoar vi något annat än produkten.
  for (const falt of ['pipeline_stage_key', 'lead_number', 'score']) {
    expect(src, `lead-inserten saknar ${falt}`).toContain(falt)
  }
  // Och kopplingen: en affär som kom från en förfrågan bär lead_id.
  expect(src, 'affärerna länkas inte till sina leads').toMatch(/lead_id: leads\[d\.leadKey\]\.lead_id/)
  expect(src, 'ingen affär är märkt som webbkällad med en lead').toMatch(/leadKey: '(mikael|anna)'/)
})

test('minst en lead står kvar obesvarad i första steget', () => {
  // Det tillståndet är det demon behöver mest: en färsk förfrågan som väntar
  // på hantverkaren. Bara konverterade leads visar inte vägen in.
  const src = read(SEEDARE)
  const block = src.slice(src.indexOf('const leadSeeds'), src.indexOf('const leads: Record'))
  expect(block, 'hittade inte leadSeeds-blocket').toBeTruthy()
  expect(block, 'ingen lead har status new — då syns bara redan vunna förfrågningar')
    .toMatch(/status: 'new'/)
})

test('allt som seedas raderas av RPC:n ELLER är bevisat idempotent', () => {
  // Invarianten som gör en reset körbar om och om igen. Bryts den ackumulerar
  // demot dubbletter varje varv, och "Återställ demon" blir opålitlig.
  const rpc = read(RPC)
  const defaults = read('lib/seed-defaults.ts')

  // leads: raderas av RPC:n (med FK-ordningen kommenterad där).
  expect(rpc, 'RPC:n raderar inte leads — de ackumuleras vid varje reset')
    .toContain('DELETE FROM public.leads')

  // v3_automation_rules och products raderas MEDVETET inte: en demoreset ska
  // inte radera regler ett riktigt konto också hade haft. Därför måste de i
  // stället vara idempotenta, och det ska bevisas här, inte antas.
  expect(rpc, 'v3_automation_rules raderas nu av RPC:n — då är resonemanget nedan fel')
    .not.toContain('DELETE FROM public.v3_automation_rules')
  for (const fn of ['seedV3AutomationRules', 'seedProducts']) {
    const i = defaults.indexOf(`function ${fn}`)
    expect(i, `hittade inte ${fn}`).toBeGreaterThan(-1)
    const kropp = defaults.slice(i, i + 700)
    expect(kropp, `${fn} läser inte efter befintliga rader`).toMatch(/select\(/)
    expect(kropp, `${fn} returnerar inte tidigt när rader redan finns — dubbletter vid varje reset`)
      .toMatch(/if \(existing && existing\.length > 0\) return/)
  }
})

test('seedaren läser business_config men skriver aldrig till den', () => {
  // Filhuvudets kontrakt. branch lades till 2026-09-10 för seedAllDefaults;
  // en skrivning här kunde radera den inloggade presentatörens egen koppling.
  const src = read(SEEDARE)
  // Tillåt kommentarsrader mellan .from och .select — det finns en där, och
  // ett prov som spricker på en kommentar vaktar formatering, inte innehåll.
  const laser = src.match(/\.from\('business_config'\)[\s\S]{0,400}?\.select\(([^)]*)\)/)
  expect(laser, 'hittade inte läsningen av business_config').toBeTruthy()
  expect(laser![1], 'branch läses inte — seedAllDefaults får ingen bransch').toContain('branch')

  // Ingen update/insert/upsert mot business_config någonstans i seedaren.
  const skrivningsRegex = /\.from\('business_config'\)[\s\S]{0,200}?\.(update|insert|upsert)\(/g
  const skrivningar: string[] = []
  let träff: RegExpExecArray | null
  while ((träff = skrivningsRegex.exec(src)) !== null) skrivningar.push(träff[1])
  expect(skrivningar.join(','), 'seedaren skriver till business_config').toEqual('')
})

test('summeringen redovisar leads — annars går seedningen inte att kontrollera', () => {
  const src = read(SEEDARE)
  expect(src).toMatch(/leads: number/)
  expect(src).toMatch(/leads: leadSeeds\.length/)
})
