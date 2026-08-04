'use client'

import { useState } from 'react'
import { Award, Plus, Pencil, Trash2, X, Loader2, AlertTriangle } from 'lucide-react'
import { classifyCertStatus } from '@/lib/certifikat/status'
import type { Certificate } from './types'
import { CERT_STATUS_BADGE, formatCertDate } from './helpers'

interface CertForm {
  cert_type: string
  cert_number: string
  issued_date: string
  valid_until: string
  notes: string
}

const EMPTY_FORM: CertForm = { cert_type: '', cert_number: '', issued_date: '', valid_until: '', notes: '' }

interface CertificatesPanelProps {
  businessUserId: string
  certificates: Certificate[]
  canManage: boolean
  onRefetch: () => Promise<void> | void
  onToast: (message: string, type: 'success' | 'error' | 'warning') => void
}

/**
 * Certifikat/behörigheter-fliken i redigeringssheeten (R3, tasks/
 * resurs-masterplan.md punkt 3 — "differentieraren, Easoft har noll").
 * Skriv-gate speglar API:t (app/api/team/certificates/route.ts): endast
 * owner/admin får lägga till/redigera/ta bort — en anställd som öppnar
 * sin egen profil ser sina certifikat, men utan formulär/knappar.
 */
export function CertificatesPanel({ businessUserId, certificates, canManage, onRefetch, onToast }: CertificatesPanelProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CertForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const openAddForm = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setFormOpen(true)
  }

  const openEditForm = (cert: Certificate) => {
    setEditingId(cert.id)
    setForm({
      cert_type: cert.cert_type,
      cert_number: cert.cert_number || '',
      issued_date: cert.issued_date || '',
      valid_until: cert.valid_until || '',
      notes: cert.notes || '',
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
  }

  const handleSave = async () => {
    if (!form.cert_type.trim()) {
      onToast('Typ av certifikat krävs', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        ...(editingId ? { id: editingId } : { business_user_id: businessUserId }),
        cert_type: form.cert_type.trim(),
        cert_number: form.cert_number.trim() || null,
        issued_date: form.issued_date || null,
        valid_until: form.valid_until || null,
        notes: form.notes.trim() || null,
      }
      const res = await fetch('/api/team/certificates', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Kunde inte spara certifikatet')

      onToast(editingId ? 'Certifikat uppdaterat' : 'Certifikat tillagt', 'success')
      closeForm()
      await onRefetch()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/team/certificates?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Kunde inte ta bort certifikatet')
      }
      onToast('Certifikat borttaget', 'success')
      await onRefetch()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Något gick fel', 'error')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="space-y-3">
      {certificates.length === 0 && !formOpen && (
        <div className="text-center py-6 text-gray-400 text-sm">
          <Award className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          Inga certifikat registrerade{canManage ? ' än' : ''}.
        </div>
      )}

      {certificates.map((cert) => {
        const st = classifyCertStatus(cert.valid_until)
        const badge = CERT_STATUS_BADGE[st]
        return (
          <div key={cert.id} className="rounded-xl border border-[#E2E8F0] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm truncate">{cert.cert_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${badge.className}`}>
                    {st === 'expiring_soon' && cert.valid_until ? `Går ut ${formatCertDate(cert.valid_until)}` : badge.label}
                  </span>
                </div>
                {cert.cert_number && <p className="text-xs text-gray-400 mt-0.5">Nr: {cert.cert_number}</p>}
                {(cert.issued_date || cert.valid_until) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {cert.issued_date && `Utfärdat ${formatCertDate(cert.issued_date)}`}
                    {cert.issued_date && cert.valid_until && ' · '}
                    {cert.valid_until && `Giltigt t.o.m. ${formatCertDate(cert.valid_until)}`}
                  </p>
                )}
                {cert.notes && <p className="text-xs text-gray-500 mt-1">{cert.notes}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(cert)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    aria-label="Redigera certifikat"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cert.id)}
                    disabled={deletingId === cert.id}
                    className={`p-1.5 rounded-lg transition-colors ${
                      confirmDeleteId === cert.id ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                    }`}
                    aria-label="Ta bort certifikat"
                  >
                    {deletingId === cert.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
            {confirmDeleteId === cert.id && deletingId !== cert.id && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Klicka igen för att bekräfta borttagning.
              </div>
            )}
          </div>
        )
      })}

      {canManage && !formOpen && (
        <button
          type="button"
          onClick={openAddForm}
          className="w-full py-2.5 rounded-xl border border-dashed border-[#E2E8F0] text-gray-500 text-sm font-medium hover:border-primary-600 hover:text-primary-700 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Lägg till certifikat
        </button>
      )}

      {canManage && formOpen && (
        <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">{editingId ? 'Redigera certifikat' : 'Nytt certifikat'}</h4>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-900 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Typ av certifikat *</label>
            <input
              type="text"
              value={form.cert_type}
              onChange={(e) => setForm((prev) => ({ ...prev, cert_type: e.target.value }))}
              placeholder="T.ex. Heta arbeten, Elbehörighet B, Liftkort"
              className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/50"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Certifikatnummer</label>
            <input
              type="text"
              value={form.cert_number}
              onChange={(e) => setForm((prev) => ({ ...prev, cert_number: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Utfärdat</label>
              <input
                type="date"
                value={form.issued_date}
                onChange={(e) => setForm((prev) => ({ ...prev, issued_date: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Giltigt t.o.m.</label>
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Anteckningar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/50"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary-700 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editingId ? 'Spara ändringar' : 'Lägg till'}
          </button>
        </div>
      )}
    </div>
  )
}
