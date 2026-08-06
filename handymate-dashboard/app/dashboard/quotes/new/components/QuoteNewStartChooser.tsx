'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, FileStack, Loader2 } from 'lucide-react'
import TemplateSelector from '@/components/quotes/TemplateSelector'
import type { QuoteTemplate } from '@/lib/types/quote'

interface QuoteNewStartChooserProps {
  show: boolean
  onClose: () => void
  onSelectTemplate: (template: QuoteTemplate) => void
}

/**
 * Mallväljaren för ny offert.
 *
 * ═══ VAD DEN VAR, OCH VARFÖR DEN INTE ÄR DET LÄNGRE ═══
 *
 * Filen hette startväljare och visade fyra alternativ innan man fick börja:
 * Snabboffert, Använd mall, Beskriv jobbet med AI, Börja från tom offert.
 *
 * Två av dem var samma sak. "Beskriv jobbet med AI" och "Snabboffert" postade
 * båda till /api/quotes/ai-generate och körde applyAiResult — Snabbofferten är
 * en strikt förbättring med röst, kundval och sektionsgranskning. Och "Börja
 * från tom offert" erbjöd piloten exakt den yta han beskrev som "för mycket,
 * rörigt, man får inte med allt".
 *
 * Kvar fanns alltså ETT verkligt beslut — beskriva jobbet eller återanvända en
 * mall — och det behöver ingen egen fullskärm. Kallstart går nu direkt till
 * Snabboffertens intag (se new/page.tsx), och mallvalet ligger som en länk
 * där. Den här komponenten är därför bara mallistan numera.
 *
 * Namnet behålls tills vidare: en omdöpning rör importvägar i flera filer utan
 * funktionell vinst, och kommentaren här räcker för att undvika förvirring.
 */
export function QuoteNewStartChooser({ show, onClose, onSelectTemplate }: QuoteNewStartChooserProps) {
  const [templateCount, setTemplateCount] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (!show) {
      setTemplateCount(null)
      return
    }
    let cancelled = false
    fetch('/api/quote-templates')
      .then(r => r.json())
      .then(data => { if (!cancelled) setTemplateCount((data.templates || []).length) })
      .catch(() => { if (!cancelled) setTemplateCount(0) })
    return () => { cancelled = true }
  }, [show])

  if (!show) return null

  async function handleFetchDefaults() {
    setSeeding(true)
    try {
      await fetch('/api/quote-templates/seed', { method: 'POST' })
      const res = await fetch('/api/quote-templates')
      const data = await res.json()
      setTemplateCount((data.templates || []).length)
    } catch (err) {
      console.error('[QuoteNewStartChooser] Kunde inte hämta mallar:', err)
    }
    setSeeding(false)
  }

  function handleSelect(template: QuoteTemplate) {
    onSelectTemplate(template)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col px-4 py-6 sm:py-10">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4 -ml-1 px-2 py-2 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Tillbaka
        </button>

        {templateCount === null ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
          </div>
        ) : templateCount === 0 ? (
          <div className="text-center py-12 px-4 bg-primary-50/50 border border-primary-100 rounded-2xl">
            <FileStack className="w-10 h-10 text-primary-700 mx-auto mb-3" />
            <p className="text-slate-900 font-semibold">Ingen mall sparad ännu</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              Hämta färdiga mallar anpassade för din bransch — helt redigerbara direkt.
            </p>
            <button
              type="button"
              onClick={handleFetchDefaults}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {seeding && <Loader2 className="w-4 h-4 animate-spin" />}
              {seeding ? 'Hämtar mallar…' : 'Hämta färdiga mallar för din bransch'}
            </button>
          </div>
        ) : (
          <TemplateSelector onSelect={handleSelect} onBack={onClose} />
        )}
      </div>
    </div>
  )
}
