'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle,
  ChevronRight,
  Copy,
  Edit,
  FileSignature,
  FileText,
  Loader2,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useFilePreview } from '@/components/documents/FilePreviewProvider'
import { ataRadNamn } from '@/lib/ata/items'
import { ataStatusLabel, ataTypLabel } from '@/lib/ata/labels'
import { isAtaEditable } from '@/lib/ata/lifecycle'

/**
 * Ett ÄTA-kort i projektets ÄTA-flik.
 *
 * ═══ VARFÖR ═══
 *
 * Åtgärderna låg tidigare gömda bakom expanderingen — hantverkaren såg
 * "Utkast" men inte hur ÄTA:n skickas. Nu ligger de alltid synliga i
 * kortets fot (max två primära per status). Expanderingen visar detaljer:
 * rader, anteckning, signatur, foton.
 *
 * "Kopiera länk" hämtar den riktiga portallänken från GET /api/ata/[id]/send
 * — den gamla bygget en död URL (`/sign/ata/…`, ingen sådan sida finns).
 */

export interface AtaCardItem {
  name?: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
}

export interface AtaCardChange {
  change_id: string
  change_type: string
  description: string
  amount: number
  status: string
  created_at: string
  ata_number?: number
  items?: AtaCardItem[]
  total?: number
  sign_token?: string
  sent_at?: string | null
  signed_at?: string | null
  signed_by_name?: string | null
  declined_at?: string | null
  declined_reason?: string | null
  notes?: string | null
  invoice_id?: string | null
}

interface AtaFoto {
  id: string
  name: string
  mime_type: string | null
}

// Fyra semantiska lägen, inte nio nyanser (Projektytor-redesign 2026-08-14):
// draft→slate (ej igång), sent/signed→teal (pågår / kunden har svarat),
// approved/invoiced→emerald (pengarna är i rörelse eller hemma).
const STATUS_FARG: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-300',
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  sent: 'bg-primary-50 text-primary-700 border-primary-200',
  signed: 'bg-primary-50 text-primary-700 border-primary-200',
  approved: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
  declined: 'bg-red-50 text-red-600 border-red-200',
  invoiced: 'bg-emerald-50 text-emerald-600 border-emerald-200',
}

const TYP_FARG: Record<string, string> = {
  addition: 'bg-emerald-100 text-emerald-600 border-emerald-500/30',
  change: 'bg-amber-50 text-amber-600 border-amber-200',
  removal: 'bg-red-100 text-red-600 border-red-500/30',
}

const KNAPP_SEKUNDAR = 'flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 border border-[#E2E8F0] rounded-lg text-sm font-medium hover:bg-gray-100 transition-all'

