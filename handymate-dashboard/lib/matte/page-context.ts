/**
 * Var i produkten står hantverkaren — och vad kan Matte göra HÄR?
 *
 * ═══ VARFÖR ═══
 *
 * Matte-API:et har läst `context.customerId`/`projectId` sedan länge
 * (app/api/matte/chat/route.ts) — men ingen har någonsin skickat in dem.
 * Chatten har alltså stått på en offert utan att veta om det, och svarat
 * som om hantverkaren ringde från gatan.
 *
 * Den här filen är hela kopplingen: pathname → sidtyp + entitets-id +
 * 2–4 kontextuella snabbåtgärder. Snabbåtgärderna är FÄRDIGA FRÅGOR som
 * fyller inputen — hantverkaren ska inte behöva veta vad man kan fråga.
 *
 * Ren funktion — facit i tests/matte-page-context.spec.ts.
 */

export type MattePage =
  | 'quote'
  | 'project'
  | 'customer'
  | 'invoice'
  | 'invoices'
  | 'quotes'
  | 'schedule'
  | 'pipeline'
  | 'other'

export interface MattePageContext {
  page: MattePage
  customerId?: string
  projectId?: string
  quoteId?: string
  invoiceId?: string
  /** Färdiga frågor som chips ovanför inputen. Max 3. */
  quickActions: string[]
}

/** Id-segmentet efter en listsida — men aldrig kända undersidor. */
function idAfter(delar: string[], lista: string): string | null {
  const i = delar.indexOf(lista)
  if (i === -1 || i + 1 >= delar.length) return null
  const kandidat = delar[i + 1]
  if (['new', 'edit'].includes(kandidat)) return null
  return kandidat
}

export function pageContextFromPathname(pathname: string | null | undefined): MattePageContext {
  const delar = (pathname ?? '').split('/').filter(Boolean)

  const quoteId = idAfter(delar, 'quotes')
  if (quoteId) {
    return {
      page: 'quote',
      quoteId,
      quickActions: [
        'Bedöm risken att den här offerten tappar fart',
        'Hur ligger den här offerten mot liknande jobb?',
      ],
    }
  }

  const projectId = idAfter(delar, 'projects')
  if (projectId) {
    return {
      page: 'project',
      projectId,
      quickActions: [
        'Hur ligger det här projektet mot kalkylen?',
        'Finns det arbete här som borde bli en ÄTA?',
        'Vad händer med marginalen om jobbet tar 20 timmar extra och materialet blir 10 % dyrare?',
      ],
    }
  }

  const customerId = idAfter(delar, 'customers')
  if (customerId) {
    return {
      page: 'customer',
      customerId,
      quickActions: [
        'Vad har den här kunden anlitat oss för tidigare?',
        'Vad kan den här kunden sannolikt behöva härnäst?',
      ],
    }
  }

  const invoiceId = idAfter(delar, 'invoices')
  if (invoiceId) {
    return {
      page: 'invoice',
      invoiceId,
      quickActions: ['Är den här fakturan betald — och om inte, vad gör vi?'],
    }
  }

  if (delar.includes('invoices')) {
    return { page: 'invoices', quickActions: ['Vad kan faktureras eller följas upp i dag?'] }
  }
  if (delar.includes('quotes')) {
    return { page: 'quotes', quickActions: ['Vilka offerter behöver följas upp?'] }
  }
  if (delar.includes('schedule')) {
    return { page: 'schedule', quickActions: ['Finns det luckor eller krockar i veckan?'] }
  }
  if (delar.includes('pipeline')) {
    return { page: 'pipeline', quickActions: ['Vilka affärer har fastnat?'] }
  }

  return { page: 'other', quickActions: [] }
}
