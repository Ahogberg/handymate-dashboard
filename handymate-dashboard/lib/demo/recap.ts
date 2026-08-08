import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'
import type { WeeklyValue } from '@/lib/weekly-value'

export interface DemoRecap {
  identifiedPotential: {
    totalKr: number
    categories: PengarSummary['kategorier']
  }
  confirmedValue: {
    totalKr: number
    items: WeeklyValue['confirmed_items']
  }
  capturedPotential: {
    totalKr: number
    count: number
  }
  estimatedTimeHours: number
}

/**
 * Håller de tre kunskapsnivåerna separata. Funktionen har medvetet ingen
 * totalsumma: identifierad potential, fångad leadpotential och verifierat
 * utfall kan överlappa och får därför aldrig adderas till ett säljtal.
 */
export function buildDemoRecap(pengar: PengarSummary, weekly: WeeklyValue): DemoRecap {
  return {
    identifiedPotential: {
      totalKr: pengar.totalKr,
      categories: pengar.kategorier.map(category => ({ ...category })),
    },
    confirmedValue: {
      totalKr: weekly.confirmed_kr,
      items: weekly.confirmed_items.map(item => ({ ...item })),
    },
    capturedPotential: {
      totalKr: weekly.captured_kr,
      count: weekly.captured_count,
    },
    estimatedTimeHours: weekly.time_hours,
  }
}
