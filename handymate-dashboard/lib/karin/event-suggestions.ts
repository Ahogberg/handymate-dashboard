/**
 * Smarta kontextuella förslag i "Lägg till"-modalen (2026-08-19).
 *
 * ═══ VAD DET HÄR ÄR — OCH VAD DET INTE ÄR ═══
 *
 * En handplockad, KURERAD lista med sådant hantverkare typiskt behöver
 * lägga in själva: semesterplanering, försäkringsgenomgång, fordons-
 * besiktning och liknande. Listan utökas FÖR HAND när fler mönster
 * identifieras — den genereras aldrig, och ingen modell är inblandad.
 *
 * "En felaktig deadline är värre än ingen" (app/dashboard/karin/page.tsx)
 * gäller här också: ett förslag är ett tryckt UTKAST som förifyller
 * formuläret — titel, datum, anteckning — som ägaren själv justerar och
 * sparar. Det läggs ALDRIG till av sig självt, och datumen är medvetet
 * ungefärliga (sista dagen i en rimlig månad), aldrig framställda som
 * exakta eller myndighetsbestämda.
 *
 * ═══ TRE FILTER, I ORDNING ═══
 *
 * 1. Månadsfönster — semesterplanering hör hemma i mars–maj, inte oktober.
 * 2. Kontextvillkor — lönerevision kräver anställda, inventering inför
 *    bokslut kräver ett känt räkenskapsår.
 * 3. Redan-finns-filtret — ett förslag vars nyckelord redan syns i en
 *    befintlig händelsetitel (härledd eller egen) visas inte igen.
 *
 * Max tre förslag returneras, i listans egen ordning.
 *
 * Rena funktioner — tests/karin-custom-events.spec.ts.
 */

import { dateStr, lastDayOfMonth } from '@/lib/karin/business-days'

export interface SuggestionContext {
  companyForm?: string | null
  /** Antal anställda (business_config.employee_count) — inte antal business_users-rader. */
  employeeCount?: number | null
  fiscalYearEndMonth?: number | null
  /** Titlar på händelser som redan finns i kalendern — härledda och egna. */
  existingTitles: string[]
  today: Date
}

export interface EventSuggestion {
  code: string
  title: string
  note: string
  /** YYYY-MM-DD — ett förifyllt UTKAST, aldrig ett auktoritativt datum. */
  date: string
}

interface SuggestionRule {
  code: string
  title: string
  note: string
  /** Vilka månader (1–12) förslaget är relevant. Funktion när fönstret beror på profilen. */
  monthWindow: number[] | ((ctx: SuggestionContext) => number[])
  /** Extra villkor utöver månadsfönstret. */
  appliesTo: (ctx: SuggestionContext) => boolean
  /** Räknar ut ett rimligt utkastsdatum, alltid framåtblickande inom fönstret. */
  suggestedDate: (ctx: SuggestionContext) => string
  /** Ord som räknar en befintlig händelsetitel som "samma sak" i dubblettfiltret. */
  keywords: string[]
}

const ALLA_MANADER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/**
 * Listan. Kurerad för hand, utökas för hand — se filhuvudet.
 */
