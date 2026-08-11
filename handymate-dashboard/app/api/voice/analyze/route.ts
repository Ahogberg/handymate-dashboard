import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { getClaudeModel } from '@/lib/ai/get-model'
import { filtreraAnalysforslag, type AnalysForslagsTyp } from '@/lib/voice/analysis-scope'
import { buildDecisionRecord, withDecisionRecord } from '@/lib/ai/decision-record'
import { splitTranscript, MAP_REDUCE_TROSKEL_TECKEN } from '@/lib/meetings/split-transcript'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  })
}

/**
 * Rollfördelningen (etapp 2b): analysmotorn FÖRESLÅR enbart de typer Lisa
 * saknar verktyg för — quote, follow_up, callback, reminder, reschedule.
 * booking, sms och create_customer GÖR Lisa själv i agentkörningen som löper
 * parallellt; producerades de även här blev det två åtgärder på samma mening.
 * Gränsen upprätthålls i kod (filtreraAnalysforslag), inte i prompten.
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
}

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
  t.ex. portkod, bästa telefonnummer).
- "source_text" MÅSTE vara ett ordagrant citat — aldrig en omskrivning.

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
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact)"
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
5. "customer_fact"-fynd: behåll fältet "fact_type" oförändrat. Finns fler än 5
   kvar efter dedupe för hela mötet, behåll bara de 5 med högst confidence —
   resten faller bort.

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
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact)"
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

    let supabase
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
    const { data: recording, error: fetchError } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          customer_id,
          name,
          phone_number,
          email,
          address
        )
      `)
      .eq('recording_id', recording_id)
      .single()

    if (fetchError || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Auth fanns — men ingen jämförelse mellan inloggat företag och
    // inspelningens (2026-08-08). En inloggad kund kunde alltså skicka ett
    // annat företags recording_id och orsaka Claude-analys, ai_suggestion
    // och tryAutoApprove i DEN tenanten. Att vara inloggad någonstans är
    // inte samma sak som att ha rätt till just den här raden.
    if (!internalOk && recording.business_id !== authed!.business_id) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    if (!recording.transcript) {
      return NextResponse.json({
        error: 'No transcript available for analysis'
      }, { status: 400 })
    }

    // Dubbelkörningsspärr. Analysen körs numera ALLTID automatiskt efter
    // transkriberingen — men UI:t har också en Analysera-knapp. Utan spärren
    // hade knappen skapat en andra uppsättning identiska kort (och betalat
    // en Haiku-körning till). Samma samtal analyseras en gång.
    const { data: befintliga } = await supabase
      .from('ai_suggestion')
      .select('suggestion_id, suggestion_type, title, status')
      .eq('recording_id', recording_id)
      .limit(20)

    if (befintliga && befintliga.length > 0) {
      return NextResponse.json({
        success: true,
        recording_id,
        already_analyzed: true,
        summary: recording.transcript_summary || null,
        suggestions_created: 0,
        suggestions: befintliga,
      })
    }

    // Hämta business-info för kontext
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, services_offered, contact_name, industry, service_area')
      .eq('business_id', recording.business_id)
      .single()

    // Hämta leverantörsprodukter för kontext (max 50 vanligaste)
    const { data: products } = await supabase
      .from('supplier_product')
      .select('name, category, sell_price')
      .eq('business_id', recording.business_id)
      .limit(50)

    const productContext = products?.length
      ? `\n\nTILLGÄNGLIGA PRODUKTER/MATERIAL:\n${products.map((p: { name: string; category: string | null; sell_price: number | null }) => `- ${p.name} (${p.category || 'Övrigt'}): ${p.sell_price || '?'} kr`).join('\n')}`
      : ''

    const industry = business?.industry || 'hantverkare'
    const services = Array.isArray(business?.services_offered)
      ? business.services_offered.join(', ')
      : business?.services_offered || 'Hantverkstjänster'

    // Mötesassistenten (etapp 3): ett platsbesök är hantverkarens eget rum,
    // inte ett inkommande samtal. Vinkeln byts — ÄTA/offert och uppföljning
    // föreslås, återuppringning är meningslös (de stod bredvid varandra).
    // Kolumnen kommer med sql/v102; saknas den är allt telefoni som förut.
    const arMote = recording.source === 'site_visit'

    // Förbättrad AI-prompt
    const prompt = `Du är en AI-assistent för en ${industry} i Sverige.
${arMote
  ? 'Läs detta transkript från ett PLATSBESÖK — hantverkaren spelade själv in mötet med kunden på plats. Analysera noggrant.'
  : 'Lyssna på detta transkript från ett kundsamtal och analysera noggrant.'}

=== FÖRETAGSINFORMATION ===
Företag: ${business?.business_name || 'Okänt'}
Bransch: ${industry}
Tjänster: ${services}
Serviceområde: ${business?.service_area || 'Okänt'}
${productContext}

=== SAMTALSINFORMATION ===
${arMote ? 'Typ: PLATSBESÖK — hantverkaren och kunden träffades fysiskt' : `Samtalsriktning: ${recording.direction === 'inbound' ? 'INKOMMANDE (kund ringde)' : 'UTGÅENDE (vi ringde)'}`}
Telefonnummer: ${recording.phone_number || 'Okänt'}
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
- Telefonnummer (from-numret: ${recording.phone_number || 'okänt'})
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
  kontaktuppgift (t.ex. portkod, bästa telefonnummer) → "customer_fact".
  Max 5 per möte. BARA saker som uttryckligen sades — gissa aldrig. Ange
  alltid "fact_type": "preference", "constraint", "commitment" eller
  "contact", och citera ordagrant i source_text.
- Föreslå ALDRIG "callback" — hantverkaren pratade nyss med kunden ansikte
  mot ansikte.
- Innehåller transkriptet ovan tidsstämpel-markörer ([mm:ss] eller
  [h:mm:ss]) — inled source_text med den närmaste markören, t.ex.
  "[05:30] ...", så evidensen blir tidsatt.`
  : `VIKTIGT: En kollega (AI-agenten Lisa) hanterar samma samtal parallellt och
sköter själv bokningar, SMS-bekräftelser och kundregistrering. Föreslå ALDRIG
dessa — då görs samma sak två gånger. Du föreslår ENBART:

- Om pris/jobb diskuterades → "quote" (skapa offert)
- Om "skicka offert" nämndes → "quote" med hög prioritet
- Om kund vill bli återkopplad → "callback" (ring tillbaka)
- Om uppföljning behövs → "follow_up"
- Om något ska påminnas om → "reminder"
- Om kund vill flytta/ändra tid → "reschedule" (flytta bokning)
  Triggerfraser: "kan vi flytta", "passar inte", "annan tid", "ändra tiden", "boka om", "flytta bokningen"`}

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
      "type": "quote|callback|follow_up|reminder|reschedule|customer_fact",
      "title": "Kort titel på svenska",
      "description": "Beskrivning av vad som ska göras",
      "priority": "low|medium|high|urgent",
      "confidence": 0.0-1.0,
      "source_text": "Relevant citat från samtalet",
      "fact_type": "preference|constraint|commitment|contact (endast för customer_fact, endast vid platsbesök)",
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
7. Föreslå ALDRIG booking, sms eller create_customer — de sköts av Lisa
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
    let analysisResult
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

    console.log('Analysis result:', analysisResult)

    // Spara sammanfattningen på inspelningen
    await supabase
      .from('call_recording')
      .update({
        transcript_summary: analysisResult.summary
      })
      .eq('recording_id', recording_id)

    // Om det är en ny kund och vi har info, skapa/uppdatera kund
    const extractedInfo = analysisResult.extracted_info || {}
    let customerId = recording.customer_id

    if (!customerId && extractedInfo.customer_name) {
      // Kolla om kund redan finns med samma telefonnummer
      const { data: existingCustomer } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', recording.business_id)
        .eq('phone_number', recording.phone_number)
        .single()

      if (existingCustomer) {
        customerId = existingCustomer.customer_id
        // Uppdatera med ny info om det finns
        if (extractedInfo.address || extractedInfo.email) {
          await supabase
            .from('customer')
            .update({
              name: extractedInfo.customer_name,
              address: extractedInfo.address || undefined,
              email: extractedInfo.email || undefined
            })
            .eq('customer_id', customerId)
        }
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
    // ═══ MÖTESGRENEN → APPROVAL-RÄLSEN (Epic 2, 2026-08-11) ═══
    //
    // Mötesutfall landar som pending_approvals-kort — INTE i legacy-
    // ai_suggestion (voice-auditens "Epic 6-kärnproblem": två köer på samma
    // transkript). Telefongrenen lämnas orörd nedan. Korten bär evidens
    // (source_text + confidence) och går genom action-kontraktet:
    // create_quote_draft är EXECUTABLE (exekveraren finns), meeting_followup
    // EXECUTABLE → task-rad, meeting_summary INFORMATIONAL.
    if (arMote) {
      let kundNamn: string | null = null
      if (customerId) {
        const { data: kund } = await supabase
          .from('customer')
          .select('name')
          .eq('customer_id', customerId)
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
      for (const s of suggestions) {
        if (s.confidence < 0.4) continue
        const evidens = s.source_text ? ` Ur mötet: "${s.source_text}"` : ''
        if (s.type === 'quote') {
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
              decision_record: beslutsstampel,
            },
          })
        } else if (s.type === 'customer_fact') {
          // Ingen kund härledd → hoppa helt, tyst. Inte ens ett loggat fel —
          // det är ett förväntat läge (möte utan bokningskoppling), inte en bugg.
          if (!factCustomerId) continue
          const kortInnehall = s.description || s.title
          kort.push({
            approval_type: 'customer_fact',
            title: `Matte hörde: ${kortInnehall.length > 60 ? kortInnehall.slice(0, 60) + '…' : kortInnehall}`,
            description: `${s.description || ''}${evidens}`,
            risk_level: 'low',
            payload: {
              customer_id: factCustomerId,
              fact_type: s.fact_type || 'preference',
              content: s.description,
              evidence_quote: s.source_text || null,
              confidence: s.confidence,
              recording_id,
              agent_id: 'matte',
              decision_record: beslutsstampel,
            },
          })
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
              decision_record: beslutsstampel,
            },
          })
        }
      }

      // Sammanfattningskortet — alltid, även när inga förslag hittades.
      // Ärlighet: kortet säger vad som FANNS, aldrig "allt är hanterat".
      kort.unshift({
        approval_type: 'meeting_summary',
        title: kundNamn
          ? `Mötet med ${kundNamn} är sammanfattat — ${kort.length} ${kort.length === 1 ? 'sak' : 'saker'} att ta vidare`
          : `Mötet är sammanfattat — ${kort.length} ${kort.length === 1 ? 'sak' : 'saker'} att ta vidare`,
        description: analysisResult.summary || 'Ingen sammanfattning kunde skapas.',
        risk_level: 'low',
        payload: {
          recording_id,
          customer_id: customerId,
          summary: analysisResult.summary || null,
          forslag: kort.length,
          decision_record: beslutsstampel,
        },
      })

      let skapadeKort = 0
      for (const k of kort) {
        const { error: kortFel } = await supabase.from('pending_approvals').insert({
          id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          business_id: recording.business_id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          ...k,
        })
        if (kortFel) console.error('[voice/analyze] möteskort kunde inte skapas:', kortFel.message)
        else skapadeKort++
      }

      // OBS: tryAutoApprove/processCallForPipeline/triggerEventCommunication
      // körs INTE för möten. Särskilt kommunikationstriggern: nu när möten
      // bär customer_id (P0-fixen) hade den börjat skicka kundkommunikation
      // utifrån ett möte hantverkaren själv satt i — exakt det rummet-
      // principen förbjuder (Lisa-exkluderingen).
      return NextResponse.json({
        success: true,
        recording_id,
        summary: analysisResult.summary,
        cards_created: skapadeKort,
      })
    }

    const createdSuggestions = []

    for (const suggestion of suggestions) {
      // Skippa förslag med låg confidence
      if (suggestion.confidence < 0.4) continue

      // Lägg till extraherad kundinfo i action_data
      const actionData = withDecisionRecord(
        {
          ...suggestion.action_data,
          customer_name: suggestion.action_data?.customer_name || extractedInfo.customer_name,
          phone_number: suggestion.action_data?.phone_number || extractedInfo.phone_number || recording.phone_number,
          address: suggestion.action_data?.address || extractedInfo.address,
          email: suggestion.action_data?.email || extractedInfo.email,
        },
        // SPÅR 1.1: beslutsposten — vilken modell och promptversion som
        // producerade förslaget, plus hash av transkriptet. Utan den går det
        // inte att svara på om samtalsanalysen blir bättre.
        buildDecisionRecord({
          model: analysModell,
          prompt: 'callAnalysis',
          input: recording.transcript,
          now: new Date(),
        })
      )

      const { data: createdSuggestion, error: insertError } = await supabase
        .from('ai_suggestion')
        .insert({
          business_id: recording.business_id,
          recording_id: recording_id,
          customer_id: customerId,
          suggestion_type: suggestion.type,
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          status: 'pending',
          action_data: actionData,
          confidence_score: suggestion.confidence,
          source_text: suggestion.source_text,
          created_at: new Date().toISOString(),
          // Förslag utgår efter 7 dagar om de inte hanteras
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (createdSuggestion) {
        createdSuggestions.push(createdSuggestion)
      }

      if (insertError) {
        console.error('Error creating suggestion:', insertError)
      }
    }

    // Auto-approve: try to auto-execute low-risk suggestions
    const autoApproveResults = []
    try {
      const { tryAutoApprove } = await import('@/lib/auto-approve')
      for (const created of createdSuggestions) {
        const result = await tryAutoApprove({
          suggestionId: created.suggestion_id,
          businessId: recording.business_id,
          actionType: created.suggestion_type,
          confidence: created.confidence_score || 0,
          suggestion: created,
        })
        autoApproveResults.push(result)
      }
    } catch (autoErr) {
      console.error('Auto-approve error (non-blocking):', autoErr)
    }

    // Pipeline integration: process call for pipeline deals
    try {
      const { processCallForPipeline } = await import('@/lib/pipeline-ai')
      if (recording.transcript && recording.business_id) {
        await processCallForPipeline({
          callId: recording_id,
          businessId: recording.business_id,
          transcript: recording.transcript,
          callerPhone: recording.phone_number || '',
        })
      }
    } catch (pipelineError) {
      console.error('Pipeline processing error (non-blocking):', pipelineError)
    }

    // Smart communication: trigger call_completed event
    try {
      if (recording.business_id && recording.customer_id) {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: recording.business_id,
          event: 'call_completed',
          customerId: recording.customer_id,
        })
      }
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    const autoApprovedCount = autoApproveResults.filter(r => r.auto_approved).length

    return NextResponse.json({
      success: true,
      recording_id,
      summary: analysisResult.summary,
      sentiment: analysisResult.customer_sentiment,
      urgency: analysisResult.urgency,
      extracted_info: extractedInfo,
      suggestions_created: createdSuggestions.length,
      suggestions: createdSuggestions,
      auto_approved: autoApprovedCount,
      auto_approve_results: autoApproveResults,
    })

  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({
      error: error.message || 'Analysis failed'
    }, { status: 500 })
  }
}
