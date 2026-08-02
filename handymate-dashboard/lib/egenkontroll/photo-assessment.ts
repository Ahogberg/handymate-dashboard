/**
 * Egenkontroll-agenten — Etapp 1a (v-plan tasks/easoft-gap-plan.md).
 *
 * Ren kärna: bedömer ett projektfoto mot en checklistas punkter via Claude
 * Vision. INGEN DB, INGEN kö-integration, INGA API-routes här — det är
 * etapp 1b/1c. Mönster: lib/efterkalkyl/freeze-outcome.ts (ren, testbar
 * kärna + fail-safe orkestrering som aldrig kastar mot anroparen).
 *
 * ChecklistPunkt-formen är verifierad mot faktisk kod (inte bara schema):
 *   - lib/checklist-defaults.ts (ChecklistItem: { id, text, required, checked })
 *   - app/api/projects/[id]/checklists/route.ts (project_checklist.items JSONB
 *     läses/skrivs rakt av med samma fält, ingen transformation)
 *   - app/dashboard/projects/[id]/page.tsx rad ~3654/5354 (item.id, item.text,
 *     item.checked, item.required används direkt i UI)
 * dvs. `checked` är relevant för UI-state men ointressant för fotobedömning
 * (vi bedömer fotot mot punktens TEXT, inte mot ifall den redan är ikryssad).
 *
 * JURIDIK (kritiskt, se planens "Får inte"-lista): bedömningen är ENDAST
 * ett underlag för hantverkarens eget beslut. Vi påstår ALDRIG att något är
 * "godkänt enligt besiktningskrav" eller "godkänt av AI" — se
 * buildAssessmentPrompt() och juridik-stycket i systemprompten.
 *
 * FAIL-SAFE (kritiskt): assessPhotoAgainstChecklist() kastar ALDRIG.
 * Fotoanalysen får aldrig blockera uppladdningsflödet som anropar den —
 * värsta fallet är att alla punkter blir 'ej_bedombar'.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getClaudeModel } from '@/lib/ai/get-model'

// ─────────────────────────────────────────────────────────────────
// Typer
// ─────────────────────────────────────────────────────────────────

/** Delmängd av lib/checklist-defaults.ts ChecklistItem — bara det
    fotobedömningen faktiskt behöver (id + text att bedöma mot). Verkliga
    checklist-rader har fler fält (checked, ev. extra), strukturell typning
    gör att de går att skicka in rakt av. */
export interface ChecklistPunkt {
  id: string
  text: string
  required?: boolean
}

export type PunktStatus = 'stods' | 'motsags' | 'ej_synlig' | 'ej_bedombar'
export type Konfidens = 'hog' | 'medel' | 'lag'

export interface PunktBedömning {
  punktId: string
  status: PunktStatus
  motivering: string
  konfidens: Konfidens
}

export type ImageSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; url: string }

export interface PhotoAssessmentInput {
  imageSource: ImageSource
  checklistItems: ChecklistPunkt[]
  /** Ev. bildtext/kommentar hantverkaren skrev vid uppladdning. */
  photoContext?: string
}

export interface AssessmentUsage {
  input_tokens: number
  output_tokens: number
}

export interface PhotoAssessmentResult {
  bedömningar: PunktBedömning[]
  usage?: AssessmentUsage
  estimated_cost_usd?: number
}

// ─────────────────────────────────────────────────────────────────
// buildAssessmentPrompt — ren funktion
// ─────────────────────────────────────────────────────────────────

export interface AssessmentPrompt {
  systemPrompt: string
  userText: string
}

/**
 * Bygger systemprompt + user-text för fotobedömningen. Ren funktion, ingen
 * I/O. Instruerar modellen att:
 *  - bedöma VARJE punkt (stöds/motsägs/ej_synlig/ej_bedombar)
 *  - ALDRIG gissa — "ej_synlig" hellre än en lågkonfidensgissning
 *  - ALDRIG formulera sig som "godkänt enligt besiktningskrav" (juridik)
 *  - svara i strikt JSON enligt ett exakt angivet schema, på svenska
 */
