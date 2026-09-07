import { hasPermission, type BusinessUser } from '@/lib/permissions'

/**
 * Säker projektion av en business_users-rad innan den lämnar servern.
 *
 * Bakgrund (rollgranskning 2026-09-07, docs/security/role-audit-2026-09-07,
 * fynd R3 och R4): /api/team GET strippade lönekostnad men lämnade ut
 * invite_token till alla i firman, och PATCH returnerade hela raden från
 * `.select()` utan någon strippning alls. En anställd som bytte sitt eget
 * namn fick tillbaka sin egen interna timkostnad, och vem som helst i firman
 * kunde läsa en väntande admininbjudans token — som accept-flödet byter mot
 * ett konto med valt lösenord.
 *
 * Regeln: GET, PATCH och varje annat svar som bär en medlemsrad går genom
 * SAMMA funktion. Två regler bor här:
 *
 *  1. Lönekostnad ser bara owner/admin. Andreas spec 2026-05-21: employee/
 *     PM/kalkylator ser ALDRIG, även med can_see_financials=true. Därför
 *     roll, inte hasPermission(see_financials).
 *  2. invite_token ser bara den som får administrera personal
 *     (manage_users). Alla andra får `invite_pending` — en boolean som
 *     räcker för "Inbjuden"-etiketten i UI:t utan att bära nyckeln.
 *
 * Okänd betraktare (null — superadmin-impersonation eller ingen medlemsrad)
 * behandlas som obehörig. En token ska aldrig läcka på grund av att vi inte
 * kunde avgöra vem som frågade.
 */

/** Alla kolumner som beskriver vad en person kostar firman. Legacy-namnen
 *  (hourly_cost, TD-59) och lönefälten ingår — de bär samma sorts uppgift. */
export const LONEKOSTNADSFALT = [
  'internal_hourly_cost',
  'hourly_cost',
  'hourly_wage',
  'ob1_rate',
  'ob2_rate',
  'overtime_50_rate',
  'overtime_100_rate',
] as const

export function canSeeInternalCosts(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canSeeInviteTokens(viewer: BusinessUser | null | undefined): boolean {
  return Boolean(viewer && hasPermission(viewer, 'manage_users'))
}

type MedlemsradIn = {
  invite_token?: string | null
  accepted_at?: string | null
  [key: string]: unknown
}

export type ProjiceradMedlem<T> = T & { invite_pending: boolean }

export function projiceraMedlem<T extends MedlemsradIn>(
  rad: T,
  viewer: BusinessUser | null | undefined,
): ProjiceradMedlem<T> {
  const ut: Record<string, unknown> = { ...rad }

  if (!canSeeInternalCosts(viewer?.role)) {
    for (const falt of LONEKOSTNADSFALT) {
      if (falt in ut) ut[falt] = null
    }
  }

  const pending = Boolean(rad.invite_token && !rad.accepted_at)
  if (!canSeeInviteTokens(viewer)) {
    ut.invite_token = null
  }
  ut.invite_pending = pending

  return ut as ProjiceradMedlem<T>
}

export function projiceraMedlemmar<T extends MedlemsradIn>(
  rader: T[],
  viewer: BusinessUser | null | undefined,
): ProjiceradMedlem<T>[] {
  return rader.map(rad => projiceraMedlem(rad, viewer))
}
