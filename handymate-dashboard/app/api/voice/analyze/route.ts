import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { getClaudeModel } from '@/lib/ai/get-model'
import { filtreraAnalysforslag, type AnalysForslagsTyp } from '@/lib/voice/analysis-scope'
import { buildDecisionRecord, withDecisionRecord } from '@/lib/ai/decision-record'
import { buildCustomerFactCard } from '@/lib/customer-facts/build-card'
import { splitTranscript, MAP_REDUCE_TROSKEL_TECKEN } from '@/lib/meetings/split-transcript'
import { checkFuelGate } from '@/lib/costs/fuel'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { claimCallProcessing, callProcessingRpc, publishCallCards, type CallPipelineResult } from '@/lib/voice/call-processing'
import { getPublicPriceList } from '@/lib/products/price-list-view'
import { findCustomerByPhone } from '@/lib/voice/find-customer-by-phone'
import { resolveCallProject } from '@/lib/voice/resolve-call-project'
import { byggAtaUtkast, harPendingAtaForProjekt, shouldSuggestAtaDraft } from '@/lib/ata/suggest-ata-draft'
import { branchWorker, describeBranches, resolveBusinessBranch } from '@/lib/branch'
import { loadTradeContext, formatTradeContextBlock } from '@/lib/branch/trade-context'
import { hamtaKundkontext } from '@/lib/context/kundkontext'

export const maxDuration = 300

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  })
}

/**
 * Efteranalysen FÖRESLÅR endast säkra, reviewbara utfall. Ett kundsamtal är
 * extern input och körs därför aldrig direkt genom den generella verktygs-
 * routern. Gränsen upprätthålls i kod (filtreraAnalysforslag), inte i prompten.
 */
interface AISuggestion {
  type: AnalysForslagsTyp
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  action_data?: Record<string, any>
  confidence: number
  source_text?: string
  // Customer Facts V1 (2026-08-12): bara satt när type === 'customer_fact'.
  fact_type?: 'preference' | 'constraint' | 'commitment' | 'contact'
  // Promise-to-Proof (Etapp N, 2026-08-17): extraktionens datumförslag,
  // bara relevant när fact_type === 'commitment'. Se lib/customer-facts/
  // build-card.ts normalizeDueDateIso för valideringen — gränsen är kod,
  // inte prompttillit.
  due_date_iso?: string | null
}

// Kortbygget för customer_fact är sedan Customer Memory V1.1 (2026-08-16)
// DELAT med e-postgrenen och bor i lib/customer-facts/build-card.ts —
// mötes- och telefongrenen nedan anropar den importerade buildCustomerFactCard.

/**
 * ═══ MAP-REDUCE FÖR LÅNGA MÖTESTRANSKRIPT (Mötesassistenten V2) ═══
 *
 * Ett 90-minutersmöte kan bli ett transkript på tiotusentals tecken — för
 * långt för ett enda Claude-anrop utan att antingen trunkera texten (tyst
 * dataförlust av precis det som spelades in) eller riskera att sprängja
 * context-fönstret. Över MAP_REDUCE_TROSKEL_TECKEN körs i stället:
 *
 *   MAP:    varje transkriptdel (lib/meetings/split-transcript.ts delar på
 *           tidsstämpel-markörerna, aldrig mitt i en mening) analyseras
 *           separat och ger kandidatfynd.
 *   REDUCE: en sista sammanslagningsomgång deduplicerar fynden och
 *           producerar EXAKT samma svarsformat som engångsanropet
 *           (`prompt` nedan) skulle ha gjort — resten av routen (metering,
 *           JSON-parsning, kortbygget) läser bara `response` och `analysisResult`
 *           och märker ingen skillnad mellan de två vägarna.
 */
interface MapReduceFynd {
  type: 'quote' | 'follow_up' | 'reminder' | 'reschedule' | 'customer_fact'
  title: string
  description: string
  source_text: string
  tidsstampel: string | null
  confidence: number
  // Customer Facts V1 (2026-08-12): bara satt när type === 'customer_fact'.
  fact_type?: 'preference' | 'constraint' | 'commitment' | 'contact'
  // Promise-to-Proof (Etapp N, 2026-08-17): se AISuggestion ovan.
  due_date_iso?: string | null
}

/** Plockar ut ett JSON-objekt ur ett AI-svar — svaret är nästan alltid ren
    JSON, men modellen lägger ibland text runt den ändå. */
function parseraJsonSvar(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Could not parse AI response as JSON')
  }
}

