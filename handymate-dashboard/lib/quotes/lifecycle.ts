/**
 * Vad som får ändras på en offert kunden redan sagt ja till.
 *
 * ═══ FELET SOM RÄTTAS ═══
 *
 * `PUT /api/quotes` hämtade offertens status men använde den bara för att sätta
 * `sent_at`. Ingen gren avvisade `accepted` eller `signed`. En accepterad offert
 * kunde alltså skrivas om i efterhand — priser, rader, villkor, förbehåll — medan
 * `signature_data` och `signed_at` stod kvar orörda.
 *
 * Kunden ser sin gamla signeringslänk. Den läser den muterbara raden. Signaturen
 * pekar därmed på ett annat innehåll än det som signerades, och ingenting i
 * systemet säger att de gått isär. Det finns varken `content_hash` eller
 * `accepted_snapshot` någonstans i repot.
 *
 * ═══ VAD SOM ÄR LÅST, OCH VARFÖR JUST DET ═══
 *
 * Låset gäller **det kunden sa ja till** — beloppen, raderna, texterna,
 * avdragen, villkoren. Inte hantverkarens interna spårning.
 *
 * Gränsen går inte vid "allt" av ett skäl: en accepterad offert ska fortfarande
 * kunna kopplas till ett projekt, byta status när den faktureras, och bära
 * uppföljningsdata. Låser man det med går arbetsflödet efter accept sönder, och
 * då börjar folk kringgå spärren i stället för att versionera.
 *
 * ═══ VAD MAN GÖR I STÄLLET ═══
 *
 * Ska innehållet ändras efter accept är det en **ny version** — den vägen finns
 * redan (`duplicate_from` + `create_version` i POST). Då behåller originalet sin
 * signatur och sitt innehåll, och kunden får något nytt att ta ställning till.
 *
 * Facit: tests/quote-lifecycle.spec.ts.
 */
import { WON_QUOTE_STATUSES } from './statuses'

/**
 * Statusar där det kommersiella innehållet är låst.
 *
 * `declined` och `expired` låses INTE. De är återvändsgränder, inte avtal — en
 * hantverkare som vill återuppliva en avböjd offert ska kunna redigera den.
 * Ingen signatur pekar på dem.
 */
export const LOCKED_QUOTE_STATUSES = WON_QUOTE_STATUSES

export function isLocked(status: string | null | undefined): boolean {
  if (!status) return false
  return (LOCKED_QUOTE_STATUSES as readonly string[]).includes(status)
}

/**
 * Fälten som utgör det kunden sa ja till.
 *
 * Härledd ur PUT-grenens egen uppdateringslista. Läggs ett nytt kundvänt fält
 * till där måste det in här också — facit kontrollerar att listorna inte glider
 * isär.
 */
export const COMMERCIAL_FIELDS = [
  // Vad jobbet är
  'title', 'description', 'items', 'project_address',
  // Vad det kostar
  'subtotal', 'total', 'vat_rate', 'vat_amount',
  'labor_total', 'material_total',
  'discount_amount', 'discount_percent',
  // Avdragen och vad kunden faktiskt betalar
  'rot_rut_type', 'rot_deduction', 'rot_work_cost', 'rot_customer_pays',
  'rut_deduction', 'rut_work_cost', 'rut_customer_pays',
  'rot_rut_deduction', 'rot_rut_eligible', 'customer_pays',
  // Hur länge erbjudandet gäller. Meningslöst att ändra efter accept, men det
  // står på kundens dokument — och allt kunden ser hör till avtalet.
  'valid_until',
  // Vad som gäller
  'terms', 'terms_text', 'introduction_text', 'conclusion_text',
  'not_included', 'ata_terms', 'payment_terms_text', 'payment_plan',
  'reservations_snapshot',
  // Vad kunden ser
  'images', 'attachments', 'template_style',
  'show_quantities', 'show_unit_prices', 'detail_level',
  // Vem det gäller
  'customer_id', 'personnummer', 'fastighetsbeteckning',
] as const

/**
 * Fält som får ändras även efter accept.
 *
 * Alla är interna: koppling till affär och projekt, status när offerten går
 * vidare i flödet, och spårning. Ingen av dem ändrar vad kunden sa ja till.
 */
export const OPERATIONAL_FIELDS = [
  'status', 'sent_at', 'deal_id', 'lead_id', 'project_id',
  'customer_reference', 'reference_person',
] as const

/**
 * Vilka av de begärda ändringarna är låsta?
 *
 * Tar nycklarna ur request-body. Returnerar tom lista när ingenting är låst —
 * antingen för att offerten är öppen eller för att bara operativa fält rörs.
 */
export function lockedChanges(
  status: string | null | undefined,
  bodyKeys: string[],
): string[] {
  if (!isLocked(status)) return []
  const kommersiella = new Set<string>(COMMERCIAL_FIELDS as readonly string[])
  return bodyKeys.filter(k => kommersiella.has(k)).sort()
}

/**
 * Meddelandet hantverkaren möter.
 *
 * Säger vad som hindras, varför, och vad man gör i stället. Ett blankt
 * "otillåtet" hade bara lett till att någon redigerade i databasen.
 */
export function lockedChangeMessage(status: string): string {
  const lage = status === 'signed' ? 'signerad av kunden' : 'accepterad av kunden'
  return `Offerten är ${lage} och innehållet är låst. Skapa en ny version om något behöver ändras — då behåller originalet det kunden faktiskt sa ja till.`
}
