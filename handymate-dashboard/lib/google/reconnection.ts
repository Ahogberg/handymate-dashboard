/** Decide before writing any tokens. Scope evidence comes from Google, not the URL. */
export function googleReconnection(input: {
  email: string
  refreshToken?: string | null
  scopes: readonly string[]
  existing?: { account_email: string | null; refresh_token: string | null } | null
  retainedAccountVerified: boolean
}) {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Google-kontot kunde inte identifieras.')
  // Account replacement needs explicit disconnect; do not reuse calendar or mail cursors.
  if (input.existing && input.existing.account_email?.trim().toLowerCase() !== email) {
    throw new Error('Koppla bort det tidigare Google-kontot innan du byter konto.')
  }
  if (!input.refreshToken && !(input.existing?.refresh_token && input.retainedAccountVerified)) {
    throw new Error('Google-kopplingen kan inte förnyas. Anslut igen och bevilja fortsatt åtkomst.')
  }
  const scopes = new Set(input.scopes)
  if (!scopes.has('https://www.googleapis.com/auth/calendar.readonly') ||
      !scopes.has('https://www.googleapis.com/auth/calendar.events')) {
    throw new Error('Kalenderbehörigheterna saknas. Anslut kalendern igen.')
  }
  return {
    gmail_scope_granted: scopes.has('https://www.googleapis.com/auth/gmail.readonly') || scopes.has('https://www.googleapis.com/auth/gmail.modify') || scopes.has('https://mail.google.com/'),
    gmail_send_scope_granted: scopes.has('https://www.googleapis.com/auth/gmail.send') || scopes.has('https://www.googleapis.com/auth/gmail.compose') || scopes.has('https://www.googleapis.com/auth/gmail.modify') || scopes.has('https://mail.google.com/'),
  }
}
