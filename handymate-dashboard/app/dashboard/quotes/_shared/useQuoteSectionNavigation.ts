'use client'
import { useCallback, useEffect, useState } from 'react'
import type { QuoteSection } from '@/lib/quotes/quote-completeness'

/** Vänta tills dokumentvyn är renderad. Nollställ först INUTI bildrutan:
 * en tidigare nollställning kör cleanup och avbryter scrollningen. */
export function useQuoteSectionNavigation(showDocument: () => void) {
  const [pendingSection, setPendingSection] = useState<QuoteSection | null>(null)
  const navigate = useCallback((section: QuoteSection) => {
    showDocument()
    setPendingSection(section)
  }, [showDocument])
  useEffect(() => {
    if (!pendingSection) return
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-section="${pendingSection}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingSection(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingSection])
  return navigate
}