/** MAP-steget: extraherar kandidatfynd ur en enskild transkriptdel. */
async function extraheraFyndFranChunk(
  anthropic: Anthropic,
  model: string,
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<{ fynd: MapReduceFynd[]; usage: Anthropic.Usage | null }> {
  const prompt = `Du analyserar DEL ${chunkIndex + 1} av ${totalChunks} av ett transkript från ett hantverkarmöte (platsbesök hos kund). Transkriptdelen innehåller tidsstämpel-markörer som "[mm:ss]" eller "[h:mm:ss]" på egna rader.

=== TRANSKRIPTDEL ===
"""
${chunk}
"""

=== UPPGIFT ===
Extrahera KANDIDATFYND — konkreta saker som diskuterades och kan bli åtgärder. Det här är en delanalys inför en senare sammanslagning, så var generös men konkret: hellre ett extra fynd än att missa något.

Tillåtna typer (ENDAST dessa fem — föreslå ALDRIG "callback", "booking" eller "sms", de hanteras av ett annat system):
- "quote": jobb, pris eller omfattning diskuterades (inkl. ÄTA — tillägg till pågående jobb)
- "follow_up": något ska följas upp efter mötet
- "reminder": något ska påminnas om (beställning, återbesök)
- "reschedule": en inbokad tid diskuterades om
- "customer_fact": kunden eller hantverkaren sa EXPLICIT något om en preferens,
  en begränsning, ett löfte eller en kontaktuppgift (se regler nedan)

Regler för "customer_fact" (striktare än övriga typer):
- BARA saker som uttryckligen sades — gissa eller tolka ALDRIG in något.
- Max 5 per transkriptdel.
- Sätt alltid "fact_type" till ett av: "preference" (önskemål/preferens),
  "constraint" (begränsning, t.ex. tillträdestider, allergier), "commitment"
  (löfte, t.ex. "vi hör av oss senast fredag") eller "contact" (kontaktuppgift,
  t.ex. bästa telefonnummer, föredragen kontaktväg).
- "source_text" MÅSTE vara ett ordagrant citat — aldrig en omskrivning.
- ENDAST för fact_type "commitment": nämns ett datum eller en tidsram
  EXPLICIT för löftet (t.ex. "senast fredag", "imorgon", "den 20 augusti") —
  sätt "due_date_iso" till det datumet i formatet YYYY-MM-DD.
  Gissa ALDRIG ett datum om det inte uttryckligen sades — sätt då
  "due_date_iso" till null. För övriga fact_types: utelämna fältet helt.
- SÄKERHET: extrahera ALDRIG åtkomstkoder — portkoder, larmkoder,
  nyckelgömmor, lösenord eller liknande. Sådant får inte lagras, även om det
  sägs uttryckligen. Hoppa över det helt.

Svara ENDAST med JSON i detta format:
{
  "fynd": [
    {
      "type": "quote|follow_up|reminder|reschedule|customer_fact",
      "title": "Kort titel på svenska",
      "description": "Vad som diskuterades",
      "source_text": "Relevant citat från transkriptdelen",
      "tidsstampel": "Närmaste [mm:ss]-markör i den här delen, eller null",
      "confidence": 0.0-1.0,
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact)",
      "due_date_iso": "YYYY-MM-DD eller null (endast för commitment, ENDAST om datum uttryckligen nämndes)"
    }
  ]
}

Om inget konkret diskuterades i den här delen: returnera {"fynd": []}. Svara ENDAST med JSON, ingen annan text.`

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let fynd: MapReduceFynd[] = []
  try {
    const parsed = parseraJsonSvar(text)
    fynd = Array.isArray(parsed?.fynd) ? parsed.fynd : []
  } catch (parseErr) {
    console.warn('[voice/analyze] map-reduce chunk-parsning misslyckades:', parseErr)
  }

  return { fynd, usage: response.usage }
}

/**
 * REDUCE-steget: slår ihop kandidatfynd från alla delar till exakt samma
 * svarsformat som engångsanropet (summary + suggestions[]).
 */
async function slaIhopFynd(
  anthropic: Anthropic,
  model: string,
  alltFynd: MapReduceFynd[],
): Promise<Anthropic.Message> {
  const prompt = `Du får en lista KANDIDATFYND som extraherats separat ur olika delar av ett långt mötestranskript (hantverkarens platsbesök hos en kund). Flera delar kan ha hittat samma sak, med olika ordval eller detaljnivå.

=== KANDIDATFYND ===
${JSON.stringify(alltFynd, null, 2)}

=== UPPGIFT ===
1. Skriv en kort sammanfattning av mötet baserat på fynden (2-3 meningar, svenska).
2. Deduplicera fynd som beskriver SAMMA sak (samma typ + liknande titel/innehåll) — behåll bara det bäst underbyggda (tydligast source_text, högst confidence).
3. Sätt en prioritet (low/medium/high/urgent) för varje kvarvarande förslag — "urgent" ENDAST vid akuta problem (läcka, strömavbrott etc).
4. Har ett fynd en tidsstämpel (fältet "tidsstampel") — inled dess source_text med den, t.ex. "[05:30] ...", så den syns i det slutgiltiga förslaget.
5. "customer_fact"-fynd: behåll fälten "fact_type" och "due_date_iso"
   OFÖRÄNDRADE — hitta inte på ett datum här, det är redan avgjort i
   kandidatfyndet. Finns fler än 5 kvar efter dedupe för hela mötet, behåll
   bara de 5 med högst confidence — resten faller bort.
6. SÄKERHET: extrahera eller behåll ALDRIG åtkomstkoder — portkoder,
   larmkoder, nyckelgömmor, lösenord eller liknande — i description eller
   source_text. Kasta sådana fynd helt, även om de kom med i kandidatlistan.

Svara ENDAST med JSON i exakt detta format:
{
  "summary": "Kort sammanfattning av mötet på svenska (2-3 meningar)",
  "suggestions": [
    {
      "type": "quote|follow_up|reminder|reschedule|customer_fact",
      "title": "Kort titel på svenska",
      "description": "Beskrivning av vad som ska göras",
      "priority": "low|medium|high|urgent",
      "confidence": 0.0-1.0,
      "source_text": "Relevant citat, med [mm:ss]-prefix om tidsstämpel finns",
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact)",
      "due_date_iso": "YYYY-MM-DD eller null (oförändrat från kandidatfyndet, endast för commitment)"
    }
  ]
}

Fanns inga fynd: returnera tom suggestions-array. Svara ENDAST med JSON, ingen annan text.`

  return anthropic.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })
}

/**
 * Kör hela map-reduce-kedjan för ett långt mötestranskript och returnerar
 * ett svar på SAMMA form som `anthropic.messages.create` skulle gett för
 * engångsanropet — anroparen (POST-handlern) behöver inte veta vilken väg
 * som kördes.
 */
async function runMeetingMapReduce(params: {
  anthropic: Anthropic
  supabase: SupabaseClient
  model: string
  transcript: string
  businessId: string
  recordingId: string
}): Promise<Anthropic.Message> {
  const { anthropic, supabase, model, transcript, businessId, recordingId } = params
  const chunks = splitTranscript(transcript)

  const alltFynd: MapReduceFynd[] = []
  for (let i = 0; i < chunks.length; i++) {
    const { fynd, usage } = await extraheraFyndFranChunk(anthropic, model, chunks[i], i, chunks.length)
    alltFynd.push(...fynd)

    // COGS: varje MAP-anrop mäts för sig — annars syns bara sista/enda
    // anropets kostnad och resten av korten på ett långt möte blir gratis
    // i boken trots att de facto kostade pengar.
    if (usage) {
      try {
        const { meterDirectLlmCall } = await import('@/lib/agents/shared/cost-guard')
        const { llmCostUsd } = await import('@/lib/costs/meter')
        await meterDirectLlmCall({
          supabase,
          businessId,
          usage,
          costUsd: llmCostUsd(usage, model),
          refType: 'call_recording',
          refId: recordingId,
          meta: { prompt: 'meetingMapReduce', chunk: i, chunks: chunks.length },
        })
      } catch (costErr) {
        console.warn('[voice/analyze] map-reduce kostnadsmätning misslyckades:', costErr)
      }
    }
  }

  return slaIhopFynd(anthropic, model, alltFynd)
}

