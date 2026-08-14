/**
 * Inställningarnas sex områden (etapp 2, 2026-08-07).
 *
 * ═══ VARFÖR SEX OMRÅDEN ═══
 *
 * Hubben hade 27 menyval i fyra grupper, plus 23 egna underrutter — varav
 * **elva inte var länkade från hubben alls**. `email-templates` gick inte att nå
 * från någonstans i hela appen.
 *
 * Grupperingen följer nu vad hantverkaren försöker göra, inte var datan ligger.
 * Skillnaden mellan "Företag" och "Bolagsprofil" är vår arkitektur; han tänker
 * bara "mina företagsuppgifter". Namnen är hans: "Pipeline" heter
 * Försäljningsflöde, "Lead-källor" heter Var kunderna kommer från, och
 * AI-assistent + Autopilot + Preferenser + Automationer — som alla beskrev samma
 * sak — samlas under "Så ska teamet jobba".
 *
 * ═══ TVÅ SORTERS POSTER, OCH SKILLNADEN SYNS ═══
 *
 * `href` saknas → posten fälls ut på plats (en flik i sidan).
 * `href` finns  → posten leder till en egen sida med eget innehåll.
 *
 * Att den skillnaden var osynlig var själva förvirringen i den gamla hubben, och
 * den var dessutom orsaken till mobilbuggen: flikremsan filtrerade bort varje
 * post som navigerade bort, så hela offertkonfigurationen saknades på telefon.
 *
 * ═══ DUBBLERINGARNA ═══
 *
 * Fyra funktioner har i dag TVÅ gränssnitt — en inbyggd flik och en egen sida —
 * och de har redan glidit isär. Den separata sidan är sanningskällan i samtliga
 * fall (`supersededBy` pekar ut den).
 *
 * Båda ligger kvar i den här etappen med flit. Att ta bort fliken innan dess
 * innehåll flyttats hade gjort inställningar oåtkomliga — exakt det fel etappen
 * ska rätta. Sammanslagningen av innehållet är ett eget steg.
 *
 * Facit: tests/settings-areas.spec.ts.
 */
import { isLaunchHidden, launchGateForPath } from '@/lib/launch-visibility'

export interface SettingsEntry {
  /** Flik-id i settings/page.tsx, eller ett unikt id för rena länkposter. */
  id: string
  label: string
  /** Vad posten gör, i klartext. Aldrig ett fältnamn. */
  desc: string
  /** Lucide-ikon. */
  icon: string
  /** Finns den → egen sida. Saknas den → fälls ut på plats. */
  href?: string
  /** Ändras sällan men påverkar hur allt annat räknas. Hopfällt som standard. */
  advanced?: boolean
  /** Endast ägare och administratör. */
  ownerOnly?: boolean
  /** Den här posten är den gamla halvan av en dubblering; sanningen finns där. */
  supersededBy?: string
}

export interface SettingsGroup {
  label: string
  entries: SettingsEntry[]
}

export interface SettingsArea {
  key: string
  label: string
  /** En rad som säger vad området rymmer. */
  tagline: string
  icon: string
  groups: SettingsGroup[]
}

/**
 * De sex områdena.
 *
 * **Listan växer inte.** Nya inställningar hamnar inuti ett område, aldrig som
 * ett sjunde. Det är hela skillnaden mot den gamla hubben, som växte varje gång
 * någon byggde något.
 */
