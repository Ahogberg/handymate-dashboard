import Link from 'next/link'
import AssignedLeads from '../dashboard/components/AssignedLeads'
export default function PartnerLeadsPage() {
  return <main className="min-h-screen bg-stone-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-4xl space-y-6"><Link href="/partners/dashboard" className="text-sm text-teal-700">← Partnerportalen</Link><AssignedLeads /></div></main>
}
