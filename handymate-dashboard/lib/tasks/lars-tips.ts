/**
 * "Lars tipsar" — deterministiska förslag på arbetsuppgifter ur projektets
 * steg, datum och luckor (2026-08-28). Noll tokens, ingen cron: räknas när
 * sidan laddas.
 *
 * Principer (Andreas):
 *  - Förslag, aldrig automatik. Ett tips blir en uppgift först vid tryck.
 *  - Hellre tyst än gissat: varje tips pekar på det datum/den lucka det
 *    bygger på ("start om 6 dagar, inget bokat"). Finns inget att säga
 *    visas inget.
 *  - Max två åt gången per projekt — godkännandekorten får inte tryckas ner.
 *  - Dedup mot öppna uppgifter med liknande titel och mot avvisade tips.
 *
 * Reglerna är rena funktioner över TipInput — testade i
 * tests/facit-lars-tipsar.spec.ts. Datainsamlingen bor i
 * app/api/projects/[id]/tips/route.ts.
 */

export const MAX_TIPS_PER_PROJECT = 2

export interface TipInput {
  todayIso: string
  stageId: string | null
  status: string | null
  startDate: string | null
  endDate: string | null
  completedAt: string | null
  name: string
  description: string | null
  jobType: string | null
  bookingCount: number
  /** Bokningar med starttid >= i dag */
  upcomingBookingCount: number
  materialCount: number
  milestoneCount: number
  checklistCount: number
  /** Senaste work_date bland tidrapporter, ISO-datum */
  lastTimeEntryDate: string | null
  hasRot: boolean
  customerPropertyDesignation: string | null
  customerPersonalNumber: string | null
  /** Namn på bekräftade installationer med serial_pending */
  serialPendingInstallations: string[]
  jobbpassStatus: 'none' | 'draft' | 'published'
  jobbpassNotified: boolean
  openTaskTitles: string[]
  dismissedKeys: string[]
}

export interface LarsTip {
  key: string
  title: string
  /** Varför-raden — alltid ur data, aldrig gissad */
  reason: string
  dueDate: string | null
}

const STAGE_POS: Record<string, number> = { 'ps-01': 1, 'ps-02': 2, 'ps-03': 3, 'ps-04': 4, 'ps-05': 5, 'ps-06': 6, 'ps-07': 7, 'ps-08': 8 }

