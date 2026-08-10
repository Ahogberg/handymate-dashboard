'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Phone, Send } from 'lucide-react'
import { formatDateTime } from '../helpers'
import type { Message, PortalData } from '../types'

interface PortalMessagesThreadProps {
  business: PortalData['business']
  messages: Message[]
  token: string
  onBack: () => void
  onMessageSent: (message: Message) => void
}

/**
 * iMessage-stil meddelandetråd (port av bp-messages.jsx).
 * Inkommande från företaget = vit bubbla med kontakt-initial.
 * Egna meddelanden = bee-färgad bubbla höger med Skickat/Läst-status —
 * "Läst" blir sant först när hantverkaren svarat (läskvittot sätts av
 * svaret, lib/portal/customer-thread).
 */
export default function PortalMessagesThread({
  business,
  messages,
  token,
  onBack,
  onMessageSent,
}: PortalMessagesThreadProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Sändfel var tidigare TYST (console.error) — kunden trodde meddelandet
  // gått iväg. Nu sägs det, och utkastet står kvar så inget skrivet tappas.
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft }),
      })
      if (res.ok) {
        const data = await res.json()
        // Raden kommer från servern sedan 2026-08-10 — utan vakten appendade
        // vi undefined och meddelandet försvann ur vyn tills omladdning.
        if (data.message) onMessageSent(data.message)
        setDraft('')
      } else {
        setSendError('Meddelandet kunde inte skickas — försök igen.')
      }
    } catch {
      setSendError('Meddelandet kunde inte skickas — kontrollera uppkopplingen och försök igen.')
    }
    setSending(false)
  }

  const contactInitial = (business.contactName || business.name || 'H').charAt(0).toUpperCase()

  // Hitta sista egna meddelandet för leverans-status
  const lastMine = [...messages].reverse().find(m => m.direction === 'inbound')

  return (
    <>
      <div className="bp-header">
        <button
          type="button"
          onClick={onBack}
          className="bp-icon-btn"
          style={{ background: 'transparent', border: 'none' }}
          aria-label="Tillbaka"
        >
          <ArrowLeft size={20} />
        </button>
        {/* Ingen närvaroprick och ingen påstådd närvarostatus — det fanns
            aldrig någon mekanik bakom dem (2026-08-10). Undertexten lovar
            bara det som är sant. */}
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--bee-500), var(--bee-700))',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {contactInitial}
          </div>
        </div>
        <div className="bp-brand">
          <div className="bp-brand-name">{business.contactName || business.name}</div>
          <div className="bp-brand-sub">
            {business.name} · svarar så snart de kan
          </div>
        </div>
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="bp-icon-btn"
            aria-label="Ring"
            style={{ textDecoration: 'none' }}
          >
            <Phone size={16} />
          </a>
        )}
      </div>

      <div
        ref={scrollRef}
        className="bp-body"
        style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 100 }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <p>Inga meddelanden ännu.</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Skriv ett meddelande till din hantverkare.</p>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const fromBusiness = m.direction === 'outbound'
              const showAvatar = fromBusiness && (!prev || prev.direction !== 'outbound')
              const groupedTop = prev && prev.direction === m.direction
              // Datumseparator per DAG — en enda stämpel överst fick en tråd
              // över tre veckor att se ut som ett datum (2026-08-10).
              const nyDag = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
              return (
                <div key={m.id}>
                {nyDag && (
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: i === 0 ? '8px 0 14px' : '16px 0 8px' }}>
                    {new Date(m.created_at).toLocaleDateString('sv-SE', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: fromBusiness ? 'flex-start' : 'flex-end',
                    alignItems: 'flex-end',
                    gap: 6,
                    marginTop: groupedTop && !nyDag ? 0 : 8,
                    animation: 'bp-pop-in 240ms',
                  }}
                >
                  {fromBusiness && (
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: showAvatar
                          ? 'linear-gradient(135deg, var(--bee-500), var(--bee-700))'
                          : 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {showAvatar ? contactInitial : ''}
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '74%',
                      padding: '9px 14px',
                      borderRadius: 18,
                      fontSize: 14,
                      lineHeight: 1.35,
                      background: fromBusiness ? '#E5E7EB' : 'var(--bee-600)',
                      color: fromBusiness ? 'var(--ink)' : '#fff',
                      borderBottomLeftRadius: fromBusiness ? 4 : 18,
                      borderBottomRightRadius: fromBusiness ? 18 : 4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.message}
                  </div>
                </div>
                </div>
              )
            })}

            {/* Last delivery status */}
            {lastMine && (
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 10,
                  color: 'var(--subtle)',
                  padding: '2px 4px 0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {/* Den gamla leveransetiketten lovade mer än en databasrad
                    kan. "Skickat" är sant direkt; "Läst" blir sant när
                    hantverkaren svarat (läskvittot sätts av svaret —
                    lib/portal/customer-thread). */}
                {lastMine.read_at ? 'Läst' : 'Skickat'}
                <span style={{ marginLeft: 4 }}>{formatDateTime(lastMine.created_at)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sändfelet sägs — aldrig en tyst papperskorg. Utkastet står kvar. */}
      {sendError && (
        <div
          role="alert"
          style={{
            margin: '0 14px 8px',
            padding: '10px 14px',
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: '#92400E',
          }}
        >
          {sendError}
        </div>
      )}

      {/* Composer */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '10px 14px 18px',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg)',
            borderRadius: 22,
            padding: '4px 4px 4px 16px',
          }}
        >
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Meddelande"
            style={{
              flex: 1,
              height: 36,
              border: 'none',
              background: 'transparent',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || sending}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: draft.trim() ? 'var(--bee-600)' : 'var(--border)',
              color: '#fff',
              border: 'none',
              cursor: draft.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}
