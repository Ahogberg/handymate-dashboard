/**
 * En push som inte nådde någon ska aldrig vara tyst.
 *
 * Bakgrund (2026-09-10). Provsamtalen visade att pushvägen fungerar hela
 * vägen fram till sista metern: `sendApprovalPush` bygger rätt text, tyst
 * tid håller den, morgoncronen släpper den. Men mot databasen samma dag:
 *
 *   - `push_subscriptions`: NOLL rader. Inte för Nordström El, inte för något
 *     konto, inte någon gång i historien.
 *   - `push_tokens`: en rad, för ett rollprovskonto.
 *   - `push_held`: två missade samtal från 2026-09-09, båda släppta 05:10
 *     med `release_outcome = 'ingen_mottagare'`.
 *
 * Produkten skrev alltså ner, två gånger, att den inte hade någon att notifiera
 * — och ingen fick veta det. Dagens två samtal lämnade inte ens det spåret:
 * utanför tyst tid går pushen direkt, och `sendApprovalPush` returnerar utan
 * att bokföra när mottagare saknas (medvetet — dedupenyckeln ska inte brännas
 * på ett försök som aldrig kunde nå fram, så att en person som registrerar
 * sin telefon senare samma dag får nästa signal). Rätt rättning är alltså
 * inte att bokföra det, utan att LARMA om det.
 *
 * Och det finns två helt olika skäl bakom "ingen mottagare", som svaret från
 * /api/push/send redan skiljer på men som ingen läste:
 *
 *   1. `webbpush_ej_konfigurerad` — VAPID-nycklarna saknas i miljön. VÅRT fel.
 *      Ingen kund kan göra något åt det, och knappen "Slå på notiser" kan
 *      aldrig lyckas hur många gånger den än trycks.
 *   2. `ingen_registrerad_enhet` — allt är rätt konfigurerat, men kontot har
 *      ingen telefon registrerad. Kundens åtgärd: installera appen och
 *      godkänna notiser.
 *
 * Att slå ihop dem till ett "kunde inte skicka" är samma klass av ohederlighet
 * som notistexten vi rättade samma dag: det låter användaren tro att felet är
 * deras.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

/** Svarsformen från POST /api/push/send som är intressant här. */
export interface PushSandSvar {
  delivered?: boolean
  reason?: string
  channels?: {
    expo?: { attempted?: number; reason?: string }
    web?: { attempted?: number; reason?: string }
  }
}

export type PushMottagarlage =
  | 'har_mottagare'
  | 'ingen_registrerad_enhet'
  | 'webbpush_ej_konfigurerad'

/**
 * Vad svaret betyder. Ren funktion.
 *
 * Ordningen är avsiktlig: saknad konfiguration vinner över saknad enhet.
 * Är VAPID osatt och kontot dessutom utan Expo-token är BÅDA sanna, men bara
 * det första går att åtgärda av oss — och det är det som ska larmas.
 */
export function bedomMottagarlage(svar: PushSandSvar): PushMottagarlage {
  if (svar.delivered === true) return 'har_mottagare'

  const web = svar.channels?.web
  const expo = svar.channels?.expo
  const vapidSaknas = web?.reason === 'vapid_not_configured'
  const ingenExpo = (expo?.attempted ?? 0) === 0

  if (vapidSaknas && ingenExpo) return 'webbpush_ej_konfigurerad'

  const ingenMottagare =
    svar.reason === 'no_recipients' ||
    svar.reason === 'no_matching_token' ||
    ((web?.attempted ?? 0) === 0 && ingenExpo)

  return ingenMottagare ? 'ingen_registrerad_enhet' : 'har_mottagare'
}

/**
 * Sant för de lägen där ingen push kunde nå fram. Typvakt, så anroparen inte
 * behöver casta bort 'har_mottagare' för hand vid larmet.
 */
export function utanMottagare(
  lage: PushMottagarlage,
): lage is Exclude<PushMottagarlage, 'har_mottagare'> {
  return lage !== 'har_mottagare'
}

const SKAL: Record<Exclude<PushMottagarlage, 'har_mottagare'>, { kalla: string; text: string }> = {
  webbpush_ej_konfigurerad: {
    kalla: 'push_ej_konfigurerad',
    text: 'VAPID-nycklarna saknas i miljön — webbpush kan inte skickas till NÅGOT konto och knappen "Slå på notiser" kan aldrig lyckas',
  },
  ingen_registrerad_enhet: {
    kalla: 'push_ingen_registrerad_enhet',
    text: 'kontot har ingen registrerad enhet — notisen skrevs i appen men nådde ingen telefon',
  },
}

/**
 * Larmar om en push som inte nådde någon. Kastar aldrig — en push får aldrig
 * fälla den händelse den handlar om.
 */
export async function larmaPushUtanMottagare(
  supabase: SupabaseClient,
  lage: Exclude<PushMottagarlage, 'har_mottagare'>,
  detaljer: { businessId: string; approvalType: string; pushClass: string; titel?: string },
): Promise<void> {
  const skal = SKAL[lage]
  try {
    await rapporteraTystFel(
      supabase,
      detaljer.businessId,
      skal.kalla,
      `"${detaljer.titel || detaljer.approvalType}" nådde ingen: ${skal.text}`,
      {
        approval_type: detaljer.approvalType,
        push_class: detaljer.pushClass,
        lage,
      },
    )
  } catch (err) {
    console.error('[push-utan-mottagare] larmet kastade (non-blocking):', err)
  }
}
