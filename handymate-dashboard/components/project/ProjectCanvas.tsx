'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Pencil,
  Type,
  ImagePlus,
  Square,
  Circle,
  Trash2,
  Undo2,
  Redo2,
  Save,
  Loader2,
  Minus,
  MousePointer,
  Palette,
  X,
} from 'lucide-react'

type ToolMode = 'select' | 'draw' | 'text' | 'rect' | 'circle' | 'eraser'

const COLORS = ['#1a1a1a', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const STROKE_WIDTHS = [2, 4, 8, 16]

interface Props {
  projectId?: string
  entityType?: string
  entityId?: string
  title?: string
}

export default function ProjectCanvas({ projectId, entityType, entityId, title }: Props) {
  // Backward compat: projectId maps to entity_type=project
  const resolvedType = entityType || 'project'
  const resolvedId = entityId || projectId || ''
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const savingRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [tool, setTool] = useState<ToolMode>('draw')
  const [color, setColor] = useState('#1a1a1a')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [fabricLoaded, setFabricLoaded] = useState(false)
  const [fabricError, setFabricError] = useState(false)

  // Load fabric.js dynamically (client-only)
  useEffect(() => {
    import('fabric').then((mod) => {
      (window as any).__fabric = mod
      setFabricLoaded(true)
    }).catch((err) => {
      console.error('[ProjectCanvas] Failed to load fabric:', err)
      setFabricError(true)
      setFabricLoaded(true) // stop spinner
      setLoading(false)
    })
  }, [])

  // Initialize canvas
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || !canvasContainerRef.current) return

    const fabric = (window as any).__fabric
    const container = canvasContainerRef.current
    const w = container.clientWidth
    const h = Math.max(container.clientHeight, 500)

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: w,
      height: h,
      backgroundColor: '#ffffff',
      isDrawingMode: true,
      selection: true,
    })

    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
    canvas.freeDrawingBrush.color = color
    canvas.freeDrawingBrush.width = strokeWidth

    fabricRef.current = canvas

    // Track history
    const pushHistory = () => {
      const json = JSON.stringify(canvas.toJSON())
      const history = historyRef.current
      const idx = historyIndexRef.current
      // Truncate forward history
      historyRef.current = history.slice(0, idx + 1)
      historyRef.current.push(json)
      historyIndexRef.current = historyRef.current.length - 1
    }

    canvas.on('object:added', pushHistory)
    canvas.on('object:modified', pushHistory)
    canvas.on('object:removed', pushHistory)

    // Load existing data
    loadCanvas(canvas)

    // Auto-save every 30s
    autoSaveTimerRef.current = setInterval(() => {
      saveCanvas(canvas)
    }, 30000)

    // Resize handler
    const handleResize = () => {
      const newW = container.clientWidth
      canvas.setWidth(newW)
      canvas.renderAll()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
      window.removeEventListener('resize', handleResize)
      canvas.dispose()
    }
  }, [fabricLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update brush when tool/color/width changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const fabric = (window as any).__fabric

    if (tool === 'draw') {
      canvas.isDrawingMode = true
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
      canvas.freeDrawingBrush.color = color
      canvas.freeDrawingBrush.width = strokeWidth
    } else if (tool === 'eraser') {
      canvas.isDrawingMode = true
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
      canvas.freeDrawingBrush.color = '#ffffff'
      canvas.freeDrawingBrush.width = strokeWidth * 4
    } else {
      canvas.isDrawingMode = false
    }
  }, [tool, color, strokeWidth])

  const loadCanvas = async (canvas: any) => {
    try {
      const res = await fetch(`/api/canvas?entityType=${resolvedType}&entityId=${resolvedId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const canvasData = data.canvas?.canvas_data

      if (canvasData && canvasData.objects && canvasData.objects.length > 0) {
        await canvas.loadFromJSON(canvasData)
        canvas.renderAll()
        // Push initial state to history
        historyRef.current = [JSON.stringify(canvas.toJSON())]
        historyIndexRef.current = 0
      } else {
        historyRef.current = [JSON.stringify(canvas.toJSON())]
        historyIndexRef.current = 0
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const saveCanvas = useCallback(async (canvasOverride?: any) => {
    const canvas = canvasOverride || fabricRef.current
    if (!canvas || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const canvasData = canvas.toJSON()
      await fetch(`/api/canvas?entityType=${resolvedType}&entityId=${resolvedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_data: canvasData }),
      })
      setLastSaved(new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }))
    } catch { /* ignore */ }
    finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [resolvedType, resolvedId])

  const handleUndo = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const idx = historyIndexRef.current
    if (idx <= 0) return
    historyIndexRef.current = idx - 1
    const json = historyRef.current[idx - 1]
    canvas.loadFromJSON(JSON.parse(json)).then(() => canvas.renderAll())
  }

  const handleRedo = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const idx = historyIndexRef.current
    if (idx >= historyRef.current.length - 1) return
    historyIndexRef.current = idx + 1
    const json = historyRef.current[idx + 1]
    canvas.loadFromJSON(JSON.parse(json)).then(() => canvas.renderAll())
  }

  const handleAddText = () => {
    const canvas = fabricRef.current
    const fabric = (window as any).__fabric
    if (!canvas || !fabric) return

    const text = new fabric.Textbox('Text...', {
      left: 100,
      top: 100,
      fontSize: 20,
      fill: color,
      fontFamily: 'sans-serif',
      editable: true,
      width: 200,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    setTool('select')
  }

  const handleAddRect = () => {
    const canvas = fabricRef.current
    const fabric = (window as any).__fabric
    if (!canvas || !fabric) return

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 150,
      height: 100,
      fill: 'transparent',
      stroke: color,
      strokeWidth: strokeWidth,
      rx: 4,
      ry: 4,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    setTool('select')
  }

  const handleAddCircle = () => {
    const canvas = fabricRef.current
    const fabric = (window as any).__fabric
    if (!canvas || !fabric) return

    const circle = new fabric.Circle({
      left: 150,
      top: 150,
      radius: 60,
      fill: 'transparent',
      stroke: color,
      strokeWidth: strokeWidth,
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
    setTool('select')
  }

  const handleAddImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const canvas = fabricRef.current
        const fabric = (window as any).__fabric
        if (!canvas || !fabric) return

        const imgEl = new window.Image()
        imgEl.onload = () => {
          const img = new fabric.FabricImage(imgEl, {
            left: 50,
            top: 50,
          })
          // Scale down if too large
          const maxDim = 400
          if (img.width > maxDim || img.height > maxDim) {
            const scale = maxDim / Math.max(img.width, img.height)
            img.scale(scale)
          }
          canvas.add(img)
          canvas.setActiveObject(img)
          setTool('select')
        }
        imgEl.src = ev.target?.result as string
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleDeleteSelected = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObjects()
    if (active && active.length > 0) {
      active.forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.renderAll()
    }
  }

  const toolBtnClass = (t: ToolMode) =>
    `p-2 rounded-lg transition ${tool === t ? 'bg-teal-100 text-teal-700 border border-teal-300' : 'text-gray-500 hover:bg-gray-100 border border-transparent'}`

  if (fabricError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <X className="w-8 h-8 text-red-400 mb-2" />
        <span className="text-sm text-gray-700 font-medium">Skissblocket kunde inte laddas</span>
        <span className="text-xs text-gray-400 mt-1">Försök ladda om sidan</span>
      </div>
    )
  }

  if (!fabricLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Laddar rityta...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-1 flex-wrap">
        {/* Select */}
        <button onClick={() => setTool('select')} className={toolBtnClass('select')} title="Markera">
          <MousePointer className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Draw */}
        <button onClick={() => setTool('draw')} className={toolBtnClass('draw')} title="Rita">
          <Pencil className="w-4 h-4" />
        </button>

        {/* Eraser */}
        <button onClick={() => setTool('eraser')} className={toolBtnClass('eraser')} title="Radera">
          <Minus className="w-4 h-4" />
        </button>

        {/* Text */}
        <button onClick={() => { handleAddText() }} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Text">
          <Type className="w-4 h-4" />
        </button>

        {/* Image */}
        <button onClick={handleAddImage} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Bild">
          <ImagePlus className="w-4 h-4" />
        </button>

        {/* Rect */}
        <button onClick={handleAddRect} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Rektangel">
          <Square className="w-4 h-4" />
        </button>

        {/* Circle */}
        <button onClick={handleAddCircle} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Cirkel">
          <Circle className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Color */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition flex items-center gap-1"
            title="Färg"
          >
            <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: color }} />
          </button>
          {showColorPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColorPicker(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 flex gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setShowColorPicker(false) }}
                    className={`w-6 h-6 rounded-full border-2 transition ${color === c ? 'border-teal-500 scale-110' : 'border-gray-200 hover:border-gray-400'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Stroke width */}
        <div className="flex items-center gap-0.5 ml-1">
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              className={`px-1.5 py-1 rounded text-[10px] font-medium transition ${
                strokeWidth === w ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Delete */}
        <button onClick={handleDeleteSelected} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent transition" title="Ta bort markerat">
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Undo / Redo */}
        <button onClick={handleUndo} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Ångra">
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={handleRedo} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 border border-transparent transition" title="Gör om">
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Save status */}
        {lastSaved && (
          <span className="text-xs text-gray-400 hidden sm:inline">Sparad {lastSaved}</span>
        )}

        {/* Save */}
        <button
          onClick={() => saveCanvas()}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Spara
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasContainerRef}
        className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden"
        style={{ minHeight: 500, touchAction: 'none' }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
