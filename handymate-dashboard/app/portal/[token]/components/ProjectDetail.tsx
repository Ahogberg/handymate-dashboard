'use client'

import { useRef, useState } from 'react'
import { Calendar, CheckCircle, Loader2, PenTool } from 'lucide-react'
import SignatureCanvas, {
  ClearSignatureButton,
  type SignatureCanvasHandle,
} from './SignatureCanvas'
import { formatDate, formatDateTime, formatCurrency, getProjectStatusText } from '../helpers'
import type { Project, ProjectPhoto, TrackerStage } from '../types'

interface ProjectDetailProps {
  project: Project
  onAtaSigned: () => void
}

/**
 * Projektdetalj-vy: status, tracker, milstolpar, ÄTA-lista med inline-signing.
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 *
 * Inline ÄTA-signering bevaras med samma state-pattern (signingAtaId,
 * signerName, signingSaving). Signature-canvas använder shared
 * SignatureCanvas-komponenten med mode='ata'.
 */
export default function ProjectDetail({ project, onAtaSigned }: ProjectDetailProps) {
  const [signingAtaId, setSigningAtaId] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signingSaving, setSigningSaving] = useState(false)
  const ataCanvasRef = useRef<SignatureCanvasHandle>(null)

  async function signAta(signToken: string) {
    if (!signerName.trim()) return
    const signatureData = ataCanvasRef.current?.toDataURL()
    if (!signatureData) return

    setSigningSaving(true)
    try {
      const res = await fetch(`/api/ata/sign/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: signerName.trim(),
          signature_data: signatureData,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kunde inte signera')
      } else {
        setSigningAtaId(null)
        setSignerName('')
        onAtaSigned()
      }
    } catch {
      alert('Kunde inte signera ÄTA')
    }
    setSigningSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Status + Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-500">Status</span>
          <span className={`text-xs px-2 py-1 rounded-full ${
            project.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
            'bg-primary-100 text-primary-700'
          }`}>
            {getProjectStatusText(project.status)}
          </span>
        </div>
        {typeof project.progress === 'number' && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Framsteg</span>
              <span>{project.progress}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-700 rounded-full transition-all" style={{ width: `${project.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Project Tracker */}
      {project.tracker_stages && project.tracker_stages.length > 0 && (
        <ProjectTracker
          stages={project.tracker_stages}
          photos={project.photos || []}
        />
      )}

      {/* Next visit */}
      {project.nextVisit && (
        <div className="bg-primary-50 rounded-xl border border-primary-200 p-4">
          <div className="flex items-center gap-2 text-primary-700 font-medium mb-1">
            <Calendar className="w-4 h-4" />
            Kommande besok
          </div>
          <p className="text-sm text-primary-700">{formatDateTime(project.nextVisit.start_time)}</p>
          {project.nextVisit.title && (
            <p className="text-sm text-sky-700 mt-1">{project.nextVisit.title}</p>
          )}
        </div>
      )}

      {/* Milestones */}
      {project.milestones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-3">Framsteg</h3>
          <div className="space-y-2">
            {project.milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                {m.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                ) : m.status === 'in_progress' ? (
                  <div className="w-5 h-5 border-2 border-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 bg-primary-700 rounded-full" />
                  </div>
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full flex-shrink-0" />
                )}
                <span className={`text-sm ${m.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {m.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {project.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-2">Beskrivning</h3>
          <p className="text-sm text-gray-600">{project.description}</p>
        </div>
      )}

      {/* ÄTA (Change Orders) */}
      {project.atas && project.atas.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Ändringar (ÄTA)</h3>
          {project.atas.map(ata => (
            <div key={ata.change_id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">ÄTA-{ata.ata_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    ata.change_type === 'addition' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    ata.change_type === 'change' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    'bg-red-50 text-red-600 border-red-200'
                  }`}>
                    {ata.change_type === 'addition' ? 'Tillägg' : ata.change_type === 'change' ? 'Ändring' : 'Avgående'}
                  </span>
                </div>
                {ata.status === 'signed' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                    Signerad
                  </span>
                )}
                {ata.status === 'approved' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                    Godkänd
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-600 mb-3">{ata.description}</p>

              {/* Items */}
              {ata.items && ata.items.length > 0 && (
                <div className="border-t border-gray-100 pt-2 mb-3">
                  {ata.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1">
                      <span className="text-gray-700">{item.name} ({item.quantity} {item.unit})</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(item.quantity * item.unit_price)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100 mt-1">
                    <span>Totalt</span>
                    <span>{formatCurrency(ata.total)}</span>
                  </div>
                </div>
              )}

              {/* Signed info */}
              {ata.signed_at && ata.signed_by_name && (
                <div className="flex items-center gap-2 text-xs text-primary-700 mt-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Signerad av {ata.signed_by_name}, {formatDate(ata.signed_at)}
                </div>
              )}

              {/* Sign button for "sent" status */}
              {ata.status === 'sent' && ata.sign_token && (
                <div className="mt-3">
                  {signingAtaId === ata.change_id ? (
                    <div className="space-y-3 border-t border-gray-100 pt-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Ditt namn</label>
                        <input
                          type="text"
                          value={signerName}
                          onChange={e => setSignerName(e.target.value)}
                          placeholder="Förnamn Efternamn"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-600"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-gray-500">Signatur</label>
                          <ClearSignatureButton
                            variant="corner"
                            onClick={() => ataCanvasRef.current?.clear()}
                          />
                        </div>
                        <SignatureCanvas
                          ref={ataCanvasRef}
                          mode="ata"
                          className="w-full h-24 border border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setSigningAtaId(null); setSignerName('') }}
                          className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={() => signAta(ata.sign_token!)}
                          disabled={!signerName.trim() || signingSaving}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-white bg-primary-700 rounded-lg hover:bg-primary-800 disabled:opacity-50"
                        >
                          {signingSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenTool className="w-3.5 h-3.5" />}
                          Signera
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setSigningAtaId(ata.change_id)
                        setTimeout(() => ataCanvasRef.current?.init(), 100)
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
                    >
                      <PenTool className="w-4 h-4" />
                      Granska och signera
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Project Tracker Sub-component ───────────────────────────

const TRACKER_STAGES = [
  { key: 'quote_accepted', label: 'Offert godkänd', icon: '✅' },
  { key: 'material', label: 'Material förbereds', icon: '📦' },
  { key: 'work_started', label: 'Arbete pågår', icon: '🔨' },
  { key: 'inspection', label: 'Slutbesiktning', icon: '🔍' },
  { key: 'done', label: 'Klart!', icon: '🎉' },
]

function ProjectTracker({
  stages,
  photos,
}: {
  stages: TrackerStage[]
  photos: ProjectPhoto[]
}) {
  const completedKeys = stages.filter(s => s.completed_at).map(s => s.stage)
  const currentIndex = TRACKER_STAGES.findIndex(s => !completedKeys.includes(s.key))
  const progressPct = currentIndex < 0
    ? 100
    : Math.round((currentIndex / (TRACKER_STAGES.length - 1)) * 100)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-1">Projektstatus</h3>
      <p className="text-xs text-gray-400 mb-5">Uppdateras i realtid</p>

      {/* Step indicator */}
      <div className="relative pl-5">
        {/* Background line */}
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-gray-200" />
        {/* Progress line */}
        <div
          className="absolute left-[19px] top-5 w-0.5 bg-primary-500 transition-all duration-1000"
          style={{ height: `${progressPct}%` }}
        />

        <div className="space-y-5">
          {TRACKER_STAGES.map((step, i) => {
            const isCompleted = completedKeys.includes(step.key)
            const isCurrent = i === currentIndex
            const stageData = stages.find(s => s.stage === step.key)

            return (
              <div key={step.key} className="flex items-start gap-3">
                {/* Circle */}
                <div
                  className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0 border-2 transition-all ${
                    isCompleted
                      ? 'bg-primary-500 border-primary-600 text-white'
                      : isCurrent
                        ? 'bg-white border-primary-600'
                        : 'bg-white border-gray-200'
                  } ${isCurrent ? 'animate-pulse' : ''}`}
                >
                  {isCompleted ? '✓' : step.icon}
                </div>

                {/* Info */}
                <div className="flex-1 pt-1">
                  <p
                    className={`text-sm font-medium ${
                      isCompleted
                        ? 'text-gray-900'
                        : isCurrent
                          ? 'text-primary-700'
                          : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </p>
                  {stageData?.completed_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(stageData.completed_at).toLocaleDateString('sv-SE', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {stageData.note && ` · ${stageData.note}`}
                    </p>
                  )}
                  {isCurrent && !isCompleted && (
                    <p className="text-xs text-primary-700 mt-0.5">Pågår nu...</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Foton från jobbet
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map(photo => (
              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Projektfoto'}
                  className="w-full h-full object-cover"
                />
                {photo.type === 'after' && (
                  <span className="absolute top-1 right-1 text-[10px] bg-primary-500 text-white px-1.5 py-0.5 rounded-full">
                    Klart
                  </span>
                )}
                {photo.type === 'before' && (
                  <span className="absolute top-1 right-1 text-[10px] bg-gray-700 text-white px-1.5 py-0.5 rounded-full">
                    Före
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
