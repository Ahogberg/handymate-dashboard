'use client'

/**
 * Reglagen på "Så ser dina kunder dig": logotyp, accentfärg, offertmall och
 * SMS-signatur. Sidan äger tillståndet; kortet visar och rapporterar.
 * Designbrief 07 — vitt kort, sektioner skilda av hårlinjer.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Upload } from 'lucide-react'
import { TEMPLATE_META, type TemplateStyle } from '@/lib/quote-templates/meta'
import { DualThumbnail } from '@/components/quotes/style-thumbnails'
import { ACCENT_PRESETS, accentVarning, contrastVsWhite, parseHexInput } from '@/lib/branding/kundvy'

export interface BrandControlsProps {
  businessName: string
  logoUrl: string | null
  accent: string
  templateStyle: TemplateStyle
  smsSignatur: string
  uploadingLogo: boolean
  savingTemplate: boolean
  onPickLogo: (file: File) => void
  onAccentChange: (hex: string) => void
  onTemplateChange: (style: TemplateStyle) => void
  /** Ger sidan ett sätt att öppna filväljaren (Redo-mätarens "Ladda upp"). */
  registerLogoPicker?: (open: () => void) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-t border-slate-200 first:border-t-0">
      <h3 className="text-[13px] font-semibold text-slate-900 mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

export default function BrandControls({
  businessName, logoUrl, accent, templateStyle, smsSignatur,
  uploadingLogo, savingTemplate, onPickLogo, onAccentChange, onTemplateChange, registerLogoPicker,
}: BrandControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    registerLogoPicker?.(() => fileRef.current?.click())
  }, [registerLogoPicker])

  const hexShown = hexDraft ?? accent.toUpperCase()
  const ratio = contrastVsWhite(accent)
  const varning = accentVarning(accent)

  function commitHex(value: string) {
    const parsed = parseHexInput(value)
    if (parsed) onAccentChange(parsed)
    setHexDraft(null)
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onPickLogo(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Logotyp */}
      <Section title="Logotyp">
        {logoUrl ? (
          <div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 bg-white h-[72px] flex items-center justify-center p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={businessName} className="max-h-10 max-w-full object-contain" />
              </div>
              <div className="rounded-xl h-[72px] flex items-center justify-center p-3" style={{ background: accent }}>
                <div className="bg-white rounded-md px-2 py-1 max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="max-h-7 max-w-full object-contain" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-[12px] text-slate-500">
              <span className="flex gap-3">
                <span>På vit grund</span>
                <span>I sidhuvudet</span>
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingLogo}
                className="text-teal-700 font-medium hover:underline disabled:opacity-50"
              >
                {uploadingLogo ? 'Laddar upp…' : 'Byt fil'}
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            className={`rounded-xl border-[1.5px] border-dashed p-4 text-center transition-colors ${
              dragOver ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
            <p className="text-[13px] font-semibold text-slate-900">Ladda upp logotyp</p>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
              PNG eller SVG, gärna utan bakgrund. Tills dess visas firmanamnet som text.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              className="mt-2.5 inline-flex items-center px-3 h-8 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploadingLogo ? 'Laddar upp…' : 'Välj fil'}
            </button>
          </div>
        )}
      </Section>

      {/* Accentfärg */}
      <Section title="Accentfärg">
        <div className="flex flex-wrap gap-2 mb-3">
          {ACCENT_PRESETS.map((p) => {
            const selected = p.hex.toUpperCase() === accent.toUpperCase()
            return (
              <button
                key={p.hex}
                type="button"
                title={p.namn}
                aria-label={p.namn}
                aria-pressed={selected}
                onClick={() => { setHexDraft(null); onAccentChange(p.hex) }}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
                style={{
                  background: p.hex,
                  boxShadow: selected ? '0 0 0 2px #fff, 0 0 0 4px #0f172a' : 'none',
                }}
              >
                {selected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 flex-1 h-9 px-2.5 rounded-lg border border-slate-300 bg-white focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
            <span className="w-4 h-4 rounded-[4px] shrink-0 border border-black/10" style={{ background: accent }} />
            <input
              value={hexShown}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitHex((e.target as HTMLInputElement).value) }}
              spellCheck={false}
              aria-label="Accentfärg som hex"
              className="flex-1 min-w-0 font-mono text-[13px] text-slate-900 outline-none bg-transparent"
            />
          </label>
          <span className="text-[12px] text-slate-500 whitespace-nowrap tabular-nums">
            Vit text {ratio.toFixed(1).replace('.', ',')}:1
          </span>
        </div>
        {varning ? (
          <p className="mt-2.5 text-[12px] leading-snug text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {varning}
          </p>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-slate-500">
            Används på knappar och en tunn linje i sidhuvudet. Texten på färgen är alltid vit.
          </p>
        )}
      </Section>

      {/* Offertmall */}
      <Section title="Offertmall">
        <div className="grid grid-cols-3 gap-2.5">
          {TEMPLATE_META.map((meta) => {
            const selected = meta.id === templateStyle
            const thumbAccent = meta.id === 'premium' ? meta.previewAccentColor : accent
            return (
              <button
                key={meta.id}
                type="button"
                disabled={savingTemplate}
                onClick={() => onTemplateChange(meta.id)}
                aria-pressed={selected}
                className={`text-left rounded-xl border-2 p-1.5 transition-colors disabled:opacity-60 ${
                  selected ? 'border-teal-600' : 'border-transparent hover:border-slate-300'
                }`}
              >
                <div className="h-[84px] rounded-lg overflow-hidden bg-slate-100">
                  <DualThumbnail style={meta.id} bg={meta.previewBgColor} accent={thumbAccent} />
                </div>
                <div className="mt-1.5 text-[12px] font-semibold text-slate-900">
                  {meta.id === 'friendly' ? 'Vänlig' : meta.name}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* SMS-signatur */}
      <Section title="SMS-signatur">
        <input
          readOnly
          value={smsSignatur}
          aria-label="SMS-signatur"
          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[13px] text-slate-700 font-mono"
        />
        <p className="mt-2 text-[12px] leading-snug text-slate-500">
          Sist i varje SMS så kunden ser vem som skriver. Följer firmanamnet.
        </p>
      </Section>
    </div>
  )
}
