import Link from 'next/link'
import { ArrowRight, Check, ShieldCheck, Sparkles } from 'lucide-react'

export interface OutcomeLandingContent {
  eyebrow: string
  title: string
  lead: string
  primaryCta: string
  proofTitle: string
  proofBody: string
  quote: string
  benefits: Array<{ title: string; body: string }>
  steps: string[]
  closingTitle: string
  closingBody: string
}

export function OutcomeLandingPage({ content }: { content: OutcomeLandingContent }) {
  return (
    <main className="min-h-screen bg-[#f7faf9] text-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tight text-teal-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-800 text-sm text-white">H</span>
          Handymate
        </Link>
        <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-teal-800">Logga in</Link>
      </header>

      <section className="relative overflow-hidden border-y border-teal-950/5 bg-[#073f3a] text-white">
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-teal-200/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:py-28">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[.22em] text-teal-200">{content.eyebrow}</p>
            <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-[-.04em] sm:text-6xl">{content.title}</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-teal-50/80">{content.lead}</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/signup" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-teal-950 shadow-lg shadow-black/10 hover:bg-teal-50">
                {content.primaryCta}<ArrowRight className="h-4 w-4" />
              </Link>
              <span className="inline-flex items-center gap-2 text-sm text-teal-100/80"><ShieldCheck className="h-4 w-4" />Du godkänner viktiga åtgärder</span>
            </div>
          </div>
          <aside className="self-end rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="flex items-center gap-2 text-sm font-bold text-teal-100"><Sparkles className="h-4 w-4" />Chefsagenten Matte</div>
            <blockquote className="mt-5 text-2xl font-semibold leading-9 tracking-tight">“{content.quote}”</blockquote>
            <p className="mt-6 text-sm leading-6 text-teal-100/75">Säg vad du vill uppnå. Matte samlar rätt specialistteam och håller ihop nästa steg.</p>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-teal-700">Från signal till handling</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-.03em] sm:text-5xl">{content.proofTitle}</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">{content.proofBody}</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {content.benefits.map(benefit => (
            <article key={benefit.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-teal-800"><Check className="h-5 w-5" /></div>
              <h3 className="text-lg font-bold">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-teal-700">Så fungerar ett Uppdrag</p>
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {content.steps.map((step, index) => (
              <div key={step} className="rounded-2xl bg-slate-50 p-5">
                <span className="text-xs font-black text-teal-700">0{index + 1}</span>
                <p className="mt-3 text-sm font-semibold leading-6">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h2 className="text-3xl font-black tracking-[-.03em] sm:text-5xl">{content.closingTitle}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">{content.closingBody}</p>
        <Link href="/signup" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900">
          {content.primaryCta}<ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-5 text-xs text-slate-500">Viktiga kundutskick och ekonomiska åtgärder följer Handymates godkännanderegler.</p>
      </section>
    </main>
  )
}
