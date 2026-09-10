/**
 * Sanna agentstatusar (tasks/plan-sann-agentstatus.md, avsnitt 2 + "Rekommenderat
 * nästa steg"). Modellerad exakt på lib/onboarding/channel-health.ts: en ren
 * härledningsfunktion, en typad tillståndsunion, en central COPY-tabell. Ingen
 * DB-läsning här — anroparen (app/api/dashboard/team-activity/route.ts) hämtar
 * signalerna, den här modulen härleder bara sanningen ur dem.
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Innan denna modul visade agentremsan på Översikt fem hårdkodade "bevakar"-
 * texter helt ogrindat — en agent utan telefonnummer, utan påslagna
 * automationer eller under en global paus såg identisk ut mot en riktigt
 * arbetande agent (grön "Standby"). Samma felklass som Codex-granskningen
 * hittade i `lib/jarvis/bevakning.ts` innan den fick sina grindar.
 *
 * ═══ TILLSTÅNDEN OCH PRIORITETSORDNINGEN ═══
 *
 * 1. `pausad` — `agents_globally_paused` vinner ALLTID, före allt annat.
 *    Ett historiskt "arbetade för en timme sedan" är sant men irrelevant när
 *    kill-switchen är på: agenten gör ingenting nytt förrän den slås på igen.
 * 2. `behover_aktiveras` — agenten saknar en förutsättning för att göra sitt
 *    jobb. Texten står i FRAMTIDSFORM ("så kan hon börja …") — vi lovar vad
 *    som händer när förutsättningen är uppfylld, aldrig att det redan sker:
 *      - Lisa: tilldelat nummer OCH ett verifierat provsamtal
 *        (`onboarding_data.test_call.called_at` — en aktiverad flagga utan
 *        bevis räcker inte, se channel-health.ts-mönstret).
 *      - Daniel: `sms_auto_enabled && sms_quote_followup`. INGET nummerkrav —
        quote-follow-up-cronen läser `assigned_phone_number` bara för SMS-
        signaturen (buildSmsSuffix tål null) och skickar uppföljningar även
        utan tilldelat nummer. Se rättningen 2026-09-10 nedan.
 *      - Karin: fakturadata finns (samma signal som
 *        lib/onboarding/kom-igang-tasks.ts, "Koppla Fortnox eller skicka din
 *        första faktura"). Denna modul har bara verifierade
 *        `business_config`-kolumner tillgängliga och kollar därför enbart
 *        faktureradata (fortnox_connected är inte en av dem) — se
 *        anroparens kommentar i team-activity/route.ts för avvikelsen.
 *      - Hanna: minst en TIDIGARE KUND (`customer.last_job_date` satt) OCH
        `sms_auto_enabled`. Det är exakt poolen hon arbetar ur
        (lib/customers/quiet-customer.ts:fetchQuietCustomers, som
        lib/agents/hanna-outbound.ts hämtar sina kandidater från).
 *      - Lars har INGEN aktiveringsgrind — bokningar och schema kräver
 *        ingen automationsflagga för att existera, så Lars bevakar alltid.
 * 3. `behover_dig` — minst ETT väntande kort är routat till agenten
 *    (samma `agentForApproval`-regel som resten av godkännande-ytan, se
 *    lib/jarvis/approval-view.ts — ingen ny, egen routing-logik här).
 * 4. `arbetar` — minst en händelse senaste 24 timmarna (samma räkning som
 *    redan avgjorde `idle` i team-activity-rutten före denna modul).
 * 5. `bevakar` — inget av ovan, men agenten är aktiverad. Den vakar.
 * 6. `klart` — reserverad för en framtida "färdigt, inget mer att vänta på"-
 *    signal. Härleds INTE av dagens regler (se tests/agent-tillstand.spec.ts)
 *    men finns i unionen och COPY-tabellen så typen är komplett från början
 *    och UI:t aldrig möter ett tillstånd utan text.
 *
 * ═══ RÄTTNING 2026-09-10: TVÅ GRINDAR VILADE PÅ FEL SIGNAL ═══
 *
 * Passet som skrev den här modulen (2026-09-04) gav Daniel ett nummerkrav och
 * Hanna ett kundsegmentkrav. Båda mättes mot produktionen 2026-09-10 och båda
 * var fel — samma felklass som facit redan vaktade för Lisa, fast en nivå upp:
 * signalen hade en skrivare, men den styrde inte agentens arbete.
 *
 *   - Daniel: `quote-follow-up`-cronen kräver inget `assigned_phone_number`.
 *     Numret används bara i `buildSmsSuffix`, som tål null. Med nummerkravet
 *     sa remsan "Daniel är redo, koppla telefonnumret" på 25 av 29 konton —
 *     inklusive båda de betalande — medan cronen samtidigt skickade
 *     uppföljningar.
 *   - Hanna: `customer_segments` är en PRISLISTE-funktion (app/api/pricing/
 *     segments). Ingen av Hannas vägar (`hanna-outbound`, `kapacitet-fyllnad`,
 *     `proactive-care`) läser `segment_id` för att välja kandidater — de utgår
 *     från `customer.last_job_date`. Dessutom seedar ingenting segment: 28 av
 *     29 konton hade noll, så Hanna var permanent "Behöver aktiveras".
 *
 * Lärdomen som facit nu vaktar: en aktiveringsgrind måste vila på en signal
 * agentens EGET produktionsarbete faktiskt läser — inte på en signal som bara
 * ser rimlig ut i en kodgranskning.
 *
 * Lisa FÅNGAR samtal hon annars hade missat — hon svarar aldrig i denna
 * kopia (facit: tests/agent-tillstand.spec.ts). Inga tekniska termer
 * ("automation", "flagga", "webhook" etc.) i någon rad — bara vad kunden ser.
 */

