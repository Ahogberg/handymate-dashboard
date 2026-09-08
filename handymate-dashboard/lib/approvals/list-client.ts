/** Failed pages never become a successful empty or truncated queue. */
export async function fetchApprovalList(url: string, headers?: HeadersInit): Promise<unknown[]> {
  const items = new Map<string, unknown>()
  let offset = 0
  while (true) {
    const response = await fetch(`${url}&offset=${offset}`, { headers })
    if (!response.ok) throw new Error('Godkännanden kunde inte hämtas.')
    const data = await response.json()
    if (!data || !Array.isArray(data.approvals) || data.approvals.some((row: any) => typeof row?.id !== 'string')) throw new Error('Ogiltigt svar för godkännanden.')
    for (const row of data.approvals) items.set(row.id, row)
    if (data.next_offset == null) return Array.from(items.values())
    if (!Number.isSafeInteger(data.next_offset) || data.next_offset <= offset) throw new Error('Ogiltig sidposition för godkännanden.')
    offset = data.next_offset
  }
}