export default function AtaCard({
  change,
  projectId,
  pricesRedacted,
  expanded,
  onToggle,
  onSend,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onToast,
  formatCurrency,
  formatDate,
}: {
  change: AtaCardChange
  projectId: string
  /** TD-77: servern har strippat beloppen (see_financials saknas). */
  pricesRedacted: boolean
  expanded: boolean
  onToggle: () => void
  onSend: () => void
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  onDelete: () => void
  onToast: (msg: string, type: 'success' | 'error') => void
  formatCurrency: (n: number) => string
  formatDate: (iso: string) => string
}) {
  const { openFilePreview } = useFilePreview()
  const [copying, setCopying] = useState(false)
  const [fotos, setFotos] = useState<AtaFoto[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const status = change.status
  const redigerbar = isAtaEditable(status)
  const harDokument = !pricesRedacted // PDF:en visar belopp — samma grind som rutten (403)
  const belopp = change.total ?? (change.amount > 0 ? change.amount : null)

  // Foton laddas först när kortet expanderas — inte för varje kort i listan.
  useEffect(() => {
    if (!expanded || fotos !== null) return
    let aktiv = true
    fetch(`/api/projects/${projectId}/documents?change_id=${encodeURIComponent(change.change_id)}`)
      .then(res => res.ok ? res.json() : { documents: [] })
      .then(data => { if (aktiv) setFotos(Array.isArray(data.documents) ? data.documents : []) })
      .catch(() => { if (aktiv) setFotos([]) })
    return () => { aktiv = false }
  }, [expanded, fotos, projectId, change.change_id])

  const kopieraLank = async () => {
    setCopying(true)
    try {
      const res = await fetch(`/api/ata/${change.change_id}/send`)
      const data = await res.json()
      if (!res.ok || !data.signUrl) throw new Error(data.error || 'Kunde inte hämta länken')
      await navigator.clipboard.writeText(data.signUrl)
      onToast('Signeringslänk kopierad', 'success')
    } catch (err: any) {
      onToast(err.message || 'Kunde inte kopiera länken', 'error')
    } finally {
      setCopying(false)
    }
  }

  const oppnaPdf = () => {
    window.open(`/api/ata/${change.change_id}/pdf`, '_blank', 'noopener')
  }

  const laddaUppFoto = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('change_id', change.change_id)
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte ladda upp fotot')
      setFotos(prev => [data.document, ...(prev || [])])
      onToast('Foto tillagt', 'success')
    } catch (err: any) {
      onToast(err.message || 'Kunde inte ladda upp fotot', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const oppnaFoto = (foto: AtaFoto) => {
    openFilePreview({
      name: foto.name || 'Foto',
      mimeType: foto.mime_type,
      inlineUrl: `/api/projects/${projectId}/documents/${foto.id}?view=inline`,
      downloadUrl: `/api/projects/${projectId}/documents/${foto.id}?view=download`,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-ata-status={status}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-all"
      >
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              ÄTA-{change.ata_number || '?'}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${TYP_FARG[change.change_type] || TYP_FARG.addition}`}>
              {ataTypLabel(change.change_type)}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${STATUS_FARG[status] || STATUS_FARG.draft}`}>
              {ataStatusLabel(status)}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">{change.description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {belopp !== null && !pricesRedacted ? formatCurrency(belopp) : '–'}
          </p>
          <p className="text-xs text-gray-400">{formatDate(change.created_at)}</p>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-2">
          {change.items && change.items.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Rad</th>
                    <th className="text-right py-2 font-medium w-16">Antal</th>
                    <th className="text-left py-2 font-medium w-16 pl-2">Enhet</th>
                    {!pricesRedacted && <th className="text-right py-2 font-medium w-24">à-pris</th>}
                    {!pricesRedacted && <th className="text-right py-2 font-medium w-24">Summa</th>}
                  </tr>
                </thead>
                <tbody>
                  {change.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="py-2 text-gray-700">{ataRadNamn(item)}</td>
                      <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                      <td className="py-2 text-left pl-2 text-gray-500">{item.unit}</td>
                      {!pricesRedacted && <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_price)}</td>}
                      {!pricesRedacted && <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(item.quantity * item.unit_price)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {change.notes && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p className="text-xs text-gray-400 mb-1">Anteckning</p>
              {change.notes}
            </div>
          )}

          {status === 'sent' && change.sent_at && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Send className="w-3.5 h-3.5" />
              Skickad till kund {formatDate(change.sent_at)} — väntar på signering
            </div>
          )}

          {change.signed_at && change.signed_by_name && (
            <div className="mt-3 flex items-center gap-2 text-xs text-primary-700">
              <FileSignature className="w-3.5 h-3.5" />
              Signerad av {change.signed_by_name} {formatDate(change.signed_at)} — låst
            </div>
          )}

          {change.declined_at && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
              <XCircle className="w-3.5 h-3.5" />
              Kunden tackade nej {formatDate(change.declined_at)}
              {change.declined_reason && <span>— {change.declined_reason}</span>}
            </div>
          )}

          {/* Foton — bilagor till ÄTA-dokumentet (project_document.change_id, v195) */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Foton</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) laddaUppFoto(f) }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs text-primary-700 font-medium hover:underline disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                Lägg till foto
              </button>
            </div>
            {fotos === null ? (
              <p className="text-xs text-gray-400">Hämtar…</p>
            ) : fotos.length === 0 ? (
              <p className="text-xs text-gray-400">Inga foton ännu. Ett foto på det som ska göras gör ÄTA:n lättare att godkänna.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {fotos.map(foto => (
                  <button
                    key={foto.id}
                    type="button"
                    onClick={() => oppnaFoto(foto)}
                    className="aspect-square rounded-lg overflow-hidden border border-[#E2E8F0] bg-gray-50 hover:opacity-90"
                    title={foto.name}
                  >
                    {foto.mime_type?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/projects/${projectId}/documents/${foto.id}?view=inline`}
                        alt={foto.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Åtgärder — alltid synliga, per status */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
        {redigerbar && (
          <>
            <button
              onClick={onSend}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              Skicka till kund
            </button>
            <button onClick={onEdit} className={KNAPP_SEKUNDAR}>
              <Edit className="w-3.5 h-3.5" />
              Redigera
            </button>
          </>
        )}

        {status === 'sent' && (
          <>
            <button onClick={kopieraLank} disabled={copying} className={KNAPP_SEKUNDAR}>
              {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Kopiera länk
            </button>
            <button
              onClick={onApprove}
              title="Kunden godkände muntligt eller på plats"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Godkänn manuellt
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              Avslå
            </button>
          </>
        )}

        {harDokument && !redigerbar && (
          <button onClick={oppnaPdf} className={KNAPP_SEKUNDAR}>
            <FileText className="w-3.5 h-3.5" />
            ÄTA-dokument (PDF)
          </button>
        )}
        {harDokument && redigerbar && (
          <button onClick={oppnaPdf} className={KNAPP_SEKUNDAR} title="Förhandsgranska dokumentet (vattenstämplat UTKAST)">
            <FileText className="w-3.5 h-3.5" />
            Förhandsgranska
          </button>
        )}

        {status === 'invoiced' && change.invoice_id && (
          <a
            href={`/dashboard/invoices/${change.invoice_id}`}
            className={KNAPP_SEKUNDAR}
          >
            Visa faktura
          </a>
        )}

        {redigerbar && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm transition-all ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Ta bort
          </button>
        )}
      </div>
    </div>
  )
}
