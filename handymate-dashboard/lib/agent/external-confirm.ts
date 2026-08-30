/**
 * Fas 0 — säkerhetsräcke för matte/chat: "kommando med koppel".
 *
 * När require_confirm_external=true i requesten (dashboard-bubblan sätter
 * detta; mobilappen skickar inte parametern och är alltså OPÅVERKAD) får
 * modellen inte exekvera verktyg som lämnar huset (SMS/e-post) direkt.
 * Istället signeras det föreslagna verktygsanropet till en kort-livad token
 * som klienten skickar tillbaka vid explicit bekräftelse ([Skicka]-knappen).
 * Routen exekverar då EXAKT det signerade anropet — inget annat — via samma
 * delade tool-router som resten av Matte.
 *
 * Samma mönster som lib/partners/approve-token.ts (HMAC, fail-closed om
 * secret saknas, timingSafeEqual).
 */
import crypto from 'crypto'

/** Verktyg som faktiskt skickar något UT ur huset. */
const EXTERNAL_SEND_TOOL_NAMES = new Set(['send_sms', 'send_email'])

export function isExternalSendTool(toolName: string): boolean {
  return EXTERNAL_SEND_TOOL_NAMES.has(toolName)
}

/**
 * Matte Mobile Voice V1 (2026-08-30): samma koppel för interna skrivningar
 * som förtjänar en snabb bekräftelse i chatten. Rösttranskript hör fel
 * ("fyra" / "fyra och en halv") — tidsregistrering visas därför som ett
 * "Matte uppfattade …"-kort innan något skrivs. Gatas BARA när klienten
 * skickat require_confirm_external (dashboard-bubblan); mobilappens anrop
 * utan parametern är opåverkade, precis som för SMS/e-post.
 */
const CONFIRM_GATED_TOOL_NAMES = new Set(
  Array.from(EXTERNAL_SEND_TOOL_NAMES).concat('log_time', 'log_material', 'add_work_note')
)

export function isConfirmGatedTool(toolName: string): boolean {
  return CONFIRM_GATED_TOOL_NAMES.has(toolName)
}

export interface PendingExternalAction {
  toolName: string
  toolInput: Record<string, unknown>
  businessId: string
  threadId: string | null
  agent: string
  ts: number
}

// 15 minuter räcker gott och väl för att läsa kortet och trycka Skicka, men
// begränsar hur länge en gammal token kan återanvändas.
const TOKEN_TTL_MS = 15 * 60 * 1000

function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function signPendingExternalAction(
  action: Omit<PendingExternalAction, 'ts'>
): string {
  const payload: PendingExternalAction = { ...action, ts: Date.now() }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', signingSecret()).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

/**
 * Verifierar och avkodar en bekräftelse-token. Kräver att businessId matchar
 * den autentiserade sessionen (försvar i djup — token är redan signerad mot
 * ett specifikt business_id, men vi kontrollerar ändå explicit här) och att
 * token inte har gått ut. Fail-closed: saknas secret eller token är
 * ogiltig/manipulerad/för gammal → null → ingen åtgärd exekveras.
 */
export function verifyPendingExternalAction(
  token: string,
  businessId: string
): PendingExternalAction | null {
  if (!token || !signingSecret()) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, sig] = parts

  const expectedSig = crypto.createHmac('sha256', signingSecret()).update(encoded).digest('base64url')
  if (sig.length !== expectedSig.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
  } catch {
    return null
  }

  let payload: PendingExternalAction
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (!payload || payload.businessId !== businessId) return null
  if (!isConfirmGatedTool(payload.toolName)) return null
  if (typeof payload.ts !== 'number' || Date.now() - payload.ts > TOKEN_TTL_MS) return null

  return payload
}

/** Mänsklig svensk sammanfattning för bekräftelsekortet. */
export function buildExternalActionSummary(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  if (toolName === 'send_sms') {
    return `Skicka SMS till ${toolInput.to}: "${toolInput.message}"`
  }
  if (toolName === 'send_email') {
    return `Skicka e-post till ${toolInput.to} (ämne: "${toolInput.subject}")`
  }
  if (toolName === 'log_time') {
    // Robust mot båda formerna: klockslag (start/slut) eller ren varaktighet.
    // Timtalet räknas ur det som faktiskt kommer skrivas — hittas inget
    // begripligt visas verktygsargumenten hellre än en gissning.
    const start = typeof toolInput.start_time === 'string' ? toolInput.start_time : null
    const slut = typeof toolInput.end_time === 'string' ? toolInput.end_time : null
    const durMin = Number(toolInput.duration_minutes)
    let tidsdel: string | null = null
    if (Number.isFinite(durMin) && durMin > 0) {
      tidsdel = `${Math.round((durMin / 60) * 10) / 10} timmar`
    } else if (start && slut) {
      tidsdel = `${start}–${slut}`
    }
    const datum = typeof toolInput.work_date === 'string' && toolInput.work_date ? ` den ${toolInput.work_date}` : ''
    const beskrivning = typeof toolInput.description === 'string' && toolInput.description
      ? ` — ${toolInput.description}`
      : ''
    return tidsdel
      ? `Matte uppfattade: logga ${tidsdel}${datum}${beskrivning}`
      : `Matte uppfattade: logga tid${datum}${beskrivning}`
  }
  if (toolName === 'log_material') {
    const antal = Number(toolInput.quantity)
    const mangd = Number.isFinite(antal) && antal > 0 ? antal : 1
    const enhet = typeof toolInput.unit === 'string' && toolInput.unit ? toolInput.unit : 'st'
    return `Matte uppfattade: bokför ${mangd} ${enhet} ${toolInput.name} på projektet`
  }
  if (toolName === 'add_work_note') {
    const text = typeof toolInput.work_performed === 'string' ? toolInput.work_performed : ''
    // Anteckningen kan vara lång — kortet visar början, hela texten sparas.
    const kort = text.length > 140 ? `${text.slice(0, 140)}…` : text
    return `Matte uppfattade: skriv arbetsanteckning — "${kort}"`
  }
  return `Utför ${toolName}`
}

/** Knapplabel för bekräftelsekortet — "Skicka" är fel verb för interna
 *  skrivningar som stannar i huset. */
export function confirmLabelForTool(toolName: string): string {
  if (toolName === 'log_time') return 'Logga'
  if (toolName === 'log_material') return 'Bokför'
  if (toolName === 'add_work_note') return 'Spara'
  return 'Skicka'
}
