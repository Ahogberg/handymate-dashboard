import { firstFocusOption } from './first-focus'

export type FirstAssignmentId = 'first_quote' | 'portfolio_plan' | 'customer_inflow'

export interface FirstAssignmentOption {
  id: FirstAssignmentId
  title: string
  description: string
  agentIds: Array<'matte' | 'daniel' | 'lisa' | 'karin' | 'lars' | 'hanna'>
  prompt?: string
}

export interface FirstAssignmentSnapshot {
  hasFirstQuoteSetup: boolean
  firstFocus?: unknown
  unpaidCount: number
  openDealsCount: number
  importedCustomers: number
}

/**
 * Ett nytt konto får aldrig ett låtsasuppdrag ur en portfölj som inte finns.
 * Offert och kundinflöde kan startas från ägarens deklarerade underlag;
 * portföljplanen kräver minst en verklig faktura-/affärssignal.
 */
export function deriveFirstAssignmentOptions(snapshot: FirstAssignmentSnapshot): FirstAssignmentOption[] {
  const options: FirstAssignmentOption[] = []
  const hasPortfolioSignal = snapshot.unpaidCount > 0 || snapshot.openDealsCount > 0
  const focus = firstFocusOption(snapshot.firstFocus)

  if (snapshot.hasFirstQuoteSetup) {
    options.push({
      id: 'first_quote',
      title: 'Få ut min första offert',
      description: 'Daniel använder jobbtypen, dina artiklar och dina priser. Du granskar innan något skickas.',
      agentIds: ['matte', 'daniel'],
    })
  }

  if (hasPortfolioSignal) {
    options.push({
      id: 'portfolio_plan',
      title: focus?.label ?? 'Hitta viktigaste nästa steg',
      description: 'Matte går igenom dina verkliga affärssignaler och låter teamet föreslå en plan.',
      agentIds: focus?.leadAgent === 'karin'
        ? ['matte', 'karin']
        : focus?.leadAgent === 'lars'
          ? ['matte', 'lars']
          : ['matte', 'hanna'],
      prompt: focus
        ? `${focus.promptLine} Gå igenom det som faktiskt finns i företaget och föreslå en plan utan att gissa.`
        : 'Gå igenom det som faktiskt finns i företaget och föreslå viktigaste nästa steg utan att gissa.',
    })
  }

  // Utan portföljsignal är nästa riktiga händelse en ärligare start än en
  // fabricerad penga-/marginalplan. En importerad kundlista kan senare ge
  // reaktivering, men räcker inte ensam som bevis för ett portföljproblem.
  if (!hasPortfolioSignal || focus?.id === 'fler_jobb') {
    options.push({
      id: 'customer_inflow',
      title: snapshot.importedCustomers > 0 ? 'Få rull på kundstocken' : 'Fånga nästa kundförfrågan',
      description: snapshot.importedCustomers > 0
        ? 'Hanna och Lisa hjälper dig välja en verklig kundväg och följa upp med ditt godkännande.'
        : 'Lisa hjälper dig verifiera telefon, e-post eller webb så nästa riktiga förfrågan inte tappas.',
      agentIds: ['matte', 'lisa', 'hanna'],
      prompt: snapshot.importedCustomers > 0
        ? 'Hjälp mig hitta en säker första väg att få rull på min befintliga kundstock. Använd bara verkliga kunder och be om godkännande före utskick.'
        : 'Hjälp mig verifiera minst en riktig kanal för kundförfrågningar och förklara vad som saknas. Skapa inga låtsasleads.',
    })
  }

  return options.slice(0, 2)
}
