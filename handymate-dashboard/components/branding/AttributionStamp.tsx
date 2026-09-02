import {
  ATTRIBUTION_BRAND,
  ATTRIBUTION_LINK_COLOR,
  ATTRIBUTION_PREFIX,
  buildAttribution,
  type Attribution,
} from '@/lib/branding/attribution'

/**
 * "Skickat via Handymate" på de publika webbsidorna (kundportal, offertsida,
 * jobbpass, lead-portal, rekommendera, chatt-widget). Systerkomponent till
 * attributionEmailHtml/attributionDocumentHtml i lib/branding/attribution.ts —
 * samma text, samma regler, bara React i stället för en HTML-sträng.
 *
 * Ren presentationskomponent utan server-beroenden: importeras från både
 * server- och klientkomponenter. Underlaget (`attribution`) laddas EN gång
 * per sidvisning i sidans data-route och skickas ner — komponenten hämtar
 * aldrig själv. Saknas det (äldre svar, fel) visas texten utan länk.
 *
 * Länken öppnas i ny flik: kunden ska inte tappa offerten/portalen den står i.
 */
export default function AttributionStamp({
  attribution,
  className,
  linkClassName,
}: {
  attribution?: Attribution | null
  /** Wrapper-klasser (storlek, färg, marginal) — ytan bestämmer sin egen diskretion. */
  className?: string
  /** Klasser på ordet Handymate (länk eller span). Färgen är alltid teal. */
  linkClassName?: string
}) {
  const a = attribution ?? buildAttribution(null)
  return (
    <p className={className}>
      {ATTRIBUTION_PREFIX}
      {a.url ? (
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          style={{ color: ATTRIBUTION_LINK_COLOR, textDecoration: 'none' }}
        >
          {ATTRIBUTION_BRAND}
        </a>
      ) : (
        <span className={linkClassName} style={{ color: ATTRIBUTION_LINK_COLOR }}>
          {ATTRIBUTION_BRAND}
        </span>
      )}
    </p>
  )
}
