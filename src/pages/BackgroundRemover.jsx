import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { removeBackground } from '@imgly/background-removal'
import { autoRemoveBackground, refineEdges, floodFillTransparent } from '../utils/imageProcessing'
import { editImageWithPrompt } from '../utils/gemini'
import { downloadCanvas } from '../utils/download'
import './ToolPage.css'
import './BackgroundRemover.css'

export default function BackgroundRemover() {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [original, setOriginal] = useState(null)
  const [history, setHistory] = useState([])
  const [tolerance, setTolerance] = useState(30)
  const [edgeSmooth, setEdgeSmooth] = useState(1)
  const [mode, setMode] = useState('ai')
  const [brushSize, setBrushSize] = useState(20)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const isDrawing = useRef(false)
  const lastPos = useRef(null)
  const pendingImg = useRef(null)
  const originalImgSrc = useRef(null)

  const onImageLoad = useCallback((img) => {
    pendingImg.current = img
    originalImgSrc.current = img.src
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    setHistory([])
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded || !pendingImg.current || !canvasRef.current) return
    const img = pendingImg.current
    const canvas = canvasRef.current
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    setOriginal(ctx.getImageData(0, 0, canvas.width, canvas.height))
    pendingImg.current = null
  }, [loaded])

  const pushHistory = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    setHistory(h => [...h.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)])
  }

  const undo = () => {
    if (history.length === 0) return
    canvasRef.current.getContext('2d').putImageData(history[history.length - 1], 0, 0)
    setHistory(h => h.slice(0, -1))
  }

  const reset = () => {
    if (!original) return
    pushHistory()
    canvasRef.current.getContext('2d').putImageData(original, 0, 0)
  }

  // === AI BACKGROUND REMOVAL ===
  const aiRemove = async () => {
    if (!loaded || !originalImgSrc.current) return
    pushHistory()
    setProcessing(true)
    setProgress('Loading  model (first time may take 20-30s)...')

    try {
      // Convert canvas to blob for the library
      const canvas = canvasRef.current
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))

      setProgress('Model is analyzing your image...')

      const resultBlob = await removeBackground(blob, {
        model: 'isnet',
        output: { format: 'image/png', quality: 1 },
        progress: (key, current, total) => {
          if (key === 'compute:inference') {
            setProgress(`Processing... ${Math.round((current / total) * 100)}%`)
          } else if (key === 'fetch:model') {
            setProgress(`Downloading  model... ${Math.round((current / total) * 100)}%`)
          }
        }
      })

      setProgress('Rendering result...')

      // Draw result to canvas
      const resultImg = new Image()
      resultImg.onload = () => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(resultImg, 0, 0, canvas.width, canvas.height)
        setProcessing(false)
        setProgress('')
        URL.revokeObjectURL(resultImg.src)
      }
      resultImg.src = URL.createObjectURL(resultBlob)
    } catch (err) {
      setProgress('Failed. Try "Color Based" mode instead.')
      setProcessing(false)
      setTimeout(() => setProgress(''), 4000)
    }
  }

  // === AI TEXT REMOVAL ===
  const aiTextRemove = async () => {
    if (!loaded) return
    pushHistory()
    setProcessing(true)
    setProgress('Sending image for text removal...')

    try {
      const canvas = canvasRef.current
      const base64 = canvas.toDataURL('image/png').split(',')[1]

      setProgress('Detecting and removing text...')

      const result = await editImageWithPrompt({
        prompt:
          'Remove all text, watermarks, captions, labels, signatures, and any overlaid writing from this image. Fill the areas where text was with the appropriate background texture, color, or pattern that seamlessly blends with the surrounding image content. Keep all non-text content exactly as it is.',
        imageBase64: base64,
        mimeType: 'image/png',
      })

      setProgress('Rendering result...')

      const resultImg = new Image()
      resultImg.onload = () => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(resultImg, 0, 0, canvas.width, canvas.height)
        setProcessing(false)
        setProgress('')
        URL.revokeObjectURL(resultImg.src)
      }
      resultImg.src = URL.createObjectURL(result.blob)
    } catch (err) {
      setProgress(`Failed: ${err.message || 'Try again.'}`)
      setProcessing(false)
      setTimeout(() => setProgress(''), 5000)
    }
  }

  // === COLOR-BASED REMOVAL (fallback) ===
  const colorRemove = () => {
    if (!loaded) return
    pushHistory()
    setProcessing(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      imageData = autoRemoveBackground(imageData, tolerance)
      if (edgeSmooth > 0) {
        imageData = refineEdges(imageData, edgeSmooth)
      }
      ctx.putImageData(imageData, 0, 0)
      setProcessing(false)
    }, 50)
  }

  const getScale = () => {
    const canvas = canvasRef.current
    if (!canvas) return 1
    return canvas.width / canvas.getBoundingClientRect().width
  }

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const s = getScale()
    const t = e.touches ? e.touches[0] : e
    return { x: Math.round((t.clientX - rect.left) * s), y: Math.round((t.clientY - rect.top) * s) }
  }

  const onCanvasClick = (e) => {
    if (mode !== 'manual') return
    const pos = getPos(e)
    pushHistory()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    floodFillTransparent(imageData, pos.x, pos.y, tolerance)
    ctx.putImageData(imageData, 0, 0)
  }

  const brushAt = (x, y) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (mode === 'erase') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, brushSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else if (mode === 'restore' && original) {
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = canvas.height
      tmp.getContext('2d').putImageData(original, 0, 0)
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, brushSize, 0, Math.PI * 2)
      ctx.clip()
      ctx.clearRect(x - brushSize, y - brushSize, brushSize * 2, brushSize * 2)
      ctx.drawImage(tmp, 0, 0)
      ctx.restore()
    }
  }

  const interpolateBrush = (from, to) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.floor(dist / 3))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      brushAt(Math.round(from.x + dx * t), Math.round(from.y + dy * t))
    }
  }

  const onPointerDown = (e) => {
    if (mode === 'manual') { onCanvasClick(e); return }
    if (mode !== 'erase' && mode !== 'restore') return
    e.preventDefault()
    isDrawing.current = true
    pushHistory()
    const pos = getPos(e)
    lastPos.current = pos
    brushAt(pos.x, pos.y)
  }

  const onPointerMove = (e) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const pos = getPos(e)
    if (lastPos.current) interpolateBrush(lastPos.current, pos)
    lastPos.current = pos
  }

  const onPointerUp = () => {
    isDrawing.current = false
    lastPos.current = null
  }

  const cursorStyle = (mode === 'erase' || mode === 'restore')
    ? 'crosshair' : mode === 'manual' ? 'crosshair' : 'default'

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Background Remover</h1>
        <p>just like Remove.bg, but free & private. Runs in your browser.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label">Mode</label>
              <div className="btn-group">
                {[
                  { id: 'ai', label: 'Remove BG' },
                  { id: 'ai-text', label: 'Text Remove' },
                  { id: 'color', label: 'Color Based' },
                  { id: 'manual', label: 'Magic Wand' },
                  { id: 'erase', label: 'Eraser' },
                  { id: 'restore', label: 'Restore' },
                ].map(m => (
                  <button key={m.id} className={`tb-btn ${mode === m.id ? 'active' : ''}`}
                    onClick={() => setMode(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>

            {(mode === 'color' || mode === 'manual') && (
              <div className="toolbar-group">
                <label className="toolbar-label">Tolerance: {tolerance}</label>
                <input type="range" min="5" max="120" value={tolerance} onChange={e => setTolerance(+e.target.value)} />
              </div>
            )}

            {mode === 'color' && (
              <div className="toolbar-group">
                <label className="toolbar-label">Edge Smooth: {edgeSmooth}</label>
                <input type="range" min="0" max="3" value={edgeSmooth} onChange={e => setEdgeSmooth(+e.target.value)} />
              </div>
            )}

            {(mode === 'erase' || mode === 'restore') && (
              <div className="toolbar-group">
                <label className="toolbar-label">Brush: {brushSize}px</label>
                <input type="range" min="2" max="100" value={brushSize} onChange={e => setBrushSize(+e.target.value)} />
              </div>
            )}

            {mode === 'ai' && (
              <button className="primary-btn ai-btn" onClick={aiRemove} disabled={processing}>
                {processing ? 'Processing...' : '✨ Remove Background'}
              </button>
            )}

            {mode === 'ai-text' && (
              <button className="primary-btn ai-text-btn" onClick={aiTextRemove} disabled={processing}>
                {processing ? 'Processing...' : '✨ Remove Text'}
              </button>
            )}

            {mode === 'color' && (
              <button className="primary-btn" onClick={colorRemove} disabled={processing}>
                {processing ? 'Processing...' : 'Remove Background'}
              </button>
            )}

            <div className="toolbar-group">
              <button className="tb-btn" onClick={undo} disabled={history.length === 0}>Undo</button>
              <button className="tb-btn danger" onClick={reset}>Reset</button>
            </div>
          </div>

          {/* Hint / Progress */}
          <div className={`tool-hint ${processing ? 'processing' : ''}`}>
            {processing && progress ? progress : (
              <>
                {mode === 'ai' && 'Click "Remove Background" for automatic, high-quality removal like Remove.bg. First use downloads the model (~30MB, cached after).'}
                {mode === 'ai-text' && 'Click "Remove Text" to erase watermarks, captions, and overlaid text. Fills the area with matching background.'}
                {mode === 'color' && 'Color-based removal. Works best with solid color backgrounds. Adjust tolerance for better results.'}
                {mode === 'manual' && 'Click on any color region to make it transparent.'}
                {mode === 'erase' && 'Click & drag to manually erase remaining background.'}
                {mode === 'restore' && 'Click & drag to restore accidentally erased areas.'}
              </>
            )}
          </div>

          {/* Processing overlay */}
          {processing && (
            <div className="processing-bar">
              <div className="processing-spinner"></div>
              <span>{progress || 'Processing...'}</span>
            </div>
          )}

          <div className="canvas-area">
            <div className="canvas-frame">
              <div className="checkerboard" style={{ position: 'absolute', inset: 0 }} />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'relative', zIndex: 1, cursor: cursorStyle,
                  maxWidth: '100%', maxHeight: '70vh',
                  opacity: processing ? 0.5 : 1, transition: 'opacity 0.3s',
                }}
                onMouseDown={onPointerDown} onMouseMove={onPointerMove}
                onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
                onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
            <div className="canvas-info">{imgSize.w} x {imgSize.h}px</div>
          </div>

          <div className="save-bar">
            <button className="save-btn" onClick={() => downloadCanvas(canvasRef.current, 'bg-removed.png', 'image/png')}>
              Download PNG
            </button>
            <button className="save-btn secondary" onClick={() => downloadCanvas(canvasRef.current, 'bg-removed.jpg', 'image/jpeg')}>
              Download JPG
            </button>
            <button className="tb-btn" onClick={() => { setLoaded(false); setOriginal(null); setHistory([]) }}>
              New Image
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
