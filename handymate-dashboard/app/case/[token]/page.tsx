import { notFound } from 'next/navigation'
import { getServerSupabase } from '@/lib/supabase'
import { arUtgangen } from '@/lib/sales/sales-case'
import KundGenomgang from './KundGenomgang'

// force-dynamic: sidan slår upp en token. En statisk cache här hade kunnat
// servera ETT företags grind till nästa besökare (CLAUDE.md, svepet
// 2026-08-22).
export const dynamic = 'force-dynamic'

// Kundens personliga länk ska aldrig hamna i ett sökindex och aldrig läcka
// sin egen URL som referrer till nästa sajt. Den här sidan bar det tidigare
// själv; nu bär den det åt vyn, som är en klientkomponent och därför inte
// kan exportera metadata.
export const metadata = {
  title: 'Er personliga Handymate-genomgång',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
}

/**
 * Kundens egen genomgång — den personliga länken vi skickar efter mötet.
 *
 * Sidan fanns sedan tidigare som en handbyggd sammanfattning (mål, första
 * arbetsflöde, en knapp vidare). Den är nu utbytt mot den designade
 * genomgången, samma komponent som säljaren kör på /admin/sales, så att
 * kunden ser exakt det vi gick igenom på mötet i stället för ett referat.
 *
 * GRINDEN ÄR KVAR OCH LIGGER HÄR, PÅ SERVERN. En okänd eller utgången token
 * ska ge 404 innan något renderas — inte en klientsida som tyst faller
 * tillbaka på säljarens första steg ("skriv in organisationsnummer"), vilket
 * är vad vyn gör på egen hand när hämtningen misslyckas.
 *
 * Sidan är PUBLIK. Token är legitimationen, precis som i kundportalen, och
 * uppslaget nedan läser bara utgångsdatumet — själva innehållet hämtar vyn
 * via GET /api/sales-case/[token], som aldrig lämnar ut vem hos oss eller
 * vilken partner som byggde caset.
 */
export default async function PersonalCase({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) notFound()

  const db = getServerSupabase()
  const { data, error } = await db
    .from('sales_case')
    .select('expires_at')
    .eq('token', params.token)
    .maybeSingle()

  if (error) {
    // Samma hållning som läsrutten: felet ska synas i loggen, men utåt är
    // svaret detsamma som för en token som aldrig funnits.
    console.error('[sales-case-page]', error.message)
    notFound()
  }
  if (!data || arUtgangen(data.expires_at as string | null, Date.now())) notFound()

  return <KundGenomgang />
}
