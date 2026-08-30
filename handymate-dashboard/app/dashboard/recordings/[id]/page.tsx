import Link from 'next/link'
import { CallOutcomeCard } from '@/components/voice/CallOutcomeCard'

export default function CallPage({ params }: { params: { id: string } }) {
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <Link href="/dashboard/recordings" className="text-teal-700 underline">← Alla samtal</Link>
    <h1 className="text-2xl font-semibold">Samtalets efterarbete</h1>
    <CallOutcomeCard recordingId={params.id} />
  </main>
}
