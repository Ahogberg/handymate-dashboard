/**
 * Vem och vad ett godkännandekort gäller (2026-08-07).
 *
 * ═══ VARFÖR DEN BEHÖVS ═══
 *
 * Kön visade tidigare mottagaren BARA när kortet saknade beskrivning
 * (`{recipient && !approval.description}`). Ett kort med en riktig fråga i
 * beskrivningen tappade alltså kunden helt, och hantverkaren fick
 * "Kunden har en fråga om offerten" utan att veta vilken kund eller vilken
 * offert. Andreas fynd från piloten 2026-08-07: *"projekt och/eller kund borde
 * alltid redovisas i korten så man vet vem och vad det gäller redan på
 * dashboarden."*
 *
 * Fälten finns redan i payloaden på i stort sett varje korttyp — de har bara
 * aldrig renderats.
 *
 * ═══ VARFÖR "Kunden" FILTRERAS BORT ═══
 *
 * Det är fallback-strängen som sätts när kunduppslaget misslyckats
 * (`lib/portal/customer-thread.ts:92`). Att visa den i en kontextrad hade sett
 * ut som ett namn — hantverkaren skulle tro att kunden faktiskt heter så, i
 * stället för att förstå att uppgiften saknas.
 *
 * Ren funktion — tests/card-context.spec.ts.
 */
export function cardContext(payload: Record<string, unknown> | null | undefined): string {
  const pl = (payload || {}) as Record<string, any>
  const delar: string[] = []

  const kund = pl.customer_name || pl.parsed?.name || null
  const kundStr = kund ? String(kund).trim() : ''
  if (kundStr && kundStr !== 'Kunden') delar.push(kundStr)

  // Projekt före offert: står båda i payloaden är projektet det konkreta.
  const projekt = pl.project_name || pl.project_title || null
  const offert = pl.quote_title || pl.item_description || null
  if (projekt) delar.push(String(projekt).trim())
  else if (offert) delar.push(`"${String(offert).trim()}"`)

  // Fakturanumret är så hantverkaren känner igen en pengapost.
  if (pl.invoice_number) delar.push(`Faktura ${pl.invoice_number}`)

  return delar.join(' · ')
}
