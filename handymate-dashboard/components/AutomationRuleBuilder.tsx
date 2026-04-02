'use client'

import { useState } from 'react'

interface RuleBuilderProps {
  onClose: () => void
  onSaved: () => void
  editRule?: {
    id: string
    name: string
    description: string | null
    trigger_type: string
    trigger_config: Record<string, unknown>
    action_type: string
    action_config: Record<string, unknown>
    requires_approval: boolean
    respects_work_hours: boolean
    respects_night_mode: boolean
  }
}

const TRIGGER_TYPES = [
  { value: 'event', label: 'Händelse', description: 'Reagerar på en specifik händelse', icon: '⚡' },
  { value: 'threshold', label: 'Tröskel', description: 'Körs när ett villkor uppfylls', icon: '📊' },
  { value: 'cron', label: 'Schemalagd', description: 'Körs vid ett bestämt klockslag', icon: '🕐' },
  { value: 'manual', label: 'Manuell', description: 'Körs manuellt från dashboard', icon: '👆' },
]

const EVENT_GROUPS = [
  {
    label: 'Leads & kommunikation',
    options: [
      { value: 'lead_created', label: 'Ny lead' },
      { value: 'sms_received', label: 'Inkommande SMS' },
      { value: 'call_missed', label: 'Missat samtal' },
      { value: 'pipeline_stage_changed', label: 'Lead bytte steg i pipeline' },
      { value: 'customer_reactivation', label: 'Kund inaktiv 6+ månader' },
    ],
  },
  {
    label: 'Offerter',
    options: [
      { value: 'quote_sent', label: 'Offert skickad' },
      { value: 'quote_opened', label: 'Offert öppnad av kund' },
      { value: 'quote_signed', label: 'Offert signerad' },
    ],
  },
  {
    label: 'Jobb & bokningar',
    options: [
      { value: 'booking_created', label: 'Bokning skapad' },
      { value: 'job_completed', label: 'Jobb avslutat' },
    ],
  },
  {
    label: 'Ekonomi',
    options: [
      { value: 'invoice_created', label: 'Faktura skapad' },
      { value: 'payment_received', label: 'Betalning mottagen' },
    ],
  },
]

const THRESHOLD_ENTITIES = [
  { value: 'quote', label: 'Offert', fields: ['days_since_sent'] },
  { value: 'invoice', label: 'Faktura', fields: ['days_overdue'] },
  { value: 'booking', label: 'Bokning', fields: ['hours_until'] },
  { value: 'customer', label: 'Kund', fields: ['months_since_last_job'] },
]

const ACTION_TYPES = [
  { value: 'send_sms', label: 'Skicka SMS' },
  { value: 'send_email', label: 'Skicka e-post' },
  { value: 'create_approval', label: 'Skapa godkännande' },
  { value: 'run_agent', label: 'Kör AI-agent' },
  { value: 'update_status', label: 'Uppdatera status' },
  { value: 'notify_owner', label: 'Skicka notis' },
  { value: 'reject_lead', label: 'Avvisa lead' },
  { value: 'generate_quote', label: 'Generera offert' },
  { value: 'create_booking', label: 'Skapa bokning' },
  { value: 'schedule_followup', label: 'Schemalägg uppföljning' },
]

