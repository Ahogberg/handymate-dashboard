/**
 * Platsbanken som PROSPEKTKÄLLA (2026-09-03).
 *
 * Rekryteringssignalen visade att Arbetsförmedlingens öppna API bär allt vi
 * behöver för att skapa ett prospekt: organisationsnummer, företagsnamn,
 * kommun, och en publik annons-URL med datum. Det är exakt de fält
 * importgrinden kräver (source_name, source_url, source_checked_at,
 * legal_form) — raderna uppfyller alltså kravet genom sin KONSTRUKTION, inte
 * genom att någon fyller i dem för hand.
 *
 * Och de kommer in med rekryteringssignalen redan sann: källan och
 * kvalitetsmåttet är samma sak. En firma som annonserar efter hantverkare
 * växer, och en växande firma har precis fått problemet vi löser.
 *
 * VAD VI ALDRIG TAR MED: annonsernas `application_contacts`. Där ligger namn
 * och direktnummer till rekryterande chefer, publicerade för att ta emot
 * frågor om en TJÄNST. Att flytta över dem till en säljlista vore att
 * återanvända en persons uppgifter för ett helt annat ändamål än de
 * publicerades för — precis det lawful_basis finns för att förhindra.
 * `employer.phone_number` och `employer.email` är dessutom oftast null i
 * svaret; kontaktvägen får komma från firmans egen webbplats i signalpasset.
 *
 * Rena funktioner. Ingen I/O — hämtningen återanvänds från
 * lib/launch-desk/rekryteringssignal.ts.
 */
import type { GtmAccountInput, GtmLegalForm } from './types'
import { normaliseraOrgnummer, type PlatsbankenTraff } from './rekryteringssignal'

/**
 * Svenska organisationsnummer inleds med en gruppsiffra som säger vad
 * juridiska personen är. Verifierat mot riktiga svar: Jönköpings kommun är
 * 2120000530, SkiStar Aktiebolag är 5560936949.
 *
 *   2 = stat, landsting, kommun, församling
 *   5 = aktiebolag
 *   7 = ekonomisk förening, bostadsrättsförening
 *   9 = handelsbolag, kommanditbolag
 *
 * En enskild firma har inget eget organisationsnummer alls — där används
 * innehavarens personnummer, som börjar på 1–4 beroende på födelsedatum och
 * därför inte går att skilja från en myndighet på siffran ensam. Sådana
 * nummer lämnas som 'unknown' och stoppas av importgrindens krav på känd
 * bolagsform för kall kontakt. Det är rätt utfall: en enskild firma är en
 * fysisk person och ska bedömas manuellt.
 */
export function arOffentligOrgnummer(org: string | null | undefined): boolean {
  const n = normaliseraOrgnummer(org)
  return n.length === 10 && n.startsWith('2')
}

export function legalFormFranOrgnummer(org: string | null | undefined): GtmLegalForm {
  const n = normaliseraOrgnummer(org)
  if (n.length !== 10) return 'unknown'
  if (n.startsWith('5')) return 'limited_company'
  if (n.startsWith('7')) return 'association'
  if (n.startsWith('9')) return 'trading_partnership'
  // 2 = offentlig (sållas bort separat), 1–4 = sannolikt personnummer
  return 'unknown'
}

export interface ProspektFranPlatsbanken extends GtmAccountInput {
  /** Annonsens id — så samma annons inte skapar två prospekt. */
  annons_id: string
}

export interface KallaResultat {
  prospekt: ProspektFranPlatsbanken[]
  /** Varför träffar sorterades bort. Visas i förhandsvisningen så det går att
   *  se att sållningen gör vad den ska, i stället för att rader tyst försvinner. */
  bortsorterade: { offentliga: number; utanOrgnummer: number; borttagnaAnnonser: number; dubbletter: number }
}

/**
 * Gör prospekt av Platsbanken-träffar.
 *
 * `tak` finns för att listan ALDRIG ska växa förbi vad en människa hinner
 * ringa. En kö på tiotusen rader är en kö ingen öppnar; hellre 150 bra som
 * faktiskt blir uppringda.
 */
export function traffarTillProspekt(
  traffar: PlatsbankenTraff[],
  options: { nu?: Date; tak?: number } = {},
): KallaResultat {
  const nu = options.nu ?? new Date()
  const tak = options.tak ?? 100
  const kontrolleradAt = nu.toISOString()

  const bortsorterade = { offentliga: 0, utanOrgnummer: 0, borttagnaAnnonser: 0, dubbletter: 0 }
  const settaOrg = new Set<string>()
  const prospekt: ProspektFranPlatsbanken[] = []

  // Nyast först — den färskaste annonsen är den mest aktuella öppningen.
  const sorterade = [...(traffar || [])].sort((a, b) =>
    String(b?.publication_date ?? '').localeCompare(String(a?.publication_date ?? '')))

  for (const traff of sorterade) {
    if (prospekt.length >= tak) break
    if (traff?.removed === true) { bortsorterade.borttagnaAnnonser++; continue }

    const org = normaliseraOrgnummer(traff?.employer?.organization_number)
    const namn = traff?.employer?.name?.trim()
    if (!org || org.length !== 10 || !namn) { bortsorterade.utanOrgnummer++; continue }
    if (arOffentligOrgnummer(org)) { bortsorterade.offentliga++; continue }
    if (settaOrg.has(org)) { bortsorterade.dubbletter++; continue }
    settaOrg.add(org)

    const adress = traff?.workplace_address
    const roll = traff?.occupation?.label || traff?.headline || null

    prospekt.push({
      annons_id: String(traff?.id ?? ''),
      company_name: namn,
      org_number: org,
      legal_form: legalFormFranOrgnummer(org),
      municipality: adress?.municipality || null,
      county: adress?.region || null,
      industry: traff?.occupation_group?.label || null,
      // Källkravet uppfylls här, inte av en människa efteråt.
      source_name: 'Platsbanken (Arbetsförmedlingen)',
      source_url: traff?.webpage_url || null,
      source_checked_at: kontrolleradAt,
      factual_notes: roll
        ? `Annonserade efter ${roll.toLowerCase()} ${String(traff?.publication_date ?? '').slice(0, 10)}.`
        : null,
      // Publik företagsuppgift ur ett myndighetsregister — aldrig en
      // namngiven persons kontaktuppgifter (se filkommentaren).
      contact_basis: 'public_business_contact',
    })
  }

  return { prospekt, bortsorterade }
}