/**
 * Analyserar ett transkriberat samtal med AI och skapar förslag
 * POST body: { recording_id: string }
 */
export async function POST(request: NextRequest) {
  let releaseWork: ((failed: boolean) => Promise<void>) | undefined
  let published = false
  try {
    // Behörighet: antingen inloggat företag (dashboard) eller internt anrop
    // (transcribe-kedjan server-till-server med CRON_SECRET). Routen skrev
    // tidigare kunddata helt oautentiserat på gissningsbart recording_id.
    const authed = await getAuthenticatedBusiness(request)
    const internalOk =
      !!process.env.CRON_SECRET &&
      request.headers.get('x-internal-secret') === process.env.CRON_SECRET
    if (!authed && !internalOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!internalOk) {
      const user = await getCurrentUser(request, authed!.business_id)
      if (!user || !isOwnerOrAdmin(user) || authed!._impersonation) return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
    }

    let supabase: SupabaseClient
    try {
      supabase = getServerSupabase()
    } catch {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const recording_id = body?.recording_id

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    const anthropic = getAnthropic()

    // Hämta inspelningen med transkript
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): customer.address
    // finns inte längre — adressen delades upp i address_line/city/
    // postal_code/region vid någon punkt, men denna embedded PostgREST-
    // query uppdaterades aldrig. Postgres kastade "column customer_1.
    // address does not exist" (42703) på VARJE anrop, vilket i sin tur
    // gjorde att /api/admin/demo-seed-meeting alltid rapporterade
    // "Recording not found" trots att raden fanns — hela analysvägen
    // (telefoni OCH möte) har aldrig kunnat läsa en inspelning.
    const { data: recording, error: fetchError } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          customer_id,
          business_id,
          name,
          phone_number,
          email,
          address_line,
          postal_code,
          city
        )
      `)
      .eq('recording_id', recording_id)
      .single()

    if (recording?.customer) {
      const c = recording.customer as { address_line?: string | null; postal_code?: string | null; city?: string | null }
      ;(recording.customer as { address?: string | null }).address =
        [c.address_line, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null
    }

    if (fetchError || !recording) {
      console.error('[voice/analyze] Recording not found:', { recording_id, fetchError: fetchError?.message, fetchCode: fetchError?.code })
      return NextResponse.json(
        { error: 'Recording not found', debug: { recording_id, fetchError: fetchError?.message || null, fetchCode: fetchError?.code || null } },
        { status: 404 },
      )
    }

    // Auth fanns — men ingen jämförelse mellan inloggat företag och
    // inspelningens (2026-08-08). En inloggad kund kunde alltså skicka ett
    // annat företags recording_id och orsaka Claude-analys, ai_suggestion
    // och tryAutoApprove i DEN tenanten. Att vara inloggad någonstans är
    // inte samma sak som att ha rätt till just den här raden.
    if (!internalOk && recording.business_id !== authed!.business_id) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Service role bypasses RLS; a stored FK is not proof of tenant ownership.
    if (recording.customer_id && (!recording.customer || recording.customer.business_id !== recording.business_id)) {
      return NextResponse.json({ error: 'Kundkopplingen kunde inte verifieras. Kontakta supporten.' }, { status: 409 })
    }

    if (recording.raw_deleted_at) return NextResponse.json({ error: 'Samtalets underlag har gallrats.' }, { status: 410 })
    if (!recording.transcript) {
      return NextResponse.json({
        error: 'No transcript available for analysis'
      }, { status: 400 })
    }

    // V180: claim is atomic; another worker cannot run the lead producer.
    // A cached extraction survives an insert failure. Old batches are NOT
    // declared complete merely because one summary happened to be saved.
    const work = await claimCallProcessing(supabase, recording.business_id, recording_id)
    if (work.status === 'complete') return NextResponse.json({ success: true, already_analyzed: true, recording_id, summary: recording.transcript_summary, suggestions_created: 0 })
    if (work.status !== 'claimed') return NextResponse.json({
      error: work.status === 'legacy' ? 'Äldre samtalsförslag finns. Granska dem innan en ny analys görs.' : 'Samtalet bearbetas redan eller underlaget är gallrat.',
      code: work.status,
    }, { status: 409 })
    const checkpoint = (data: Record<string, unknown>) => callProcessingRpc(supabase, recording.business_id, recording_id, 'checkpoint', work.token, data)
    releaseWork = async (failed) => {
      await callProcessingRpc(supabase, recording.business_id, recording_id, 'release', work.token,
        failed ? { error_code: 'analysis_failed' } : {})
    }
    if (!work.state.result || !work.state.pipeline) {
      const fuel = await checkFuelGate(supabase, recording.business_id)
      if (!fuel.allowed) return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    // Hämta business-info för kontext
    // Branschförståelse steg 1: branschen kommer ur `branch` (onboardingens
    // val) via lib/branch — aldrig ur `industry` som är 'hantverkare' överallt.
    const [{ data: business }, tradeContext] = await Promise.all([
      supabase
        .from('business_config')
        .select('business_name, services_offered, contact_name, branch, secondary_branches, service_area')
        .eq('business_id', recording.business_id)
        .single(),
      loadTradeContext(supabase, recording.business_id).catch(() => null),
    ])

    // B1 (Prisslingan V2): priskontexten läser HANTVERKARENS egna säljpriser
    // ur kanoniska products (sales_price>0) — tidigare lästes
    // supplier_product (grossistpriser, 7 rader totalt i prod) vilket gav
    // efteranalysen fel prisbild.
    const produktRader = await getPublicPriceList(supabase, recording.business_id, { limit: 50 })
      .catch(() => [] as Awaited<ReturnType<typeof getPublicPriceList>>)

    const productContext = produktRader.length
      ? `\n\nHANTVERKARENS PRISLISTA (säljpriser):\n${produktRader.map(p => `- ${p.name}: ${p.unit_price} kr/${p.unit}`).join('\n')}`
      : ''

    const branschRoll = branchWorker(business?.branch).toLowerCase()
    const branschText = describeBranches(tradeContext ?? resolveBusinessBranch(business))
    const branschBlock = tradeContext ? `\n${formatTradeContextBlock(tradeContext)}` : ''
    const services = Array.isArray(business?.services_offered)
      ? business.services_offered.join(', ')
      : business?.services_offered || 'Hantverkstjänster'

    // Mötesassistenten (etapp 3): ett platsbesök är hantverkarens eget rum,
    // inte ett inkommande samtal. Vinkeln byts — ÄTA/offert och uppföljning
    // föreslås, återuppringning är meningslös (de stod bredvid varandra).
    // Kolumnen kommer med sql/v102; saknas den är allt telefoni som förut.
    const arMote = recording.source === 'site_visit'
    // "Ring via Handymate" (2026-09-01): utgående samtal spelas in med kunden
    // som A-ben. Kunden är alltid känd (raden skapades före uppringningen) —
    // därför ingen lead-/deal-kvalificering och ingen "ring tillbaka".
    const arUtgaende = !arMote && recording.direction === 'outbound'
    const samtalsriktning = arUtgaende ? 'UTGÅENDE (hantverkaren ringde upp kunden)' : 'INKOMMANDE (kund ringde)'

    // Kundminnet, pass 3 (lib/context/kundkontext.ts): känd kund vid
    // analystillfället ⇒ samma sammanslagna kontext (företagsfakta +
    // kundfakta/-kanaler + minnen) som chatten/triggern använder, direkt
    // efter branschblocket. Ingen känd kund ⇒ inget block. Fail-soft: ett
    // fel här ska aldrig fälla hela samtalsanalysen.
    let kundkontextBlock = ''
    if (recording.customer_id) {
      try {
        const kundkontext = await hamtaKundkontext(supabase, {
          businessId: recording.business_id,
          customerId: recording.customer_id,
          agentId: arMote ? 'matte' : 'lisa',
        })
        kundkontextBlock = kundkontext.block ? `\n${kundkontext.block}` : ''
      } catch (err) {
        console.error('[voice/analyze] kundkontext kunde inte hämtas (non-blocking):', err)
      }
    }

    // Förbättrad AI-prompt
    const prompt = `Du är en AI-assistent för en ${branschRoll} i Sverige.
${arMote
  ? 'Läs detta transkript från ett PLATSBESÖK — hantverkaren spelade själv in mötet med kunden på plats. Analysera noggrant.'
  : 'Lyssna på detta transkript från ett kundsamtal och analysera noggrant.'}

=== FÖRETAGSINFORMATION ===
Företag: ${business?.business_name || 'Okänt'}
Bransch: ${branschText}
Tjänster: ${services}
Serviceområde: ${business?.service_area || 'Okänt'}${branschBlock}${kundkontextBlock}
${productContext}

=== SAMTALSINFORMATION ===
${arMote ? 'Typ: PLATSBESÖK — hantverkaren och kunden träffades fysiskt' : `Samtalsriktning: ${samtalsriktning}`}
Kundens telefonnummer: ${recording.phone_number || 'Okänt'}
Samtalslängd: ${recording.duration_seconds || 0} sekunder
${recording.customer ? `
Befintlig kund: ${recording.customer.name || 'Ja'}
Kundadress: ${recording.customer.address || 'Ej registrerad'}
Kundemail: ${recording.customer.email || 'Ej registrerad'}
` : 'Ny/okänd kund'}

=== TRANSKRIBERAT SAMTAL ===
"""
${recording.transcript}
"""

=== ANALYSINSTRUKTIONER ===

Analysera samtalet och extrahera följande information:

**1. KUNDINFO**
- Namn (om nämnt i samtalet)
- Telefonnummer (kundens nummer: ${recording.phone_number || 'okänt'})
- Adress (om nämnd - gata, postnummer, ort)
- Email (om nämnd)

**2. JOBBDETALJER**
- Typ av jobb (installation, reparation, service, besiktning, etc)
- Specifikt vad kunden vill ha (t.ex. "3 eluttag i kök", "byta kran i badrum")
- Plats i fastigheten (kök, badrum, garage, etc)
- Eventuella problem/symptom som beskrivs

**3. ÖVERENSKOMMELSER**
- Tid/datum som nämndes ("tisdag", "nästa vecka", "så fort som möjligt", etc)
- Pris som nämndes eller diskuterades
- Eventuella villkor eller förväntningar

**4. MATERIAL SOM KAN BEHÖVAS**
- Lista material baserat på jobbtyp
- Uppskattade kvantiteter om möjligt

**5. SENTIMENT OCH BRÅDSKANDHET**
- Är kunden nöjd, neutral eller missnöjd?
- Är det brådskande (läcka, strömavbrott) eller kan det vänta?

=== FÖRSLAG ===

Baserat på analysen, skapa KONKRETA och ACTIONABLE förslag.
${arMote
  ? `Detta är ett PLATSBESÖK — hantverkaren var själv där. Föreslå det som för
affären framåt efter besöket:

- Om jobb/pris/omfattning diskuterades → "quote" (skapa offert). Nämndes
  TILLÄGG till ett pågående jobb (ÄTA) → "quote" med "ÄTA" i titeln.
- Om material listades → nämn materialen i beskrivningen på quote-förslaget.
- Om något ska följas upp efter besöket → "follow_up"
- Om något ska påminnas om (beställning, återbesök) → "reminder"
- Om en inbokad tid diskuterades om → "reschedule"
- Sa kunden eller hantverkaren EXPLICIT något om en preferens (t.ex.
  tidpreferens, önskemål om utförande), en begränsning (t.ex. tillträdestider,
  allergier), ett löfte (t.ex. "vi hör av oss senast fredag") eller en
  kontaktuppgift (t.ex. bästa telefonnummer, föredragen kontaktväg) →
  "customer_fact". Max 5 per möte. BARA saker som uttryckligen sades — gissa
  aldrig. Ange alltid "fact_type": "preference", "constraint", "commitment"
  eller "contact", och citera ordagrant i source_text.
  ENDAST för fact_type "commitment": nämns ett datum eller en tidsram
  EXPLICIT för löftet (t.ex. "senast fredag", "imorgon", "den 20 augusti") —
  sätt "due_date_iso" till det datumet (YYYY-MM-DD). Gissa ALDRIG ett datum
  om det inte uttryckligen sades — sätt då "due_date_iso" till null.
  SÄKERHET: extrahera ALDRIG åtkomstkoder — portkoder, larmkoder,
  nyckelgömmor, lösenord eller liknande. Sådant får inte lagras, även om det
  sägs uttryckligen. Hoppa över det helt.
- Föreslå ALDRIG "callback" — hantverkaren pratade nyss med kunden ansikte
  mot ansikte.
- Innehåller transkriptet ovan tidsstämpel-markörer ([mm:ss] eller
  [h:mm:ss]) — inled source_text med den närmaste markören, t.ex.
  "[05:30] ...", så evidensen blir tidsatt.`
  : `Detta är ett AVSLUTAT telefonsamtal. Du får bara identifiera vad som
bör granskas av företaget efteråt. Boka, skicka SMS eller skapa kund direkt
utifrån transkriptet ALDRIG. ${arUtgaende
    ? 'Samtalet var UTGÅENDE: hantverkaren ringde upp en redan känd kund. Föreslå "callback" ENBART om kunden uttryckligen bad om att bli uppringd igen — annars aldrig. '
    : ''}Du föreslår ENBART:

- Om pris/jobb diskuterades → "quote" (skapa offert)
- Om "skicka offert" nämndes → "quote" med hög prioritet
- Om kunden vill ha ett tilläggs- eller ändringsarbete på ett PÅGÅENDE jobb
  — kunden vill ha något mer eller annat än det som beställts (t.ex. "kan ni
  ta det andra rummet också", "vi vill byta till större kakel") → "ata".
  Beskriv konkret VAD som ska läggas till eller ändras. Gäller det ett helt
  nytt jobb, inte ett pågående → "quote".
- Om kund vill bli återkopplad → "callback" (ring tillbaka)
- Om uppföljning behövs → "follow_up"
- Om något ska påminnas om → "reminder"
- Om kund vill flytta/ändra tid → "reschedule" (flytta bokning)
  Triggerfraser: "kan vi flytta", "passar inte", "annan tid", "ändra tiden", "boka om", "flytta bokningen"
- Sa kunden eller hantverkaren EXPLICIT något om en preferens (t.ex.
  tidpreferens, önskemål om utförande), en begränsning (t.ex. tillträdestider,
  allergier), ett löfte (t.ex. "vi hör av oss senast fredag") eller en
  kontaktuppgift (t.ex. bästa telefonnummer, föredragen kontaktväg) →
  "customer_fact". Max 5 per samtal. BARA saker som uttryckligen sades — gissa
  aldrig. Ange alltid "fact_type": "preference", "constraint", "commitment"
  eller "contact", och citera ordagrant i source_text.
  ENDAST för fact_type "commitment": nämns ett datum eller en tidsram
  EXPLICIT för löftet (t.ex. "senast fredag", "imorgon", "den 20 augusti") —
  sätt "due_date_iso" till det datumet (YYYY-MM-DD). Gissa ALDRIG ett datum
  om det inte uttryckligen sades — sätt då "due_date_iso" till null.
  SÄKERHET: extrahera ALDRIG åtkomstkoder — portkoder, larmkoder,
  nyckelgömmor, lösenord eller liknande. Sådant får inte lagras, även om det
  sägs uttryckligen. Hoppa över det helt.`}

=== SVARSFORMAT ===

Svara ENDAST med JSON i följande format:

{
  "summary": "Kort sammanfattning av samtalet på svenska (2-3 meningar)",
  "customer_sentiment": "positive|neutral|negative",
  "urgency": "low|normal|high|urgent",
  "extracted_info": {
    "customer_name": "Namn eller null",
    "phone_number": "${recording.phone_number || 'null'}",
    "address": "Adress eller null",
    "email": "Email eller null",
    "job_type": "Typ av jobb",
    "job_description": "Detaljerad beskrivning",
    "location_in_property": "Var i fastigheten",
    "mentioned_date": "Datum/tid som nämndes eller null",
    "mentioned_price": "Pris som nämndes eller null",
    "materials_needed": ["Lista", "av", "material"]
  },
  "suggestions": [
    {
      "type": "quote|callback|follow_up|reminder|reschedule|customer_fact|ata",
      "title": "Kort titel på svenska",
      "description": "Beskrivning av vad som ska göras",
      "priority": "low|medium|high|urgent",
      "confidence": 0.0-1.0,
      "source_text": "Relevant citat från samtalet",
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact)",
      "due_date_iso": "YYYY-MM-DD eller null (endast för commitment, ENDAST om datum uttryckligen nämndes)",
      "action_data": {
        "customer_name": "Namn om känt",
        "phone_number": "Telefon",
        "address": "Adress om känd",
        "service": "Typ av tjänst",
        "date": "YYYY-MM-DD om känt",
        "time": "HH:MM om känt",
        "estimated_price": "Uppskattat pris",
        "message_template": "SMS-meddelande för sms-typ",
        "reason": "Anledning för callback/follow_up"
      }
    }
  ]
}

