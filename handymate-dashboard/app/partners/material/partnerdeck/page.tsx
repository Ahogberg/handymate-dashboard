'use client'

// Partnerdecken — 11 mobilanpassade "slides" som vertikala sektioner.
// Innehållet är Claude Design-materialet (2026-09-07) troget återgivet;
// sista sektionens kontakt förifylls med partnerns riktiga namn och länk.
// Pitch-decken (16:9) läggs in separat när den uppdaterade versionen är klar.

import { Loader2 } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { usePartnerMe } from '../usePartnerMe'

const AGENTER: Array<{ key: string; namn: string; roll: string }> = [
  { key: 'matte', namn: 'Matte', roll: 'Går igenom firman varje morgon' },
  { key: 'karin', namn: 'Karin', roll: 'Fakturor, marginal, moms' },
  { key: 'daniel', namn: 'Daniel', roll: 'Offerter och uppföljning' },
  { key: 'lars', namn: 'Lars', roll: 'Projekt, tid, byggdagbok' },
  { key: 'hanna', namn: 'Hanna', roll: 'Väcker gamla kunder' },
  { key: 'lisa', namn: 'Lisa', roll: 'Samtal och kundservice' },
]

function Eyebrow({ children, ljus }: { children: React.ReactNode; ljus?: boolean }) {
  return (
    <p className={`text-xs font-semibold tracking-[.14em] uppercase ${ljus ? 'text-teal-300' : 'text-primary-700'}`}>
      {children}
    </p>
  )
}

