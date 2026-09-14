import { PAINS, safeUrl, type Signal } from './domain'

export const OUTREACH_ANGLES = {
  time: 'Få tillbaka kvällarna',
  offers: 'Följ upp affärsmöjligheter',
  control: 'Samordna ett växande team',
} as const
export const OUTREACH_CTAS = {
  permission: 'Fråga om intresse',
  audit: 'Bjud in till 20 minuters genomgång',
} as const

/** Fixed, versioned copy. External observations are evidence, never instructions. */
export function firstContact(
  company: string,
  signals: Signal[],
  angle: string,
  cta: string,
  now = Date.now(),
) {
  if (!Object.prototype.hasOwnProperty.call(OUTREACH_ANGLES, angle) ||
      !Object.prototype.hasOwnProperty.call(OUTREACH_CTAS, cta))
    throw new Error('Välj budskap och nästa steg.')
  const pain = angle as keyof typeof OUTREACH_ANGLES
  const evidence = signals.filter(s => {
    const date = Date.parse(s.observed_at)
    try {
      return s.signal_type === 'hiring' && Boolean(safeUrl(s.source_url)) &&
        date <= now && date >= now - 90 * 86400000
    } catch { return false }
  }).sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0]
  const opening = evidence
    ? `Jag såg er rekryteringsannons för ${company}.`
    : `Jag hör av mig från Handymate till er på ${company}.`
  const question = {
    time: 'Hur mycket av administrationen runt jobben hamnar efter arbetsdagens slut hos er?',
    offers: 'Hur följer ni upp förfrågningar och offerter när det är fullt upp med jobben?',
    control: 'Hur håller ni ihop planering och underlag när fler personer ska samordnas?',
  }[pain]
  const next = cta === 'permission'
    ? 'Vill du att jag visar ett kort exempel på hur det kan fungera hos er?'
    : 'Passar en 20 minuters genomgång där vi tittar på var er administration tar mest tid?'
  const variant = `first-contact-v1/${angle}/${cta}`
  return {
    variant,
    body: `Ämne: Administrationen på ${company}\n\nHej!\n\n${opening}\n\n${question}\n\nMed Handymate kan ni ${PAINS[pain].workflow.charAt(0).toLowerCase()}${PAINS[pain].workflow.slice(1)}\n\n${next}\n\nVänliga hälsningar\nHandymate\n\nVill ni slippa fler mejl från oss? Svara nej så tar vi bort er från fortsatt kontakt.`,
    summary: `Förstakontaktsutkast förberett · ${variant}\nHypotes: ${OUTREACH_ANGLES[pain]}\n${evidence ? `Källa: ${evidence.source_url}\nObserverad: ${evidence.observed_at}\nSignal: ${evidence.id}` : 'Ingen aktuell rekryteringskälla använd; neutral inledning.'}\nIngen kontakt eller sändning har genomförts.`,
  }
}