export function buildAssessmentPrompt(items: ChecklistPunkt[], photoContext?: string): AssessmentPrompt {
  const itemsList = items
    .map((it, idx) => `${idx + 1}. [id: ${it.id}] ${it.text}${it.required ? ' (obligatorisk punkt)' : ''}`)
    .join('\n')

  const systemPrompt = `Du är ett AI-underlag för en hantverkares egenkontroll av ett pågående projekt. Du får ett foto och en lista med checklistpunkter.

För VARJE punkt i listan ska du bedöma om fotot STÖDS, MOTSÄGS eller INTE VISAR (ej synlig) punkten. Du får ALDRIG gissa — om du är osäker på vad fotot faktiskt visar ska du svara "ej_synlig" eller "ej_bedombar" hellre än att göra en lågkonfidensgissning.

VIKTIGT — JURIDIK: Din bedömning är ENDAST ett underlag för hantverkarens eget beslut. Du får ALDRIG formulera dig som att arbetet är "godkänt enligt besiktningskrav", "godkänt av AI", "besiktigat" eller likvärdigt. Det är alltid hantverkaren själv, inte du, som avgör om en punkt är uppfylld — din uppgift är bara att beskriva vad fotot visar eller inte visar.

Svara ENDAST med strikt JSON i exakt detta schema — ingen text utanför JSON-blocket, ingen inledning eller avslutning:
{
  "bedomningar": [
    {
      "punktId": "<punktens id från listan, exakt som angivet>",
      "status": "stods" | "motsags" | "ej_synlig" | "ej_bedombar",
      "motivering": "<kort svensk mening som motiverar bedömningen>",
      "konfidens": "hog" | "medel" | "lag"
    }
  ]
}

Statusbetydelse:
- "stods": fotot visar tydligt att punkten är utförd/uppfylld
- "motsags": fotot visar tydligt att punkten INTE är utförd/uppfylld
- "ej_synlig": det punkten avser syns inte alls i fotot
- "ej_bedombar": fotot är för otydligt, oskarpt eller ovidkommande för att avgöra

Inkludera exakt en rad i "bedomningar" för VARJE punkt i listan nedan, i samma ordning, med samma id.`

  const contextLine = photoContext && photoContext.trim()
    ? `Bildtext från hantverkaren: "${photoContext.trim()}"\n\n`
    : ''

  const userText = `${contextLine}Checklistpunkter att bedöma mot fotot:\n${itemsList}\n\nBedöm varje punkt enligt instruktionerna i systemprompten och svara med JSON enligt schemat.`

  return { systemPrompt, userText }
}

// ─────────────────────────────────────────────────────────────────
// parseAssessmentResponse — ren, fail-safe parser (kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

const VALID_STATUS: ReadonlySet<string> = new Set(['stods', 'motsags', 'ej_synlig', 'ej_bedombar'])
const VALID_KONFIDENS: ReadonlySet<string> = new Set(['hog', 'medel', 'lag'])

const OKÄND_MOTIVERING = 'Kunde inte tolkas ur svaret'

function fillAllUnassessed(items: ChecklistPunkt[], motivering: string): PunktBedömning[] {
  return items.map(it => ({
    punktId: it.id,
    status: 'ej_bedombar' as const,
    motivering,
    konfidens: 'lag' as const,
  }))
}

/** Plockar ut ett JSON-block ur ett svar som kan innehålla omgivande text
    eller ```json-fences. Returnerar null om inget objekt/array hittas. */
function extractJsonBlock(raw: string): string | null {
  if (!raw) return null

  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw

  const objMatch = candidate.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]

  const arrMatch = candidate.match(/\[[\s\S]*\]/)
  if (arrMatch) return arrMatch[0]

  return null
}

/**
 * Ren, fail-safe parser: tolkar modellens rå textrespons mot den kända
 * checklistan. Kastar ALDRIG — värsta fallet är att alla punkter blir
 * 'ej_bedombar'. Regler:
 *  - Okänd punktId i svaret → ignoreras tyst
 *  - Punkt i checklistan som saknas i svaret → 'ej_bedombar' + motivering
 *    "Kunde inte tolkas ur svaret"
 *  - Ogiltig status/konfidens-sträng → 'ej_bedombar' / 'lag'
 *  - Trasigt/oparsbart svar → alla punkter 'ej_bedombar', inget kast
 *  - Tom punktlista → tom bedömningslista, oavsett svar
 */
export function parseAssessmentResponse(raw: string, items: ChecklistPunkt[]): PunktBedömning[] {
  if (!items || items.length === 0) return []

  try {
    const jsonStr = extractJsonBlock(raw)
    if (!jsonStr) return fillAllUnassessed(items, OKÄND_MOTIVERING)

    const parsed = JSON.parse(jsonStr)
    const rawList: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any)?.bedomningar)
        ? (parsed as any).bedomningar
        : Array.isArray((parsed as any)?.bedömningar)
          ? (parsed as any).bedömningar
          : []

    const knownIds = new Set(items.map(it => it.id))
    const byId = new Map<string, PunktBedömning>()

    for (const entryRaw of rawList) {
      if (!entryRaw || typeof entryRaw !== 'object') continue
      const entry = entryRaw as Record<string, unknown>

      const punktId = String(entry.punktId ?? entry.id ?? entry.index ?? '')
      if (!punktId || !knownIds.has(punktId)) continue // okänd punkt → ignoreras

      const statusRaw = typeof entry.status === 'string' ? entry.status : ''
      const status: PunktStatus = VALID_STATUS.has(statusRaw) ? (statusRaw as PunktStatus) : 'ej_bedombar'

      const motiveringRaw = typeof entry.motivering === 'string' ? entry.motivering.trim() : ''
      const motivering = motiveringRaw || 'Ingen motivering angiven av modellen'

      const konfidensRaw = typeof entry.konfidens === 'string' ? entry.konfidens : ''
      const konfidens: Konfidens = VALID_KONFIDENS.has(konfidensRaw) ? (konfidensRaw as Konfidens) : 'lag'

      byId.set(punktId, { punktId, status, motivering, konfidens })
    }

    // Punkter som saknas helt i svaret fylls fail-safe.
    for (const it of items) {
      if (!byId.has(it.id)) {
        byId.set(it.id, {
          punktId: it.id,
          status: 'ej_bedombar',
          motivering: OKÄND_MOTIVERING,
          konfidens: 'lag',
        })
      }
    }

    // Returnera i checklistans ordning (deterministiskt för UI/1c).
    return items.map(it => byId.get(it.id)!)
  } catch (err) {
    console.error('[egenkontroll/photo-assessment] parse misslyckades (fail-safe)', err)
    return fillAllUnassessed(items, OKÄND_MOTIVERING)
  }
}

