/**
 * Avdragsvakten för auto-fakturering.
 *
 * ═══ FELET SOM STÄNGS (spår 5, 2026-09-18) ═══
 *
 * app/api/invoices/auto-generate skapar fakturor ur ofakturerade tidposter,
 * grupperade PER KUND, och satte `customerPays: total` — inget ROT/RUT-avdrag,
 * inget `rot_work_cost`, ingen `rot_rut_type`. En ROT-kund fick alltså en
 * auto-faktura på fullt belopp, och kundens årsutrymme förbrukades inte.
 *
 * ═══ VARFÖR VAKTEN, OCH INTE EN BERÄKNING ═══
 *
 * Det går inte att räkna fram avdraget här, och det är inte en lucka utan ett
 * faktum om datan. Slaget upp 2026-09-18:
 *
 *   - `customer` har NOLL ROT/RUT-kolumner. Varje ROT-fält bor på `invoice`
 *     och på `quotes`.
 *   - Auto-fakturan har ingen offert och inget projekt (rutten grupperar per
 *     kund), så rot_rut_type, personnummer och fastighetsbeteckning — allt
 *     Skatteverket kräver — finns ingenstans att läsa.
 *   - Tidposter har ingen jobbtyp, så inte heller lib/rot/tabell.ts kan
 *     avgöra vad som är berättigat arbete.
 *
 * Ett avdrag räknat på det underlaget hade varit en gissning om skatt. Samma
 * fil vägrar redan gissa ett timpris ("aldrig ett hårdkodat 500 på en RIKTIG
 * faktura — det är den värsta lögnen i systemet") och utesluter i stället
 * posten. Vakten gör exakt det, ett steg upp: en kund med avdragshistorik
 * auto-faktureras INTE, utan lämnas åt en människa som har uppgifterna.
 *
 * Fel åt rätt håll: en utebliven auto-faktura syns i listan och kan skickas
 * för hand. En skickad faktura utan avdrag är fel mot kunden, fel mot
 * Skatteverket, och upptäcks först när kunden ringer.
 *
 * Ren modul — inga DB-anrop. Rutten läser raderna, den här filen dömer.
 * Facit: tests/auto-faktura-avdragsvakt.spec.ts.
 */

/** En rad som visar att kunden har haft ROT eller RUT någon gång. */
export interface AvdragsSpar {
  customer_id: string | null
  rot_rut_type: string | null
}

export const AVDRAGSTYPER = ['rot', 'rut'] as const

/**
 * Kunder som någon gång burit ett ROT- eller RUT-avdrag.
 *
 * Tar rader från både `quotes` och `invoice` — anroparen läser båda, för en
 * faktura med avdrag är ett starkare spår än en offert, och en offert är det
 * enda spåret som finns innan första fakturan.
 *
 * Bara 'rot' och 'rut' räknas. Ett tomt eller okänt värde är INTE ett spår:
 * då hade vakten blockerat hela kundregistret på en slarvig sträng.
 */
export function kunderMedAvdragshistorik(rader: AvdragsSpar[]): Set<string> {
  const ut = new Set<string>()
  for (const rad of rader) {
    if (!rad.customer_id) continue
    const typ = (rad.rot_rut_type || '').trim().toLowerCase()
    if ((AVDRAGSTYPER as readonly string[]).includes(typ)) ut.add(rad.customer_id)
  }
  return ut
}

/**
 * Skälet som visas för hantverkaren när en kund hoppas över.
 *
 * Svenska, inga tekniska termer, och det säger vad man ska GÖRA — en rad som
 * bara konstaterar att något inte hände är en återvändsgränd.
 */
export function avdragsvaktSkal(): string {
  // Kundnamnet står redan bredvid skälet i ytan (result.skipped bär
  // customer_name separat). Sett i 375 px 2026-09-18 blev upprepningen
  // "Familjen Lind — Familjen Lind har haft…" — därför utan namn här.
  return 'Har haft ROT- eller RUT-avdrag tidigare. Auto-fakturan skulle ha saknat avdraget, så tidrapporterna ligger kvar — fakturera dem för hand så avdraget och kundens årsutrymme räknas rätt.'
}
