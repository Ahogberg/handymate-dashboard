'use client'

/**
 * Mockuperna för de tre sidkontaktpunkterna (offertsidan, kundportalen,
 * jobbpasset) och de små tumnaglarna på korten. Allt är exempeldata ur
 * lib/branding/kundvy — ingen riktig kund. Mailen och SMS:en byggs av
 * servern (buildKundvyPreviews); här ritas bara det som saknar sändväg
 * i HTML-form.
 *
 * ROT-avdraget står som preliminärt överallt.
 */
import { EXEMPEL } from '@/lib/branding/kundvy'
import { ATTRIBUTION_BRAND, ATTRIBUTION_PREFIX } from '@/lib/branding/attribution'

export interface MockBrand {
  businessName: string
  accent: string
  logoUrl: string | null
}

const kr = (n: number) => `${n.toLocaleString('sv-SE')} kr`

/** Logotypen om den finns, annars firmanamnet som text — som i mailens sidhuvud. */
export function LogoMark({ brand, onDark = false, size = 'md' }: { brand: MockBrand; onDark?: boolean; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'max-h-4' : 'max-h-7'
  if (brand.logoUrl) {
    return (
      <span className={`inline-flex items-center ${onDark ? 'bg-white rounded px-1.5 py-0.5' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt={brand.businessName} className={`${h} max-w-[120px] object-contain`} />
      </span>
    )
  }
  return (
    <span className={`font-bold tracking-tight truncate ${size === 'sm' ? 'text-[11px]' : 'text-[15px]'} ${onDark ? 'text-white' : 'text-slate-900'}`}>
      {brand.businessName}
    </span>
  )
}

function Stamp() {
  return (
    <div className="text-[10px] text-slate-400 text-center pt-3">
      {ATTRIBUTION_PREFIX}<span className="text-teal-700 underline">{ATTRIBUTION_BRAND}</span>
    </div>
  )
}

/** Sidhuvudet i portalen/offertsidan: vit rad med logotyp + tunn accentlinje. */
function PageHeader({ brand, sub }: { brand: MockBrand; sub?: string }) {
  return (
    <div className="bg-white px-4 py-3 border-b-2" style={{ borderColor: brand.accent }}>
      <LogoMark brand={brand} />
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function AccentButton({ brand, children }: { brand: MockBrand; children: React.ReactNode }) {
  return (
    <div className="rounded-lg text-white text-[13px] font-semibold text-center py-2.5" style={{ background: brand.accent }}>
      {children}
    </div>
  )
}

/** 2 · Offertsidan — där kunden godkänner, i mobilen. */
export function OffertsidaMock({ brand }: { brand: MockBrand }) {
  const o = EXEMPEL.offert
  return (
    <div className="bg-slate-50 min-h-full text-slate-900">
      <PageHeader brand={brand} sub={`Offert ${o.nummer}`} />
      <div className="p-4 flex flex-col gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Till {EXEMPEL.kund.namn}</div>
          <div className="text-[16px] font-bold leading-tight mt-0.5">{o.titel}</div>
          <p className="text-[12px] text-slate-600 mt-1.5 leading-snug">{o.beskrivning}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="flex justify-between text-[12px] text-slate-600"><span>Totalt inkl. moms</span><span className="tabular-nums">{kr(o.total)}</span></div>
          <div className="flex justify-between text-[12px] text-slate-600 mt-1"><span>ROT-avdrag (preliminärt)</span><span className="tabular-nums">−{kr(o.rotAvdrag)}</span></div>
          <div className="flex justify-between text-[14px] font-bold mt-2 pt-2 border-t border-slate-200"><span>Du betalar</span><span className="tabular-nums">{kr(o.kundBetalar)}</span></div>
        </div>
        <AccentButton brand={brand}>Godkänn offerten</AccentButton>
        <div className="text-[11px] text-slate-500 text-center">Giltig till 5 oktober · Ladda ner PDF</div>
        <Stamp />
      </div>
    </div>
  )
}

/** 4 · Kundportalen — allt om jobbet på ett ställe. */
export function PortalMock({ brand }: { brand: MockBrand }) {
  const o = EXEMPEL.offert
  const f = EXEMPEL.faktura
  return (
    <div className="bg-slate-50 min-h-full text-slate-900">
      <PageHeader brand={brand} sub={`Hej ${EXEMPEL.kund.namn.split(' ')[0]}`} />
      <div className="p-4 flex flex-col gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pågående jobb</div>
          <div className="text-[14px] font-bold mt-0.5">{o.titel}</div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-2/3 rounded-full" style={{ background: brand.accent }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Nästa: {EXEMPEL.bokning.dag} kl {EXEMPEL.bokning.tid}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {[
            ['Offert', o.nummer, 'Godkänd'],
            ['Faktura', f.nummer, 'Förfaller 19 okt'],
            ['Dokument', 'Egenkontroll', 'PDF'],
          ].map(([a, b, c]) => (
            <div key={a} className="flex items-center justify-between px-3.5 py-2.5 text-[12px]">
              <div><span className="font-semibold">{a}</span> <span className="text-slate-500">{b}</span></div>
              <span className="text-[11px] font-medium" style={{ color: brand.accent }}>{c}</span>
            </div>
          ))}
        </div>
        <AccentButton brand={brand}>Betala {kr(f.attBetala)} med Swish</AccentButton>
        <Stamp />
      </div>
    </div>
  )
}

/** 5 · Jobbpasset — "Ditt hem" med foton från dagen. */
export function JobbpassMock({ brand }: { brand: MockBrand }) {
  return (
    <div className="bg-slate-50 min-h-full text-slate-900">
      <PageHeader brand={brand} sub="Ditt hem" />
      <div className="p-4 flex flex-col gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{EXEMPEL.dagbok.dag}</div>
          <div className="text-[14px] font-bold mt-0.5">{EXEMPEL.dagbok.text}</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-gradient-to-br from-slate-200 to-slate-300" />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-[12px] text-slate-600 leading-snug">
          Vi har lagt kaklet på väggarna och fogar imorgon. Golvvärmen är testad och fungerar.
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: brand.accent }}>
            {brand.businessName.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-slate-600">{brand.businessName} · 16:42</span>
        </div>
        <Stamp />
      </div>
    </div>
  )
}

export function PageMock({ id, brand }: { id: 'offertsida' | 'portal' | 'jobbpass'; brand: MockBrand }) {
  if (id === 'offertsida') return <OffertsidaMock brand={brand} />
  if (id === 'portal') return <PortalMock brand={brand} />
  return <JobbpassMock brand={brand} />
}

/** SMS-bubblan — som kunden ser den i telefonen. */
export function SmsBubble({ sender, text }: { sender?: string; text: string }) {
  return (
    <div className="px-4 py-5">
      {sender && <div className="text-[11px] text-slate-500 text-center mb-3">{sender}</div>}
      <div className="max-w-[85%] bg-slate-200 text-slate-900 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] leading-snug whitespace-pre-line">
        {text}
      </div>
    </div>
  )
}

// ── Tumnaglar på korten ────────────────────────────────────────────────

/** Ett mail i miniatyr: sidhuvud med logotyp + accentlinje, rubrik, belopp, knapp. */
export function MailMini({ brand, label, amount }: { brand: MockBrand; label: string; amount: string }) {
  return (
    <div className="w-[128px] bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden text-slate-900">
      <div className="px-2 py-1.5 border-b-2 flex items-center" style={{ borderColor: brand.accent }}>
        <LogoMark brand={brand} size="sm" />
      </div>
      <div className="px-2 py-2 flex flex-col gap-1.5">
        <div className="text-[9px] font-semibold leading-tight">{label}</div>
        <div className="h-1 w-3/4 rounded bg-slate-200" />
        <div className="h-1 w-1/2 rounded bg-slate-200" />
        <div className="text-[10px] font-bold tabular-nums">{amount}</div>
        <div className="h-4 rounded text-white text-[7px] font-semibold flex items-center justify-center" style={{ background: brand.accent }}>
          Öppna
        </div>
      </div>
    </div>
  )
}

export function SmsMini({ sender, text }: { sender: string; text: string }) {
  return (
    <div className="w-[128px] text-slate-900">
      <div className="text-[8px] text-slate-500 text-center mb-1">{sender}</div>
      <div className="bg-slate-200 rounded-xl rounded-bl-sm px-2 py-1.5 text-[8px] leading-snug whitespace-pre-line line-clamp-5">
        {text}
      </div>
    </div>
  )
}

/** Sidmockup i miniatyr — telefonen ritas i naturlig storlek och skalas ner. */
export function PageMini({ id, brand }: { id: 'offertsida' | 'portal' | 'jobbpass'; brand: MockBrand }) {
  return (
    <div className="w-[150px] h-[150px] overflow-hidden flex justify-center">
      <div
        className="w-[300px] h-[300px] origin-top rounded-t-[22px] overflow-hidden border-[4px] border-b-0 border-[#0f172a]"
        style={{ transform: 'scale(0.5)' }}
      >
        <PageMock id={id} brand={brand} />
      </div>
    </div>
  )
}

export const MINI_AMOUNTS = {
  offertmail: kr(EXEMPEL.offert.kundBetalar),
  faktura: kr(EXEMPEL.faktura.attBetala),
}
