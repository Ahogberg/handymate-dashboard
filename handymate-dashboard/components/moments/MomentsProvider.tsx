'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AgentMoment } from '@/lib/moments/derive'
import { splitByTier, unseenValueKr } from '@/lib/moments/interruption'
import { MomentCard } from './MomentCard'

/**
 * Den globala kanalen för teamets fynd.
 *
 * ═══ ANSVARSDELNINGEN ═══
 *
 * Servern (/api/moments) vet VAD som hittats. Den här providern vet vad
 * hantverkaren redan SETT — det ligger i localStorage, för sedd-status är
 * inte affärsdata och ska inte kosta en tabell. Prioriteringen (vem som
 * får avbryta) ligger i lib/moments/interruption och delar därmed facit
 * med servern.
 *
 * Providern renderar själv det ENDA globala kortet. Badge-listan och
 * panelen exponeras via useMoments() — Matte-bubblan (A3) konsumerar dem.
 *
 * ═══ TYSTNADSREGLERNA ═══
 *
 * - 403 (anställd) → tyst tom. Momenten bär ekonomi; rollgrinden sitter i
 *   API:et och ytan ska inte skvallra om att det finns något att dölja.
 * - Fel → tyst tom MEN loggad. En trasig värdekanal får aldrig blockera
 *   arbetet — den är grädde, inte mjölk.
 * - Högst ETT globalt kort per sidladdning, oavsett hur många som kvalar.
 */

const SEEN_KEY = 'hm_moments_seen'
const SEEN_MAX = 200

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>) {
  try {
    // Äldst först ut när taket nås — id:na är stabila så nyare vinner.
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-SEEN_MAX)))
  } catch {
    /* full storage är inte vårt problem att lösa här */
  }
}

interface MomentsState {
  /** Fynd värda en badge på Matte-bubblan (osedda, medium+). */
  badge: AgentMoment[]
  /** Hela listan för Matte-panelen, sedd eller ej. */
  panel: AgentMoment[]
  /** Summan av osedda verkliga belopp — bubbelns beloppsläge. */
  unseenKr: number
  markSeen: (id: string) => void
}

const MomentsContext = createContext<MomentsState>({
  badge: [],
  panel: [],
  unseenKr: 0,
  markSeen: () => {},
})

export function useMoments(): MomentsState {
  return useContext(MomentsContext)
}

export function MomentsProvider({ children }: { children: React.ReactNode }) {
  const [moments, setMoments] = useState<AgentMoment[]>([])
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [globalDismissed, setGlobalDismissed] = useState(false)

  useEffect(() => {
    setSeen(readSeen())
    let aktiv = true
    fetch('/api/moments')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (aktiv && d?.moments) setMoments(d.moments as AgentMoment[])
      })
      .catch(err => {
        console.error('[moments] kunde inte hämtas:', err)
      })
    return () => {
      aktiv = false
    }
  }, [])

  const markSeen = useCallback((id: string) => {
    setSeen(prev => {
      const nasta = new Set(prev)
      nasta.add(id)
      writeSeen(nasta)
      return nasta
    })
  }, [])

  const { global: globalMoment, badge, panel } = useMemo(
    () => splitByTier(moments, seen, new Date()),
    [moments, seen],
  )

  const unseenKr = useMemo(() => unseenValueKr(moments, seen), [moments, seen])

  const value = useMemo(
    () => ({ badge, panel, unseenKr, markSeen }),
    [badge, panel, unseenKr, markSeen],
  )

  return (
    <MomentsContext.Provider value={value}>
      {children}
      {globalMoment && !globalDismissed && (
        <MomentCard
          moment={globalMoment}
          onDismiss={() => {
            markSeen(globalMoment.id)
            setGlobalDismissed(true)
          }}
        />
      )}
    </MomentsContext.Provider>
  )
}