export const SETTINGS_AREAS: SettingsArea[] = [
  {
    key: 'foretag',
    label: 'Företag',
    tagline: 'Det kunden ser att du är',
    icon: 'building-2',
    groups: [
      {
        label: 'Uppgifter',
        entries: [
          { id: 'company', label: 'Företagsuppgifter', desc: 'Namn, adress, logotyp och kontaktuppgifter', icon: 'building-2' },
          { id: '_link_bolagsprofil', label: 'Bolagsprofil', desc: 'Bolagsform, momsperiod och räkenskapsår', icon: 'landmark', href: '/dashboard/settings/bolagsprofil', ownerOnly: true },
          { id: 'hours', label: 'Öppettider', desc: 'När ni svarar och när teamet tar över', icon: 'clock' },
        ],
      },
    ],
  },
  {
    key: 'kundkontakt',
    label: 'Kundkontakt',
    tagline: 'Hur teamet pratar med kunder',
    icon: 'phone',
    groups: [
      {
        label: 'Telefon',
        entries: [
          { id: '_link_phone', label: 'Telefoni', desc: 'Nummer, vidarekoppling och installationen', icon: 'phone', href: '/dashboard/settings/phone' },
          { id: 'phone', label: 'Samtalsinställningar', desc: 'Hur samtal hanteras i vardagen', icon: 'phone-call', supersededBy: '/dashboard/settings/phone' },
        ],
      },
      {
        label: 'Meddelanden',
        entries: [
          { id: '_link_email_templates', label: 'E-postmallar', desc: 'Texterna som går ut med mejl till kund', icon: 'mail', href: '/dashboard/settings/email-templates' },
          { id: '_link_reviews', label: 'Recensionsförfrågningar', desc: 'När och hur ni ber om omdöme', icon: 'star', href: '/dashboard/automations' },
        ],
      },
    ],
  },
  {
    key: 'offert',
    label: 'Offerter & fakturor',
    tagline: 'Utseende, texter och priser',
    icon: 'file-text',
    groups: [
      {
        label: 'Dokument & utseende',
        entries: [
          { id: '_link_quote_style', label: 'Dokumentstil', desc: 'Logotyp, färg och typsnitt på PDF:er', icon: 'palette', href: '/dashboard/settings/quote-style' },
          { id: '_link_templates', label: 'Offertmallar', desc: 'Färdiga upplägg för återkommande jobb', icon: 'files', href: '/dashboard/settings/quote-templates' },
          { id: '_link_form_templates', label: 'Formulärmallar', desc: 'Frågorna teamet ställer vid en förfrågan', icon: 'clipboard-list', href: '/dashboard/settings/form-templates' },
        ],
      },
      {
        label: 'Texter du återanvänder',
        entries: [
          { id: '_link_texts', label: 'Standardtexter', desc: 'Inledning, betalning och garanti', icon: 'type', href: '/dashboard/settings/quote-texts' },
          { id: '_link_reservations', label: 'Förbehåll', desc: 'Dolda skador, indexering och liknande', icon: 'shield', href: '/dashboard/settings/reservations' },
        ],
      },
      {
        label: 'Priser',
        entries: [
          { id: '_link_products', label: 'Produkter & priser', desc: 'Raderna teamet räknar med', icon: 'package', href: '/dashboard/settings/products' },
          { id: '_link_my_prices', label: 'Mina priser', desc: 'Timpris och framkörning', icon: 'tag', href: '/dashboard/settings/my-prices' },
        ],
      },
      {
        label: 'Fakturor',
        entries: [
          { id: 'invoice', label: 'Fakturainställningar', desc: 'Betalvillkor och dröjsmålsränta', icon: 'receipt' },
        ],
      },
      {
        label: 'Avancerat',
        entries: [
          { id: '_link_pricing', label: 'Prisstruktur', desc: 'Påslag, zoner och rabattnivåer', icon: 'sliders-horizontal', href: '/dashboard/settings/pricing', advanced: true },
          { id: '_link_categories', label: 'Offertkategorier', desc: 'Hur offerter sorteras i listorna', icon: 'folder-tree', href: '/dashboard/settings/quote-categories', advanced: true },
        ],
      },
    ],
  },
  {
    key: 'arbete',
    label: 'Arbete & ekonomi',
    tagline: 'Tid, kostnad och lönsamhet',
    icon: 'clock',
    groups: [
      {
        label: 'Tid & jobb',
        entries: [
          { id: 'time', label: 'Tidrapportering', desc: 'Hur tid registreras och godkänns', icon: 'clock' },
          { id: '_link_jobtypes', label: 'Jobbtyper', desc: 'De sorters jobb ni tar', icon: 'briefcase', href: '/dashboard/settings/job-types' },
          { id: '_link_agreement_types', label: 'Serviceavtal', desc: 'Återkommande besök och vad de kostar', icon: 'refresh-cw', href: '/dashboard/settings/agreement-types' },
        ],
      },
      {
        label: 'Ekonomi',
        entries: [
          { id: 'economics', label: 'Marginalmål', desc: 'Vad ett jobb ska bära', icon: 'trending-up' },
          { id: '_link_internal_costs', label: 'Intern timkostnad', desc: 'Vad en timme kostar dig', icon: 'calculator', href: '/dashboard/settings/internal-costs', ownerOnly: true },
        ],
      },
      {
        label: 'Avancerat',
        entries: [
          { id: '_link_reservations_calendar', label: 'Reservationer', desc: 'Tider som hålls undan i kalendern', icon: 'calendar-off', href: '/dashboard/settings/reservations', advanced: true },
        ],
      },
    ],
  },
  {
    key: 'team',
    label: 'Så ska teamet jobba',
    tagline: 'Vad de gör själva, vad du godkänner',
    icon: 'sparkles',
    groups: [
      {
        label: 'Arbetssätt',
        entries: [
          { id: 'ai', label: 'Så ska Handymate arbeta', desc: 'Hur mycket teamet gör på egen hand', icon: 'bot' },
          { id: 'autopilot', label: 'Godkännanden', desc: 'Vad som kräver ditt ja innan det går ut', icon: 'clipboard-check' },
          { id: '_link_knowledge', label: 'Kunskap & jobbstil', desc: 'Det teamet lärt sig om ditt företag', icon: 'book-open', href: '/dashboard/settings/knowledge' },
        ],
      },
      {
        label: 'Försäljning',
        entries: [
          { id: 'pipeline', label: 'Försäljningsflöde', desc: 'Stegen ett ärende går igenom', icon: 'trending-up' },
          { id: '_link_leads', label: 'Var kunderna kommer från', desc: 'Källorna ni följer upp', icon: 'link-2', href: '/dashboard/settings/lead-sources' },
        ],
      },
      {
        label: 'Avancerat',
        entries: [
          { id: 'preferences', label: 'Detaljerade inställningar', desc: 'Enskilda värden teamet rättar sig efter', icon: 'star', advanced: true },
          { id: '_link_automations', label: 'Automationer', desc: 'Vad som händer av sig självt', icon: 'zap', href: '/dashboard/automations', advanced: true },
        ],
      },
    ],
  },
  {
    key: 'anslutningar',
    label: 'Anslutningar & konto',
    tagline: 'Det Handymate pratar med',
    icon: 'link',
    groups: [
      {
        label: 'Anslutningar',
        entries: [
          { id: '_link_integrations', label: 'Google, Outlook och Fortnox', desc: 'Kalender, bokföring och mejl', icon: 'link', href: '/dashboard/settings/integrations' },
          { id: 'integrations', label: 'Anslutningsstatus', desc: 'Vad som är kopplat just nu', icon: 'plug', supersededBy: '/dashboard/settings/integrations' },
        ],
      },
      {
        label: 'Konto',
        entries: [
          // FEMTE DUBBLERINGEN, som varken auditen eller designen fångade:
          // BÅDA `/dashboard/billing` och `/dashboard/settings/billing` finns som
          // egna rutter. Den under settings är den tydligare av de två och pekas
          // ut här. Den andra bör avvecklas — men det är en egen städning, inte
          // en sidoeffekt av en menyomstrukturering.
          { id: '_link_billing', label: 'Abonnemang & fakturering', desc: 'Plan, användning och betalningshistorik', icon: 'credit-card', href: '/dashboard/settings/billing' },
          { id: 'subscription', label: 'Nuvarande plan', desc: 'Vad som ingår i din nivå', icon: 'credit-card', supersededBy: '/dashboard/settings/billing' },
          { id: '_link_byt_losenord', label: 'Byt lösenord', desc: 'Ditt eget personliga lösenord', icon: 'key', href: '/dashboard/settings/byt-losenord' },
        ],
      },
      {
        label: 'Avancerat',
        entries: [
          { id: '_link_team', label: 'Team', desc: 'Vilka som har tillgång och till vad', icon: 'users-round', href: '/dashboard/team', advanced: true },
        ],
      },
    ],
  },
]

/** Alla poster, platt. */
export function allEntries(areas: SettingsArea[] = SETTINGS_AREAS): SettingsEntry[] {
  return areas.flatMap(a => a.groups.flatMap(g => g.entries))
}

/**
 * Områdena som de ska visas: lanseringsdolda poster bort, grupper som blir tomma
 * bort, och områden som blir tomma bort.
 *
 * Samma nyckelkälla som sidomenyn och routegrinden — annars kan en funktion vara
 * dold i menyn men fullt synlig här.
 */
export function visibleAreas(opts: { isOwnerOrAdmin: boolean }): SettingsArea[] {
  return SETTINGS_AREAS
    .map(area => ({
      ...area,
      groups: area.groups
        .map(g => ({
          ...g,
          entries: g.entries.filter(e => {
            if (e.ownerOnly && !opts.isOwnerOrAdmin) return false
            if (e.href && isLaunchHidden(launchGateForPath(e.href))) return false
            return true
          }),
        }))
        .filter(g => g.entries.length > 0),
    }))
    .filter(a => a.groups.length > 0)
}

/** Antal poster i ett område, exklusive de avancerade. */
export function primaryCount(area: SettingsArea): number {
  return area.groups.flatMap(g => g.entries).filter(e => !e.advanced).length
}
