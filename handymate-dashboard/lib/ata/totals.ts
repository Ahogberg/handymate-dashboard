/**
 * ÄTA-summor — EN beräkning för delsumma/moms/totalt/ROT-avdrag/att betala.
 *
 * ═══ VARFÖR ═══
 *
 * ÄTA:ns dokument (PDF, portal, "Förhandsgranska faktura") behöver samma
 * summor räknade på samma sätt överallt. Duplicerad pengalogik är den
 * felklass som redan orsakat problem i den här kodbasen (momsbasen
 * 2026-07-30, tre spridda "avtalad ÄTA"-definitioner 2026-09-02) — kopior
 * som är sinsemellan konsistenta idag men driftar isär över tid.
 *
 * ROT-avdraget räknas via `rotRutDeductionInclVat` (lib/rot-rut.ts):
 * Skatteverkets regel är 30 % på arbetskostnaden INKLUSIVE moms.
 */

import type { AtaRad } from './items'
import { rotRutDeductionInclVat } from '@/lib/rot-rut'

export interface AtaSummor {
  delsumma: number
  moms: number
  totalt: number
  rotTyp: 'rot' | 'rut' | null
  rotArbetskostnadExMoms: number
  rotAvdrag: number
  attBetala: number
}

/**
 * Beräkna ÄTA:ns summor. `changeType === 'removal'` (Avgående) ger negativa
 * summor — det är avsett (raden dras AV från projektets totalsumma), och
 * ROT-avdrag är då alltid 0 (avdrag på ett negativt belopp är meningslöst).
 *
 * Avrundning till hela kronor sker INTE här — utsidan (PDF/UI) avrundar med
 * Math.round där den visar beloppet, så mellanstegen behåller precision.
 */
export function beraknaAtaSummor(
  items: AtaRad[],
  vatRate: number,
  changeType?: string,
): AtaSummor {
  const ärAvgående = changeType === 'removal'
  const tecken = ärAvgående ? -1 : 1

  const delsummaAbs = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const delsumma = tecken * delsummaAbs
  const moms = delsumma * vatRate / 100
  const totalt = delsumma + moms

  // Samma avgörande som fakturamotorn (lib/invoices/project-invoice-draft.ts):
  // ROT om `is_rot_eligible` eller `rot_rut_type === 'rot'`, RUT om
  // `is_rut_eligible` eller `rot_rut_type === 'rut'`. En ÄTA antas vara av
  // EN sort — finns bägge vinner ROT (vanligast för hantverk).
  const arRot = (item: AtaRad) => item.is_rot_eligible === true || item.rot_rut_type === 'rot'
  const arRut = (item: AtaRad) => item.is_rut_eligible === true || item.rot_rut_type === 'rut'
  const rotAbs = items.filter(arRot).reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const rutAbs = items.filter(arRut).reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  const rotTyp: 'rot' | 'rut' | null = ärAvgående
    ? null
    : rotAbs > 0 ? 'rot' : rutAbs > 0 ? 'rut' : null
  const rotArbetskostnadAbs = rotTyp === 'rot' ? rotAbs : rotTyp === 'rut' ? rutAbs : 0
  const rotArbetskostnadExMoms = tecken * rotArbetskostnadAbs

  const rotAvdrag = rotTyp
    ? rotRutDeductionInclVat(rotTyp, rotArbetskostnadExMoms, { vatRate })
    : 0

  const attBetala = totalt - rotAvdrag

  return {
    delsumma,
    moms,
    totalt,
    rotTyp,
    rotArbetskostnadExMoms,
    rotAvdrag,
    attBetala,
  }
}
