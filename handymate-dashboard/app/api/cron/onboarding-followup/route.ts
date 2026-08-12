import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { getWeeklyValue, type WeeklyValue } from '@/lib/weekly-value'
import { sendEmail, logEmail } from '@/lib/email'
import { setBusinessPreference, deleteBusinessPreference } from '@/lib/business-preferences'

/**
 * GET/POST /api/cron/onboarding-followup
 *
 * Touchpoint 4 (dag 7, onboarding-följeskrift) — se tasks/onboarding-foljeskrift.md.
 * Det ENDA uppföljningsmailet. Hittar konton skapade 7–8 dagar sedan som inte
 * redan fått mailet (business_preferences-flaggan onboarding_day7_email),
 * hämtar veckans siffror via lib/weekly-value.ts (samma logik som
 * /api/dashboard/weekly-value — ingen copy-paste) och skickar via Resend.
 *
 * Noll-hantering: siffror som är 0 utelämnas helt ur listan (aldrig "0 kr").
 * Om ALLA tre siffror är noll: mjuk tomt-vecka-variant istället för listan.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDay7Followup()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDay7Followup()
}

const FLAG_KEY = 'onboarding_day7_email'

async function runDay7Followup() {
  try {
    const supabase = getServerSupabase()
    const now = Date.now()
    // 7–10 dagar (inte exakt 7–8): flaggan onboarding_day7_email hindrar
    // dubbletter, och det bredare fönstret gör att en missad cron-körning
    // självläker nästa dag istället för att kontot missar mailet permanent.
    const from = new Date(now - 10 * 24 * 3600_000).toISOString()
    const to = new Date(now - 7 * 24 * 3600_000).toISOString()

    const { data: candidates, error } = await supabase
      .from('business_config')
      .select('business_id, contact_name, contact_email, created_at')
      .gte('created_at', from)
      .lt('created_at', to)

    if (error) throw error
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ success: true, sent: 0, candidates: 0 })
    }

    const bizIds = candidates.map((b) => b.business_id)
    const { data: flags } = await supabase
      .from('business_preferences')
      .select('business_id')
      .eq('key', FLAG_KEY)
      .in('business_id', bizIds)

    const alreadySent = new Set((flags || []).map((f) => f.business_id))
    // Demokontot får ALDRIG kundlivscykel-mail (det reseedas och delas av
    // flera personer) — samma exkludering som driftlarm-cronen.
    const demoBusinessId = process.env.DEMO_BUSINESS_ID || null
    const targets = candidates.filter(
      (b) => !alreadySent.has(b.business_id) && b.contact_email && b.business_id !== demoBusinessId
    )

    let sent = 0
    let failed = 0

    for (const biz of targets) {
      try {
        // CLAIM-FIRST (ändrat 2026-07-31): flaggan sätts INNAN skicket. Den
        // gamla ordningen (skicka → flagga) spammade kunden en gång per dag
        // när flaggan tyst misslyckades (saknad unik constraint svalde
        // upsert-felet). At-most-once är rätt semantik för ett välkomstmail:
        // hellre ett uteblivet mail än ett dagligen upprepat. Kan flaggan
        // inte sättas skickar vi INTE (fail-closed).
        const claimed = await setBusinessPreference(biz.business_id, FLAG_KEY, '1', 'onboarding')
        if (!claimed) {
          failed++
          console.error('[onboarding-followup] kunde inte sätta dubblettskyddet — hoppar över:', biz.business_id)
          continue
        }

        const value = await getWeeklyValue(supabase, biz.business_id)
        const firstName = (biz.contact_name || '').trim().split(/\s+/)[0] || ''
        const html = buildDay7EmailHtml(firstName, value)

        const result = await sendEmail({
          to: biz.contact_email,
          subject: 'Din första vecka med Handymate',
          html,
          replyTo: 'andreas@handymate.se',
        })

        await logEmail({
          businessId: biz.business_id,
          to: biz.contact_email,
          subject: 'Din första vecka med Handymate',
          status: result.success ? 'sent' : 'failed',
          messageId: result.messageId,
        })

        if (result.success) {
          sent++
        } else {
          failed++
          console.error('[onboarding-followup] sendEmail failed:', biz.business_id, result.error)
          // Rulla tillbaka claimen så morgondagens körning kan försöka igen
          // (fönstret är 7–10 dagar just för att tåla en missad dag).
          await deleteBusinessPreference(biz.business_id, FLAG_KEY)
        }
      } catch (err) {
        failed++
        console.error('[onboarding-followup] business failed (non-blocking):', biz.business_id, err)
      }
    }

    return NextResponse.json({ success: true, sent, failed, candidates: candidates.length })
  } catch (err: any) {
    console.error('[onboarding-followup] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

function buildDay7EmailHtml(firstName: string, value: WeeklyValue): string {
  const greeting = firstName ? `Hej ${firstName},` : 'Hej,'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

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

  return `
<!DOCTYPE html>
<html lang="sv">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <span style="color: white; font-size: 18px; font-weight: 700;">Handymate</span>
  </div>
  <div style="background: #ffffff; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">${greeting}</p>
    ${bodyHtml}
    <div style="text-align: center; margin: 28px 0;">
      <a href="${appUrl}/dashboard" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Se hela veckan →
      </a>
    </div>
    <p style="font-size: 13px; line-height: 1.6; color: #6B7280;">
      Har du frågor? Svara på det här mailet — vi läser varje svar.
    </p>
  </div>
</body>
</html>`
}
