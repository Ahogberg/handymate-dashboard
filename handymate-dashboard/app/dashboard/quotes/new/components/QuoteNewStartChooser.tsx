'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, FilePlus2, FileStack, Loader2, Sparkles } from 'lucide-react'
import TemplateSelector from '@/components/quotes/TemplateSelector'
import type { QuoteTemplate } from '@/lib/types/quote'

interface QuoteNewStartChooserProps {
  show: boolean
  onClose: () => void
  onSelectTemplate: (template: QuoteTemplate) => void
  onDescribeWithAI: () => void
}

/**
 * Startsteg för ny offert (Etapp 3). Fullskärms-overlay som visas bara när
 * inget annat redan pekat ut vad offerten ska bli (se hasQuoteStartSignal i
 * new/page.tsx) — deal/lead, vald kund, transcript eller förifylld titel
 * gör att den aldrig visas. QuoteNewTemplatePanel (den ihopfällbara panelen
 * i vänsterspalten) är kvar som väg tillbaka till mallarna även efter att
 * den här stängts.
 */
export function QuoteNewStartChooser({ show, onClose, onSelectTemplate, onDescribeWithAI }: QuoteNewStartChooserProps) {
  const [mode, setMode] = useState<'choose' | 'templates'>('choose')
  const [templateCount, setTemplateCount] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (!show) {
      setMode('choose')
      setTemplateCount(null)
    }
  }, [show])

  useEffect(() => {
    if (!show || mode !== 'templates') return
    let cancelled = false
    fetch('/api/quote-templates')
      .then(r => r.json())
      .then(data => { if (!cancelled) setTemplateCount((data.templates || []).length) })
      .catch(() => { if (!cancelled) setTemplateCount(0) })
    return () => { cancelled = true }
  }, [show, mode])

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

  function handleAi() {
    onDescribeWithAI()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col px-4 py-6 sm:py-10">
        {mode === 'choose' ? (
          <>
            <div className="text-center mb-8 mt-4 sm:mt-10">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Ny offert</h1>
              <p className="text-slate-500 mt-2">Hur vill du börja?</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setMode('templates')}
                className="flex items-center gap-4 p-5 bg-white border-2 border-slate-200 hover:border-primary-700 hover:bg-primary-50/50 rounded-2xl text-left transition-all active:scale-[0.99]"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <FileStack className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-base font-bold text-slate-900">Använd mall</p>
                  <p className="text-sm text-slate-500 mt-0.5">Välj en färdig mall och fyll i detaljerna</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleAi}
                className="flex items-center gap-4 p-5 bg-white border-2 border-slate-200 hover:border-primary-700 hover:bg-primary-50/50 rounded-2xl text-left transition-all active:scale-[0.99]"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-base font-bold text-slate-900">Beskriv jobbet med AI</p>
                  <p className="text-sm text-slate-500 mt-0.5">Skriv eller ladda upp foton — AI fyller i offerten åt dig</p>
                </div>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-4 p-5 bg-white border-2 border-slate-200 hover:border-primary-700 hover:bg-primary-50/50 rounded-2xl text-left transition-all active:scale-[0.99]"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <FilePlus2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-base font-bold text-slate-900">Börja från tom offert</p>
                  <p className="text-sm text-slate-500 mt-0.5">Bygg offerten från grunden själv</p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 text-sm text-slate-400 hover:text-slate-600 text-center mx-auto py-2 px-3"
            >
              Hoppa över
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMode('choose')}
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
              <TemplateSelector onSelect={handleSelect} onBack={() => setMode('choose')} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
