'use client'

import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowRight } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { fromChatMessage, statusLabel, type ChatMessageLike } from '@/lib/agents/interaction'

/**
 * AgentMessage — ETT chattmeddelande, en gång (Codex audit avsnitt 8, Epic 3).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * MatteChatModal och Jobbkompisen renderade varsin kopia av samma bubbla, och
 * båda hade samma fel: modalen ritade Mattes porträtt på ALLA svar — även när
 * Karin var den som svarade — och lade en fotnot "💬 via Karin" under. En
 * fotnot är inte en avsändare. Efter Epic 2 kan ett svar dessutom komma från
 * tre olika kollegor i följd, och då blir fel ansikte inte en detalj utan en
 * obegriplig konversation.
 *
 * Nu: porträttet ÄR avsändaren. Specialisten får sitt eget ansikte och en
 * byline i tredje person ("Karin · Ekonom förberedde"), Matte får sin.
 *
 * ═══ ÖVERLÄMNINGEN SYNS ═══
 *
 * En handoff renderas dämpad med pil och vänsterkant — den är ett skifte i
 * samtalet, inte ett svar på frågan. Utan den skillnaden läses överlämningen
 * som ännu ett påstående om ärendet.
 *
 * ═══ STATUS KOMMER FRÅN SERVERN ═══
 *
 * `status` sätts av orkestreringen (Epic 2) och härleds där ur verktygens
 * faktiska utfall. UI:t hittar aldrig på en status — det visar den det får,
 * eller ingen alls.
 */
export function AgentMessage({
  message,
  index = 0,
  timestamp,
  children,
}: {
  message: ChatMessageLike
  index?: number
  /** ISO-tid — visas som HH:MM under bubblan. */
  timestamp?: string | null
  /** Åtgärdsknappar under bubblan (Jobbkompisens actions). */
  children?: ReactNode
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-primary-700 text-white text-sm leading-relaxed">
            <p className="whitespace-pre-wrap m-0">{message.content}</p>
          </div>
          {timestamp && <Tidsstämpel iso={timestamp} högerställd />}
        </div>
      </div>
    )
  }

  const interaction = fromChatMessage(message, index)
  const ärÖverlämning = interaction.mode === 'handoff'
  const status = statusLabel(interaction.status)

  return (
    <div className="flex gap-2.5">
      <div className="pt-0.5">
        <AgentAvatar agentKey={interaction.agentKey} size="sm" />
      </div>
      <div className="max-w-[85%] min-w-0">
        <p className="m-0 mb-1 text-[11px] text-slate-500 leading-none">{interaction.byline}</p>
        <div
          className={`rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed border ${
            ärÖverlämning
              ? 'bg-slate-50 border-slate-200 text-slate-600 border-l-2'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          style={ärÖverlämning ? { borderLeftColor: '#cbd5e1' } : undefined}
        >
          {ärÖverlämning && (
            <ArrowRight className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-slate-400" aria-hidden />
          )}
          <div className="prose prose-sm max-w-none inline [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_strong]:font-semibold [&_a]:text-primary-700">
            <ReactMarkdown>{interaction.body}</ReactMarkdown>
          </div>
          {status && (
            <StatusChip status={interaction.status} label={status} />
          )}
        </div>
        {children}
        {timestamp && <Tidsstämpel iso={timestamp} />}
      </div>
    </div>
  )
}

/**
 * Statusen bär färg bara när något INTE är klart. Ett grönt "Klart" på varje
 * svar hade blivit tapet på tre meddelanden; det som ska sticka ut är det som
 * kräver något av hantverkaren eller som gick fel.
 */
function StatusChip({ status, label }: { status: string; label: string }) {
  const stil =
    status === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : status === 'partial' ? 'bg-amber-50 text-amber-800 border-amber-200'
    : status === 'awaiting_approval' ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${stil}`}>
      {label}
    </span>
  )
}

function Tidsstämpel({ iso, högerställd }: { iso: string; högerställd?: boolean }) {
  return (
    <p className={`m-0 mt-1 px-1 text-[10px] text-slate-400 ${högerställd ? 'text-right' : ''}`}>
      {new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
    </p>
  )
}
