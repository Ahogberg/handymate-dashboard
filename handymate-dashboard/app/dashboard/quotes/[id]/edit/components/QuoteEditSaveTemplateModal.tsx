'use client'

interface QuoteEditSaveTemplateModalProps {
  show: boolean
  onClose: () => void
  templateName: string
  setTemplateName: (s: string) => void
  saving: boolean
  onSave: () => void
}

export function QuoteEditSaveTemplateModal({
  show,
  onClose,
  templateName,
  setTemplateName,
  saving,
  onSave,
}: QuoteEditSaveTemplateModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border-thin border-[#E2E8F0] rounded-xl w-full max-w-md px-8 py-7"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-medium text-[#1E293B] mb-5">Spara som mall</h3>
        <div className="mb-5">
          <label className="block text-[12px] text-[#64748B] mb-1">Mallnamn</label>
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="T.ex. Byte elcentral"
            autoFocus
            className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer"
          >
            Avbryt
          </button>
          <button
            onClick={onSave}
            disabled={!templateName.trim() || saving}
            className="flex-1 py-2.5 bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}
