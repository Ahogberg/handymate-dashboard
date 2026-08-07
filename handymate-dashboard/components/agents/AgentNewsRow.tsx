'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

interface AgentNewsRowProps {
  agentKey: string
  /** Vad som hänt, i dåtid. Agentens namn fetas av komponenten. */
  children: ReactNode
  /** Högst en länk. Fler gör raden till ett beslut igen. */
  link?: { label: string; href: string; icon?: ReactNode }
  /** Diskret sekundärlänk, t.ex. "Se leaden". */
  secondaryLink?: { label: string; href: string }
}

/**
 * AgentNewsRow — en agent som BERÄTTAR (2026-08-07).
 *
 * ═══ VARFÖR DEN INTE ÄR ETT KORT ═══
 *
 * Det här är designens bärande idé. Beslut och nyheter är två olika saker, och
 * skillnaden bärs av ANATOMIN:
 *
 *   beslut  → vitt kort med ram och knappar, resultatet läsbart på plats
 *   nyhet   → platt rad, ingen ram, ingen bakgrund, inga knappar
 *
 * Med den skillnaden kan hantverkaren skumma sidan på två sekunder och veta
 * exakt vad som är hans jobb. Ger man nyheter samma kortform blir allt lika
 * viktigt, och då slutar man läsa allt — samma mekanism som gör att amber
 * bara får användas när det är sant.
 *
 * Avataren är 28 px här mot beslutens 36. Mindre vikt, med flit.
 */
export function AgentNewsRow({ agentKey, children, link, secondaryLink }: AgentNewsRowProps) {
  const agent = AGENT_INFO[agentKey]

  return (
    <div className="flex items-start gap-2.5 px-1 py-2.5">
      <AgentAvatar agentKey={agentKey} size="sm" />
      <p className="m-0 flex-1 min-w-0 text-[13px] text-slate-600 leading-relaxed">
        <b className="font-semibold text-slate-900">{agent?.name || 'Teamet'}</b> {children}
      </p>
      {/* 44px träffyta på mobil — hantverkaren har arbetshandskar på.
          Höjden tas ut med negativ marginal så raden inte blir högre av det. */}
      {link && (
        <Link
          href={link.href}
          className="shrink-0 inline-flex items-center gap-1 min-h-[44px] -my-2 px-1 text-[13px] font-medium text-primary-700 hover:text-primary-800"
        >
          {link.icon}
          {link.label}
        </Link>
      )}
      {secondaryLink && (
        <Link
          href={secondaryLink.href}
          className="shrink-0 inline-flex items-center min-h-[44px] -my-2 px-1 text-[13px] font-medium text-slate-400 hover:text-slate-600"
        >
          {secondaryLink.label}
        </Link>
      )}
    </div>
  )
}
