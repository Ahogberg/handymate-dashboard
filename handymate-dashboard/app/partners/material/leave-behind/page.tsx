'use client'

// Leave-behind — ensidig A4 att skriva ut och lämna hos hantverkaren.
// Claude Design-materialet (2026-09-07) troget återgivet; kontaktrutan
// förifylls med partnerns namn och riktiga referrallänk.

import { Loader2, Printer } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { usePartnerMe } from '../usePartnerMe'

export default function LeaveBehindPage() {
  const { partner, loading, referralUrl } = usePartnerMe()

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-700 animate-spin" /></div>
  }
  if (!partner) return null

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white py-8 print:py-0">
      <div className="max-w-[210mm] mx-auto px-4 print:px-0">
        <div className="flex justify-end mb-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-800 text-white text-sm font-medium hover:opacity-90"
          >
            <Printer className="w-4 h-4" /> Skriv ut (A4)
          </button>
        </div>

        {/* A4-arket */}
        <div className="bg-slate-50 shadow-lg print:shadow-none rounded-lg print:rounded-none p-8 flex flex-col gap-5" style={{ minHeight: '285mm' }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Handymate" className="w-8 h-8" />
              <span className="text-xl font-bold tracking-tight text-slate-900">Handymate</span>
            </div>
            <span className="text-[11px] font-semibold tracking-[.14em] text-primary-700 uppercase">Ett AI-team för hantverkare</span>
          </div>

          <div>
            <h1 className="text-[28px] font-bold tracking-tight leading-tight text-slate-900">
              Du sköter hantverket.<br /><span className="text-primary-700">Handymate sköter resten.</span>
            </h1>
            <p className="text-[13px] text-slate-600 leading-relaxed mt-2 max-w-xl">
              Sex AI-kollegor som går igenom firman varje morgon, tar möten och samtal vidare under
              dagen och visar i slutet av veckan vad det var värt. På svenska, varje dag.
              Inget når en kund utan ditt OK.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['PÅ MORGONEN', 'Handymate har redan gått igenom firman.', 'Tre saker som behöver dig — inte fyrtio. Resten har teamet redan tagit.'],
              ['UNDER ARBETSDAGEN', 'Spela in platsbesöket. Matte gör resten.', 'Det kunden säger blir uppgifter, sparade löften och ÄTA-förslag.'],
              ['I SLUTET AV VECKAN', 'Här är vad Handymate gjorde och vad det var värt.', 'Bara verifierade siffror. Identifierat är inte samma sak som betalt.'],
            ].map(([eyebrow, titel, text], i) => (
              <div key={eyebrow} className={`bg-white rounded-xl p-4 ${i === 2 ? 'border border-primary-700/35' : 'border border-slate-200'}`}>
                <p className="text-[9px] font-mono tracking-widest text-primary-700">{eyebrow}</p>
                <p className="text-[14px] font-semibold text-slate-900 leading-snug mt-1.5">{titel}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">{text}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-slate-700 leading-relaxed">
            {[
              'Missade samtal fångas med SMS — jobbet stannar hos dig',
              'Offert på minuter, ROT/RUT rätt räknat per jobbtyp',
              'Fakturor som påminner sig själva, Swish-QR, e-faktura',
              'Fortnox-synk, leverantörsfakturor och bolagskalender',
              'ÄTA och byggdagbok med foto och attest',
              'Marginalbevakning — och beviskedjan bakom varje förslag',
              'Egen kundportal med digitalt jobbpass vid avslut',
              'Frånvaroläge, uppdrag med gränser, veckorapport',
            ].map(t => (
              <p key={t}><span className="text-primary-700 font-bold">✓</span> {t}</p>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-center">
              <AgentAvatar agentKey="karin" size="lg" />
              <div>
                <p className="text-[10px] text-slate-400">Ett kvitto, så som det ser ut i appen</p>
                <p className="text-[12px] text-slate-900 leading-relaxed mt-1">
                  <span className="text-primary-700 font-bold">✓ Karin skickade påminnelsen.</span> 18 400 kr bevakas nu.
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-center">
              <AgentAvatar agentKey="matte" size="lg" />
              <div>
                <p className="text-[10px] text-slate-400">Dag ett</p>
                <p className="text-[12px] text-slate-900 leading-relaxed mt-1">
                  <span className="font-semibold">Ge Handymate 15 minuter</span> så börjar teamet jobba med det som redan finns i Fortnox.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto bg-[#0f2e2a] rounded-2xl p-6 flex justify-between items-center gap-6 text-white">
            <div>
              <p className="text-[10px] font-semibold tracking-[.14em] text-teal-300 uppercase">Ett pris. Allt ingår.</p>
              <p className="mt-1.5">
                <span className="text-[28px] font-bold tracking-tight leading-none">5 995 kr</span>
                <span className="text-[13px] text-white/60"> /mån</span>
              </p>
              <p className="text-[11px] text-white/65 leading-relaxed mt-1.5">
                Hela teamet. Ingen bindningstid. 30 dagars pengarna-tillbaka.<br />
                Storfirman 11 995 kr/mån för större team.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] tracking-widest text-white/50">NÄSTA STEG</p>
              <p className="text-[14px] font-semibold mt-1">Kör Företagskollen gratis — 2 minuter</p>
              <p className="text-[11px] text-teal-300 mt-0.5">handymate.se/foretagskollen</p>
              <p className="text-[10px] tracking-widest text-white/50 mt-3">DIN KONTAKT</p>
              <p className="text-[13px] font-medium mt-1">{partner.name}</p>
              <p className="text-[11px] text-white/70 mt-0.5 break-all">{referralUrl}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
