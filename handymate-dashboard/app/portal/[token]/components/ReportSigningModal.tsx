'use client'

/**
 * ReportSigningModal — placeholder.
 *
 * Fältrapport-signering sker idag via extern signing-sida på
 * `/sign/report/[signature_token]`, INTE inline i portalen.
 * Denna fil är reserverad för framtida inline-signering om/när
 * den flyttas in i portalen, för att matcha samma mönster som
 * QuoteSigningModal.
 *
 * Tas inte i bruk av nuvarande FieldReportsList (som länkar ut
 * till external page). Lämnas här för att hålla komponent-strukturen
 * komplett enligt designspec.
 *
 * När inline-signering implementeras: kopiera mönstret från
 * QuoteSigningModal.tsx och använd SignatureCanvas-komponenten.
 */

export default function ReportSigningModal() {
  // Avsiktligt tom — signing sker externt via /sign/report/[token]
  return null
}
