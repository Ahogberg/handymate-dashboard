import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { bedomNummer, type NummerUtfall } from '@/lib/phone/bedom-nummer'
import { arSimuleratDemonummer } from '@/lib/demo/simulerad-telefoni'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/phone-number-verify
 *
 * Kontrollerar att de nummer vi säger är kopplade faktiskt är våra hos 46elks,
 * och att de pekar tillbaka på oss.
 *
 * Bakgrund (2026-09-09). 46elks tar en månadsavgift per allokerat nummer. När
 * saldot tog slut i mitten av augusti återkallades numren — tyst. Sex av åtta
 * konton hade kvar sitt nummer i `business_config.assigned_phone_number`, och
 * produkten fortsatte påstå att telefonen var kopplad. Två av dem hade dessutom
 * ett rent påhittat nummer (`+46760000000`) som aldrig existerat. Att ringa gav
 * "Numret du har ringt har ingen abonnent".
 *
 * Orsaken var att ingenting någonsin kontrollerade om numret var kvar.
 * `purchaseAndAssignNumber` är idempotent på fel sätt: finns en sträng i vår
 * databas antas numret fungera (lib/phone/purchase-number.ts:30), och
 * phone-provision-retry sveper bara konton som saknar nummer. Det köpta numret
 * kontrollerades alltså inte en enda gång efter köpet.
 *
 * Svepet kontrollerar två saker, eftersom vi hade BÅDA felen samma kväll:
 *
 *   1. Äger vi numret? `GET /a1/numbers/{id}` ska svara att det är aktivt och
 *      att numret stämmer. Gör det inte det nollställs fältet — produkten ska
 *      hellre säga "telefonen behöver kopplas" än ljuga. Det öppnar också
 *      onboardingvägen igen, eftersom provisioneringen bara rör konton utan
 *      nummer.
 *   2. Pekar det tillbaka på oss? Numrets `voice_start` ska ligga på vår
 *      /api/voice/incoming. Ett nummer med fel eller saknad `voice_start` ger
 *      `badsource` hos 46elks och tystnad hos kunden — exakt det som hände när
 *      ett nummer allokerats för hand.
 *
 * Numret NOLLSTÄLLS aldrig vid nätfel eller 5xx: en tillfällig störning hos
 * 46elks får inte koppla bort en fungerande telefon. Då larmas bara.
 *
 * Kan vi inte verifiera alls (saknat `elks_number_id`, som för nummer som
 * allokerats manuellt) larmas det, men fältet lämnas orört — att radera ett
 * nummer som kanske fungerar är värre än att inte veta.
 *
 * UNDANTAGET (2026-09-10): demokontots SIMULERADE nummer hoppas över. Det är
 * påhittat med flit (lib/demo/simulerad-telefoni.ts) och har därför inget
 * elks_number_id — svepet hade annars larmat `nummer_kan_ej_verifieras` om
 * det varje dygn, om ett nummer vi själva hittat på. Undantaget kräver BÅDA:
 * att numret är exakt det simulerade OCH att raden är ett demokonto. Nyckeln
 * ligger på numret, så ett demokonto som köper ett riktigt nummer verifieras
 * som alla andra; kravet på is_demo_tenant gör att ett riktigt företag som
 * mot alla odds hade just det numret ändå kontrolleras.
 *
 * SCHEMAT: "17 5 * * *" i vercel.json — en gång per dygn, före
 * phone-provision-retry (6:42) så ett nollställt konto kan få nytt nummer
 * samma morgon.
 */

interface Rad {
  business_id: string
  business_name: string | null
  assigned_phone_number: string
  elks_number_id: string | null
  is_demo_tenant: boolean | null
}

async function kor() {
  const supabase = getServerSupabase()
  const user = process.env.ELKS_API_USER
  const password = process.env.ELKS_API_PASSWORD

  const { data, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, assigned_phone_number, elks_number_id, is_demo_tenant')
    .not('assigned_phone_number', 'is', null)

  if (error) {
    console.error('[phone-number-verify] kunde inte läsa konton:', error.message)
    return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  }

  // Demons simulerade nummer sorteras bort innan något kontrolleras — se
  // undantaget i filhuvudet. Båda villkoren krävs.
  const rader = ((data || []) as Rad[]).filter(
    rad => !(arSimuleratDemonummer(rad.assigned_phone_number) && rad.is_demo_tenant === true),
  )
  const utfall: NummerUtfall[] = []

  if (!user || !password) {
    // Utan uppgifter kan ingenting kontrolleras. Det är ett drifthål i sig.
    await rapporteraTystFel(supabase, 'system', 'nummerverifiering_omojlig',
      'ELKS_API_USER/ELKS_API_PASSWORD saknas — nummer kan inte verifieras', { konton: rader.length })
    return NextResponse.json({ kontrollerade: 0, utfall: [], fel: 'elks_env_missing' })
  }

  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')

  for (const rad of rader) {
    if (!rad.elks_number_id) {
      utfall.push({ business_id: rad.business_id, nummer: rad.assigned_phone_number, utfall: 'kan_ej_verifieras' })
      await rapporteraTystFel(supabase, rad.business_id, 'nummer_kan_ej_verifieras',
        `${rad.assigned_phone_number} saknar elks_number_id och kan inte kontrolleras mot 46elks`,
        { nummer: rad.assigned_phone_number })
      continue
    }

    let svar: { status: number; kropp: Record<string, unknown> | null }
    try {
      const r = await fetch(`https://api.46elks.com/a1/numbers/${encodeURIComponent(rad.elks_number_id)}`, {
        headers: { Authorization: auth },
      })
      svar = { status: r.status, kropp: await r.json().catch(() => null) }
    } catch (err: any) {
      svar = { status: 0, kropp: null }
      console.error('[phone-number-verify] anropet kastade:', rad.business_id, err?.message || err)
    }

    const dom = bedomNummer(rad, svar, '/api/voice/incoming')
    utfall.push({ business_id: rad.business_id, nummer: rad.assigned_phone_number, ...dom })

    if (dom.utfall === 'nollstallt') {
      const { error: uppdErr } = await supabase
        .from('business_config')
        .update({ assigned_phone_number: null, elks_number_id: null, updated_at: new Date().toISOString() })
        .eq('business_id', rad.business_id)
      if (uppdErr) {
        console.error('[phone-number-verify] nollställningen misslyckades:', rad.business_id, uppdErr.message)
      }
      await rapporteraTystFel(supabase, rad.business_id, 'nummer_aterkallat',
        `${rad.assigned_phone_number} är inte längre vårt hos 46elks (${dom.detalj}) — fältet nollställt`,
        { nummer: rad.assigned_phone_number, detalj: dom.detalj })
    } else if (dom.utfall === 'webhook_fel') {
      await rapporteraTystFel(supabase, rad.business_id, 'nummer_webhook_fel',
        `${rad.assigned_phone_number} finns men ringer ingen: ${dom.detalj}`,
        { nummer: rad.assigned_phone_number, detalj: dom.detalj })
    } else if (dom.utfall === 'kontroll_misslyckades') {
      console.error('[phone-number-verify] kunde inte verifiera:', rad.business_id, dom.detalj)
    }
  }

  return NextResponse.json({
    kontrollerade: rader.length,
    hoppade_demonummer: (data || []).length - rader.length,
    utfall,
  })
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return kor()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return kor()
}
