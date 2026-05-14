import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { resizeImage } from '../utils/imageProcessing'
import { downloadCanvas } from '../utils/download'
import './ToolPage.css'

const presets = [
  { label: 'Instagram Post', w: 1080, h: 1080 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Facebook Cover', w: 820, h: 312 },
  { label: 'Facebook Post', w: 1200, h: 630 },
  { label: 'Twitter Header', w: 1500, h: 500 },
  { label: 'Twitter Post', w: 1200, h: 675 },
  { label: 'YouTube Thumbnail', w: 1280, h: 720 },
  { label: 'YouTube Banner', w: 2560, h: 1440 },
  { label: 'LinkedIn Cover', w: 1584, h: 396 },
  { label: 'WhatsApp DP', w: 500, h: 500 },
  { label: 'HD (720p)', w: 1280, h: 720 },
  { label: 'Full HD (1080p)', w: 1920, h: 1080 },
  { label: '4K', w: 3840, h: 2160 },
  { label: 'Passport Photo', w: 600, h: 600 },
  { label: 'A4 (300dpi)', w: 2480, h: 3508 },
]

export default function ImageResizer() {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [origW, setOrigW] = useState(0)
  const [origH, setOrigH] = useState(0)
  const [newW, setNewW] = useState(0)
  const [newH, setNewH] = useState(0)
  const [lockRatio, setLockRatio] = useState(true)
  const [ratio, setRatio] = useState(1)
  const [resized, setResized] = useState(false)
  const resizedCanvasRef = useRef(null)
  const pendingImg = useRef(null)

  const onImageLoad = useCallback((img) => {
    pendingImg.current = img
    setOrigW(img.naturalWidth)
    setOrigH(img.naturalHeight)
    setNewW(img.naturalWidth)
    setNewH(img.naturalHeight)
    setRatio(img.naturalWidth / img.naturalHeight)
    setResized(false)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded || !pendingImg.current || !canvasRef.current) return
    const img = pendingImg.current
    const canvas = canvasRef.current
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    pendingImg.current = null
  }, [loaded])

  const handleWidthChange = (w) => {
    setNewW(w)
    if (lockRatio) setNewH(Math.round(w / ratio))
    setResized(false)
  }

  const handleHeightChange = (h) => {
    setNewH(h)
    if (lockRatio) setNewW(Math.round(h * ratio))
    setResized(false)
  }

  const applyPreset = (p) => {
    setNewW(p.w)
    setNewH(p.h)
    setLockRatio(false)
    setResized(false)
  }

  const doResize = () => {
    if (!canvasRef.current || newW < 1 || newH < 1) return
    const result = resizeImage(canvasRef.current, newW, newH)
    resizedCanvasRef.current = result
    setResized(true)
  }

  const download = (type, ext) => {
    const c = resized ? resizedCanvasRef.current : canvasRef.current
    downloadCanvas(c, `resized-${newW}x${newH}.${ext}`, type)
  }

  const pctW = origW ? Math.round((newW / origW) * 100) : 100
  const pctH = origH ? Math.round((newH / origH) * 100) : 100

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Image Resizer</h1>
        <p>Resize images to exact dimensions or use social media presets.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label">Width</label>
              <input type="number" className="tb-input" value={newW} min={1} max={10000}
                onChange={e => handleWidthChange(+e.target.value)} />
              <span className="tb-hint">{pctW}%</span>
            </div>
            <div className="toolbar-group">
              <button className={`tb-btn small ${lockRatio ? 'active' : ''}`}
                onClick={() => { setLockRatio(!lockRatio); if (!lockRatio) setRatio(newW / newH) }}
                title="Lock aspect ratio">
                {lockRatio ? '🔗' : '🔓'}
              </button>
            </div>
            <div className="toolbar-group">
              <label className="toolbar-label">Height</label>
              <input type="number" className="tb-input" value={newH} min={1} max={10000}
                onChange={e => handleHeightChange(+e.target.value)} />
              <span className="tb-hint">{pctH}%</span>
            </div>

            <button className="primary-btn" onClick={doResize}>
              Resize Image
            </button>
          </div>

          <div className="presets-bar">
            <span className="toolbar-label">Presets:</span>
            <div className="presets-list">
              {presets.map(p => (
                <button key={p.label} className="preset-chip" onClick={() => applyPreset(p)}>
                  {p.label} <small>{p.w}x{p.h}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="canvas-area">
            <div className="canvas-frame">
              <canvas ref={canvasRef}
                style={{ maxWidth: '100%', maxHeight: '60vh', display: resized ? 'none' : 'block' }} />
              {resized && resizedCanvasRef.current && (
                <img src={resizedCanvasRef.current.toDataURL()} alt="Resized"
                  style={{ maxWidth: '100%', maxHeight: '60vh' }} />
              )}
            </div>
            <div className="canvas-info">
              Original: {origW}x{origH} &rarr; New: {newW}x{newH}
              {resized && ' ✓ Resized'}
            </div>
          </div>

          <div className="save-bar">
            <button className="save-btn" onClick={() => download('image/png', 'png')} disabled={!resized}>PNG</button>
            <button className="save-btn secondary" onClick={() => download('image/jpeg', 'jpg')} disabled={!resized}>JPG</button>
            <button className="save-btn secondary" onClick={() => download('image/webp', 'webp')} disabled={!resized}>WebP</button>
            <button className="tb-btn" onClick={() => { setLoaded(false); setResized(false) }}>New Image</button>
          </div>
        </div>
      )}
    </div>
  )
}
