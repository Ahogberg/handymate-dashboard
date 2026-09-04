'use client'

import { useRef, type ReactNode } from 'react'
import { Check, MessageCircle, ShieldCheck } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import type { OnboardingFormData } from '@/app/onboarding/types-redesign'
import { deriveConfiguredFacts, SETUP_GUIDANCE } from './MatteSetupGuide'

interface Props {
  step: number
  totalSteps: number
  data: OnboardingFormData
  onUseClassic: () => void
  children: ReactNode
}

export function SetupStudioShell({ step, totalSteps, data, onUseClassic, children }: Props) {
  const matte = getAgentById('matte')
  const guidance = SETUP_GUIDANCE[step] ?? SETUP_GUIDANCE[0]
  const configured = deriveConfiguredFacts(data)

  // "Det här har teamet lärt sig" lovar att listan kommer från det kunden
  // just svarat. Uppgifter som redan låg på kontot när studion öppnades
  // (ett tidigare påbörjat besök, eller demokontots färdiga konfiguration)
  // har teamet inte lärt sig här — de stod bockade innan kunden skrivit ett
  // enda tecken, vilket gör hela kvittot otrovärdigt. Därför: ögonblicksbild
  // vid montering, och bara det som tillkommit sedan dess visas.
  //
  // Skalet monteras först när page.tsx laddat klart (loading-grinden), så
  // ögonblicksbilden ser den återställda datan — inte ett tomt formulär.
  const redanPaPlats = useRef<Set<string> | null>(null)
  if (redanPaPlats.current === null) redanPaPlats.current = new Set(configured)
  const larda = configured.filter(fakta => !redanPaPlats.current!.has(fakta))
  const antalSedanTidigare = redanPaPlats.current.size

  return (
    <section className="setup-studio" aria-label="Onboarding med Matte">
      <header className="setup-studio__topbar">
        <div className="setup-studio__brand">
          <img src={matte?.avatar} alt="" width={42} height={42} />
          <div>
            <strong>Matte · din chefsagent</strong>
            <span><i aria-hidden="true" /> Teamet är med</span>
          </div>
        </div>
        <div className="setup-studio__progress" aria-label={`Steg ${step + 1} av ${totalSteps}`}>
          <span>Steg {step + 1} av {totalSteps}</span>
          <div aria-hidden="true"><i style={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></div>
        </div>
        <button type="button" className="setup-studio__classic" onClick={onUseClassic}>
          Byt till klassisk guide
        </button>
      </header>

      <div className="setup-studio__conversation">
        <aside className="setup-studio__dialog" aria-label="Mattes guidning">
          <div className="setup-studio__bubble" aria-live="polite">
            <div className="setup-studio__bubble-label"><MessageCircle size={14} /> {guidance.eyebrow}</div>
            <h1>{guidance.title}</h1>
            <p>{guidance.body}</p>
          </div>

          <div className="setup-studio__receipt">
            <h2>Det här har teamet lärt sig</h2>
            {larda.length > 0 ? (
              <ul>
                {larda.slice(-5).map(fact => (
                  <li key={fact}><Check size={14} aria-hidden="true" /><span>{fact}</span></li>
                ))}
              </ul>
            ) : (
              <p>Vi fyller på medan du svarar. Tomma fält blir aldrig gissningar.</p>
            )}
            {antalSedanTidigare > 0 && (
              <p className="setup-studio__receipt-earlier">
                {antalSedanTidigare === 1
                  ? 'En uppgift fanns redan sedan tidigare.'
                  : `${antalSedanTidigare} uppgifter fanns redan sedan tidigare.`}
              </p>
            )}
          </div>

          <p className="setup-studio__truth"><ShieldCheck size={15} /> Du kan alltid byta guide utan att förlora dina svar.</p>
        </aside>

        <main className="setup-studio__workspace" aria-label="Ditt svar">
          <span className="setup-studio__answer-label">Ditt svar</span>
          {children}
        </main>
      </div>
    </section>
  )
}
