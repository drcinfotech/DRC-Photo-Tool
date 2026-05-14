import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { floodFillTransparent } from '../utils/imageProcessing'
import { downloadCanvas, downloadSVG } from '../utils/download'
import './ToolPage.css'

export default function TransparencyEditor() {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [original, setOriginal] = useState(null)
  const [history, setHistory] = useState([])
  const [tool, setTool] = useState('wand')
  const [tolerance, setTolerance] = useState(32)
  const [brushSize, setBrushSize] = useState(20)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const isDrawing = useRef(false)
  const lastPos = useRef(null)
  const pendingImg = useRef(null)

  const onImageLoad = useCallback((img) => {
    pendingImg.current = img
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

  const getScale = () => {
    const c = canvasRef.current
    return c ? c.width / c.getBoundingClientRect().width : 1
  }

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const s = getScale()
    const t = e.touches ? e.touches[0] : e
    return { x: Math.round((t.clientX - rect.left) * s), y: Math.round((t.clientY - rect.top) * s) }
  }

  const brushAt = (x, y) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (tool === 'eraser') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, brushSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else if (tool === 'restore' && original) {
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width; tmp.height = canvas.height
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

  const interpolate = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.floor(dist / 3))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      brushAt(Math.round(from.x + dx * t), Math.round(from.y + dy * t))
    }
  }

  const onDown = (e) => {
    if (tool === 'wand') {
      const pos = getPos(e)
      pushHistory()
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      floodFillTransparent(imageData, pos.x, pos.y, tolerance)
      ctx.putImageData(imageData, 0, 0)
      return
    }
    e.preventDefault()
    isDrawing.current = true
    pushHistory()
    const pos = getPos(e)
    lastPos.current = pos
    brushAt(pos.x, pos.y)
  }

  const onMove = (e) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const pos = getPos(e)
    if (lastPos.current) interpolate(lastPos.current, pos)
    lastPos.current = pos
  }

  const onUp = () => { isDrawing.current = false; lastPos.current = null }

  const hints = {
    wand: 'Click on any color region to make it transparent. Adjust tolerance for wider/narrower selection.',
    eraser: 'Click & drag to manually erase areas. Adjust brush size below.',
    restore: 'Click & drag to restore accidentally erased areas from the original.',
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Transparency Editor</h1>
        <p>Magic wand, eraser & restore brush — full control over image transparency.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <div className="btn-group">
                {[
                  { id: 'wand', label: 'Magic Wand' },
                  { id: 'eraser', label: 'Eraser' },
                  { id: 'restore', label: 'Restore' },
                ].map(t => (
                  <button key={t.id} className={`tb-btn ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tool === 'wand' && (
              <div className="toolbar-group">
                <label className="toolbar-label">Tolerance: {tolerance}</label>
                <input type="range" min="5" max="120" value={tolerance} onChange={e => setTolerance(+e.target.value)} />
              </div>
            )}

            {(tool === 'eraser' || tool === 'restore') && (
              <div className="toolbar-group">
                <label className="toolbar-label">Brush: {brushSize}px</label>
                <input type="range" min="2" max="100" value={brushSize} onChange={e => setBrushSize(+e.target.value)} />
              </div>
            )}

            <div className="toolbar-group">
              <button className="tb-btn" onClick={undo} disabled={history.length === 0}>Undo</button>
              <button className="tb-btn danger" onClick={reset}>Reset</button>
            </div>
          </div>

          <div className="tool-hint">{hints[tool]}</div>

          <div className="canvas-area">
            <div className="canvas-frame">
              <div className="checkerboard" style={{ position: 'absolute', inset: 0 }} />
              <canvas
                ref={canvasRef}
                style={{ position: 'relative', zIndex: 1, cursor: 'crosshair', maxWidth: '100%', maxHeight: '70vh' }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
            <div className="canvas-info">{imgSize.w} x {imgSize.h}px</div>
          </div>

          <div className="save-bar">
            <button className="save-btn" onClick={() => downloadCanvas(canvasRef.current, 'transparent.png', 'image/png')}>PNG</button>
            <button className="save-btn secondary" onClick={() => downloadCanvas(canvasRef.current, 'image.jpg', 'image/jpeg')}>JPG</button>
            <button className="save-btn secondary" onClick={() => downloadSVG(canvasRef.current, 'image.svg')}>SVG</button>
            <button className="tb-btn" onClick={() => { setLoaded(false); setOriginal(null); setHistory([]) }}>New Image</button>
          </div>
        </div>
      )}
    </div>
  )
}
