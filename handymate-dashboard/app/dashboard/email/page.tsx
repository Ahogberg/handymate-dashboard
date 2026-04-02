'use client'

import { useEffect, useState } from 'react'
import {
  Mail,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import Link from 'next/link'

interface EmailConversation {
  id: string
  gmail_thread_id: string
  gmail_message_id: string
  customer_id: string | null
  lead_id: string | null
  matched_by: string | null
  from_email: string
  from_name: string | null
  subject: string | null
  body_text: string | null
  received_at: string | null
  direction: string
  status: string
  agent_handled: boolean
  agent_response: string | null
  created_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string | null
  } | null
}

type FilterStatus = 'all' | 'new' | 'read' | 'replied'

export default function EmailInboxPage() {
  const business = useBusiness()
  const [emails, setEmails] = useState<EmailConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (business.business_id) {
      fetchEmails()
    }
  }, [business.business_id])

  async function fetchEmails() {
    setLoading(true)
    const { data } = await supabase
      .from('email_conversations')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number
        )
      `)
      .eq('business_id', business.business_id)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false })
      .limit(100)

    setEmails((data || []) as EmailConversation[])
    setLoading(false)
  }

  async function markAsRead(id: string) {
    await supabase
      .from('email_conversations')
      .update({ status: 'read' })
      .eq('id', id)

    setEmails(prev => prev.map(e => e.id === id ? { ...e, status: 'read' } : e))
  }

  const filteredEmails = filter === 'all'
    ? emails
    : emails.filter(e => e.status === filter)

  const statusCounts = {
    all: emails.length,
    new: emails.filter(e => e.status === 'new').length,
    read: emails.filter(e => e.status === 'read').length,
    replied: emails.filter(e => e.status === 'replied').length,
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'new':
        return <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">Ny</span>
      case 'read':
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">Läst</span>
      case 'replied':
        return <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">Besvarad</span>
      case 'ignored':
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400 rounded-full">Ignorerad</span>
      default:
        return null
    }
  }

  function getMatchBadge(matchedBy: string | null) {
    switch (matchedBy) {
      case 'email':
        return <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full">Matchad via e-post</span>
      case 'name':
        return <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-full">Matchad via namn</span>
      case 'unmatched':
        return <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-600 rounded-full">Okänd avsändare</span>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            { key: 'all', label: 'Alla' },
            { key: 'new', label: 'Nya' },
            { key: 'read', label: 'Lästa' },
            { key: 'replied', label: 'Besvarade' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f.key
                  ? 'bg-primary-700 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {f.label}
              {statusCounts[f.key] > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  filter === f.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {statusCounts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Email list */}
        {filteredEmails.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Inga e-postmeddelanden</h3>
            <p className="text-gray-500 text-sm">
              {filter === 'all'
                ? 'Inkommande mail visas här när Gmail Pub/Sub är aktiverat.'
                : `Inga ${filter === 'new' ? 'nya' : filter === 'read' ? 'lästa' : 'besvarade'} mail.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEmails.map(email => {
              const isExpanded = expandedId === email.id
              return (
                <div
                  key={email.id}
                  className={`bg-white rounded-xl border transition-all ${
                    email.status === 'new'
                      ? 'border-primary-300 shadow-sm'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Header row */}
                  <button
                    onClick={() => {
                      setExpandedId(isExpanded ? null : email.id)
                      if (email.status === 'new') markAsRead(email.id)
                    }}
                    className="w-full flex items-start gap-4 p-4 text-left"
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      email.customer_id ? 'bg-primary-100' : 'bg-gray-100'
                    }`}>
                      {email.customer_id ? (
                        <User className="w-5 h-5 text-primary-700" />
                      ) : (
                        <Mail className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium truncate ${
                          email.status === 'new' ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {email.customer?.name || email.from_name || email.from_email}
                        </span>
                        {getStatusBadge(email.status)}
                        {getMatchBadge(email.matched_by)}
                      </div>
                      <p className={`text-sm truncate ${
                        email.status === 'new' ? 'text-gray-900 font-medium' : 'text-gray-600'
                      }`}>
                        {email.subject || '(Inget ämne)'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {email.body_text?.substring(0, 120) || ''}
                      </p>
                    </div>

                    {/* Time + expand */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">
                          {email.received_at
                            ? format(parseISO(email.received_at), 'dd MMM HH:mm', { locale: sv })
                            : ''}
                        </p>
                        {email.agent_handled && (
                          <div className="flex items-center gap-1 mt-1">
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600">AI hanterad</span>
                          </div>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="mt-4 space-y-3">
                        {/* Metadata */}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>Från: {email.from_email}</span>
                          {email.received_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(parseISO(email.received_at), "d MMMM yyyy 'kl.' HH:mm", { locale: sv })}
                            </span>
                          )}
                        </div>

                        {/* Body */}
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {email.body_text || '(Inget innehåll)'}
                          </p>
                        </div>

                        {/* Agent response */}
                        {email.agent_response && (
                          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              <span className="text-sm font-medium text-emerald-700">AI-svar</span>
                            </div>
                            <p className="text-sm text-emerald-800 whitespace-pre-wrap">
                              {email.agent_response}
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                          {email.customer_id && (
                            <Link
                              href={`/dashboard/customers/${email.customer_id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                            >
                              <User className="w-3.5 h-3.5" />
                              Visa kund
                            </Link>
                          )}
                          {email.matched_by === 'unmatched' && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Ingen kopplad kund
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
