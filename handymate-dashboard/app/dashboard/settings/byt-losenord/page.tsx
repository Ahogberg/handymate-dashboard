'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, KeyRound, Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useToast } from '@/components/Toast'

/**
 * Inställningar → Byt lösenord (2026-08-14).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Enda vägen att sätta ett nytt lösenord var tidigare "Glömt lösenord" på
 * inloggningssidan — omständligt när man redan sitter inloggad och bara
 * vill byta. Den sidan (och /auth/callback) hade dessutom en riktig bugg
 * (hash-tokens från återställningsmejlet lästes aldrig, fixad samma dag,
 * se app/reset-password/page.tsx) — upptäckt när Andreas eget testkonto-
 * lösenord slutade fungera efter en admin-ändring och återställningen då
 * inte gick att använda som reservväg.
 *
 * ═══ VARFÖR NUVARANDE LÖSENORD KRÄVS ═══
 *
 * En egen action (`change_password`, inte samma som återställningens
 * `reset_password`) verifierar nuvarande lösenord server-side innan något
 * ändras. En redan inloggad session är inte samma sak som ett medvetet
 * lösenordsbyte — utan kravet hade vem som helst vid en olåst, övergiven
 * flik kunnat stänga ute den riktiga ägaren tyst.
 *
 * ═══ PLACERING ═══
 *
 * Egen "Mitt konto"-grupp i Inställningar (page.tsx tabGroups) — allt
 * annat i hubben är företagsdata, det här är personligt och gäller den
 * inloggade användaren, inte företaget. Synlig för alla roller (inte
 * ägare/admin-gated som Bolagsprofil/Intern timkostnad) — var och en äger
 * sitt eget lösenord.
 */

const FALT_CLS =
  'w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-primary-600'

export default function BytLosenordPage() {
  const toast = useToast()
  const { user } = useCurrentUser()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState('')

  async function bytLosenord() {
    setFel('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFel('Fyll i alla tre fälten')
      return
    }
    if (newPassword !== confirmPassword) {
      setFel('De nya lösenorden matchar inte')
      return
    }
    if (newPassword.length < 6) {
      setFel('Det nya lösenordet måste vara minst 6 tecken')
      return
    }

    setSparar(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_password',
          data: { currentPassword, newPassword },
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || 'Kunde inte byta lösenord')

      toast.success('Lösenordet är bytt')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      setFel(e?.message || 'Kunde inte byta lösenord')
    } finally {
      setSparar(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="text-slate-400 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Byt lösenord</h1>
          <p className="text-slate-500 text-sm m-0">
            {user?.email ? `För ${user.email}` : 'Ditt personliga lösenord'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Nuvarande lösenord</label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => { setCurrentPassword(e.target.value); setFel('') }}
            placeholder="Ditt nuvarande lösenord"
            className={FALT_CLS}
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Nytt lösenord</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setFel('') }}
            placeholder="Minst 6 tecken"
            className={FALT_CLS}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Bekräfta nytt lösenord</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setFel('') }}
            placeholder="Skriv det nya lösenordet igen"
            className={FALT_CLS}
            autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && void bytLosenord()}
          />
        </div>

        {fel && <p className="text-[13px] text-amber-700 m-0">{fel}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void bytLosenord()}
            disabled={sparar}
            className="inline-flex items-center gap-2 h-11 px-5 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {sparar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Byt lösenord
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400 leading-relaxed flex items-start gap-1.5">
        <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Har du glömt ditt nuvarande lösenord? Logga ut och använd "Glömt lösenord" på inloggningssidan i stället.
      </p>
    </div>
  )
}
