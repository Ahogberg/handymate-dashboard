'use client'
import type { ImpactResponse } from '@/lib/value/impact'
import { LedgerFlode } from './LedgerFlode'
import { LedgerRader } from './LedgerRader'
import { WeeklyValueReceipt } from '@/components/dashboard/WeeklyValueDigest'
export function ImpactView({ data }: { data: ImpactResponse }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">
          Arbetet som identifierades i {data.period}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Följ samma ärenden till handling, faktura och betalning. Senare steg
          kan ha inträffat efter månaden.
        </p>
        <LedgerFlode ledger={data.ledger} />
        <LedgerRader items={data.ledger.items} />
      </section>
      <WeeklyValueReceipt data={data.weekly} />
      {data.weekly.confirmed_items.length > 0 && (
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">
            Teamets verifierade utfall de senaste sju dagarna
          </h2>
          <ul className="mt-3 space-y-3">
            {data.weekly.confirmed_items.map((item, index) => (
              <li key={index}>
                <p>
                  {item.label} · {item.amount.toLocaleString('sv-SE')} kr
                </p>
                <p className="text-sm text-gray-600">
                  {item.agent} · {item.dagar} dagar från godkännande
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">
          Verifierade händelser under {data.period} (UTC)
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Accepterade offerter och betalningar kopplade till teamets arbete.
          Varje rad har sitt bevis. Detta är ett annat tidsfönster än kohorten
          ovan.
        </p>
        {data.receipt.confirmed_items.length === 0 ? (
          <p className="mt-3 text-sm">
            Inga verifierade beloppshändelser i perioden.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.receipt.confirmed_items.map((item, index) => (
              <li
                key={`${item.approval_id}:${index}`}
                className="border-t pt-3"
              >
                <a
                  className="underline"
                  href={`/dashboard/approvals#approval-${encodeURIComponent(item.approval_id)}`}
                >
                  {item.label}
                </a>
                <p>
                  {item.amount.toLocaleString('sv-SE')} kr · {item.agent} ·{' '}
                  {item.dagar} dagar från godkännande
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Månadens tidsunderlag</h2>
        <p className="mt-3">
          {data.receipt.estimated_minutes.toLocaleString('sv-SE')} min
          uppskattad arbetsbesparing
        </p>
        <p className="text-sm text-gray-600">
          Schablon per aktivitet, inte uppmätt arbetstid.
        </p>
        <p className="mt-3">
          {data.receipt.measured_minutes.toLocaleString('sv-SE')} min uppmätt
          genomloppstid
        </p>
        <p className="text-sm text-gray-600">
          Tid mellan arbetssteg, inte sparad arbetstid. Månadens tidsmått
          summeras inte med veckans.
        </p>
      </section>
      <p className="text-xs text-gray-500">
        Kontrollerat {new Date(data.checked_at).toLocaleString('sv-SE')}.
        Beloppen visar utfall kopplade till teamets arbete, inte bevisad
        merintäkt.
      </p>
    </div>
  )
}
