import type { IntakeQuestion } from './intake-questions'

export interface IntakeQuestionsResponse {
  jobType: { slug: string; name: string }
  questions: IntakeQuestion[]
  seeded: boolean
  units: string[]
  canManage: boolean
}

/**
 * Klientens läsning av frågorna för en jobbtyp. Ett läsfel är ett fel —
 * aldrig en tom lista som tyst hoppar över flödet. Injicerbar fetch som
 * job-type-start.ts, så facit kan köra utan nätverk.
 */
export async function fetchIntakeQuestions(jobTypeSlug: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<IntakeQuestionsResponse> {
  const response = await fetcher(`/api/job-types/intake-questions?jobType=${encodeURIComponent(jobTypeSlug)}`, { cache: 'no-store', signal })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || !Array.isArray(data.questions)) throw new Error(data?.error || 'Kunde inte hämta frågorna för jobbtypen.')
  return data as IntakeQuestionsResponse
}

/** Sparar firmans frågor. `questions: null` = tillbaka till förslagen. */
export async function saveIntakeQuestions(jobTypeSlug: string, questions: IntakeQuestion[] | null, fetcher: typeof fetch = fetch): Promise<IntakeQuestionsResponse> {
  const response = await fetcher('/api/job-types/intake-questions', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobTypeSlug, questions }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || !Array.isArray(data.questions)) throw new Error(data?.error || 'Frågorna kunde inte sparas.')
  return data as IntakeQuestionsResponse
}
