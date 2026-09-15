/**
 * Adminbehörighetens enda grind: e-postadressen.
 *
 * Samma logik låg tidigare i två kopior — lib/admin-auth.ts (isAdmin, som
 * alla 37 adminrutter går igenom) och lib/auth/superadmin.ts (isSuperAdmin,
 * som impersonationen går igenom). Två kopior av en behörighetsgrind är en
 * kopia för mycket: den dag den ena skärps och den andra inte gör det står
 * en öppen dörr kvar utan att någon ser den. Här finns nu en definition,
 * och tests/admin-email-gate.spec.ts är facit för den.
 *
 * Två vägar in, i den ordningen:
 *   1. Adressen slutar på @handymate.se — den permanenta grinden.
 *   2. Adressen finns i ADMIN_EMAILS (kommaseparerad env-var) — reservnyckeln
 *      medan @handymate.se-kontona körs in. Ska bort när båda är provade,
 *      se tasks/efter-lansering.md.
 *
 * ADMIN_EMAILS läses vid varje anrop, inte vid modulladdning. Det gör
 * grinden provbar utan att starta om processen, och kostnaden är en split
 * på en sträng som nästan alltid är tom.
 */

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized.endsWith('@handymate.se')) return true
  return getAdminEmails().includes(normalized)
}
