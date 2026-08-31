import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// FAS 1 (offert-omtaget, 2026-08-31): orkestratorn flyttade från
// app/dashboard/quotes/new/page.tsx (nu en tunn wrapper) till
// app/dashboard/quotes/_shared/QuoteBuilder.tsx. dealIdFromQuery/
// leadIdFromQuery och deal-lookupen lever OFÖRÄNDRADE där. Payload-
// byggandet (deal_id/lead_id in i POST-bodyn) flyttade separat till
// buildQuotePayload.ts — se den andra testfunktionen nedan.
const source = fs.readFileSync(
  path.resolve(__dirname, '../app/dashboard/quotes/_shared/QuoteBuilder.tsx'),
  'utf8',
)
const payloadSource = fs.readFileSync(
  path.resolve(__dirname, '../app/dashboard/quotes/_shared/buildQuotePayload.ts'),
  'utf8',
)

test('ny offert håller lead- och deal-kopplingar åtskilda', () => {
  expect(source).toContain("const dealIdFromQuery = searchParams?.get('deal_id') || null")
  expect(source).toContain("const leadIdFromQuery = searchParams?.get('lead_id') || null")
  expect(source).not.toMatch(/dealIdFromQuery\s*=.*get\('lead_id'\)/)
  // dealIdFromQuery/leadIdFromQuery flödar in i getContext() (camelCase,
  // QuoteBuilder.tsx) och sedan ut i POST-bodyn (snake_case,
  // buildQuotePayload.ts) — aldrig ihopblandade i endera ledet.
  expect(source).toMatch(/dealId:\s*dealIdFromQuery,[\s\S]*leadId:\s*leadIdFromQuery/)
  expect(payloadSource).toMatch(/deal_id:\s*input\.dealId,[\s\S]*lead_id:\s*input\.leadId/)
})

test('lead-id skickas aldrig till deal-API:t', () => {
  expect(source).toContain("const dealId = searchParams?.get('deal_id')")
  expect(source).not.toMatch(/const dealId\s*=.*get\('lead_id'\)/)
  expect(source).toContain('fetchDealAndPrefill(dealId, !!customerId)')
})

// Fas 1.6 (offert-omtaget, 2026-08-31): deal.job_type var redan hämtat och
// sparat i `quoteJobType`-state (Motor 1/efterkalkyl-insikten), och redan
// skrivet till quotes.job_type via buildQuotePayload — men aldrig skickat
// vidare till AI-generate-anropen. Dessa tester bevisar hela kedjan:
// deal → quoteJobType → AI-generate-body → quotes.job_type.
test('deal.job_type sätter quoteJobType-state vid deal-prefill', () => {
  expect(source).toContain('const [quoteJobType, setQuoteJobType] = useState<string | null>(null)')
  expect(source).toMatch(/if \(deal\.job_type\) \{\s*setInheritedJobType\(deal\.job_type\)\s*setQuoteJobType\(deal\.job_type\)/)
})

test('alla tre AI-generate-anrop skickar jobType från quoteJobType när en deal satt den', () => {
  // Tre call sites: analyzePhoto (foto), generateFromText (AI-hjälpen text),
  // buildQuickDraft (Snabbofferten) — se docblock ovanför buildQuickDraft.
  const aiGenerateCallCount = (source.match(/fetch\('\/api\/quotes\/ai-generate'/g) || []).length
  expect(aiGenerateCallCount).toBe(3)

  // analyzePhoto: jobType är en direkt nyckel i JSON.stringify-objektet.
  expect(source).toMatch(/textDescription: photoDescription \|\| undefined,\s*customerId: selectedCustomer \|\| undefined,\s*jobType: quoteJobType \|\| undefined,/)

  // generateFromText och buildQuickDraft: jobType sätts villkorligt på
  // body-objektet innan fetch — samma mönster som customerId där.
  const conditionalJobTypeAssignments = (source.match(/if \(quoteJobType\) body\.jobType = quoteJobType/g) || []).length
  expect(conditionalJobTypeAssignments).toBe(2)
})

// Epic 2-uppföljning (2026-08-31): en jobbtyp med FLERA kopplade mallar
// kräver att servern vet VILKEN mallen är — annars 409:ar den (medvetet,
// se quote-generation-context.ts). Utan templateId i anropet kunde den
// mall handleNewTemplateSelect redan applicerat i editorn ändå inte
// disambiguera AI-anropet. templateId-state finns redan (mallval +
// jobbtypsstart delar samma handleNewTemplateSelect) — den behövde bara
// trådas till samma tre anrop som jobType.
test('alla tre AI-generate-anrop skickar även templateId när en mall är applicerad', () => {
  expect(source).toMatch(/jobType: quoteJobType \|\| undefined,\s*templateId: templateId \|\| undefined,/)
  const conditionalTemplateIdAssignments = (source.match(/if \(templateId\) body\.templateId = templateId/g) || []).length
  expect(conditionalTemplateIdAssignments).toBe(2)
})

test('utan deal ELLER uttryckligt jobbtypsval gissas ingen jobbtyp vid kallstart', () => {
  // Epic 2: kallstart får nu ha ett mänskligt val eller verifierat
  // onboardingval. Antalet setState-anrop är inte längre rätt facit.
  expect(source).not.toMatch(/jobType:\s*null/)
  expect(source).toContain('useState<string | null>(null)')
  expect(source).toContain('setQuoteJobType(start.selection.jobTypeSlug)')
  expect(source).toContain('onSelectJobType={slug =>')
  expect(source).toContain('canApplyJobTypeStart(before, jobStartSnapshot.current)')
})

test('quotes.job_type skrivs från quoteJobType vid spar (buildQuotePayload)', () => {
  // Fas 2 (offert-omtaget, 2026-08-31): fältet är nu OPTIONELLT på
  // QuotePayloadContext (edit-läget sätter det aldrig — se docblocket i
  // buildQuotePayload.ts) — samma typ, `string | null`, bara `?` tillagt.
  expect(payloadSource).toContain('quoteJobType?: string | null')
  expect(payloadSource).toContain('job_type: input.quoteJobType')
})
