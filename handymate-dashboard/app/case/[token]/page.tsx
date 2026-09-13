import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSupabase } from '@/lib/supabase'
import { arUtgangen, type SalesCasePayload } from '@/lib/sales/sales-case'
import { PAINS, type Pain } from '@/lib/revenue/domain'
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Er personliga Handymate-genomgång',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
function str(v: unknown) {
  return typeof v === 'string' ? v : ''
}
export default async function PersonalCase({
  params,
}: {
  params: { token: string }
}) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) notFound()
  const db = getServerSupabase()
  const { data, error } = await db
    .from('sales_case')
    .select('business_name,payload,expires_at')
    .eq('token', params.token)
    .maybeSingle()
  if (error) {
    console.error('[sales-case-page]', error.message)
    throw new Error('Genomgången kunde inte hämtas. Försök igen.')
  }
  if (!data || arUtgangen(data.expires_at, Date.now())) notFound()
  const p = (data.payload || {}) as SalesCasePayload,
    pain = str(p.raw?.pain) as Pain,
    direction = PAINS[pain]
  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-50 to-teal-50 px-5 py-14 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <p className="font-semibold text-teal-700">
          {data.business_name} + Handymate
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Er personliga Handymate-genomgång
        </h1>
        <p className="mt-4 text-slate-600">
          {str(p.meeting?.iso) || str(p.meeting?.date)
            ? `Från mötet ${str(p.meeting?.iso) || str(p.meeting?.date)}.`
            : 'Sammanfattningen av vår genomgång.'}
        </p>
        <section className="mt-10 rounded-3xl border bg-white p-7">
          <p className="text-sm font-semibold text-teal-700">
            Ert mål med Handymate
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            {str(p.goal?.name) || str(p.focusTitle) || 'En enklare vardag'}
          </h2>
          {str(p.goal?.quote) && (
            <blockquote className="mt-5 border-l-4 border-teal-200 pl-5 text-lg">
              ”{str(p.goal?.quote)}”
            </blockquote>
          )}
          <p className="mt-4 text-sm text-slate-500">
            Det här är er beskrivning och ert mål från mötet. Vi följer upp
            utvecklingen tillsammans efter införandet.
          </p>
        </section>
        {direction && (
          <section className="mt-6 rounded-3xl bg-teal-800 p-7 text-white">
            <h2 className="text-xl font-semibold">
              Första arbetsflödet att avlasta
            </h2>
            <p className="mt-4 text-xl">{direction.workflow}</p>
            <p className="mt-4 text-teal-100">{direction.agent}</p>
          </section>
        )}
        <section className="mt-6 space-y-4 rounded-3xl border bg-white p-7">
          <h2 className="text-xl font-semibold">
            Nästa kapitel börjar med er firma
          </h2>
          <p>
            Uppgifterna från genomgången följer med in i starten. Där bekräftar
            ni företagsuppgifterna, kopplar era system och går igenom upplägget
            innan betalningen.
          </p>
          <p className="text-sm text-slate-500">
            Bjud in teamet och lägg in jobben i kalendern så att Handymate får
            en rättvis bild av vardagen.
          </p>
          <Link
            href={`/onboarding?case=${encodeURIComponent(params.token)}`}
            className="inline-block rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white"
          >
            Kom igång med Handymate →
          </Link>
        </section>
      </div>
    </main>
  )
}
