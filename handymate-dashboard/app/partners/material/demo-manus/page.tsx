'use client'

// Demo-manuset — talarstöd för partnerns 20-minutersmöte.
// Claude Design-materialet (2026-09-07) troget återgivet, med EN medveten
// ändring: "SMS inom sekunder" → "SMS direkt" (Lisa-skarpbeviset mäter
// minuter, inte sekunder — vi lovar bara det beviset visar).

import { Loader2, Printer } from 'lucide-react'
import { usePartnerMe } from '../usePartnerMe'

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-slate-900 border-t border-slate-200 pt-5 mt-7 print:mt-4 print:pt-3">
      {children}
    </h2>
  )
}

export default function DemoManusPage() {
  const { partner, loading, referralUrl } = usePartnerMe()

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-700 animate-spin" /></div>
  }
  if (!partner) return null

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="max-w-3xl mx-auto px-5 py-10 print:py-0">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <p className="text-xs font-semibold tracking-[.14em] text-primary-700 uppercase">Partnermaterial · Talarstöd</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-100"
          >
            <Printer className="w-4 h-4" /> Skriv ut
          </button>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-2">
          Demo-manus: 20 minuter med en hantverkare
        </h1>
        <p className="text-slate-600 leading-relaxed mt-3">
          Följer Partnerdecken slide för slide. Berättelsen är en vanlig dag:{' '}
          <strong>morgon → arbete → kvitto</strong>. Prata som en kollega, inte som en säljare.
          Lyssna mer än du pratar.
        </p>

        <div className="text-[15px] leading-relaxed text-slate-700">
          <H2>Innan mötet (2 min)</H2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Ta reda på: hur många anställda, vilket fack, använder de Fortnox?</li>
            <li>Öppna Partnerdecken på mobilen — din länk står redan på sista sliden: <span className="font-mono text-[13px] break-all">{referralUrl}</span></li>
            <li>Ha Företagskollen redo i en flik: handymate.se/foretagskollen.</li>
          </ul>

          <H2>1 · Känner du igen dig? (2 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Vilken av de här tre hände dig senaste veckan?&rdquo; Låt dem svara. Det de väljer är det du återkommer till hela mötet.</p>
          <p className="mt-1.5 text-slate-500"><strong>Lyssna efter:</strong> kvällsadmin, missade samtal, saker kunden bett om som aldrig fakturerades.</p>

          <H2>2 · Ett team, inte ett verktyg (1 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Det här är inte ett program du ska lära dig. Det är sex kollegor med namn som lär sig dig. Matte är den du pratar med. De andra jobbar i bakgrunden.&rdquo; Nämn bara den agent som passar deras svar i steg 1.</p>

          <H2>3 · Morgonen (3 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Klockan åtta har Matte redan gått igenom firman. Du får tre saker, inte fyrtio. Karin har sett att ett projekt drar iväg på el. Daniel har sett en offert som kallnar.&rdquo;</p>
          <p className="mt-1.5"><strong>Fråga:</strong> &rdquo;Hur många offerter ligger obesvarade hos dig just nu?&rdquo; De vet oftast inte. Det är poängen.</p>
          <p className="mt-1.5 text-slate-500"><strong>Om de är skeptiska:</strong> &rdquo;Varje förslag har en beviskedja. Ett tryck visar mötet, offerten och citatet. Ingen svart låda.&rdquo;</p>

          <H2>4 · Under dagen (3 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Du spelar in platsbesöket med mobilen i fickan. Kunden säger &rsquo;vi vill nog ha sex spotlights också&rsquo;. Matte gör det till en uppgift, sparar att de föredrar ek, och flaggar att spotlights inte finns i offerten. Du sätter priset — Handymate gissar aldrig pengar.&rdquo;</p>
          <p className="mt-1.5 text-slate-500"><strong>Poäng att landa:</strong> det här är pengar som idag försvinner för att ingen skrev ner det.</p>

          <H2>5 · Papperet (2 min)</H2>
          <p className="mt-2">Gå snabbt. <strong>Säg:</strong> &rdquo;Offert på minuter, ROT/RUT rätt per jobbtyp, Fortnox i takt med e-faktura, byggdagbok med foto och attest, leverantörsfakturor på projektet, moms- och AGI-datum bevakade.&rdquo; Stanna bara på det de frågar om.</p>

          <H2>6 · Pengarna (2 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;När telefonkanalen är aktiverad och verifierad kan Lisa följa upp missade samtal via SMS. Karin föreslår fakturapåminnelser utifrån era inställningar. Du granskar innan utskick eller ger ett avgränsat mandat.&rdquo;</p>
          <p className="mt-1.5 text-slate-500"><strong>Fråga:</strong> &rdquo;Hur mycket ligger ute hos dig just nu som du inte har hunnit jaga?&rdquo;</p>

          <H2>7 · Kunden (1 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Kunden får en egen sida med offerter, ÄTA att godkänna och fakturor. När jobbet är klart får de ett jobbpass med foton och garanti. Det är därför de ringer dig nästa gång och inte googlar.&rdquo;</p>

          <H2>8 · Veckan (2 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Måndag sju får du veckan: pengar in, vad som kräver dig, vad teamet gjorde och en sak Handymate lärt sig om din firma.&rdquo;</p>
          <p className="mt-1.5 text-slate-500"><strong>Poäng att landa:</strong> &rdquo;Vi kallar aldrig något återvunnet förrän pengarna är på kontot. Du ska kunna lita på siffrorna.&rdquo;</p>

          <H2>9 · Du bestämmer (2 min)</H2>
          <p className="mt-2">Det här är sliden för den vanligaste oron: kontroll. <strong>Säg:</strong> &rdquo;Inget når en kund utan ditt OK. Du kan ge teamet ett mål med gränser — &rsquo;få in 80 000 före månadsskiftet, max fem utskick om dagen&rsquo;. Frånvaroläge när du är ledig. Och bränslemätaren visar bokförd användning.&rdquo;</p>

          <H2>10 · Första riktiga jobbet (1 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Vi börjar med din firma och ett riktigt arbetsflöde. Har du historik kan vi gå igenom den; börjar du utan historik väljer vi första jobbet tillsammans. Vi kontrollerar vad som fungerar och vad som återstår.&rdquo;</p>

          <H2>11 · Nästa steg (1 min)</H2>
          <p className="mt-2"><strong>Säg:</strong> &rdquo;Firman kostar 5 995 kronor per månad exklusive moms vid månadsbetalning, utan bindningstid. Hela teamet ingår och standardgarantin är 30 dagar. Bränsle ingår upp till planens gräns; extra påfyllning köps separat. Vi går igenom aktuella villkor tillsammans.&rdquo;</p>
          <p className="mt-1.5"><strong>Gör:</strong> Kör Företagskollen tillsammans direkt på mobilen. Det tar två minuter och ger dem en egen siffra att gå hem med. Lämna leave-behind-bladet med din kontakt.</p>

          <H2>Vanliga invändningar</H2>
          <div className="mt-2 space-y-2">
            <p><strong>&rdquo;Jag har redan Bygglet/Easoft.&rdquo;</strong> → &rdquo;Då utgår vi från hur ni arbetar idag och visar ett konkret moment i Handymate. Vi kontrollerar separat vilket underlag som kan föras över.&rdquo;</p>
            <p><strong>&rdquo;Jag vill inte att en AI pratar med mina kunder.&rdquo;</strong> → &rdquo;Den gör inte det utan ditt OK. Du godkänner allt tills du själv väljer att släppa mer.&rdquo;</p>
            <p><strong>&rdquo;Det är dyrt.&rdquo;</strong> → &rdquo;Vad kostar ett missat jobb? Ett ÄTA som ingen fakturerade? Räkna på dina egna siffror — Företagskollen hjälper dig.&rdquo;</p>
            <p><strong>&rdquo;Jag hinner inte sätta upp något nytt.&rdquo;</strong> → &rdquo;Vi väljer ett första moment som gör skillnad för dig. Tiden beror på vilket underlag och vilka anslutningar som behövs. Du får veta vad som ingår innan vi börjar.&rdquo;</p>
            <p><strong>&rdquo;Hur vet jag att den har rätt?&rdquo;</strong> → &rdquo;Tryck på &rsquo;Varför?&rsquo;. Du ser mötet, offerten och citatet. Och veckorapporten visar bara det som är verifierat.&rdquo;</p>
          </div>

          <H2>Säg inte</H2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>&rdquo;Revolutionerande&rdquo;, &rdquo;AI-plattform&rdquo;, &rdquo;agenter orkestrerar&rdquo;. Säg &rdquo;teamet&rdquo;, &rdquo;Matte&rdquo;, &rdquo;Karin&rdquo;.</li>
            <li>Att något är &rdquo;återvunnet&rdquo; eller &rdquo;säkrade pengar&rdquo;. Säg &rdquo;bevakas&rdquo;, &rdquo;flaggat&rdquo;, &rdquo;godkänt&rdquo;, &rdquo;betalt&rdquo; — efter status.</li>
            <li>Att telefon-AI eller röststyrning på bygget finns idag. Det är på väg. Vi lovar bara det som finns.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
