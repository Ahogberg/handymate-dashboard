/** @jsxImportSource react */
import { customerImportTitle, type CustomerImportResult } from '@/lib/customers/import-result'

/** Same receipt in onboarding and customer import. Partial success never gets an all-clear. */
export default function CustomerImportReceipt({ result }: { result: CustomerImportResult }) {
  const counts = [
    ['Skapade', result.created], ['Uppdaterade', result.updated],
    ['Oförändrade', result.unchanged], ['Överhoppade', result.skipped], ['Misslyckade', result.failed],
  ] as const
  return (
    <section aria-label="Importresultat" className="text-left" role="status">
      <h2 className="text-xl font-semibold text-gray-900">{customerImportTitle(result)}</h2>
      <p className="mt-2 text-sm text-gray-600">{result.total} rader kontrollerade. Antalen nedan gäller rader i kundlistan.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {counts.map(([label, count]) => (
          <div key={label} className="rounded-lg bg-gray-50 p-3">
            <dt className="text-sm text-gray-600">{label}</dt>
            <dd className={`text-2xl font-semibold ${label === 'Misslyckade' && count > 0 ? 'text-red-700' : 'text-gray-900'}`}>{count}</dd>
          </div>
        ))}
      </dl>
      {result.failed > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Kontrollera kundlistan innan du försöker igen. Rader som redan sparats finns kvar.</p>
          <ul className="mt-2 list-disc pl-5">
            {result.errors.map((message, i) => <li key={i}>{message}</li>)}
          </ul>
          {result.failed > result.errors.length && <p className="mt-2">Ytterligare {result.failed - result.errors.length} rader misslyckades.</p>}
        </div>
      )}
      <p className="mt-4 text-sm text-gray-500">Kvittot gäller kundlistan i Handymate. Det bekräftar inte synk till Fortnox eller aktivering av kundinflödet. Inga kundmeddelanden skickas av importen.</p>
    </section>
  )
}
