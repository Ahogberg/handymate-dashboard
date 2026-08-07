'use client'

import { Bot } from 'lucide-react'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

/**
 * AgentAvatar — den enda avataren (spår D2, 2026-08-06).
 *
 * Låg oexporterad i IdagCore.tsx och var dessutom inlinead på två ställen
 * till, med olika storlekar (30 respektive 36 px) för samma sak. En avatar
 * som byter storlek beroende på vilken sida man är på läses som två olika
 * saker.
 *
 * ═══ FÄRGREGELN ═══
 *
 * Teal är chrome; per-agent-färgen sitter BARA på avataren. Det är den enda
 * plats i produkten där en icke-teal accent är tillåten, och den regeln är
 * det som gör att en yta med hela teamet inte blir en färgkarusell. Se
 * docs/HANDYMATE_DESIGN_SYSTEM.md, avsnittet om agentytor.
 *
 * Okänd agent → neutral robotikon, aldrig en gissad färg. En avatar som ser
 * ut som Karin men inte är Karin är värre än en som inte föreställer någon.
 */
export function AgentAvatar({
  agentKey,
  size = 'md',
}: {
  agentKey: string
  /** sm 28px (listrader) · md 36px (kort och rubriker) · lg 44px (rubrikytor) */
  size?: 'sm' | 'md' | 'lg'
}) {
  const agent = AGENT_INFO[agentKey]
  const cls =
    size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'

  if (!agent) {
    return (
      <div className={`${cls} rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0`}>
        <Bot className="w-4 h-4 text-gray-500" />
      </div>
    )
  }

  return (
    <div
      aria-label={agent.name}
      className={`${cls} rounded-full ${agent.color} flex items-center justify-center flex-shrink-0 text-white font-bold`}
    >
      {agent.initials}
    </div>
  )
}