export default function AutomationRuleBuilder({ onClose, onSaved, editRule }: RuleBuilderProps) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(editRule?.name || '')
  const [description, setDescription] = useState(editRule?.description || '')
  const [triggerType, setTriggerType] = useState(editRule?.trigger_type || '')
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(editRule?.trigger_config || {})
  const [actionType, setActionType] = useState(editRule?.action_type || '')
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(editRule?.action_config || {})
  const [requiresApproval, setRequiresApproval] = useState(editRule?.requires_approval ?? false)
  const [respectsWorkHours, setRespectsWorkHours] = useState(editRule?.respects_work_hours ?? true)
  const [respectsNightMode, setRespectsNightMode] = useState(editRule?.respects_night_mode ?? true)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        name,
        description: description || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        action_type: actionType,
        action_config: actionConfig,
        requires_approval: requiresApproval,
        respects_work_hours: respectsWorkHours,
        respects_night_mode: respectsNightMode,
      }

      const url = editRule ? `/api/automation/rules/${editRule.id}` : '/api/automation/rules'
      const method = editRule ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        onSaved()
      }
    } catch {
      // error
    }
    setSaving(false)
  }

  const canProceed = () => {
    if (step === 1) return !!triggerType
    if (step === 2) {
      if (triggerType === 'event') return !!triggerConfig.event_name
      if (triggerType === 'threshold') return !!triggerConfig.entity && !!triggerConfig.field && triggerConfig.value !== undefined
      if (triggerType === 'cron') return !!triggerConfig.schedule
      return true
    }
    if (step === 3) return !!actionType
    if (step === 4) {
      if (actionType === 'send_sms') return !!actionConfig.template
      if (actionType === 'run_agent') return !!actionConfig.instruction
      return true
    }
    if (step === 5) return !!name
    return true
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editRule ? 'Redigera regel' : 'Ny automationsregel'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-4 flex gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`h-1 flex-1 rounded ${s <= step ? 'bg-primary-700' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="p-5">
          {/* Step 1: Trigger type */}
          {step === 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">1. Välj triggertyp</h3>
              <div className="space-y-2">
                {TRIGGER_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setTriggerType(t.value); setTriggerConfig({}) }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      triggerType === t.value
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{t.label}</div>
                        <div className="text-xs text-gray-500">{t.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Trigger config */}
          {step === 2 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">2. Konfigurera trigger</h3>

              {triggerType === 'event' && (
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Händelse</label>
                  <select
                    value={(triggerConfig.event_name as string) || ''}
                    onChange={e => setTriggerConfig({ event_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Välj händelse...</option>
                    {EVENT_GROUPS.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map(e => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              {triggerType === 'threshold' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Entitet</label>
                    <select
                      value={(triggerConfig.entity as string) || ''}
                      onChange={e => setTriggerConfig({ ...triggerConfig, entity: e.target.value, field: '' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Välj...</option>
                      {THRESHOLD_ENTITIES.map(e => (
                        <option key={e.value} value={e.value}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  {!!triggerConfig.entity && (
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Fält</label>
                      <select
                        value={(triggerConfig.field as string) || ''}
                        onChange={e => setTriggerConfig({ ...triggerConfig, field: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Välj...</option>
                        {THRESHOLD_ENTITIES.find(e => e.value === triggerConfig.entity)?.fields.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Operator</label>
                      <select
                        value={(triggerConfig.operator as string) || '>='}
                        onChange={e => setTriggerConfig({ ...triggerConfig, operator: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value=">=">&gt;= (större/lika)</option>
                        <option value="<=">&lt;= (mindre/lika)</option>
                        <option value="==">=== (exakt)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Värde</label>
                      <input
                        type="number"
                        value={(triggerConfig.value as number) ?? ''}
                        onChange={e => setTriggerConfig({ ...triggerConfig, value: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {triggerType === 'cron' && (
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Cron-schema</label>
                  <input
                    type="text"
                    value={(triggerConfig.schedule as string) || ''}
                    onChange={e => setTriggerConfig({ schedule: e.target.value })}
                    placeholder="0 7 * * mon-fri"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Exempel: &quot;0 7 * * mon-fri&quot; = vardagar kl 07:00
                  </p>
                </div>
              )}

              {triggerType === 'manual' && (
                <p className="text-sm text-gray-500">
                  Denna regel körs manuellt från dashboarden.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Action type */}
          {step === 3 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">3. Välj åtgärd</h3>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_TYPES.map(a => (
                  <button
                    key={a.value}
                    onClick={() => { setActionType(a.value); setActionConfig({}) }}
                    className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                      actionType === a.value
                        ? 'border-primary-600 bg-primary-50 font-medium'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Action config */}
          {step === 4 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">4. Konfigurera åtgärd</h3>

              {actionType === 'send_sms' && (
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">SMS-mall</label>
                  <textarea
                    value={(actionConfig.template as string) || ''}
                    onChange={e => setActionConfig({ ...actionConfig, template: e.target.value })}
                    placeholder="Hej {{customer_name}}! ..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Variabler: {'{{customer_name}}'}, {'{{business_name}}'}, {'{{days}}'}, {'{{total}}'}, {'{{due_date}}'}, {'{{time}}'}, {'{{address}}'}
                  </p>
                </div>
              )}

              {actionType === 'send_email' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Ämne</label>
                    <input
                      type="text"
                      value={(actionConfig.subject as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Brödtext</label>
                    <textarea
                      value={(actionConfig.body as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, body: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {actionType === 'run_agent' && (
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Instruktion till AI-agenten</label>
                  <textarea
                    value={(actionConfig.instruction as string) || ''}
                    onChange={e => setActionConfig({ ...actionConfig, instruction: e.target.value })}
                    placeholder="Generera morgonrapport med dagens bokningar..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}

              {actionType === 'create_approval' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Titel</label>
                    <input
                      type="text"
                      value={(actionConfig.title as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Beskrivning</label>
                    <textarea
                      value={(actionConfig.description as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {actionType === 'notify_owner' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Notistitel</label>
                    <input
                      type="text"
                      value={(actionConfig.title as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Meddelande</label>
                    <input
                      type="text"
                      value={(actionConfig.body as string) || ''}
                      onChange={e => setActionConfig({ ...actionConfig, body: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {['update_status', 'reject_lead', 'generate_quote', 'create_booking', 'schedule_followup'].includes(actionType) && (
                <p className="text-sm text-gray-500">
                  Denna åtgärd använder standardkonfiguration. Kontexten från triggern styr beteendet.
                </p>
              )}
            </div>
          )}

          {/* Step 5: Name + options */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">5. Namn och styrning</h3>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Regelnamn</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="T.ex. Morgonrapport"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Beskrivning (valfritt)</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={e => setRequiresApproval(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-700"
                  />
                  <span className="text-sm text-gray-700">Kräv godkännande före körning</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={respectsWorkHours}
                    onChange={e => setRespectsWorkHours(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-700"
                  />
                  <span className="text-sm text-gray-700">Respektera arbetstider</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={respectsNightMode}
                    onChange={e => setRespectsNightMode(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-700"
                  />
                  <span className="text-sm text-gray-700">Respektera nattspärr</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            {step > 1 ? 'Tillbaka' : 'Avbryt'}
          </button>
          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-5 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              Nästa
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !name}
              className="px-5 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Sparar...' : editRule ? 'Uppdatera regel' : 'Skapa regel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
