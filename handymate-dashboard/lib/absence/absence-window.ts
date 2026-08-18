/**
 * Frånvarofönster V1 (Etapp Å, sql/v153_owner_absence.sql) — ägarens
 * "jag är borta till fredag".
 *
 * Lagras i automation_settings.owner_absence (samma JSONB-precedent som
 * auto_approve_config). Fönstret UPPHÖR AUTOMATISKT genom läs-tids-check
 * (isAbsenceActive) — ingen cron, ingen städning. Ägaren kan avsluta tidigt
 * genom att sätta `to` till "nu" (endAbsenceNow), inget extra statusfält.
 *
 * FÖRBJUDEN INTEGRATIONSPUNKT: den här filen importerar ALDRIG någon av
 * agentsystemets exekveringsvägar och skriver ALDRIG pending_approvals till
 * ett godkänt tillstånd. Frånvaron ger ingen ny behörighet — bara ett
 * lästillstånd andra moduler kan fråga (isAbsenceActive). Källskanningslåst
 * (exakt vilka funktionsnamn/strängar som är förbjudna listas medvetet bara
 * i testfilen, tests/absence-push-gate.spec.ts — annars fastnar den här
 * kommentaren i sin egen fälla, samma lärdom som lib/mandates/
 * mission-mandate.ts).
 */

import { getAutomationSettings, updateAutomationSettings } from '@/lib/automations'

export interface AbsenceWindow {
  /** ISO 8601. */
  from: string
  /** ISO 8601. */
  to: string
  /** business_users.id för vem som satte fönstret, eller null om okänt. */
  setBy: string | null
  /** ISO 8601 — när fönstret senast sattes/ändrades. */
  setAt: string
}

/**
 * Ren funktion — testbar utan Supabase/klocka. Ett fönster är aktivt om
 * `now` ligger inom [from, to], inklusive gränserna. Ett null-fönster,
 * ett trasigt fönster (ogiltiga datum) eller ett passerat/framtida fönster
 * är INTE aktivt.
 */
export function isAbsenceActive(window: AbsenceWindow | null, now: Date): boolean {
  if (!window) return false
  const fromMs = Date.parse(window.from)
  const toMs = Date.parse(window.to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return false
  const nowMs = now.getTime()
  return nowMs >= fromMs && nowMs <= toMs
}

/**
 * Ren validering av ett nytt fönster innan det sparas — `to` måste ligga
 * efter `from`, och båda måste vara giltiga tidsstämplar.
 */
export function isValidAbsenceRange(fromIso: string, toIso: string): boolean {
  const fromMs = Date.parse(fromIso)
  const toMs = Date.parse(toIso)
  return Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs
}

function normalizeWindow(raw: unknown): AbsenceWindow | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  if (typeof w.from !== 'string' || typeof w.to !== 'string' || typeof w.set_at !== 'string') return null
  return {
    from: w.from,
    to: w.to,
    setBy: typeof w.set_by === 'string' ? w.set_by : null,
    setAt: w.set_at,
  }
}

/**
 * Läser fönstret. Fail-soft: saknad tabell/kolumn, trasig rad eller läsfel
 * ⇒ null (samma degradering som getAutomationSettings redan gör — se
 * DEFAULT_SETTINGS.owner_absence).
 */
export async function getAbsenceWindow(businessId: string): Promise<AbsenceWindow | null> {
  const settings = await getAutomationSettings(businessId)
  return normalizeWindow(settings.owner_absence)
}

/**
 * Sätter/ersätter fönstret. Anroparen (API-rutten) validerar behörighet
 * (ägare/admin) och isValidAbsenceRange INNAN detta anrop — den här
 * funktionen litar på indata, den är bara skrivvägen.
 */
export async function setAbsenceWindow(
  businessId: string,
  params: { from: string; to: string; setBy: string | null },
): Promise<AbsenceWindow> {
  const window: AbsenceWindow = {
    from: params.from,
    to: params.to,
    setBy: params.setBy,
    setAt: new Date().toISOString(),
  }
  await updateAutomationSettings(businessId, {
    owner_absence: { from: window.from, to: window.to, set_by: window.setBy, set_at: window.setAt },
  })
  return window
}

/**
 * Avslutar ett aktivt fönster i förtid genom att korta `to` till nu.
 * Null om inget fönster fanns att avsluta. Ett redan passerat fönster
 * rörs inte (to hade redan gjort det inaktivt — inget att korta).
 */
export async function endAbsenceNow(businessId: string): Promise<AbsenceWindow | null> {
  const current = await getAbsenceWindow(businessId)
  if (!current) return null
  const nowIso = new Date().toISOString()
  const nyTo = Date.parse(nowIso) < Date.parse(current.from) ? current.from : nowIso
  const ended: AbsenceWindow = { ...current, to: nyTo }
  await updateAutomationSettings(businessId, {
    owner_absence: { from: ended.from, to: ended.to, set_by: ended.setBy, set_at: current.setAt },
  })
  return ended
}
