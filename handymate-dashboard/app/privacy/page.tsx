import Link from 'next/link'

export const metadata = {
  title: 'Integritetspolicy - Handymate',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">&larr; Tillbaka</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Integritetspolicy</h1>
        <p className="text-sm text-gray-500 mb-8">Senast uppdaterad: 2026-02-11</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Vem ansvarar för dina personuppgifter?</h2>
            <p className="text-gray-700 leading-relaxed">
              Handymate AB (nedan &quot;Handymate&quot;, &quot;vi&quot;, &quot;oss&quot;) är personuppgiftsansvarig för behandlingen av dina personuppgifter.
              Du når oss på <a href="mailto:privacy@handymate.se" className="text-blue-600 hover:underline">privacy@handymate.se</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Vilka uppgifter samlar vi in?</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <p className="font-medium text-gray-900">Kontouppgifter</p>
                <p className="text-sm text-gray-600">Namn, e-post, telefonnummer, företagsnamn, organisationsnummer.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Kunddata</p>
                <p className="text-sm text-gray-600">Namn, adress, telefonnummer, e-post till era kunder som ni registrerar i plattformen.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Samtalsinspelningar</p>
                <p className="text-sm text-gray-600">Ljudfiler och transkriberingar av samtal som ni väljer att spela in, med samtycke från uppringaren.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Ekonomiska uppgifter</p>
                <p className="text-sm text-gray-600">Offerter, fakturor, tidrapporter och betalningshistorik.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Teknisk data</p>
                <p className="text-sm text-gray-600">IP-adress, webbläsartyp, enhet och användningsmönster.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Varför behandlar vi uppgifterna?</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Avtal:</strong> För att tillhandahålla våra tjänster enligt avtalet med dig.</li>
              <li><strong>Berättigat intresse:</strong> För att förbättra plattformen, förhindra missbruk och ge support.</li>
              <li><strong>Samtycke:</strong> För samtalsinspelning (samtycke inhämtas per samtal).</li>
              <li><strong>Rättslig förpliktelse:</strong> Bokföringslagen kräver att vi bevarar ekonomisk data i 7 år.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Hur länge sparar vi data?</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Datatyp</th>
                    <th className="pb-2 font-medium">Lagringstid</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-gray-50"><td className="py-2">Kontouppgifter</td><td>Så länge kontot är aktivt + 30 dagar</td></tr>
                  <tr className="border-b border-gray-50"><td className="py-2">Kunddata</td><td>Så länge kontot är aktivt + 30 dagar</td></tr>
                  <tr className="border-b border-gray-50"><td className="py-2">Samtalsinspelningar</td><td>90 dagar (konfigurerbart)</td></tr>
                  <tr className="border-b border-gray-50"><td className="py-2">Ekonomisk data</td><td>7 år (bokföringslagen)</td></tr>
                  <tr><td className="py-2">Teknisk data</td><td>12 månader</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Vilka delar vi data med?</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Supabase (EU):</strong> Databaslagring och autentisering.</li>
              <li><strong>Vercel:</strong> Hosting av webbapplikationen.</li>
              <li><strong>46elks:</strong> Telefoni och SMS-tjänster (Sverige).</li>
              <li><strong>Anthropic:</strong> AI-analys (anonymiserat där möjligt).</li>
              <li><strong>OpenAI:</strong> Transkribering av samtalsinspelningar.</li>
              <li><strong>Stripe:</strong> Betalningshantering.</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2">Vi säljer aldrig dina uppgifter till tredje part.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Dina rättigheter</h2>
            <p className="text-gray-700 mb-3">Enligt GDPR har du rätt att:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Få tillgång</strong> till dina personuppgifter (dataexport).</li>
              <li><strong>Rätta</strong> felaktiga uppgifter.</li>
              <li><strong>Radera</strong> dina uppgifter (&quot;rätten att bli glömd&quot;).</li>
              <li><strong>Flytta</strong> dina uppgifter till annan tjänst (dataportabilitet).</li>
              <li><strong>Invända</strong> mot behandling baserad på berättigat intresse.</li>
              <li><strong>Återkalla</strong> samtycke när som helst.</li>
            </ul>
            <p className="text-sm text-gray-600 mt-3">
              Kontakta oss på <a href="mailto:privacy@handymate.se" className="text-blue-600 hover:underline">privacy@handymate.se</a> eller
              använd dataexport- och raderingsfunktionerna i inställningarna.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies</h2>
            <p className="text-gray-700">
              Vi använder nödvändiga cookies för autentisering och sessionhantering.
              Analyscookies används bara med ditt samtycke. Du kan ändra dina cookiepreferenser när som helst.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Klagomål</h2>
            <p className="text-gray-700">
              Om du anser att vi hanterar dina personuppgifter felaktigt har du rätt att lämna klagomål till
              Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">www.imy.se</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
