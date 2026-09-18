'use client'
import { postKortbeslut } from './klient-bekraftelse'
import { delaUrval, farSammanfattas, type BulkHandling, type BulkKort, type BulkNekat } from './bulk'
import type { ApprovalReview } from './review-contract'

/**
 * Bulk med bekräftelse — klientsidan.
 *
 * Två steg, med flit åtskilda: `bulkPlan` tar reda på vad som SKULLE hända
 * utan att ändra något, och `bulkKor` utför det efter att användaren sagt ja
 * en gång. Ingen krona och inget beslut rör sig i steg ett.
 *
 * Varje kort skickas i steg två som sitt EGET beslut via postKortbeslut —
 * samma väg som ett klick på ett kort. Granskningsnyckeln följer med per
 * kort. Bulk är alltså en bekräftelse för människan, inte en genväg runt
 * serverns grindar: massutskicksgrinden, behörighetskontrollen och
 * granskningsvakten gäller varje rad precis som förut.
 */

export interface BulkKlar {
  id: string
  titel: string
  /** Vad som händer med just det här kortet, ur serverns egen granskning. */
  effekt: string
  /** Serverns granskningsnyckel, när den krävs för handlingen. */
  token?: string
}

export interface BulkPlan {
  handling: BulkHandling
  klara: BulkKlar[]
  nekade: BulkNekat[]
}

export interface BulkUtfall {
  id: string
  titel: string
  ok: boolean
  fel?: string
}

/** Så många förhandsvisningar körs samtidigt. Snålt med flit. */
const PARALLELLT = 4

async function forhandsvisa(kort: BulkKort, handling: BulkHandling): Promise<BulkKlar | BulkNekat> {
  const titel = kort.title || kort.approval_type
  try {
    const res = await fetch(`/api/approvals/${kort.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', decision_action: handling }),
    })
    const data = await res.json().catch(() => null)

    // Servern säger att ingen granskning krävs — då är kortet en ren rad.
    if (res.ok && data?.review_not_required === true) {
      return { id: kort.id, titel, effekt: 'Markeras som läst. Ingenting utförs.' }
    }

    const review: ApprovalReview | undefined = data?.review
    if (!review) {
      return { id: kort.id, titel, skal: data?.error || 'kunde inte förhandsvisas' }
    }
    // Ett kort vars granskning bär meddelande, bilaga eller delbeslut hör
    // inte hemma i en samlad bekräftelse — då döljer sammanfattningen det
    // som faktiskt ska läsas.
    if (!farSammanfattas(review)) {
      return { id: kort.id, titel, skal: review.blockedReason || 'behöver öppnas och granskas för sig' }
    }
    if (!data.review_token) {
      return { id: kort.id, titel, skal: 'saknar en giltig granskning just nu' }
    }
    return { id: kort.id, titel, effekt: review.effect, token: data.review_token }
  } catch {
    return { id: kort.id, titel, skal: 'kunde inte nås just nu' }
  }
}

function arNekat(v: BulkKlar | BulkNekat): v is BulkNekat {
  return typeof (v as BulkNekat).skal === 'string'
}

/**
 * Steg 1: vad skulle hända? Ändrar ingenting.
 *
 * Kort som husets klassificering inte släpper i bulk sorteras bort direkt,
 * utan ett anrop. Resten förhandsvisas mot servern, som är den enda som får
 * avgöra om en granskning krävs.
 */
export async function bulkPlan(kort: BulkKort[], handling: BulkHandling): Promise<BulkPlan> {
  const { tillatna, nekade } = delaUrval(kort, handling)

  // Att skjuta upp är inget beslut om innehållet — granskningsvakten hoppar
  // över handlingen helt, så det finns ingen förhandsvisning att hämta.
  if (handling === 'snooze') {
    return {
      handling,
      klara: tillatna.map(k => ({
        id: k.id,
        titel: k.title || k.approval_type,
        effekt: 'Försvinner ur kön i fyra timmar. Inget beslut tas.',
      })),
      nekade,
    }
  }

  const klara: BulkKlar[] = []
  const alla: BulkNekat[] = [...nekade]
  for (let i = 0; i < tillatna.length; i += PARALLELLT) {
    const svar = await Promise.all(tillatna.slice(i, i + PARALLELLT).map(k => forhandsvisa(k, handling)))
    for (const s of svar) {
      if (arNekat(s)) alla.push(s)
      else klara.push(s)
    }
  }
  return { handling, klara, nekade: alla }
}

/**
 * Steg 2: utför, ett kort i taget.
 *
 * Seriellt med flit. Ett godkännande kan skriva i databasen och trigga
 * exekvering; fyra samtidiga skrivningar mot samma projekt är en
 * kapplöpning ingen bad om. Kön är kort — en människa har just läst den.
 */
export async function bulkKor(
  plan: BulkPlan,
  onFramsteg?: (klart: number, totalt: number) => void,
): Promise<BulkUtfall[]> {
  const utfall: BulkUtfall[] = []
  for (let i = 0; i < plan.klara.length; i++) {
    const kort = plan.klara[i]
    try {
      const body: Record<string, unknown> = plan.handling === 'snooze'
        ? { action: 'snooze', snooze_hours: 4 }
        : { action: plan.handling, ...(kort.token ? { review_token: kort.token } : {}) }
      const res = await postKortbeslut(kort.id, { headers: {}, body })
      if (res.ok) utfall.push({ id: kort.id, titel: kort.titel, ok: true })
      else {
        const data = await res.json().catch(() => null)
        utfall.push({ id: kort.id, titel: kort.titel, ok: false, fel: data?.error || `svar ${res.status}` })
      }
    } catch {
      utfall.push({ id: kort.id, titel: kort.titel, ok: false, fel: 'kunde inte nås' })
    }
    onFramsteg?.(i + 1, plan.klara.length)
  }
  return utfall
}