export type AgentId = 'lisa' | 'daniel' | 'karin' | 'lars' | 'hanna'

export type AgentTillstand =
  | 'behover_aktiveras'
  | 'bevakar'
  | 'arbetar'
  | 'behover_dig'
  | 'klart'
  | 'pausad'

export interface AgentTillstandRad {
  tillstand: AgentTillstand
  rad: string
}

interface Aktivitetssignaler {
  /** Antal händelser (samtal, offerter, fakturor, bokningar, utskick) senaste 24h. */
  handelser24h: number
  /** Antal väntande kort routade till agenten (lib/jarvis/approval-view.ts agentForApproval). */
  vantandeKort: number
}

export interface AgentTillstandIndata {
  /** Kill-switchen (business_config.agents_globally_paused) — vinner över allt annat. */
  agentsGloballyPaused: boolean
  lisa: Aktivitetssignaler & {
    /** business_config.assigned_phone_number finns. */
    harNummer: boolean
    /** onboarding_data.test_call.called_at finns — ett riktigt bevisat provsamtal. */
    telefonVerifierad: boolean
  }
  daniel: Aktivitetssignaler & {
    smsAutoEnabled: boolean
    smsQuoteFollowup: boolean
  }
  karin: Aktivitetssignaler & {
    harFakturadata: boolean
  }
  lars: Aktivitetssignaler
  hanna: Aktivitetssignaler & {
    /**
     * Minst en kund med `last_job_date` — en bekräftad tidigare kund. Exakt
     * poolen lib/agents/hanna-outbound.ts arbetar ur (fetchQuietCustomers).
     * Ersatte `harKundsegment` 2026-09-10, se filhuvudet.
     */
    harTidigareKunder: boolean
    smsAutoEnabled: boolean
  }
}

const AGENT_NAMN: Record<AgentId, string> = {
  lisa: 'Lisa',
  daniel: 'Daniel',
  karin: 'Karin',
  lars: 'Lars',
  hanna: 'Hanna',
}

/** Statisk COPY — text som inte beror på ett antal. */
const PAUSAD_RAD: Record<AgentId, string> = {
  lisa: 'Lisa är pausad — slå på agenterna igen i inställningarna så fångar hon samtal igen.',
  daniel: 'Daniel är pausad — slå på agenterna igen i inställningarna så följer han upp offerter igen.',
  karin: 'Karin är pausad — slå på agenterna igen i inställningarna så bevakar hon fakturorna igen.',
  lars: 'Lars är pausad — slå på agenterna igen i inställningarna så håller han koll på schemat igen.',
  hanna: 'Hanna är pausad — slå på agenterna igen i inställningarna så föreslår hon återaktivering igen.',
}