function stagePos(stageId: string | null): number {
  return stageId ? (STAGE_POS[stageId] ?? 0) : 0
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function normaliseraTitel(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'a').replace(/å/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Ren: finns redan en öppen uppgift som täcker tipset? Nyckelord ur tipset måste alla finnas i titeln. */
export function coveredByOpenTask(tipKeywords: string[], openTaskTitles: string[]): boolean {
  const kws = tipKeywords.map(normaliseraTitel)
  return openTaskTitles.some(t => { const n = normaliseraTitel(t); return kws.every(k => n.includes(k)) })
}

function dagarText(n: number): string {
  if (n === 0) return 'i dag'
  if (n === 1) return 'i morgon'
  if (n < 0) return `${-n} dag${-n === 1 ? '' : 'ar'} sedan`
  return `om ${n} dagar`
}

const VATRUM = ['badrum', 'vatrum', 'tatskikt', 'dusch', 'tvattstuga', 'kakel', 'klinker']
const EL = ['el', 'elcentral', 'laddbox', 'elinstallation', 'solcell']

function textHar(input: TipInput, words: string[]): boolean {
  const t = normaliseraTitel(`${input.name} ${input.description || ''} ${input.jobType || ''}`)
  return words.some(w => new RegExp(`(^|[^a-z])${w}`).test(t))
}

/**
 * Alla regler, i prioritetsordning. Varje regel svarar null när den inte är
 * sann. Ordningen avgör vilka två som visas.
 */
export function allaTips(input: TipInput): LarsTip[] {
  const pos = stagePos(input.stageId)
  const active = input.status !== 'completed' && input.status !== 'cancelled' && !input.completedAt
  const daysToStart = input.startDate ? daysBetween(input.todayIso, input.startDate) : null
  const daysToEnd = input.endDate ? daysBetween(input.todayIso, input.endDate) : null
  const tips: LarsTip[] = []
  if (!active) {
    // Efter avslut: bara jobbpasset
    if (input.jobbpassStatus === 'published' && !input.jobbpassNotified) {
      tips.push({ key: 'jobbpass_meddela', title: 'Meddela kunden om jobbpasset', reason: 'Jobbpasset är publicerat men kunden har inte fått något mejl', dueDate: input.todayIso })
    }
    return tips
  }

  // Kontrakt/startmöte: startmöte
  if (pos <= 2 && daysToStart !== null && daysToStart <= 14 && input.upcomingBookingCount === 0) {
    tips.push({ key: 'boka_startmote', title: 'Boka startmöte med kunden', reason: `Start ${dagarText(daysToStart)}, inget besök bokat`, dueDate: daysToStart > 2 ? addDays(input.todayIso, 2) : input.todayIso })
  }
  // Material
  if (pos <= 3 && daysToStart !== null && daysToStart <= 10 && input.materialCount === 0) {
    tips.push({ key: 'bestall_material', title: 'Beställ material', reason: `Inga materialrader, start ${dagarText(daysToStart)}`, dueDate: daysToStart > 3 ? addDays(input.todayIso, 1) : input.todayIso })
  }
  // Delmoment
  if (pos <= 2 && daysToStart !== null && daysToStart <= 7 && input.milestoneCount === 0) {
    tips.push({ key: 'planera_delmoment', title: 'Planera delmomenten', reason: `Inga delmoment, start ${dagarText(daysToStart)}`, dueDate: input.todayIso })
  }
  // ROT: fastighetsbeteckning/personnummer
  if (input.hasRot && (!input.customerPropertyDesignation || !input.customerPersonalNumber)) {
    const saknas = [!input.customerPropertyDesignation ? 'fastighetsbeteckning' : null, !input.customerPersonalNumber ? 'personnummer' : null].filter(Boolean).join(' och ')
    tips.push({ key: 'rot_uppgifter', title: `Hämta ${saknas} för ROT-avdraget`, reason: `ROT-jobb — ${saknas} saknas på kunden, fakturan fastnar annars`, dueDate: input.todayIso })
  }
  // Egenkontroll för våtrum/el
  if (pos >= 3 && pos <= 5 && input.checklistCount === 0 && (textHar(input, VATRUM) || textHar(input, EL))) {
    tips.push({ key: 'starta_egenkontroll', title: 'Starta egenkontrollen', reason: textHar(input, VATRUM) ? 'Våtrumsjobb utan påbörjad egenkontroll' : 'Eljobb utan påbörjad egenkontroll', dueDate: input.todayIso })
  }
  // Tid inte rapporterad
  if (pos >= 3 && pos <= 5 && input.lastTimeEntryDate && daysBetween(input.lastTimeEntryDate, input.todayIso) >= 3) {
    tips.push({ key: 'rapportera_tid', title: 'Rapportera tid', reason: `Senaste tidrapport ${dagarText(-daysBetween(input.lastTimeEntryDate, input.todayIso))}`, dueDate: input.todayIso })
  }
  // Slutbesiktning
  if (pos >= 3 && pos <= 5 && daysToEnd !== null && daysToEnd <= 5 && input.upcomingBookingCount === 0) {
    tips.push({ key: 'boka_slutbesiktning', title: 'Boka slutbesiktning', reason: daysToEnd < 0 ? `Planerat slut ${dagarText(daysToEnd)}, ingen besiktning bokad` : `Slut ${dagarText(daysToEnd)}, ingen besiktning bokad`, dueDate: input.todayIso })
  }
  // Serienummer att komplettera (v174)
  if (input.serialPendingInstallations.length > 0) {
    const namn = input.serialPendingInstallations[0]
    tips.push({ key: 'serienummer_' + normaliseraTitel(namn).replace(/ /g, '_'), title: `Komplettera serienumret på ${namn.toLowerCase()}`, reason: 'Markerad "komplettera senare" i installationsregistret', dueDate: null })
  }
  // Jobbpass publicerat men inte meddelat
  if (input.jobbpassStatus === 'published' && !input.jobbpassNotified) {
    tips.push({ key: 'jobbpass_meddela', title: 'Meddela kunden om jobbpasset', reason: 'Jobbpasset är publicerat men kunden har inte fått något mejl', dueDate: input.todayIso })
  }
  return tips
}

const TIP_KEYWORDS: Record<string, string[]> = {
  boka_startmote: ['startmöte'],
  bestall_material: ['material'],
  planera_delmoment: ['delmoment'],
  rot_uppgifter: ['fastighetsbeteckning'],
  starta_egenkontroll: ['egenkontroll'],
  rapportera_tid: ['rapportera tid'],
  boka_slutbesiktning: ['besiktning'],
  jobbpass_meddela: ['jobbpass'],
}

/** Ren: alla regler → dedup mot avvisade och öppna uppgifter → max två. */
export function suggestProjectTasks(input: TipInput): LarsTip[] {
  return allaTips(input)
    .filter(t => !input.dismissedKeys.includes(t.key))
    .filter(t => {
      const kws = t.key.startsWith('serienummer_') ? ['serienum'] : (TIP_KEYWORDS[t.key] || [t.title])
      return !coveredByOpenTask(kws, input.openTaskTitles)
    })
    .slice(0, MAX_TIPS_PER_PROJECT)
}
