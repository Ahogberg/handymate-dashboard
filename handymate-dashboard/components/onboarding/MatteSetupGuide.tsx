'use client'

import { Check, Sparkles } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import { pricingModelLabel } from '@/lib/onboarding/pricing-start'
import type { OnboardingFormData } from '@/app/onboarding/types-redesign'

interface Props {
  step: number
  data: OnboardingFormData
}

export const SETUP_GUIDANCE: Record<number, { eyebrow: string; title: string; body: string }> = {
  0: { eyebrow: 'Teamet samlas', title: 'Välkommen. Jag heter Matte.', body: 'Du berättar hur firman fungerar. Jag ser till att rätt specialist får rätt underlag — utan att du behöver lära dig systemet först.' },
  1: { eyebrow: 'Jag lär känna firman', title: 'Vi börjar med grunden.', body: 'Jag hjälper dig samla företagets riktiga uppgifter så resten av teamet arbetar med rätt underlag.' },
  2: { eyebrow: 'Jag ställer in arbetssättet', title: 'Hur fungerar ni i vardagen?', body: 'Priser, jobbtyper och arbetstider blir källor teamet kan använda — aldrig något vi hittar på.' },
  3: { eyebrow: 'Lisa gör sig redo', title: 'Nästa förfrågan ska inte tappas.', body: 'Telefonkopplingen blir en av företagets riktiga vägar in. Du bestämmer hur den ska användas.' },
  4: { eyebrow: 'Handymate aktiveras', title: 'Du behåller kontrollen.', body: 'Teamet kan föreslå och förbereda. Kundkontakt och ekonomiska handlingar följer era godkännanden.' },
  5: { eyebrow: 'Teamet får verklig kontext', title: 'Har ni historik tar vi med den.', body: 'Importerade kunder, affärer och fakturor kan ge ett skarpare första uppdrag. Tomt konto får inga låtsasinsikter.' },
  6: { eyebrow: 'Daniel förbereder offertstarten', title: 'Nästa offert ska inte börja från noll.', body: 'Koppla jobbtyp, arbetsartikel och upplägg. Jobbtypens uttryckliga pris går alltid före standardpriset.' },
  7: { eyebrow: 'Teamet är redo', title: 'Vad ska vi ta tag i först?', body: 'Nu kan du ge teamet ett första riktigt uppdrag eller börja med offerten du just förberett. Inget skickas utan ditt godkännande.' },
}

export function MatteSetupGuide({ step, data }: Props) {
  const message = SETUP_GUIDANCE[step]
  if (!message) return null
  const matte = getAgentById('matte')
  const configured = deriveConfiguredFacts(data)

  return (
    <aside className="matte-setup-guide" aria-label="Mattes guidning">
      <div className="matte-setup-guide__host">
        <img src={matte?.avatar} alt="" width={64} height={64} />
        <div>
          <span>{message.eyebrow}</span>
          <strong>Matte · din chefsagent</strong>
        </div>
      </div>
      <div className="matte-setup-guide__message" aria-live="polite">
        <Sparkles size={17} aria-hidden="true" />
        <div>
          <h2>{message.title}</h2>
          <p>{message.body}</p>
        </div>
      </div>
      <div className="matte-setup-guide__receipt">
        <h3>Det här är nu inställt</h3>
        {configured.length > 0 ? (
          <ul>
            {configured.slice(-5).map(fact => (
              <li key={fact}><Check size={14} aria-hidden="true" /><span>{fact}</span></li>
            ))}
          </ul>
        ) : (
          <p>Vi fyller på kvittot medan du svarar.</p>
        )}
      </div>
      <p className="matte-setup-guide__truth">Alla ändringar görs av de vanliga, verifierade onboardingstegen.</p>
    </aside>
  )
}

export function deriveConfiguredFacts(data: OnboardingFormData): string[] {
  const facts: string[] = []
  if (data.companyName) facts.push(`Företag: ${data.companyName}`)
  if (data.trade) facts.push('Huvudbransch vald')
  if ((data.specialties?.length ?? 0) > 0) facts.push(`${data.specialties!.length} specialiteter valda`)
  const pricing = pricingModelLabel(data.pricingModel)
  if (pricing) facts.push(pricing)
  if (Number(data.standardHourlyRate) > 0) facts.push(`Standardpris: ${Number(data.standardHourlyRate).toLocaleString('sv-SE')} kr/tim`)
  if (data.lisaNumber) facts.push('Telefonväg vald')
  const imported = (data.importedCustomers ?? 0) + (data.importedInvoices ?? 0)
  if (imported > 0) facts.push(`${imported} verkliga poster hämtade`)
  if ((data.quoteJobTypes?.length ?? 0) > 0) facts.push(`${data.quoteJobTypes!.length} jobbtyper förberedda`)
  if (data.firstQuoteSelection) facts.push('Första offertupplägget valt')
  return facts
}
