'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/**
 * Delad signatur-canvas (touch + mouse, 2x DPR).
 * Replikerar EXAKT befintlig logik från quote-signing och ÄTA-signing
 * som tidigare bodde inline i page.tsx — ingen visuell eller funktionell
 * ändring.
 *
 * Två varianter används i koden:
 *  - `mode="ata"`   — strokeStyle #1E293B, scale-init via init()-anrop
 *  - `mode="quote"` — strokeStyle #1a1a1a, samma init-pattern
 *
 * Båda bevaras pixel-perfekt här.
 */

export interface SignatureCanvasHandle {
  init: () => void
  clear: () => void
  toDataURL: () => string | null
  hasSignature: () => boolean
}

interface SignatureCanvasProps {
  mode?: 'ata' | 'quote'
  className?: string
  placeholder?: string
  onChange?: (hasDrawn: boolean) => void
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ mode = 'ata', className, placeholder, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const [hasDrawn, setHasDrawn] = useState(false)

    const strokeStyle = mode === 'ata' ? '#1E293B' : '#1a1a1a'

    function init() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      ctx.scale(2, 2)
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }

    function clear() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasDrawn(false)
      onChange?.(false)
    }

    useImperativeHandle(ref, () => ({
      init,
      clear,
      toDataURL: () => canvasRef.current?.toDataURL('image/png') || null,
      hasSignature: () => hasDrawn,
    }))

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current
      if (!canvas) return
      drawingRef.current = true
      const rect = canvas.getBoundingClientRect()

      if (mode === 'quote') {
        // Quote mode använder pointer-capture (befintlig beteende)
        lastPointRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        canvas.setPointerCapture(e.pointerId)
      } else {
        // ÄTA mode: beginPath direkt (befintlig beteende)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.beginPath()
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
      }
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (mode === 'quote') {
        if (!lastPointRef.current) return
        ctx.beginPath()
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
        ctx.lineTo(x, y)
        ctx.stroke()
        lastPointRef.current = { x, y }
      } else {
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      if (!hasDrawn) {
        setHasDrawn(true)
        onChange?.(true)
      }
    }

    function handlePointerUp() {
      drawingRef.current = false
      lastPointRef.current = null
    }

    return (
      <div className={mode === 'quote' ? 'relative border border-gray-200 rounded-lg overflow-hidden bg-white' : ''}>
        <canvas
          ref={canvasRef}
          className={className}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {mode === 'quote' && !hasDrawn && placeholder && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-sm">
            {placeholder}
          </div>
        )}
      </div>
    )
  },
)

export default SignatureCanvas

/**
 * Hjälpknapp som visas under canvas. Behåller exakta klasser från originalet.
 */
export function ClearSignatureButton({ onClick, variant = 'inline' }: { onClick: () => void; variant?: 'inline' | 'corner' }) {
  if (variant === 'corner') {
    return (
      <button onClick={onClick} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
        <Eraser className="w-3 h-3" /> Rensa
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
    >
      <Eraser className="w-3 h-3" />
      Rensa
    </button>
  )
}
