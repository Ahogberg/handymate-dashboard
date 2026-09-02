import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { getWeeklyValue, type WeeklyValue } from '@/lib/weekly-value'
import { sendEmail, logEmail } from '@/lib/email'
import { setBusinessPreference, deleteBusinessPreference } from '@/lib/business-preferences'
import { pickDay7NextAction, type Day7NextAction } from '@/lib/onboarding/day7-next-action'
import { hamtaKomIgangSignals } from '@/lib/onboarding/kom-igang-signals'
import { deriveKomIgangTasks, type KomIgangTask } from '@/lib/onboarding/kom-igang-tasks'
import {
  LIVSCYKEL_DAGAR,
  type LivscykelDag,
  flaggaFor,
  amneFor,
  fonsterFor,
  skaSkickaDag14,
} from '@/lib/onboarding/lifecycle-emails'
import {
  hamtaAdoptionHandelser,
  computeAdoption,
  ADOPTION_TROSKEL,
} from '@/lib/admin/adoption'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/onboarding-followup
 *
 * Livscykelmailen efter onboardingen — dag 2, 7 och 14 (Etapp B4, 2026-09-02;
 * dag 7 fanns sedan tidigare, se tasks/onboarding-foljeskrift.md). Schemat och
 * fönsterlogiken är ren och testad i lib/onboarding/lifecycle-emails.ts.
 *
 * Innehållet härleds ur kontots verkliga läge, aldrig generisk drip:
 *   dag 2  — Kom igång-luckorna (samma som startsidan visar)
 *   dag 7  — veckans siffror (lib/weekly-value) + nästa väntande kort
 *   dag 14 — bara till konton som ännu INTE är aktiva på fyra ytor
 *
 * Noll-hantering i dag 7: siffror som är 0 utelämnas helt ur listan (aldrig
 * "0 kr"). Är alla tre noll används den mjuka tomt-vecka-varianten.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runLivscykel()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runLivscykel()
}

interface Kandidat {
  business_id: string
  contact_name: string | null
  contact_email: string | null
  created_at: string
  onboarding_completed_at: string | null
}

