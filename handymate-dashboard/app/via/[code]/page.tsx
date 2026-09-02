/**
 * app/via/[code]/page.tsx — "Skickat via Handymate"-länkens landningssida.
 *
 * Varje offert, faktura och mejl som en firma skickar bär foten
 * "Skickat via Handymate" (lib/branding/attribution.ts) där ordet Handymate
 * länkar hit med firmans referral_code. Mottagaren är oftast en annan
 * hantverkare, en byggherre eller en privatkund. Sidan är en MJUK, publik
 * landningssida: förklarar vad firman använder och leder vidare till
 * registreringen (/registrera?ref=<kod>) eller marknadssajten.
 *
 * Ingen inloggning, ingen dashboard-layout (ligger direkt under
 * app/layout.tsx precis som app/rekommendera). Server component med
 * service role — selectar BARA business_id, business_name, branch och
 * service_area. Inga kontaktuppgifter får läcka ut på en offentlig sida.
 *
 * Varje visning av en KÄND kod loggas till landing_events (event
 * 'via_click', sql/v116) — loggfel får aldrig fälla sidan. Okända koder
 * loggas inte: koderna är korta (ABC-1234) och ett gissningssvep skulle
 * annars fylla tabellen med tusentals rader som inte säger något.
 */
import type { Metadata } from 'next'
import { cache } from 'react'
import { getServerSupabase } from '@/lib/supabase'
import { branchWorker, normalizeBranch } from '@/lib/branch'

export const dynamic = 'force-dynamic'

const SITE_URL = 'https://handymate.se'

type ViaBusiness = {
  business_id: string
  business_name: string
  branch: string | null
  service_area: string | null
}

function normalizeCode(raw: string | undefined): string {
  let decoded = raw ?? ''
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // Trasig URL-kodning — behåll råsträngen, uppslaget ger bara "okänd kod".
  }
  return decoded.trim().toUpperCase().slice(0, 64)
}

/** cache(): generateMetadata och sidan slår upp samma kod i samma request — en query, inte två. */
const lookupBusiness = cache(async function lookupBusiness(code: string): Promise<ViaBusiness | null> {
  if (!code) return null
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, branch, service_area')
      .eq('referral_code', code)
      .maybeSingle()
    if (error || !data || !data.business_name) return null
    return data as ViaBusiness
  } catch (err) {
    console.warn('[via] uppslag av referral_code misslyckades:', err)
    return null
  }
})

async function logViaClick(code: string, business: ViaBusiness): Promise<void> {
  try {
    const supabase = getServerSupabase()
    const { error } = await supabase.from('landing_events').insert({
      event: 'via_click',
      session_id: null,
      payload: { code, business_id: business.business_id },
    })
    if (error) console.warn('[via] kunde inte logga via_click:', error.message)
  } catch (err) {
    console.warn('[via] kunde inte logga via_click:', err)
  }
}

/** "Elektriker · Göteborg" — bara delar som faktiskt finns; allround visas inte. */
function subtitleFor(business: ViaBusiness): string | null {
  const parts: string[] = []
  const branchId = normalizeBranch(business.branch)
  if (business.branch?.trim() && branchId !== 'other') parts.push(branchWorker(branchId))
  const area = business.service_area?.trim()
  if (area) parts.push(area)
  return parts.length > 0 ? parts.join(' · ') : null
}

type PageProps = { params: { code: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const code = normalizeCode(params.code)
  const business = await lookupBusiness(code)
  return {
    title: business ? `${business.business_name} använder Handymate` : 'Skickat via Handymate',
    description: business
      ? `${business.business_name} sköter offerter, fakturor och telefonen med Handymate.`
      : 'Det här dokumentet skickades via Handymate — AI-teamet för hantverksfirmor.',
    robots: { index: false, follow: false },
  }
}

const POINTS = [
  {
    title: 'Telefonen besvaras',
    text: 'När de står på taket eller sitter i bilen tar Handymate samtalet och bokar in ärendet.',
  },
  {
    title: 'Offerten skrivs på plats',
    text: 'Efter besöket blir anteckningarna en färdig offert att skicka direkt från mobilen.',
  },
  {
    title: 'Fakturan går ut samma dag',
    text: 'När jobbet är klart skapas fakturan ur det som gjorts — och påminnelser sköts automatiskt.',
  },
] as const

export default async function ViaPage({ params }: PageProps) {
  const code = normalizeCode(params.code)
  const business = await lookupBusiness(code)

  // Loggningen är felisolerad (kastar aldrig, kan aldrig fälla sidan) men
  // inväntas ändå: en oavvaktad promise i en serverkomponent på Vercel
  // riskerar att frysas med funktionen när svaret är klart och aldrig nå
  // databasen. En insert kostar tiotals ms — sidan är inte latenskritisk.
  if (business) await logViaClick(code, business)

  const registerHref = business ? `/registrera?ref=${encodeURIComponent(code)}` : '/registrera'
  const subtitle = business ? subtitleFor(business) : null

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
          Skickat via Handymate
        </p>

        {business ? (
          <>
            <h1 className="mt-3 font-heading text-2xl font-bold leading-snug sm:text-3xl">
              <span className="text-primary-700">{business.business_name}</span> sköter offerter,
              fakturor och telefonen med Handymate
            </h1>
            {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
          </>
        ) : (
          <>
            <h1 className="mt-3 font-heading text-2xl font-bold leading-snug sm:text-3xl">
              Det här dokumentet skickades via Handymate
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Handymate är ett AI-team som sköter telefon, offerter och fakturor åt hantverksfirmor.
            </p>
          </>
        )}

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">
            {business ? `Vad det innebär för ${business.business_name}` : 'Vad det innebär för firman'}
          </h2>
          <ul className="mt-4 space-y-4">
            {POINTS.map(point => (
              <li key={point.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-700"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{point.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{point.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-col gap-3">
          <a
            href={registerHref}
            className="flex w-full items-center justify-center rounded-xl bg-primary-700 px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            Starta för er firma
          </a>
          <a
            href={SITE_URL}
            className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3.5 text-base font-medium text-gray-800 transition-colors hover:bg-gray-100"
          >
            Så fungerar Handymate
          </a>
        </div>

        {business && (
          <p className="mt-4 text-center text-xs leading-relaxed text-gray-500">
            Den som startar via den här länken ger {business.business_name} en månad gratis.
          </p>
        )}

        <footer className="mt-12 text-center text-xs text-gray-400">
          Handymate · app.handymate.se
        </footer>
      </div>
    </main>
  )
}