// ─────────────────────────────────────────────────────────────────
// assessPhotoAgainstChecklist — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }

export interface AnthropicCallParams {
  model: string
  max_tokens: number
  temperature: number
  system: string
  messages: Array<{ role: 'user'; content: AnthropicContentBlock[] }>
}

export interface AnthropicCallResponse {
  content: Array<{ type: string; text?: string }>
  usage?: { input_tokens: number; output_tokens: number }
}

/** Injicerbar anropsfunktion — låter tester köra hela orkestreringen utan
    att någonsin instansiera en riktig Anthropic-klient. */
export type AnthropicCaller = (params: AnthropicCallParams) => Promise<AnthropicCallResponse>

/** Skapar Anthropic-klienten först vid faktiskt anrop (aldrig vid import) —
    så test-filer aldrig råkar instansiera en riktig klient. */
async function defaultAnthropicCaller(params: AnthropicCallParams): Promise<AnthropicCallResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY saknas')
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)
  return {
    content: response.content as unknown as Array<{ type: string; text?: string }>,
    usage: response.usage
      ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      : undefined,
  }
}

function buildImageBlock(source: ImageSource): AnthropicContentBlock {
  if (source.type === 'url') {
    return { type: 'image', source: { type: 'url', url: source.url } }
  }
  return { type: 'image', source: { type: 'base64', media_type: source.mediaType, data: source.data } }
}

// Sonnet 4.6-priser (samma källa som lib/agents/shared/thinking-call.ts):
// $3/1M input tokens, $15/1M output tokens. Håll i synk om priserna ändras.
function estimateCostUsd(usage: AssessmentUsage): number {
  const inputCost = (usage.input_tokens / 1_000_000) * 3.0
  const outputCost = (usage.output_tokens / 1_000_000) * 15.0
  return inputCost + outputCost
}

/**
 * Bedömer ett foto mot en checklistas punkter via Claude Vision.
 * FAIL-SAFE: kastar ALDRIG. Om anropet eller tolkningen misslyckas
 * returneras alla punkter som 'ej_bedombar' med motiveringen "Analysen
 * kunde inte genomföras" — fotoanalysen får inte blockera uppladdnings-
 * flödet som anropar den.
 *
 * `caller` är injicerbar (default = riktigt Anthropic-anrop, Sonnet via
 * getClaudeModel) uteslutande för testbarhet — facit-testerna injicerar
 * alltid en mock och når därför aldrig defaultAnthropicCaller.
 */
export async function assessPhotoAgainstChecklist(
  input: PhotoAssessmentInput,
  opts: { caller?: AnthropicCaller } = {},
): Promise<PhotoAssessmentResult> {
  const items = input.checklistItems || []
  if (items.length === 0) {
    return { bedömningar: [] }
  }

  const { systemPrompt, userText } = buildAssessmentPrompt(items, input.photoContext)
  const caller = opts.caller ?? defaultAnthropicCaller

  try {
    const response = await caller({
      // Fotobedömning kräver vision-kvalitet (planens ord) — samma
      // taskType som annan kund-synlig, kvalitetskritisk analys.
      // Kostnadsmässigt klassas anropet som bakgrund i cost-guard-lagret
      // (etapp 1b), det är en separat axel från modellvalet här.
      model: getClaudeModel('live-customer'),
      max_tokens: 2000,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [buildImageBlock(input.imageSource), { type: 'text', text: userText }],
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock?.text || ''
    const bedömningar = parseAssessmentResponse(rawText, items)

    const usage = response.usage
      ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      : undefined

    return {
      bedömningar,
      usage,
      estimated_cost_usd: usage ? estimateCostUsd(usage) : undefined,
    }
  } catch (err) {
    console.error('[egenkontroll/photo-assessment] anrop misslyckades (fail-safe)', err)
    return { bedömningar: fillAllUnassessed(items, 'Analysen kunde inte genomföras') }
  }
}