async function runLivscykel() {
  try {
    const supabase = getServerSupabase()
    const now = Date.now()
    const perDag: Record<string, { kandidater: number; skickade: number; hoppade: number; misslyckade: number }> = {}

    for (const dag of LIVSCYKEL_DAGAR) {
      perDag[`dag${dag}`] = await korDag(supabase, dag, now)
    }

    return NextResponse.json({ success: true, ...perDag })
  } catch (err: any) {
    console.error('[onboarding-followup] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function korDag(
  supabase: ReturnType<typeof getServerSupabase>,
  dag: LivscykelDag,
  now: number,
): Promise<{ kandidater: number; skickade: number; hoppade: number; misslyckade: number }> {
  const flagga = flaggaFor(dag)
  const { fran, till } = fonsterFor(dag, now)

  // Fönstret räknas från onboarding_completed_at (Lager 3 / B9, 2026-08-27):
  // tiden ska räknas MED teamet, inte sedan registreringen — den som
  // registrerade dag 1 och blev klar dag 6 fick annars ett tomt mail. Konton
  // utan completed_at (äldre flöden) faller tillbaka på created_at som förut.
  const { data: candidates, error } = await supabase
    .from('business_config')
    .select('business_id, contact_name, contact_email, created_at, onboarding_completed_at')
    .or(
      `and(onboarding_completed_at.gte.${fran},onboarding_completed_at.lt.${till}),` +
      `and(onboarding_completed_at.is.null,created_at.gte.${fran},created_at.lt.${till})`,
    )

  if (error) throw error
  if (!candidates || candidates.length === 0) {
    return { kandidater: 0, skickade: 0, hoppade: 0, misslyckade: 0 }
  }

  const bizIds = candidates.map(b => b.business_id)
  const { data: flags } = await supabase
    .from('business_preferences')
    .select('business_id')
    .eq('key', flagga)
    .in('business_id', bizIds)

  const alreadySent = new Set((flags || []).map(f => f.business_id))
  // Demokontot får ALDRIG kundlivscykel-mail (det reseedas och delas av flera
  // personer) — samma exkludering som driftlarm-cronen.
  const demoBusinessId = process.env.DEMO_BUSINESS_ID || null
  const targets = (candidates as Kandidat[]).filter(
    b => !alreadySent.has(b.business_id) && b.contact_email && b.business_id !== demoBusinessId,
  )

  // Dag 14 behöver adoptionen för att veta vilka som inte kommit igång.
  const adoptionPerBusiness =
    dag === 14 && targets.length > 0
      ? await hamtaAdoptionHandelser(
          supabase,
          targets.map(b => ({ business_id: b.business_id, onboarding_completed_at: b.onboarding_completed_at })),
        ).catch(err => {
          console.warn('[onboarding-followup] adoptionen kunde inte läsas — dag 14 hoppas över:', err)
          return null
        })
      : null

  let skickade = 0
  let hoppade = 0
  let misslyckade = 0
  const nowIso = new Date(now).toISOString()

  for (const biz of targets) {
    try {
      if (dag === 14) {
        // Läsfel på adoptionen: skicka inget hellre än att maila fel person.
        if (!adoptionPerBusiness) {
          hoppade++
          continue
        }
        const adoption = computeAdoption(
          adoptionPerBusiness.get(biz.business_id) || [],
          { business_id: biz.business_id, onboarding_completed_at: biz.onboarding_completed_at },
          nowIso,
        )
        if (!skaSkickaDag14(adoption.antal, ADOPTION_TROSKEL)) {
          // Kontot är igång — inget mail, men flagga så vi inte frågar igen.
          await setBusinessPreference(biz.business_id, flagga, 'skipped_active', 'onboarding')
          hoppade++
          continue
        }
      }

      // CLAIM-FIRST (2026-07-31): flaggan sätts INNAN skicket. Den gamla
      // ordningen (skicka → flagga) spammade kunden en gång per dag när
      // flaggan tyst misslyckades (saknad unik constraint svalde upsert-felet).
      // At-most-once är rätt semantik här: hellre ett uteblivet mail än ett
      // dagligen upprepat. Kan flaggan inte sättas skickar vi INTE.
      const claimed = await setBusinessPreference(biz.business_id, flagga, '1', 'onboarding')
      if (!claimed) {
        misslyckade++
        console.error('[onboarding-followup] kunde inte sätta dubblettskyddet — hoppar över:', biz.business_id, flagga)
        continue
      }

      const firstName = (biz.contact_name || '').trim().split(/\s+/)[0] || ''
      const html = await byggMail(supabase, dag, biz, firstName)
      const subject = amneFor(dag)

      const result = await sendEmail({
        to: biz.contact_email as string,
        subject,
        html,
        replyTo: 'andreas@handymate.se',
      })

      await logEmail({
        businessId: biz.business_id,
        to: biz.contact_email as string,
        subject,
        status: result.success ? 'sent' : 'failed',
        messageId: result.messageId,
      })

      if (result.success) {
        skickade++
      } else {
        misslyckade++
        console.error('[onboarding-followup] sendEmail failed:', biz.business_id, dag, result.error)
        // Rulla tillbaka claimen så morgondagens körning kan försöka igen
        // (fönstret är tre dygn brett just för att tåla en missad dag).
        await deleteBusinessPreference(biz.business_id, flagga)
      }
    } catch (err) {
      misslyckade++
      console.error('[onboarding-followup] business failed (non-blocking):', biz.business_id, dag, err)
    }
  }

  return { kandidater: candidates.length, skickade, hoppade, misslyckade }
}

async function byggMail(
  supabase: ReturnType<typeof getServerSupabase>,
  dag: LivscykelDag,
  biz: Kandidat,
  firstName: string,
): Promise<string> {
  if (dag === 7) {
    const value = await getWeeklyValue(supabase, biz.business_id)
    // Ett konkret nästa steg — bara om ett riktigt kort väntar (annars null
    // och blocket utelämnas). Läsfel utelämnar också, mailet går ändå.
    const nextAction = await pickDay7NextAction(supabase, biz.business_id).catch(() => null)
    return buildDay7EmailHtml(firstName, value, nextAction)
  }

  const luckor = await hamtaLuckor(supabase, biz.business_id)
  if (dag === 2) {
    const value = await getWeeklyValue(supabase, biz.business_id).catch(() => null)
    return buildDay2EmailHtml(firstName, value, luckor)
  }
  return buildDay14EmailHtml(firstName, luckor)
}

/** De öppna Kom igång-uppgifterna, viktigast först. Läsfel ⇒ tom lista. */
async function hamtaLuckor(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
): Promise<KomIgangTask[]> {
  try {
    const signals = await hamtaKomIgangSignals(supabase, businessId)
    return deriveKomIgangTasks(signals).filter(t => !t.klar)
  } catch (err) {
    console.warn('[onboarding-followup] kunde inte läsa Kom igång-luckorna:', err)
    return []
  }
}

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
}

/** Ramen kring alla livscykelmail — samma huvud, knapp och fot. */
function ram(greeting: string, innehall: string, knappText: string, knappHref: string): string {
  return `
<!DOCTYPE html>
<html lang="sv">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <span style="color: white; font-size: 18px; font-weight: 700;">Handymate</span>
  </div>
  <div style="background: #ffffff; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">${greeting}</p>
    ${innehall}
    <div style="text-align: center; margin: 28px 0;">
      <a href="${appUrl()}${knappHref}" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
        ${knappText}
      </a>
    </div>
    <p style="font-size: 13px; line-height: 1.6; color: #6B7280;">
      Har du frågor? Svara på det här mailet — vi läser varje svar.
    </p>
  </div>
</body>
</html>`
}

/** En Kom igång-uppgift som klickbar rad. */
function luckaHtml(task: KomIgangTask): string {
  return `<li style="margin-bottom: 10px;">
    <a href="${appUrl()}${task.href}" style="color: #0F766E; font-weight: 600; text-decoration: underline;">${escapeHtml(task.label)}</a>
    <span style="color: #6B7280;"> — ${escapeHtml(task.varde)} (${task.minuter} min)</span>
  </li>`
}

export function buildDay2EmailHtml(
  firstName: string,
  value: WeeklyValue | null,
  luckor: KomIgangTask[],
): string {
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,'

  const gjort: string[] = []
  if (value) {
    if (value.calls_captured > 0) gjort.push(`<li style="margin-bottom: 8px;"><b>${value.calls_captured} kundsamtal</b> fångade</li>`)
    if (value.time_hours > 0) gjort.push(`<li style="margin-bottom: 8px;"><b>${value.time_hours} timmar</b> administration du slapp</li>`)
    if (value.confirmed_kr > 0) gjort.push(`<li style="margin-bottom: 8px;"><b>${kr(value.confirmed_kr)} kr</b> i accepterade offerter och betalda fakturor teamet bidragit till</li>`)
  }

  const gjortHtml = gjort.length > 0
    ? `<p style="font-size: 15px; line-height: 1.6; color: #374151;">Två dagar in. Det här har teamet redan gjort åt dig:</p>
       <ul style="font-size: 15px; line-height: 1.6; color: #374151; padding-left: 20px;">${gjort.join('\n')}</ul>`
    : `<p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Två dagar in. Teamet är på plats — det som saknas är att de får se hur du jobbar.
       </p>`

  // Bara den viktigaste luckan i dag 2-mailet: ett steg, inte en lista.
  const nasta = luckor[0]
  const nastaHtml = nasta
    ? `<div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 10px; padding: 14px 16px; margin: 20px 0;">
         <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #0F766E;">Nästa steg</p>
         <p style="margin: 0 0 4px; font-size: 15px; line-height: 1.5; color: #134E4A;">${escapeHtml(nasta.label)}</p>
         <p style="margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #4B5563;">${escapeHtml(nasta.varde)}</p>
         <a href="${appUrl()}${nasta.href}" style="font-size: 14px; font-weight: 600; color: #0F766E; text-decoration: underline;">Gör det nu (${nasta.minuter} min) →</a>
       </div>`
    : ''

  return ram(greeting, `${gjortHtml}${nastaHtml}`, 'Öppna Handymate →', '/dashboard')
}

export function buildDay14EmailHtml(firstName: string, luckor: KomIgangTask[]): string {
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,'
  const tre = luckor.slice(0, 3)

  const innehall = tre.length > 0
    ? `<p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Två veckor in. Det här är kvar innan teamet kan sköta det mesta själva —
         inget av det tar mer än några minuter:
       </p>
       <ul style="font-size: 15px; line-height: 1.6; color: #374151; padding-left: 20px;">
         ${tre.map(luckaHtml).join('\n')}
       </ul>
       <p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Fastnar du någonstans — svara på det här mailet, så hjälper vi dig igenom det.
       </p>`
    : `<p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Två veckor in. Säg till om du vill att vi går igenom hur du får ut mest av teamet.
       </p>`

  return ram(greeting, innehall, 'Öppna Handymate →', '/dashboard')
}

export function buildDay7EmailHtml(firstName: string, value: WeeklyValue, nextAction: Day7NextAction | null = null): string {
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,'

  // "Nästa bästa steg" — ett riktigt väntande kort med djuplänk, aldrig ett
  // påhittat. Utelämnas helt när inget kort väntar.
  const nextStepHtml = nextAction
    ? `<div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 10px; padding: 14px 16px; margin: 20px 0;">
         <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #0F766E;">Nästa bästa steg</p>
         <p style="margin: 0 0 10px; font-size: 15px; line-height: 1.5; color: #134E4A;">${escapeHtml(nextAction.title)}</p>
         <a href="${appUrl()}${nextAction.href}" style="font-size: 14px; font-weight: 600; color: #0F766E; text-decoration: underline;">Öppna och besluta →</a>
       </div>`
    : ''

  const bullets: string[] = []
  if (value.calls_captured > 0) {
    bullets.push(
      `<li style="margin-bottom: 8px;"><b>${value.calls_captured} kundsamtal</b> fångade som annars kunde gått förlorade</li>`
    )
  }
  if (value.time_hours > 0) {
    bullets.push(
      `<li style="margin-bottom: 8px;"><b>${value.time_hours} timmar</b> administration du slapp</li>`
    )
  }
  if (value.confirmed_kr > 0) {
    bullets.push(
      `<li style="margin-bottom: 8px;"><b>${kr(value.confirmed_kr)} kr</b> i accepterade offerter och betalda fakturor som teamet bidragit till</li>`
    )
  }

  const isEmptyWeek = bullets.length === 0

  const bodyHtml = isEmptyWeek
    ? `<p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Teamet är på plats och redo — säg till om du vill att vi hjälper dig igång.
       </p>`
    : `<p style="font-size: 15px; line-height: 1.6; color: #374151;">
         En vecka sedan du fick ditt team. Här är vad de gjorde åt dig:
       </p>
       <ul style="font-size: 15px; line-height: 1.6; color: #374151; padding-left: 20px;">
         ${bullets.join('\n')}
       </ul>
       <p style="font-size: 15px; line-height: 1.6; color: #374151;">
         Det här är din vecka — inte en demo. Och teamet lär sig hela tiden: ju
         fler gånger du godkänner samma sorts ärende, desto närmare kommer de
         att kunna sköta det själva när du är redo att lita på dem med det.
       </p>`

  return ram(greeting, `${bodyHtml}${nextStepHtml}`, 'Se hela veckan →', '/dashboard')
}
