/** Shared by preview and execution: reviewing an SMS never reserves a slot. */
export function bookingProposalMessage(p: Record<string, any>): string | null {
  if (typeof p.customer_reply_pending === 'string' && p.customer_reply_pending.trim()) return p.customer_reply_pending
  if (!Array.isArray(p.available_slots) || !p.available_slots.length || p.available_slots.some((s: any) => typeof s?.label !== 'string' || !s.label.trim())) return null
  return `Hej! Vi kan komma:\n${p.available_slots.map((s: any, i: number) => `${i + 1}. ${s.label}`).join('\n')}\nVilket passar bäst?`
}
