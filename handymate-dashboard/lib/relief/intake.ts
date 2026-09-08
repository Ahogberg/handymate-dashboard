export type ReliefIntent = 'quote' | 'report' | 'followup'
export interface ReliefDraft { version: 1; businessId: string; userId: string; intent: ReliefIntent; text: string; projectId: string; savedAt: number }
export const RELIEF_MAX_LENGTH = 4000
const TTL = 7 * 86400000
export function reliefKey(businessId: string, userId: string) { return `hm:relief:v1:${businessId}:${userId}` }
export function readReliefDraft(raw: string | null, businessId: string, userId: string, now = Date.now()): ReliefDraft | null {
  try {
    const d = JSON.parse(raw || 'null')
    if (!businessId || !userId || !d || d.version !== 1 || d.businessId !== businessId || d.userId !== userId
      || !['quote','report','followup'].includes(d.intent) || typeof d.text !== 'string' || d.text.length > RELIEF_MAX_LENGTH
      || typeof d.projectId !== 'string' || d.projectId.length > 128 || !Number.isFinite(d.savedAt) || d.savedAt > now || now - d.savedAt > TTL) return null
    return d
  } catch { return null }
}
export function loadReliefDraft(businessId: string, userId: string): ReliefDraft | null {
  try { return readReliefDraft(sessionStorage.getItem(reliefKey(businessId, userId)), businessId, userId) } catch { return null }
}
export function saveReliefDraft(draft: Omit<ReliefDraft, 'version' | 'savedAt'>): boolean {
  if (!draft.businessId || !draft.userId) return false
  const value = { ...draft, version: 1 as const, savedAt: Date.now() }
  const raw = JSON.stringify(value)
  if (!readReliefDraft(raw, draft.businessId, draft.userId)) return false
  try { sessionStorage.setItem(reliefKey(draft.businessId, draft.userId), raw); return true } catch { return false }
}
export function reliefPrompt(text: string): string {
  return `Hjälp mig förbereda en uppföljning utifrån mitt underlag nedan. Kontrollera vilken kund och vilket ärende det gäller innan du föreslår en handling. Visa vad du har förberett, vad som behöver mitt godkännande och vad som återstår. Lova ingen bevakning eller avstämning som inte faktiskt finns sparad. Skicka inget meddelande nu.\n\nMitt underlag:\n${text.trim()}`
}

/** Each handoff has its own editor recovery scope; a later request cannot overwrite it. */
export function createQuoteReliefHandoff(businessId: string, userId: string, text: string): string | null {
  if (!businessId || !userId || text.trim().length < 8 || text.length > RELIEF_MAX_LENGTH) return null
  try {
    const id = crypto.randomUUID()
    const draft: ReliefDraft = { version: 1, businessId, userId, text, intent: 'quote', projectId: '', savedAt: Date.now() }
    sessionStorage.setItem(`${reliefKey(businessId, userId)}:handoff:${id}`, JSON.stringify(draft))
    return id
  } catch { return null }
}
export function loadQuoteReliefHandoff(businessId: string, userId: string, id: string | null): ReliefDraft | null {
  if (!id || !/^[a-zA-Z0-9-]{1,64}$/.test(id)) return null
  try {
    const draft = readReliefDraft(sessionStorage.getItem(`${reliefKey(businessId, userId)}:handoff:${id}`), businessId, userId)
    return draft?.intent === 'quote' ? draft : null
  } catch { return null }
}