const BEHOVER_AKTIVERAS_RAD: Record<AgentId, string> = {
  lisa: 'Lisa är redo. Verifiera telefonen så kan hon börja fånga missade samtal.',
  daniel: 'Daniel är redo. Slå på automatiska uppföljningar så kan han börja påminna kunder om öppna offerter.',
  karin: 'Karin är redo. Koppla in fakturadata så kan hon börja bevaka betalningarna.',
  // Aldrig härledd idag (Lars har ingen aktiveringsgrind) — text finns ändå
  // så unionen och COPY-tabellen är kompletta, se filhuvudet.
  lars: 'Lars är redo. Boka in ditt första jobb så kan han börja hålla koll på schemat.',
  hanna: 'Hanna är redo. När du har avslutat och fakturerat dina första jobb kan hon börja väcka gamla kunder.',
}

const BEVAKAR_RAD: Record<AgentId, string> = {
  lisa: 'Bevakar telefonen — fångar samtal du missar.',
  daniel: 'Bevakar offerterna — följer upp när det är dags.',
  karin: 'Bevakar fakturorna och betalningarna.',
  lars: 'Bevakar bokningar och projektstatus.',
  hanna: 'Förbereder kampanjer — spanar efter nya leads.',
}

/** Reserverad — se punkt 6 i filhuvudet. Inte härledd av harledAgentTillstand idag. */
const KLART_RAD: Record<AgentId, string> = {
  lisa: 'Lisa har fångat dagens samtal — inget väntar just nu.',
  daniel: 'Daniel har följt upp alla öppna offerter.',
  karin: 'Karin har koll — inga obetalda fakturor väntar.',
  lars: 'Lars har koll — inget bokat kräver din uppmärksamhet.',
  hanna: 'Hanna har inget att föreslå just nu.',
}

const BEHOVER_DIG_RAD = 'Väntar på dig'

function arbetarRad(agent: AgentId, n: number): string {
  switch (agent) {
    case 'lisa': return `Fångade ${n} samtal senaste dygnet`
    case 'daniel': return `${n} offerter hanterade senaste dygnet`
    case 'karin': return `${n} fakturahändelser senaste dygnet`
    case 'lars': return `${n} bokningar uppdaterade senaste dygnet`
    case 'hanna': return `${n} utskick gjorda senaste dygnet`
  }
}

function harledEnAgent(
  agent: AgentId,
  globaltPausad: boolean,
  aktiverad: boolean,
  signaler: Aktivitetssignaler,
): AgentTillstandRad {
  if (globaltPausad) {
    return { tillstand: 'pausad', rad: PAUSAD_RAD[agent] }
  }
  if (!aktiverad) {
    return { tillstand: 'behover_aktiveras', rad: BEHOVER_AKTIVERAS_RAD[agent] }
  }
  if (signaler.vantandeKort > 0) {
    return { tillstand: 'behover_dig', rad: BEHOVER_DIG_RAD }
  }
  if (signaler.handelser24h > 0) {
    return { tillstand: 'arbetar', rad: arbetarRad(agent, signaler.handelser24h) }
  }
  return { tillstand: 'bevakar', rad: BEVAKAR_RAD[agent] }
}

/** Namnet — härlett ur AGENT_NAMN, aldrig hårdkodat på ett andra ställe. */
export function agentNamn(agent: AgentId): string {
  return AGENT_NAMN[agent]
}

/** Exponerad för UI/tester som vill visa "klart"-texten om den någon gång sätts explicit. */
export function klartRad(agent: AgentId): string {
  return KLART_RAD[agent]
}

export function harledAgentTillstand(
  indata: AgentTillstandIndata,
): Record<AgentId, AgentTillstandRad> {
  const paused = indata.agentsGloballyPaused === true

  return {
    lisa: harledEnAgent(
      'lisa',
      paused,
      indata.lisa.harNummer && indata.lisa.telefonVerifierad,
      indata.lisa,
    ),
    daniel: harledEnAgent(
      'daniel',
      paused,
      indata.daniel.smsAutoEnabled && indata.daniel.smsQuoteFollowup,
      indata.daniel,
    ),
    karin: harledEnAgent('karin', paused, indata.karin.harFakturadata, indata.karin),
    // Lars har ingen aktiveringsgrind (se filhuvudet, punkt 2).
    lars: harledEnAgent('lars', paused, true, indata.lars),
    hanna: harledEnAgent(
      'hanna',
      paused,
      indata.hanna.harTidigareKunder && indata.hanna.smsAutoEnabled,
      indata.hanna,
    ),
  }
}
