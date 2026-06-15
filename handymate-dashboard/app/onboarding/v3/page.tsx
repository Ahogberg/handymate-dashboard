'use client'

/* Förhandsroute för den konversationella Matte-onboardingen (v3).
   STATISK demo — låter oss granska designen i appen innan data-wiring
   (increment 6). Onboarding.css kommer från layouten; v3-css importeras här. */

import { useState } from 'react'
import '../onboarding-v3.css'
import { SCREENS, type Variant } from '../components/conversational/screens'

export default function OnboardingV3Preview() {
  const [idx, setIdx] = useState(0)
  const [variant, setVariant] = useState<Variant>('desktop')
  const Comp = SCREENS[idx].comp

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', display: 'flex', flexDirection: 'column' }}>
      {/* Förhands-toolbar (ej del av produkten) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, color: '#0F766E', marginRight: 8 }}>Onboarding v3 · förhandsvisning</strong>
        {SCREENS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIdx(i)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: i === idx ? '#0F766E' : 'transparent',
              color: i === idx ? '#fff' : '#475569',
            }}
          >{s.id} · {s.name}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setVariant(v => (v === 'desktop' ? 'mobile' : 'desktop'))}
          style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', background: '#fff' }}
        >{variant === 'desktop' ? '→ Mobil' : '→ Desktop'}</button>
      </div>

      {/* Scen */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 0 }}>
        {variant === 'desktop' ? (
          <div style={{ width: '100%', maxWidth: 1080, height: 680, background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 20px 60px rgba(15,23,42,0.14)' }}>
            <Comp variant="desktop" />
          </div>
        ) : (
          <div style={{ width: 390, height: 780, background: '#fff', borderRadius: 32, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 20px 60px rgba(15,23,42,0.14)' }}>
            <Comp variant="mobile" />
          </div>
        )}
      </div>
    </div>
  )
}
