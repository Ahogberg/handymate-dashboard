'use client'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { ReliefStart } from '@/components/relief/ReliefStart'
import { MyDayCard } from '@/components/relief/MyDayCard'
export default function ReliefPage() {
  const business = useBusiness()
  const { user, loading, isOwnerOrAdmin } = useCurrentUser()
  if (loading) return <p role="status" className="p-6">Öppnar ditt underlag…</p>
  if (!user?.is_active || user.business_id !== business.business_id || !user.user_id) return <p role="alert" className="p-6">Din användare kunde inte verifieras. Logga in igen.</p>
  return <main key={`${business.business_id}:${user.user_id}`} className="mx-auto max-w-3xl px-4 py-6 pb-28"><a href="/dashboard" className="mb-4 inline-flex min-h-[44px] items-center text-sm text-teal-800 underline">Till Översikt</a><a href="#min-dag" className="ml-4 inline-flex min-h-[44px] items-center text-sm text-teal-800 underline">Se din dag</a><ReliefStart businessId={business.business_id} userId={user.user_id} canQuote={isOwnerOrAdmin} /><div id="min-dag" className="mt-6 scroll-mt-6"><MyDayCard /></div></main>
}
