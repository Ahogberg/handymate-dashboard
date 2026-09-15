'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { ChannelState } from '@/lib/channels/preflight'
type Status = { channels: ChannelState[]; morning: { message: string; reportReady: boolean } | null }
export default function ChannelBanner() {
  const business = useBusiness()
  const { user, isOwnerOrAdmin } = useCurrentUser()
  const [value, setValue] = useState<{ key: string; data: Status } | null>(null)
  const [failed, setFailed] = useState(false)
  const key = `${business?.business_id}:${user?.id}`
  useEffect(() => {
    if (!isOwnerOrAdmin || !business?.business_id) return
    let active = true
    let controller: AbortController | undefined
    const refresh = async () => {
      controller?.abort(); controller = new AbortController()
      try {
        const r = await fetch('/api/dashboard/channels', { cache: 'no-store', signal: controller.signal })
        if (!active) return
        if ([401,403,404].includes(r.status)) { setValue(null); setFailed(false); return }
        if (!r.ok) throw new Error('status')
        const data = await r.json()
        if (active) { setValue({ key, data }); setFailed(false) }
      } catch (e) { if (active && !(e instanceof Error && e.name === 'AbortError')) { setValue(null); setFailed(true) } }
    }
    void refresh(); window.addEventListener('focus', refresh)
    return () => { active = false; controller?.abort(); window.removeEventListener('focus', refresh) }
  }, [key, isOwnerOrAdmin, business?.business_id])
  if (!isOwnerOrAdmin) return null
  const data = value?.key === key ? value.data : null
  const unavailable = data?.channels.filter(c => !c.ok) || []
  if (!failed && !unavailable.length && !data?.morning) return null
  return <aside aria-label="Utskick och morgonrapport" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800" role="status">
    {failed && <p>Status för utskick kunde inte hämtas. Försök igen genom att ladda om sidan.</p>}
    {unavailable.map(c => <p key={c.channel} className="mb-2">{c.message} <Link className="underline" href={c.href}>{c.channel === 'push' ? 'Inställningar' : 'Kontakta Handymate'}</Link></p>)}
    {data?.morning && <p>{data.morning.message} {data.morning.reportReady && <Link className="underline" href="/dashboard/oversikt">Läs morgonrapporten</Link>}</p>}
  </aside>
}
