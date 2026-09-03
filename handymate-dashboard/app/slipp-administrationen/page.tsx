import type { Metadata } from 'next'
import { OutcomeLandingPage, type OutcomeLandingContent } from '@/components/marketing/OutcomeLandingPage'

export const metadata: Metadata = {
  title: 'Slipp hålla ihop hela firman själv | Handymate',
  description: 'Ett sammanhängande system för kundkontakt, offerter, projekt och fakturering — med ett AI-team koordinerat av chefsagenten Matte.',
}

const content: OutcomeLandingContent = {
  eyebrow: 'Välkommen till framtiden',
  title: 'Du startade inte företag för att administrera ett system från 2006.',
  lead: 'Ändå börjar dagen med samma jakt: Vem väntar på svar? Vad ska faktureras? Vilken offert behöver följas upp? Vad lovade vi kunden?',
  primaryCta: 'Hälsa på ditt nya team',
  proofTitle: 'En ingång. Ett helt specialistteam.',
  proofBody: 'Säg till chefsagenten Matte vad du vill uppnå. Han samlar Lisa, Daniel, Lars, Karin eller andra relevanta specialister, visar planen och håller ihop vad som hände.',
  quote: 'Fyll nästa veckas luckor utan att vi tappar kontrollen.',
  benefits: [
    { title: 'Lisa fångar nästa kund', body: 'När telefonkanalen är aktiverad och verifierad kan missade samtal följas upp via SMS och gå vidare som kundinflöde med rätt kontroll.' },
    { title: 'Specialisterna arbetar i samma verklighet', body: 'Kundkontakt, offert, projekt och fakturering delar sammanhang — inte fem separata AI-chattar.' },
    { title: 'Matte håller ihop arbetet', body: 'Du behöver inte veta vilken agent eller meny som äger frågan. Beskriv utfallet du vill nå.' },
  ],
  steps: ['Du säger vad du vill uppnå.', 'Matte förstår mål och sammanhang.', 'Rätt specialister arbetar i följd.', 'Beslut stannar hos rätt person.', 'Matte redovisar resultat och nästa steg.'],
  closingTitle: 'Gamla system ger dig fler menyer. Handymate ger dig ett team.',
  closingBody: 'Kliv in i 2026 med ett arbetssätt som börjar i målet — och behåller människan vid varje viktig gräns.',
}

export default function Page() { return <OutcomeLandingPage content={content} /> }
