'use client'

import { ArrowLeft } from 'lucide-react'
import { JobbpassView } from '@/components/jobbpass/JobbpassView'
import type { PortalJobbpassSummary } from '../types'

/**
 * Jobbpasset inne i kundportalen (Fastighetspasset steg 1, 2026-08-27):
 * samma JobbpassView som den publika sidan, med portalens tillbaka-rad.
 * Kunden behöver aldrig en separat länk — passet ligger där hen redan är.
 */
export default function PortalJobbpass({ pass, onBack }: { pass: PortalJobbpassSummary; onBack: () => void }) {
  return (
    <div className="bp-body" style={{ paddingBottom: 96 }}>
      <div style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Tillbaka"
          style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bee-700)', letterSpacing: '0.08em' }}>JOBBPASS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pass.project_name}</div>
        </div>
      </div>
      <div style={{ padding: '12px 18px 0' }}>
        <JobbpassView pass={pass.view} />
      </div>
    </div>
  )
}
