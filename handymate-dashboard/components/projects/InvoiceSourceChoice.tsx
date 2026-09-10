'use client'

import React, { useEffect, useRef } from 'react'

/** Navigation only: neither option creates an invoice or changes an agreement. */
export function InvoiceSourceChoice({ onChoose, onClose }: {
  onChoose: (source: 'contract' | 'actuals') => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog ref={dialog} aria-labelledby="invoice-source-title" onCancel={onClose}
      className="w-full max-w-lg rounded-2xl p-6 backdrop:bg-black/40">
      <h2 id="invoice-source-title" className="text-lg font-semibold text-slate-900">Vilket underlag vill du granska?</h2>
      <p className="mt-2 text-sm text-slate-600">
        Projektet har en offert. Välj det underlag som stämmer med vad ni avtalat med kunden.
        Projektets typ avgör inte faktureringssättet.
      </p>
      <div className="mt-5 grid gap-3">
        <button type="button" onClick={() => onChoose('contract')}
          className="rounded-xl border border-slate-300 p-4 text-left hover:bg-slate-50">
          <span className="block font-semibold">Offert och godkända ÄTA</span>
          <span className="mt-1 block text-sm text-slate-600">Granska offertens rader och fakturerbara ÄTA. Registrerad tid och material läggs inte på en gång till.</span>
        </button>
        <button type="button" onClick={() => onChoose('actuals')}
          className="rounded-xl border border-slate-300 p-4 text-left hover:bg-slate-50">
          <span className="block font-semibold">Registrerad tid och material</span>
          <span className="mt-1 block text-sm text-slate-600">Välj faktisk ofakturerad tid och material. Offertens total läggs inte till.</span>
        </button>
      </div>
      <p className="mt-4 text-sm text-slate-600">Har ni ett blandat upplägg behöver du kontrollera vilka delar som redan täcks av offerten. Underlagen slås inte ihop automatiskt. Inget skapas eller skickas när du väljer här.</p>
      <button type="button" onClick={onClose} className="mt-5 text-sm font-medium text-slate-700">Avbryt</button>
    </dialog>
  )
}
