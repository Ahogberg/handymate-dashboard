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

/** Verktyg som faktiskt skickar något UT ur huset — de enda som gatas. */
const EXTERNAL_SEND_TOOL_NAMES = new Set(['send_sms', 'send_email'])

export function isExternalSendTool(toolName: string): boolean {
  return EXTERNAL_SEND_TOOL_NAMES.has(toolName)
}

export interface PendingExternalAction {
  toolName: 'send_sms' | 'send_email'
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
  if (!isExternalSendTool(payload.toolName)) return null
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
  return `Utför ${toolName}`
}
