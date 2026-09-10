export interface ProjectApprovalPage<T> {
  approvals: T[]
  nextOffset: number | null
}

type FetchPage = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createProjectApprovalReadGuard() {
  let current = 0
  return {
    begin: () => ++current,
    isCurrent: (sequence: number) => sequence === current,
    invalidate: () => { current += 1 },
  }
}

export async function loadProjectApprovalPage<T>(
  projectId: string,
  accessToken: string | undefined,
  offset: number,
  signal: AbortSignal,
  fetchPage: FetchPage = fetch,
): Promise<ProjectApprovalPage<T>> {
  const params = new URLSearchParams({
    status: 'pending',
    limit: '50',
    project_id: projectId,
    offset: String(offset),
  })
  const response = await fetchPage(`/api/approvals?${params}`, {
    signal,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (!response.ok) throw new Error('approval-read-failed')

  const body = await response.json().catch(() => null)
  const nextOffset = body?.next_offset
  if (
    !body || !Array.isArray(body.approvals) ||
    !(nextOffset === null || (Number.isSafeInteger(nextOffset) && nextOffset > offset))
  ) throw new Error('approval-read-malformed')

  return { approvals: body.approvals as T[], nextOffset }
}
