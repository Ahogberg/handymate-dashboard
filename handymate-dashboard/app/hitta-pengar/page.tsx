import type { Metadata } from 'next'
import { OutcomeLandingPage, type OutcomeLandingContent } from '@/components/marketing/OutcomeLandingPage'

export const metadata: Metadata = {
  title: 'Hitta pengar som redan finns i firman | Handymate',
  description: 'Handymates AI-team hittar faktureringsklart arbete, förfallna fakturor, gamla kunder och offerter som behöver nästa steg.',
}

const content: OutcomeLandingContent = {
  eyebrow: 'Pengar på bordet',
  title: 'Pengarna finns ofta redan i firman.',
  lead: 'I arbeten som är klara men inte fakturerade. I offerter som aldrig följdes upp. I kunder som gärna hade anlitat dig igen — om någon bara hörde av sig.',
  primaryCta: 'Ge teamet sitt första Uppdrag',
  proofTitle: 'Inte ännu en rapport. Ett team som hjälper dig agera.',
  proofBody: 'Karin ser vad som går att fakturera. Daniel ser offerter, ÄTA och kunder som behöver nästa steg. Lars ser om projektet faktiskt är redo. Matte håller ihop arbetet och visar bara belopp som kan härledas till verkliga poster.',
  quote: 'Hur hittar vi mer pengar före månadsskiftet?',
  benefits: [
    { title: 'Hitta möjligheten', body: 'Teamet letar i riktiga fakturor, offerter, projekt och kundrelationer — aldrig i ett påhittat demoresultat.' },
    { title: 'Granska nästa steg', body: 'Du ser vem som föreslår vad och godkänner externa eller ekonomiska åtgärder innan de utförs.' },
    { title: 'Räkna först när det kan bevisas', body: 'Identifierad potential och bekräftat värde hålls isär. En möjlighet får aldrig klä ut sig till intäkt.' },
  ],
  steps: ['Du beskriver målet.', 'Matte samlar riktiga signaler.', 'Specialisterna bygger planen.', 'Du fattar nödvändiga beslut.', 'Utfallet redovisas med bevis.'],
  closingTitle: 'Låt inte redan intjänade pengar fastna i administrationen.',
  closingBody: 'Handymate hjälper firman gå från signal till nästa säkra handling — utan att du behöver leta i ännu en meny.',
}

export default function Page() { return <OutcomeLandingPage content={content} /> }
