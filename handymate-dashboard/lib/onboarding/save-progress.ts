/** A confirmed save is required before leaving the job-type step. */
export async function persistOnboardingProgress(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(typeof result.error === 'string' ? result.error : 'Kunde inte spara dina jobbval. Försök igen.')
  }
}