const RULES: SuggestionRule[] = [
  {
    code: 'semesterplanering',
    title: 'Semesterplanering inför sommaren',
    note: 'Boka in vem som är ledig när, innan sommaren smyger sig på.',
    monthWindow: [3, 4, 5],
    appliesTo: () => true,
    suggestedDate: ctx => dateStr(lastDayOfMonth(ctx.today.getFullYear(), 5)),
    keywords: ['semester'],
  },
  {
    code: 'forsakringsgenomgang',
    title: 'Försäkringsgenomgång',
    note: 'En årlig koll på vad som faktiskt täcks.',
    monthWindow: [1, 2],
    appliesTo: () => true,
    suggestedDate: ctx => dateStr(lastDayOfMonth(ctx.today.getFullYear(), 2)),
    keywords: ['försäkring'],
  },
  {
    code: 'fordonsbesiktning',
    title: 'Fordonsbesiktning',
    note: 'Boka in besiktningen innan besiktningsperioden tar slut.',
    // Alla hantverkare har typiskt servicebilar — inget bransch- eller
    // bolagsvillkor gör det mer eller mindre relevant.
    monthWindow: ALLA_MANADER,
    appliesTo: () => true,
    suggestedDate: ctx => {
      const d = new Date(ctx.today)
      d.setDate(d.getDate() + 60)
      return dateStr(d)
    },
    keywords: ['besiktning', 'fordon'],
  },
  {
    code: 'arbetsmiljorond',
    title: 'Arbetsmiljörond',
    note: 'Halvårsvis genomgång av arbetsmiljön på arbetsplatserna.',
    monthWindow: [1, 2, 7, 8],
    appliesTo: () => true,
    suggestedDate: ctx => {
      const manad = ctx.today.getMonth() + 1
      const malManad = manad <= 2 ? 2 : 8
      return dateStr(lastDayOfMonth(ctx.today.getFullYear(), malManad))
    },
    keywords: ['arbetsmiljö'],
  },
  {
    code: 'lonerevision',
    title: 'Lönerevision',
    note: 'Årlig genomgång av lönerna för de anställda.',
    monthWindow: [2, 3],
    appliesTo: ctx => typeof ctx.employeeCount === 'number' && ctx.employeeCount > 0,
    suggestedDate: ctx => dateStr(lastDayOfMonth(ctx.today.getFullYear(), 3)),
    keywords: ['lönerevision', 'löneöversyn'],
  },
  {
    code: 'vinterdack',
    title: 'Vinterdäck på firmabilarna',
    note: 'Boka tid innan köerna hos däckverkstaden.',
    monthWindow: [10, 11],
    appliesTo: () => true,
    suggestedDate: ctx => dateStr(lastDayOfMonth(ctx.today.getFullYear(), 11)),
    keywords: ['vinterdäck', 'däck'],
  },
  {
    code: 'inventering_bokslut',
    title: 'Inventering inför bokslut',
    note: 'Räkna in lager och material innan räkenskapsåret stängs.',
    // Relevant månaden INNAN räkenskapsåret slutar. Räkenskapsår som slutar i
    // januari ger december (wrap runt årsskiftet).
    monthWindow: ctx => {
      if (typeof ctx.fiscalYearEndMonth !== 'number') return []
      const malManad = ctx.fiscalYearEndMonth === 1 ? 12 : ctx.fiscalYearEndMonth - 1
      return [malManad]
    },
    appliesTo: ctx => typeof ctx.fiscalYearEndMonth === 'number',
    suggestedDate: ctx => {
      const fy = ctx.fiscalYearEndMonth as number
      const malManad = fy === 1 ? 12 : fy - 1
      return dateStr(lastDayOfMonth(ctx.today.getFullYear(), malManad))
    },
    keywords: ['inventering', 'bokslut'],
  },
]

function relevantMonths(rule: SuggestionRule, ctx: SuggestionContext): number[] {
  return typeof rule.monthWindow === 'function' ? rule.monthWindow(ctx) : rule.monthWindow
}

function alreadyCovered(rule: SuggestionRule, ctx: SuggestionContext): boolean {
  const existing = ctx.existingTitles.map(t => t.toLowerCase())
  return rule.keywords.some(kw => existing.some(t => t.includes(kw.toLowerCase())))
}

/** De (max tre) förslag som är relevanta just nu. */
export function suggestEvents(ctx: SuggestionContext): EventSuggestion[] {
  const manad = ctx.today.getMonth() + 1
  const ut: EventSuggestion[] = []

  for (const rule of RULES) {
    if (!relevantMonths(rule, ctx).includes(manad)) continue
    if (!rule.appliesTo(ctx)) continue
    if (alreadyCovered(rule, ctx)) continue
    ut.push({ code: rule.code, title: rule.title, note: rule.note, date: rule.suggestedDate(ctx) })
    if (ut.length >= 3) break
  }

  return ut
}
