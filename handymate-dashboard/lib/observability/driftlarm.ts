/**
 * Driftlarm-rapportering — delad helper (2026-08-12).
 *
 * Flera nya fail-safe-vägar (margin-snapshot, debrief-kortet, customer_fact-
 * supersede, morning-brief, ai-quote-generatorns lärdoms-/kundfakta-läsning)
 * degraderar medvetet tyst vid fel — de kastar ALDRIG, men fram tills nu
 * loggade de bara till console.warn/console.error. Det syns i Vercel-
 * loggarna om man råkar leta, men driftlarm-cronen (app/api/cron/driftlarm/
 * route.ts) sveper aldrig dit — den sveper TABELLER, bland dem
 * automation_activity där status='failed' (se filhuvudet där + mönstret i
 * lib/proactive-care.ts, som redan larmar via lib/automations.ts
 * logAutomationActivity).
 *
 * Den här helpern gör samma sak från EN delad plats så varje ny fail-safe-
 * väg kan koppla in sig med ett enda anrop istället för att skriva sin egen
 * Supabase-insert.
 *
 * KONTRAKT: kastar ALDRIG. Ett fel i själva rapporteringen (t.ex. att
 * automation_activity-tabellen saknas, eller ett nätverksfel) loggas till
 * console.error som absolut sista utväg. En trasig larmrapportör får aldrig
 * fälla den kod som anropade den — den koden är per definition redan i sin
 * egen fail-safe-gren.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rapporterar ett tyst fel till driftlarmet genom att skriva en
 * automation_activity-rad med status='failed' — samma tabell och form som
 * driftlarm-cronens automation_activity-svep redan läser (business_id,
 * automation_type, action, description, status, created_at).
 *
 * automation_type sätts till det gemensamma märket 'tyst_fel' så alla
 * rapporter från denna helper går att hitta/filtrera på en plats;
 * `kalla` (t.ex. "margin-snapshot:update" eller "morning-brief:moteskontext")
 * blir `action`-kolumnen så digest-mailet visar exakt vilket kodställe som
 * klagade ("tyst_fel/margin-snapshot:update: <felmeddelande>").
 *
 * @param supabase   Klienten som redan finns i scope hos anroparen.
 * @param businessId Krävs — utan business_id går felet inte att koppla till
 *                    ett företag i digest-mailet. Anropsställen utan
 *                    business_id i scope ska HOPPA ÖVER att anropa denna
 *                    helper, inte gissa ett värde.
 * @param kalla      Varifrån felet kom — fri text, blir `action`-kolumnen.
 * @param fel        Felmeddelandet (redan till text, t.ex. error.message).
 * @param context    Valfri extra data, sparas i `metadata`-kolumnen (JSONB).
 */
export async function rapporteraTystFel(
  supabase: SupabaseClient,
  businessId: string,
  kalla: string,
  fel: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from('automation_activity').insert({
      business_id: businessId,
      automation_type: 'tyst_fel',
      action: kalla,
      description: fel,
      metadata: context || {},
      status: 'failed',
    })
    if (error) {
      // Även detta är "bara logga" — men det är precis vad denna helper
      // finns för att undvika i ANROPARENS kod, inte i sin egen sista gren.
      console.error(
        `[driftlarm-rapportering] kunde inte skriva automation_activity för "${kalla}":`,
        error.message,
      )
    }
  } catch (err) {
    console.error(`[driftlarm-rapportering] kastade oväntat för "${kalla}":`, err)
  }
}

/**
 * Postgres-felkoder för "tabellen/kolumnen finns inte än" — samma
 * konvention som resten av huset (t.ex. lib/agreements/invoice-visit.ts,
 * lib/efterkalkyl/freeze-outcome.ts). Flera av de nya fail-safe-vägarna
 * pekar på tabeller/kolumner (customer_fact, project_lesson,
 * expected_margin_snapshot) vars migration körs manuellt av Andreas EFTER
 * att koden deployats — 42P01/42703 i det fönstret är FÖRVÄNTAT, inte en
 * driftstörning värd att larma om. Riktiga fel (annan felkod, eller inget
 * kod alls — t.ex. ett nätverksfel) ska fortfarande rapporteras.
 *
 * PGRST205 (2026-08-19, OperatingExperiment Etapp 2-utredningen): PostgREST
 * fångar en okänd tabell i sin EGEN schema-cache innan frågan ens når
 * Postgres, och svarar då PGRST205 ("Could not find the table ... in the
 * schema cache") — INTE 42P01. Verifierat empiriskt mot den riktiga demo-
 * databasen (operating_experiment, v157 ej körd): felkoden var PGRST205,
 * inte 42P01. Samma gotcha var redan handplockad lokalt i tre andra filer
 * (lib/business-twin/watch-forecast.ts:isMissingForecastTable m.fl.) innan
 * den fixades här EN gång — alla anropare av arSchemaSaknas (measure.ts,
 * kickoff-candidates.ts, propose-pattern.ts, med flera) får rättelsen utan
 * att röras.
 */
export function arSchemaSaknas(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code
  return code === '42P01' || code === '42703' || code === 'PGRST205'
}
