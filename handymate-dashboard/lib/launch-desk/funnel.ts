import type { GtmFunnel, GtmStatus } from './types'

export function deriveFunnel(
  accounts: Array<{ status: GtmStatus; next_action_at: string | null }>,
  now: Date = new Date(),
): GtmFunnel {
  const statuses = (wanted: GtmStatus[]) => accounts.filter(account => wanted.includes(account.status)).length
  return {
    total: accounts.length,
    ready: statuses(['qualified', 'ready']),
    due: accounts.filter(account => {
      if (!account.next_action_at || ['won', 'lost', 'suppressed'].includes(account.status)) return false
      const due = new Date(account.next_action_at).getTime()
      return !Number.isNaN(due) && due <= now.getTime()
    }).length,
    contacted: statuses(['contacted', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won']),
    replied: statuses(['replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won']),
    meetings: statuses(['meeting_booked', 'demo_booked', 'offer_sent', 'won']),
    demos: statuses(['demo_booked', 'offer_sent', 'won']),
    offers: statuses(['offer_sent', 'won']),
    won: statuses(['won']),
    suppressed: statuses(['suppressed']),
  }
}
