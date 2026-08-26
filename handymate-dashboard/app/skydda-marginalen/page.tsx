import type { Metadata } from 'next'
import { OutcomeLandingPage, type OutcomeLandingContent } from '@/components/marketing/OutcomeLandingPage'

export const metadata: Metadata = {
  title: 'Skydda marginalen innan projektet är över | Handymate',
  description: 'Handymates AI-team följer tid, material, ÄTA och projektbevis så att avvikelser syns innan pengarna är borta.',
}

const content: OutcomeLandingContent = {
  eyebrow: 'Projektintelligens',
  title: 'Det dyraste projektfelet syns ofta för sent.',
  lead: 'Några extra timmar loggades aldrig. Materialet drog iväg. Kunden bad om merarbete men ÄTA:n blev kvar i huvudet. När fakturan ska skapas är marginalen redan borta.',
  primaryCta: 'Låt teamet bevaka nästa projekt',
  proofTitle: 'Projektets verklighet — innan avslutet.',
  proofBody: 'Lars följer projektets underlag och visar en namngiven blockerare när något kräver ditt omdöme. Daniel hjälper till med ÄTA. Karin tar vid först när fakturaunderlaget håller.',
  quote: 'Vad saknas innan vi kan fakturera projektet korrekt?',
  benefits: [
    { title: 'Se avvikelsen', body: 'Tid, material, ändringar och projektbevis bedöms från verkliga poster — inte modellens magkänsla.' },
    { title: 'Frågan hör hemma i projektet', body: 'Agentens fråga visas där arbetet finns, med underlaget nära till hands.' },
    { title: 'Lär med kontroll', body: 'Bekräftade arbetssätt kan föreslås i liknande projekt, testas och först därefter bli företagets standard.' },
  ],
  steps: ['Projektdata samlas.', 'Lars bedömer bevisläget.', 'Rätt specialist kopplas in.', 'Du granskar förändringen.', 'Resultatet följs till fakturaunderlag.'],
  closingTitle: 'Skydda marginalen medan den fortfarande går att påverka.',
  closingBody: 'Handymate påstår aldrig att projektet är redo när bevis saknas. Du får blockeraren, ägaren och nästa steg.',
}

export default function Page() { return <OutcomeLandingPage content={content} /> }
