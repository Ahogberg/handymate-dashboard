/** Explain known storage failures without exposing database internals in cards. */
export function approvalErrorText(message?: string | null): string {
  if (!message) return 'Handlingen kunde inte utföras.'
  if (/project_checklist/i.test(message) && /order_id/i.test(message) && /not-null|null value/i.test(message)) {
    return 'Checklistan kunde inte sparas eftersom projektkopplingen inte accepterades. Granska ett nytt försök; det tidigare försöket är inte ett sparat resultat.'
  }
  if (/violates .*constraint|permission denied for|relation .* does not exist|column .* does not exist/i.test(message)) {
    return 'Ett tekniskt fel hindrade åtgärden. Kontrollera det sparade resultatet innan du försöker igen.'
  }
  return message
}
