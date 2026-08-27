export interface TimelineProjectReference {
  project_id: string
  name: string
  project_number: string | null
  status: string | null
}

export interface TimelineProjectContext {
  projects: Record<string, TimelineProjectReference>
  bookingToProject: Record<string, string>
  invoiceToProject: Record<string, string>
  dealToProject: Record<string, string>
  quoteToProject: Record<string, string>
  leadToProject: Record<string, string>
}

const RELATION_KEYS = [
  ['project_id', null],
  ['booking_id', 'bookingToProject'],
  ['invoice_id', 'invoiceToProject'],
  ['deal_id', 'dealToProject'],
  ['quote_id', 'quoteToProject'],
  ['lead_id', 'leadToProject'],
] as const

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * Kopplar en tidslinjehändelse till ett projekt enbart via verifierade id:n.
 * Kundnamn, fritext, datum och "kundens enda projekt" används aldrig som
 * heuristik — hellre Övrig kunddialog än kommunikation under fel jobb.
 */
export function resolveTimelineProject(
  metadata: Record<string, unknown>,
  context: TimelineProjectContext,
): TimelineProjectReference | null {
  for (const [metadataKey, relationKey] of RELATION_KEYS) {
    const sourceId = nonEmptyString(metadata[metadataKey])
    if (!sourceId) continue

    const projectId = relationKey ? context[relationKey][sourceId] : sourceId
    if (!projectId) continue

    const project = context.projects[projectId]
    if (project) return project
  }

  return null
}

export function emptyTimelineProjectContext(): TimelineProjectContext {
  return {
    projects: {},
    bookingToProject: {},
    invoiceToProject: {},
    dealToProject: {},
    quoteToProject: {},
    leadToProject: {},
  }
}