=== REGLER ===

1. Ge ENDAST förslag baserade på vad som faktiskt diskuterades
2. Om kunden nämner något specifikt, citera det i source_text
3. Confidence ska reflektera hur tydligt det framgår i samtalet
4. Om inget konkret diskuterades, returnera tom suggestions-array
5. Prioritera "quote" om kunden har ett aktivt behov
6. "urgent" prioritet ENDAST vid akuta problem (läcka, strömavbrott, etc)
7. Föreslå ALDRIG booking, sms eller create_customer — de kräver en separat, säker verkställighetsväg
8. Svara ENDAST med JSON, ingen annan text före eller efter`

    // Fångad i variabel så beslutsposten stämplar modellen som FAKTISKT
    // användes — inte den vi tror används vid läsning senare.
    const analysModell = getClaudeModel('background')

    // Långa mötestranskript (platsbesök, ofta 60-90 min) kan bli så stora
    // att ett enda anrop antingen trunkerar eller spränger context-
    // fönstret. Över tröskeln körs map-reduce (funktionerna ovan) i
    // stället — resultatet landar i samma `response`-form som engångs-
    // anropet, så allt nedanför (metering, JSON-parsning, kortbygge) är
    // omedvetet om vilken väg som kördes.
    const anvandMapReduce = arMote && recording.transcript.length > MAP_REDUCE_TROSKEL_TECKEN

    let analysisResult = work.state.result
    if (!analysisResult) {
    const response = anvandMapReduce
      ? await runMeetingMapReduce({
          anthropic,
          supabase,
          model: analysModell,
          transcript: recording.transcript,
          businessId: recording.business_id,
          recordingId: recording_id,
        })
      : await anthropic.messages.create({
          // Post-call analys av transkript — background extraction (kunden har redan
          // lagt på). JSON-output gör Haiku lämplig. Sonnet behövdes inte här.
          // Möten får dubbla tokentaket: transkriptet är längre och
          // suggestions-listan kan bli större än ett telefonsamtal.
          model: analysModell,
          max_tokens: arMote ? 4000 : 2000,
          messages: [{ role: 'user', content: prompt }]
        })

    // COGS (P0-fix 2026-08-11): analysanropet gick förbi cost-guard och var
    // helt omätt — Whisper bokfördes men inte Haiku. Mätningen bor i
    // cost-guard (enda tillåtna llm-skrivaren per cogs-facit) och får
    // aldrig fälla analysen.
    try {
      const { meterDirectLlmCall } = await import('@/lib/agents/shared/cost-guard')
      const { llmCostUsd } = await import('@/lib/costs/meter')
      await meterDirectLlmCall({
        supabase,
        businessId: recording.business_id,
        usage: response.usage,
        costUsd: llmCostUsd(response.usage, analysModell),
        refType: 'call_recording',
        refId: recording_id,
        meta: { prompt: 'callAnalysis', source: recording.source || 'phone' },
      })
    } catch (costErr) {
      console.warn('[voice/analyze] kostnadsmätning misslyckades:', costErr)
    }

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extrahera JSON från svaret
    try {
      // Försök parsa hela svaret som JSON
      analysisResult = JSON.parse(responseText)
    } catch {
      // Om det misslyckas, försök hitta JSON i texten
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse AI response as JSON')
      }
    }

    if (!analysisResult || typeof analysisResult.summary !== 'string' || !Array.isArray(analysisResult.suggestions)) {
      throw new Error('Analysen saknade ett läsbart resultat. Försök igen.')
    }
    await checkpoint({ result: analysisResult })
    }

    // Om det är en ny kund och vi har info, skapa/uppdatera kund
    const extractedInfo = analysisResult.extracted_info || {}
    let customerId = recording.customer_id

    if (!customerId && recording.phone_number) {
      // Kolla om kund redan finns med samma telefonnummer (rå + E.164 + fallback)
      const existingCustomer = await findCustomerByPhone(supabase, recording.business_id, recording.phone_number)

      if (existingCustomer) {
        customerId = existingCustomer.customer_id
        // Caller-ID is a candidate, never authority to overwrite contact details.
      }
    }

    // ═══ GRÄNSEN ÄR KOD, INTE PROMPTTILLIT ═══
    //
    // Prompten ber modellen hålla sig till de fem typer Lisa saknar verktyg
    // för — men det som skyddar hantverkaren från dubbelåtgärder (Lisa bokar
    // mötet OCH ett "boka in mötet"-kort skapas) är filtret här. Det som
    // kastas loggas, så en modell som börjar svamla syns i loggen.
    const { tillatna: suggestions, kastade } = filtreraAnalysforslag<AISuggestion>(
      analysisResult.suggestions || []
    )
    if (kastade.length > 0) {
      console.warn(
        `[voice/analyze] ${kastade.length} förslag utanför analysmotorns område kastades:`,
        kastade.map(k => k.type).join(', ')
      )
    }
    // ═══ EN APPROVAL-RÄLS FÖR ALLT TAL ═══
    //
    // Telefoni och platsbesök landar nu i samma action contract. Telefoni
    // kvalificerar först eventuell ny kund/lead/deal via Golden Path, men
    // inget offert-, uppföljnings- eller kundfaktautfall verkställs direkt
    // från ett externt transkript. Det gamla ai_suggestion/auto-approve-
    // sidospåret är därmed borta ur den körande vägen.
    let pipelineResult: CallPipelineResult | null = work.state.pipeline || null
    let pipelineFailed = false

    // Utgående samtal: kunden är känd sedan raden skapades — ingen lead-/deal-
    // kvalificering (skulle annars kunna skapa en dubblettaffär på en kund
    // hantverkaren själv ringde upp).
    if (!arMote && !arUtgaende) {
      try {
        const { processCallForPipeline } = await import('@/lib/pipeline-ai')
        pipelineResult = pipelineResult || await processCallForPipeline({
          callId: recording_id,
          businessId: recording.business_id,
          transcript: recording.transcript,
          callerPhone: recording.phone_number || '',
          summary: analysisResult.summary,
        })
        await checkpoint({ pipeline: pipelineResult })
        if (!customerId && pipelineResult.customerId) {
          customerId = pipelineResult.customerId
          const { error: kopplingsFel } = await supabase
            .from('call_recording')
            .update({ customer_id: customerId })
            .eq('recording_id', recording_id)
            .eq('business_id', recording.business_id)
          if (kopplingsFel) {
            throw kopplingsFel
          }
        }
      } catch (pipelineError) {
        // Analysen och sammanfattningskortet är fortfarande värdefulla. Vi
        // påstår aldrig att leadet skapades; felet syns i svaret/loggen.
        console.error('[voice/analyze] pipeline-kvalificering misslyckades:', pipelineError)
        pipelineFailed = true
      }
    }
    if (customerId && customerId !== recording.customer_id) {
      const { error: linkError } = await supabase.from('call_recording').update({ customer_id: customerId })
        .eq('business_id', recording.business_id).eq('recording_id', recording_id)
      if (linkError) throw linkError
    }

    // Samtalsefterarbete (2026-09-01): vilket projekt gäller samtalet? Delas
    // av ÄTA-utkastet och dagbokskortet nedan. null = entydigt projekt saknas,
    // då skapas inget projektbundet kort (aldrig gissa).
    const samtalsProjekt = await resolveCallProject(supabase, {
      businessId: recording.business_id,
      recording: { project_id: recording.project_id, booking_id: recording.booking_id },
      customerId,
    })

    {
      let routedBusinessUserId: string | null = null
      if (arUtgaende && recording.initiated_by_user_id) {
        // Den som ringde får sammanfattningen — men bara om personen fortfarande
        // är en aktiv användare i företaget (aldrig push till ett främmande id).
        const { data: ringare } = await supabase
          .from('business_users')
          .select('id')
          .eq('business_id', recording.business_id)
          .eq('id', recording.initiated_by_user_id)
          .eq('is_active', true)
          .maybeSingle()
        routedBusinessUserId = ringare?.id || null
      }
      if (!arMote && !routedBusinessUserId) {
        const { data: owner } = await supabase
          .from('business_users')
          .select('id')
          .eq('business_id', recording.business_id)
          .eq('is_active', true)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle()
        routedBusinessUserId = owner?.id || null
      }

      let kundNamn: string | null = null
      if (customerId) {
        const { data: kund } = await supabase
          .from('customer')
          .select('name')
          .eq('customer_id', customerId)
          .eq('business_id', recording.business_id)
          .maybeSingle()
        kundNamn = kund?.name || null
      }

      // Customer Facts V1 (2026-08-12): ett fakta-kort får ALDRIG skapas utan
      // en säkert härledd kund. recording.customer_id (customerId ovan) kan
      // vara null för ett fysiskt platsbesök som spelades in utan
      // telefonkoppling — men bokningen känner ofta kunden ändå
      // (call_recording.booking_id → booking.customer_id, v118). Hittas
      // ingen kund här hoppas fakta-extraktionen tyst över nedan — ingen
      // gissning, inget kort på fel kund.
      let factCustomerId: string | null = customerId || null
      if (!factCustomerId && recording.booking_id) {
        const { data: koppladBokning } = await supabase
          .from('booking')
          .select('customer_id')
          .eq('booking_id', recording.booking_id)
          .eq('business_id', recording.business_id)
          .maybeSingle()
        factCustomerId = koppladBokning?.customer_id || null
      }

      const beslutsstampel = buildDecisionRecord({
        model: analysModell,
        prompt: 'callAnalysis',
        input: recording.transcript,
        now: new Date(),
      })

      const kort: Array<Record<string, unknown>> = []
      let utelamnadeUtanKund = 0
      // Samtalsefterarbete (2026-09-01): ÄTA-dedupen (samma fråga som
      // suggestAtaDraft) slås upp EN gång per samtal, lazy — bara när modellen
      // faktiskt föreslog en "ata". Ett projekt ska aldrig ha två väntande
      // ÄTA-förslag, varken från samtalet, Daniel eller Matte. Går uppslaget
      // fel behandlas det som "pending finns" (fail-closed → uppföljningskort).
      let ataPendingForProjekt: boolean | null = null
      let ataKortIBatchen = false
      for (let suggestionIndex = 0; suggestionIndex < suggestions.length; suggestionIndex++) {
        const s = suggestions[suggestionIndex]
        if (s.confidence < 0.4) continue
        const kallform = arMote ? 'mötet' : 'samtalet'
        const evidens = s.source_text ? ` Ur ${kallform}: "${s.source_text}"` : ''
        if (s.type === 'ata') {
          // ÄTA-utkast ur samtalet — ENBART med ett entydigt projekt
          // (resolveCallProject gissar aldrig), utan väntande ÄTA-kort för
          // projektet och högst ett per samtal. Allt annat faller igenom som
          // uppföljning nedan: behovet försvinner inte, men vi skapar aldrig
          // ett utkast på ett projekt vi bara tror att samtalet gällde.
          let utkast: Awaited<ReturnType<typeof byggAtaUtkast>> = null
          if (samtalsProjekt && !ataKortIBatchen) {
            if (ataPendingForProjekt === null) {
              ataPendingForProjekt = await harPendingAtaForProjekt(
                supabase, recording.business_id, samtalsProjekt.project_id,
              ).catch(() => true)
            }
            const ataDescription = [s.description, s.source_text].filter(Boolean).join('\n\n')
            if (shouldSuggestAtaDraft({
              projectId: samtalsProjekt.project_id,
              description: ataDescription,
              hasPendingAtaForProject: ataPendingForProjekt,
            })) {
              utkast = await byggAtaUtkast(supabase, {
                businessId: recording.business_id,
                projectId: samtalsProjekt.project_id,
                description: ataDescription,
                customerContext: s.source_text || null,
                customerId: customerId || null,
                routedAgent: 'daniel',
              })
            }
          }
          if (utkast && samtalsProjekt) {
            ataKortIBatchen = true
            kort.push({
              approval_type: 'create_ata_draft',
              title: utkast.title,
              description: `${utkast.description}${evidens}`,
              risk_level: 'low',
              payload: {
                ...utkast.payload,
                recording_id,
                source_text: s.source_text || null,
                confidence: s.confidence,
                // Fast nyckel (inte suggestion:index) — högst ett ÄTA-kort
                // per samtal, och samma id vid en omkörning.
                call_card_key: 'ata',
                decision_record: beslutsstampel,
              },
            })
            continue
          }
          kort.push({
            approval_type: 'meeting_followup',
            title: `Förbered ÄTA: ${s.title}`,
            description: `${s.description || ''}${evidens}`,
            risk_level: 'low',
            payload: {
              title: `Förbered ÄTA: ${s.title}`,
              description: s.description || null,
              source_text: s.source_text || null,
              confidence: s.confidence,
              priority: s.priority || 'medium',
              customer_id: customerId,
              recording_id,
              ...(samtalsProjekt ? { project_id: samtalsProjekt.project_id } : {}),
              routed_agent: 'lisa',
              ...withDecisionRecord({}, beslutsstampel),
            },
          })
        } else if (s.type === 'quote') {
          // Offertutkastets exekverare behöver en tenant-verifierad kund.
          // Om lead-automationen är avstängd visar sammanfattningen fyndet,
          // men vi skapar inte ett kort som garanterat skulle fallera.
          if (!customerId) {
            utelamnadeUtanKund++
            continue
          }
          kort.push({
            approval_type: 'create_quote_draft',
            title: s.title,
            description: `${s.description || ''}${evidens}`,
            risk_level: 'high',
            payload: {
              description: [s.description, s.source_text].filter(Boolean).join('\n\n'),
              entity: { customerId },
              source_text: s.source_text || null,
              confidence: s.confidence,
              recording_id,
              lead_id: pipelineResult?.leadId || null,
              routed_agent: 'daniel',
              // Kanoniska nyckeln (_decision) via withDecisionRecord — annars
              // kan readDecisionRecord() aldrig läsa tillbaka stämpeln
              // (facit: tests/decision-record.spec.ts, producent-blocket).
              ...withDecisionRecord({}, beslutsstampel),
            },
          })
        } else if (s.type === 'customer_fact') {
          // Ingen kund härledd → hoppa helt, tyst. Inte ens ett loggat fel —
          // det är ett förväntat läge (möte utan bokningskoppling), inte en bugg.
          if (!factCustomerId) continue
          kort.push(buildCustomerFactCard(s, {
            customerId: factCustomerId,
            recordingId: recording_id,
            decisionRecord: beslutsstampel,
            evidensKalla: arMote ? 'mötet' : 'samtalet',
          }))
        } else {
          // follow_up / reminder / reschedule → uppföljningskort → task.
          kort.push({
            approval_type: 'meeting_followup',
            title: s.type === 'reschedule' ? `Omboka: ${s.title}` : s.title,
            description: `${s.description || ''}${evidens}`,
            risk_level: 'low',
            payload: {
              title: s.type === 'reschedule' ? `Omboka: ${s.title}` : s.title,
              description: s.description || null,
              source_text: s.source_text || null,
              confidence: s.confidence,
              priority: s.priority || 'medium',
              customer_id: customerId,
              recording_id,
              routed_agent: 'lisa',
              // Kanoniska nyckeln (_decision) via withDecisionRecord — annars
              // kan readDecisionRecord() aldrig läsa tillbaka stämpeln
              // (facit: tests/decision-record.spec.ts, producent-blocket).
              ...withDecisionRecord({}, beslutsstampel),
            },
          })
        }
        const lastCard = kort[kort.length - 1]
        lastCard.payload = { ...(lastCard.payload as Record<string, unknown>), call_card_key: `suggestion:${suggestionIndex}` }
      }

      if (pipelineResult?.action === 'review_required') {
        kort.push({ approval_type: 'meeting_followup', title: 'Kontrollera vilken affär samtalet gäller',
          description: pipelineResult.reviewReason, risk_level: 'low',
          payload: { title: 'Kontrollera vilken affär samtalet gäller', description: pipelineResult.reviewReason,
            recording_id, customer_id: customerId, routed_agent: 'lisa', call_card_key: 'pipeline-review' } })
      }

      // Samtalsefterarbete (2026-09-01): dagboksraden. Samtalet blir en
      // project_log-rad NÄR hantverkaren godkänner — bara med ett entydigt
      // projekt (resolveCallProject). Läggs sist i batchen (efter förslagen,
      // före unshift av sammanfattningen så att "N saker att ta vidare"
      // räknar med det); 40-taket i RPC:n hotas inte av ett enda kort.
      if (samtalsProjekt) {
        kort.push({
          approval_type: 'project_log_note',
          title: `Lägg samtalet i dagboken för ${samtalsProjekt.name || 'projektet'}`,
          description: analysisResult.summary || 'Ingen sammanfattning kunde skapas.',
          risk_level: 'low',
          payload: {
            recording_id,
            project_id: samtalsProjekt.project_id,
            project_name: samtalsProjekt.name,
            customer_id: customerId,
            summary: analysisResult.summary || null,
            call_date: recording.created_at || null,
            routed_agent: 'matte',
            call_card_key: 'diary',
            decision_record: beslutsstampel,
          },
        })
      }

      // Sammanfattningskortet — alltid, även när inga förslag hittades.
      // Ärlighet: kortet säger vad som FANNS, aldrig "allt är hanterat".
      kort.unshift({
        approval_type: 'meeting_summary',
        title: arMote
          ? (kundNamn
              ? `Mötet med ${kundNamn} är sammanfattat — ${kort.length} ${kort.length === 1 ? 'sak' : 'saker'} att ta vidare`
              : `Mötet är sammanfattat — ${kort.length} ${kort.length === 1 ? 'sak' : 'saker'} att ta vidare`)
          : (kundNamn
              ? `Lisa har sammanfattat ${arUtgaende ? 'ditt samtal' : 'samtalet'} med ${kundNamn}`
              : `Lisa har sammanfattat ett ${arUtgaende ? 'utgående' : 'inkommande'} samtal`),
        description: [
          analysisResult.summary || 'Ingen sammanfattning kunde skapas.',
          utelamnadeUtanKund > 0
            ? `${utelamnadeUtanKund} förslag kräver att kunden först kopplas till samtalet.`
            : null,
        ].filter(Boolean).join(' '),
        risk_level: 'low',
        payload: {
          recording_id,
          customer_id: customerId,
          source: arMote ? 'site_visit' : 'phone_call',
          direction: arMote ? null : (arUtgaende ? 'outbound' : 'inbound'),
          summary: analysisResult.summary || null,
          forslag: kort.length,
          pipeline_action: pipelineResult?.action || null,
          lead_id: pipelineResult?.leadId || null,
          deal_id: pipelineResult?.dealId || null,
          // RPC:n skriver om deal_id ur pipeline-checkpointen vid publish; den
          // affär ett utgående samtal ringdes FRÅN bärs därför i eget fält.
          call_deal_id: recording.deal_id || null,
          routed_agent: arMote ? 'matte' : 'lisa',
          decision_record: beslutsstampel,
        },
        ...(!arMote && routedBusinessUserId ? { routed_business_user_id: routedBusinessUserId } : {}),
      })

      const batch = await publishCallCards(supabase, recording.business_id, recording_id, work.token, kort, pipelineFailed)
      published = true
      // Single notification AFTER every proposal is durable. No customer text on
      // the lock screen; no broadcast when the recipient cannot be resolved.
      if (!arMote && routedBusinessUserId) {
        const notice = await callProcessingRpc(supabase, recording.business_id, recording_id, 'notify', work.token)
        if (notice.claimed) await sendApprovalPush({
          business_id: recording.business_id, approval_type: 'meeting_summary',
          payload: { recording_id, source: 'phone_call' }, risk_level: kort.some(k => k.risk_level === 'high') ? 'high' : 'low',
          routed_business_user_id: routedBusinessUserId,
        })
      }

      // Smart communication körs medvetet inte här. Ett transkript är evidens
      // till ägarens granskningskort, aldrig ett självständigt kundutskick.
      return NextResponse.json({
        success: !pipelineFailed,
        recording_id,
        summary: analysisResult.summary,
        cards_created: batch.cards_created,
        suggestions_created: batch.cards_created,
        pipeline: pipelineResult,
        ...(pipelineFailed ? { error: 'Sammanfattningen är sparad, men affärskopplingen kunde inte slutföras. Försök igen.', partial: true } : {}),
      }, { status: pipelineFailed ? 503 : 200 })
    }

  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({
      error: error.message || 'Analysis failed'
    }, { status: 500 })
  } finally {
    if (releaseWork) await releaseWork(!published).catch(() => console.error('[voice/analyze] bearbetningslåset kunde inte släppas; tidsgränsen frigör det'))
  }
}
