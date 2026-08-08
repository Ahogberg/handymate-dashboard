'use client'

import { AlertTriangle, RotateCw } from 'lucide-react'

/**
 * När företagsuppgifterna inte gick att läsa.
 *
 * ═══ VARFÖR DEN STOPPAR I STÄLLET FÖR ATT VARNA ═══
 *
 * `logBusinessConfigError` skrev en rad i webbläsarkonsolen och lät sidan
 * fortsätta. Kommentaren i den funktionen säger rakt ut vad det innebär:
 * "dokumentets logotyp, adress och betaluppgifter blir tomma". En logg ingen
 * läser stoppar inte en faktura utan bankgiro från att gå till kund — och en
 * faktura utan bankgiro går inte att betala.
 *
 * Efter v96 kan läsningen faktiskt nekas: en anställd vars inbjudan aldrig
 * kopplats till en inloggning passerar inte `is_business_member`. Då är det
 * här inte ett teoretiskt fall utan hens vardag.
 *
 * ═══ VAD DEN INTE GÖR ═══
 *
 * Blockerar bara ytor som PRODUCERAR dokument — offert, faktura, order. En
 * översiktssida som saknar logotypen är ful; en faktura som saknar bankgiro
 * är trasig. Att stoppa allt hade gjort produkten oanvändbar av en logg.
 */
export function ConfigUnavailableNotice({ vad }: { vad: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-amber-900">
            Dina företagsuppgifter kunde inte hämtas
          </h2>
          <p className="mt-1 mb-0 text-sm text-amber-800 leading-relaxed">
            Utan dem skulle {vad} sakna logotyp, organisationsnummer och betaluppgifter — och en
            faktura utan bankgiro går inte att betala. Därför stannar vi här.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-amber-700 text-white text-sm font-semibold"
          >
            <RotateCw className="w-4 h-4" />
            Försök igen
          </button>
          <p className="mt-2.5 mb-0 text-xs text-amber-700">
            Händer det igen: be den som äger kontot kontrollera att du är tillagd som användare.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ConfigUnavailableNotice