function AgentRad({ agentKey, namn, text, accent }: { agentKey: string; namn: string; text: string; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl px-5 py-4 flex gap-4 items-start ${accent ? 'border border-primary-700/35 shadow-[0_8px_30px_rgba(15,118,110,.1)]' : 'border border-slate-200'}`}>
      <AgentAvatar agentKey={agentKey} size="md" />
      <div className="min-w-0">
        <p className="text-[11px] font-mono text-primary-700 uppercase">{namn}</p>
        <p className="text-[15px] text-slate-900 leading-relaxed mt-0.5">{text}</p>
      </div>
    </div>
  )
}

export default function PartnerdeckPage() {
  const { partner, loading, referralUrl } = usePartnerMe()

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-700 animate-spin" /></div>
  }
  if (!partner) return null

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <div className="max-w-md mx-auto">

        {/* 01 · Känner du igen dig */}
        <section className="bg-[#0f2e2a] text-white px-6 py-12 flex flex-col gap-8 min-h-screen justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Handymate" className="w-10 h-10" />
            <span className="text-xl font-bold tracking-tight">Handymate</span>
          </div>
          <div>
            <Eyebrow ljus>Känner du igen dig?</Eyebrow>
            <div className="flex flex-col gap-3.5 mt-6">
              {[
                'Ett samtal missat när du stod på stegen. Kunden ringde nästa firma.',
                'Offerten från tisdags är fortfarande inte skriven. Det är fredag.',
                'Kunden bad om något extra på plats. Ingen skrev ner det. Ingen fakturerade det.',
              ].map(t => (
                <div key={t} className="bg-white/[.06] border border-white/10 rounded-2xl px-5 py-4">
                  <p className="text-[17px] leading-relaxed">{t}</p>
                </div>
              ))}
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            Du sköter hantverket.<br /><span className="text-teal-300">Handymate sköter resten.</span>
          </h1>
        </section>

        {/* 02 · Ett team */}
        <section className="bg-slate-50 px-6 py-12">
          <Eyebrow>Ditt AI-team</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Inte ett verktyg du använder. Ett team som jobbar åt dig.
          </h2>
          <div className="grid grid-cols-1 gap-3 mt-8">
            {AGENTER.map(a => (
              <div key={a.key} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex gap-4 items-center">
                <AgentAvatar agentKey={a.key} size="lg" />
                <div>
                  <p className="text-[17px] font-semibold text-slate-900">{a.namn}</p>
                  <p className="text-sm text-slate-500">{a.roll}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[15px] text-slate-600 leading-relaxed mt-8">
            Alla pratar svenska, jobbar varje dag och skickar aldrig något till en kund utan ditt OK.
          </p>
        </section>

        {/* 03 · Morgonen */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>På morgonen</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Handymate har redan gått igenom firman
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed mt-3">
            Klockan 08:07 väntar det som behöver dig. Resten har teamet redan tagit.
          </p>
          <div className="flex flex-col gap-3 mt-7">
            <AgentRad agentKey="matte" namn="Matte" text="God morgon. Tre saker väntar på dig." />
            <AgentRad agentKey="karin" namn="Karin" text="Storgatan riskerar marginal. Elen ligger 9 % över kalkyl." />
            <AgentRad agentKey="daniel" namn="Daniel" text="Offerten till Ekvägen är oläst i 11 dagar. Ska jag följa upp?" />
            <AgentRad agentKey="matte" namn="Matte" text="Kunden på Storgatan bad om något nytt i gårdagens möte. Jag har lagt ett ÄTA-utkast." accent />
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mt-6">
            Undrar du varför? Ett tryck visar mötet, offerten och citatet bakom varje förslag.
          </p>
        </section>

        {/* 04 · Under dagen */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>Under arbetsdagen</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Spela in platsbesöket. Matte gör resten.
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed mt-3">
            Det kunden säger på plats blir en uppgift, ett sparat löfte eller ett ÄTA-förslag. Utan att du skriver en rad.
          </p>
          <div className="flex flex-col gap-3 mt-7">
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
              <p className="text-[11px] font-mono text-slate-400 uppercase">14:32 · Platsbesök Storgatan · 42 min</p>
              <p className="text-[15px] font-medium text-slate-700 mt-1">Inspelat och sammanfattat av Matte</p>
            </div>
            <div className="self-center text-slate-400 text-xl leading-none">↓</div>
            <div className="bg-white border border-primary-700/35 rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgba(15,118,110,.1)]">
              <p className="text-[11px] font-mono text-primary-700 uppercase">Matte tog hand om mötet</p>
              <div className="flex flex-col gap-1.5 mt-2.5 text-[15px] text-slate-700">
                <p><span className="text-primary-700 font-bold">✓</span> 3 uppgifter skapade</p>
                <p><span className="text-primary-700 font-bold">✓</span> 1 kundpreferens sparad: &rdquo;föredrar ek&rdquo;</p>
                <p><span className="text-amber-700 font-bold">⚠</span> 1 möjligt ÄTA väntar på ditt pris</p>
              </div>
            </div>
            <div className="self-center text-slate-400 text-xl leading-none">↓</div>
            <div className="bg-primary-700 rounded-2xl px-5 py-4">
              <p className="text-[11px] font-mono text-teal-200 uppercase">16:10</p>
              <p className="text-[15px] font-medium text-white mt-1">
                Kunden godkände ÄTA:t i portalen. 7 800 kr som annars hade glömts.
              </p>
            </div>
          </div>
        </section>

        {/* 05 · Papperet */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>Papperet</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Allt som måste bli rätt — blir rätt
          </h2>
          <div className="flex flex-col gap-3 mt-7">
            {[
              ['Offert på minuter', 'Välj jobbtyp — rader, material och avdrag förifylls från din mall.'],
              ['ROT/RUT rätt räknat', 'Arbete och material delas upp automatiskt, rätt procent per jobbtyp.'],
              ['Fortnox-synk med e-faktura', 'Kunder, fakturor och betalningar i takt. E-faktura till företagskunder.'],
              ['ÄTA och byggdagbok', 'Foto, attest och tid på rätt projekt. Kunden godkänner i portalen.'],
              ['Leverantörsfakturor på projektet', 'Så att marginalen är verklig, inte gissad.'],
              ['Karins bolagskalender', 'Moms- och AGI-datum bevakade. Du påminns i tid.'],
            ].map(([titel, text]) => (
              <div key={titel} className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
                <p className="text-[17px] font-semibold text-slate-900">{titel}</p>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 06 · Pengarna */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>Pengarna</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Inget jobb missas. Ingen faktura glöms.
          </h2>
          <div className="flex flex-col gap-3 mt-7">
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
              <p className="text-[11px] font-mono text-slate-400">13:42</p>
              <p className="text-[15px] font-medium text-slate-700 mt-1">Missat samtal — Anna, Bromma</p>
            </div>
            <div className="self-center text-slate-400 text-xl leading-none">↓</div>
            <div className="bg-white border border-primary-700/35 rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgba(15,118,110,.1)]">
              <p className="text-[11px] font-mono text-primary-700 uppercase">13:42 · SMS skickat</p>
              <p className="text-[15px] text-slate-700 leading-relaxed mt-1">
                &rdquo;Hej! Vi såg att du ringde. Beskriv gärna jobbet här, så återkommer vi så snart vi kan.&rdquo;
              </p>
            </div>
            <div className="self-center text-slate-400 text-xl leading-none">↓</div>
            <div className="bg-primary-700 rounded-2xl px-5 py-4">
              <p className="text-[11px] font-mono text-teal-200">14:05</p>
              <p className="text-[15px] font-medium text-white mt-1">Anna svarar. Jobbet stannar hos dig.</p>
            </div>
          </div>
          <div className="mt-7 bg-white border border-slate-200 rounded-2xl px-5 py-4 flex gap-4 items-center">
            <AgentAvatar agentKey="karin" size="lg" />
            <p className="text-[15px] text-slate-900 leading-relaxed">
              <span className="text-primary-700 font-bold">✓ Karin skickade påminnelsen.</span>{' '}
              18 400 kr bevakas nu. Dag 5, dag 12 — tills det är betalt.
            </p>
          </div>
        </section>

        {/* 07 · Kunden */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>Dina kunder</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Bli kundens fasta hantverkare
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed mt-3">
            Kunden får en egen inloggning: offerter, ÄTA att godkänna, fakturor och allt ni sagt — på ett ställe.
          </p>
          <div className="mt-7 bg-white border border-primary-700/25 rounded-2xl px-5 py-4">
            <p className="text-[15px] text-slate-900 leading-relaxed">
              Vid avslut får kunden ett digitalt jobbpass: omfattning, ÄTA, foton, egenkontroll och garanti.{' '}
              <span className="text-primary-700 font-semibold">Avslutet som startar nästa affär.</span>
            </p>
          </div>
        </section>

        {/* 08 · Veckan */}
        <section className="bg-slate-50 px-6 py-12 border-t border-slate-200">
          <Eyebrow>I slutet av veckan</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Här är vad Handymate gjorde — och vad det var värt
          </h2>
          <div className="mt-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,.08)]">
            <p className="text-[11px] font-mono text-slate-400 uppercase">Vecka 36 · Måndag 07:00</p>
            <p className="text-xl font-bold text-slate-900 mt-1">Veckan med Handymate</p>
            <div className="grid grid-cols-2 gap-3 mt-4 text-[13px] leading-relaxed">
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] tracking-widest text-slate-400">PENGAR</p>
                <p className="text-primary-700 mt-1.5">+ 24 800 kr accepterat<br />+ 7 800 kr ÄTA godkänt<br />+ 18 400 kr fakturerat</p>
                <p className="text-amber-700 mt-1">⚠ 31 200 kr kräver dig</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] tracking-widest text-slate-400">PROJEKT</p>
                <p className="text-slate-700 mt-1.5">3 enligt plan<br /><span className="text-amber-700">1 behöver dig</span><br />2 avslutade</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] tracking-widest text-slate-400">SÄLJ</p>
                <p className="text-slate-700 mt-1.5">4 nya leads<br />3 offerter skickade<br /><span className="text-amber-700">2 behöver följas upp</span></p>
              </div>
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] tracking-widest text-slate-400">TEAMET</p>
                <p className="text-slate-700 mt-1.5">Matte 8 möten<br />Karin 12 händelser<br />Daniel 5 · Lars 6</p>
              </div>
            </div>
            <div className="mt-3 bg-teal-50 border border-primary-700/25 rounded-xl p-3">
              <p className="text-[10px] tracking-widest text-primary-700">LÄRT SIG DEN HÄR VECKAN</p>
              <p className="text-[14px] text-slate-900 italic mt-1">&rdquo;Badrumsrivning tar längre tid än kalkylerat.&rdquo;</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mt-5">
            Bara verifierade siffror. Vi kallar aldrig något återvunnet förrän pengarna är på kontot.
          </p>
        </section>

        {/* 09 · Du bestämmer */}
        <section className="bg-[#134e4a] text-white px-6 py-12">
          <Eyebrow ljus>Du bestämmer</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight leading-tight mt-2">
            Teamet jobbar. Du håller i ratten.
          </h2>
          <div className="flex flex-col gap-3 mt-8">
            {[
              ['Inget når en kund utan ditt OK', 'Ett tryck i mobilen. När du litar på teamet släpper du mer — i din takt.'],
              ['Ge ett uppdrag med gränser', '"Få in 80 000 kr före månadsskiftet." Max antal utskick, aldrig över en viss summa, alltid återkallbart.'],
              ['Frånvaroläge', 'Åk på semester. Bara verkliga undantag når dig — resten väntar i en rapport.'],
              ['Bränslemätaren', 'Du ser exakt vad AI:n kostar och vad den gjort för pengarna.'],
              ['"Varför säger Handymate det?"', 'Varje förslag visar mötet, offerten och citatet det bygger på.'],
            ].map(([titel, text]) => (
              <div key={titel} className="bg-white/[.06] border border-white/10 rounded-2xl px-5 py-4">
                <p className="text-[17px] font-semibold">{titel}</p>
                <p className="text-sm text-white/65 leading-relaxed mt-1">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 10 · Dag ett */}
        <section className="bg-slate-50 px-6 py-12">
          <Eyebrow>Dag ett</Eyebrow>
          <h2 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight mt-2">
            Börja med ett riktigt jobb
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed mt-3">
            Vi går igenom din firma och väljer ett första arbetsflöde. Anslut de tjänster du behöver och kontrollera vad som fungerar innan du börjar använda dem.
          </p>
          <div className="mt-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,.08)]">
            <p className="text-lg font-semibold text-slate-900">Exempel: en firma med importerad historik</p>
            <div className="flex flex-col gap-2.5 mt-4 text-[15px] text-slate-700">
              {[
                '347 kunder hittade',
                '18 öppna fakturor analyserade',
                'Karin hittade 63 400 kr utestående',
                'Daniel hittade 3 offerter att följa upp',
              ].map(t => (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary-700 text-white text-xs flex items-center justify-center flex-none">✓</span>
                  <span>{t}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 text-slate-400">
                <span className="w-6 h-6 rounded-full border-2 border-slate-300 flex-none" />
                <span>Söker efter saker som behöver dig…</span>
              </div>
            </div>
            <div className="mt-4 bg-primary-700 rounded-xl px-4 py-3">
              <p className="text-[15px] font-medium text-white">Handymate är igång. Här är vad teamet hittade.</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mt-5">
            Siffrorna ovan är exempel. I din firma visas det underlag som faktiskt finns — nästa steg anpassas även om du börjar utan historik.
          </p>
        </section>

        {/* 11 · Nästa steg — förifylld med partnerns kontakt */}
        <section className="bg-[#0f2e2a] text-white px-6 py-12 flex flex-col gap-8">
          <div>
            <Eyebrow ljus>Hela teamet. Tydliga villkor.</Eyebrow>
            <div className="flex items-baseline gap-2 mt-4">
              <span className="text-5xl font-bold tracking-tight">5 995 kr</span>
              <span className="text-xl text-white/60">/mån</span>
            </div>
            <p className="text-[15px] text-white/65 leading-relaxed mt-3">
              Firman: 5 995 kr/mån exkl. moms vid månadsbetalning, utan bindningstid. 30 dagars pengarna-tillbaka-garanti. Storfirman: 11 995 kr/mån exkl. moms för större volym. Bränsle ingår upp till planens gräns; extra påfyllning köps separat.
            </p>
            <p className="text-xl font-semibold leading-snug mt-6">
              Utgå från <span className="text-teal-300">vad det kan göra för din firma</span>.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="bg-gradient-to-br from-primary-700 to-teal-500 rounded-2xl px-5 py-4 shadow-lg shadow-primary-700/25">
              <p className="text-[17px] font-semibold">Kör Företagskollen nu — gratis, 2 minuter</p>
              <p className="text-sm text-white/80 mt-1">Se vad Handymate hittar i din firma innan du bestämmer dig.</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl px-5 py-4">
              <p className="text-[17px] font-semibold">Boka en genomgång — 20 minuter</p>
              <p className="text-sm text-white/65 mt-1">Vi går igenom din firma tillsammans.</p>
            </div>
          </div>
          <div className="flex justify-between items-end gap-4 border-t border-white/10 pt-6">
            <div className="min-w-0">
              <p className="text-[11px] tracking-widest text-white/50">DIN KONTAKT</p>
              <p className="text-lg font-semibold mt-1">{partner.name}</p>
              <p className="text-sm text-white/70 mt-0.5 break-all">{referralUrl}</p>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <img src="/logo.png" alt="Handymate" className="w-8 h-8" />
              <span className="text-lg font-semibold">Handymate</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
