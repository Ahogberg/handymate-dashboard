import { STAGES } from '@/lib/revenue/domain'
export type Metrics = {
  stages: { status: keyof typeof STAGES; count: number }[]
  sources: { source: string; accounts: number; won: number }[]
  channels: { activity_type: string; activities: number; accounts: number }[]
  contacted_30d: number
  replied_30d: number
  meetings_30d: number
  active_sequences: number
  unqualified: number
  stale: number
}
export function SalesMetrics({ metrics: m }: { metrics: Metrics }) {
  return <section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-semibold">Pipeline och utfall</h2>
    <p className="text-sm text-slate-500">Hela din behöriga portfölj. Kontaktmåtten avser loggade händelser de senaste 30 dagarna. Vunnen affär är säljarens bedömning och innebär inte verifierad betalning.</p>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">{[
      ['Kontaktade företag', m.contacted_30d], ['Företag med svar/kontakt', m.replied_30d], ['Loggade möten', m.meetings_30d],
      ['Aktiva sekvenser', m.active_sequences], ['Ej kvalificerade', m.unqualified], ['Ingen kontakt på 14 dagar', m.stale],
    ].map(([label, n]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold">{n}</p></div>)}</div>
    <div className="flex flex-wrap gap-2">{Object.entries(STAGES).map(([key, label]) => <span key={key} className="rounded-lg bg-stone-100 p-2 text-sm">{label}: {m.stages.find(s => s.status === key)?.count || 0}</span>)}</div>
    <details><summary className="cursor-pointer text-sm text-teal-700">Källor och kontaktkanaler</summary>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <table className="w-full text-left text-sm"><caption className="text-left font-semibold">Nuvarande affärsstatus per källa</caption><thead><tr><th>Källa</th><th>Företag</th><th>Vunna</th></tr></thead><tbody>{m.sources.map(s => <tr key={s.source}><td>{s.source}</td><td>{s.accounts}</td><td>{s.won}</td></tr>)}</tbody></table>
        <table className="w-full text-left text-sm"><caption className="text-left font-semibold">Kontakt senaste 30 dagarna</caption><thead><tr><th>Kanal</th><th>Aktiviteter</th><th>Företag</th></tr></thead><tbody>{m.channels.map(c => <tr key={c.activity_type}><td>{{ call: 'Samtal', email: 'E-post', meeting: 'Möte', audit: 'Genomgång', demo: 'Demo' }[c.activity_type] || c.activity_type}</td><td>{c.activities}</td><td>{c.accounts}</td></tr>)}</tbody></table>
      </div>
    </details>
  </section>
}
