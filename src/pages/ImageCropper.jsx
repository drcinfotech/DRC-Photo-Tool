import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { cropImage } from '../utils/imageProcessing'
import { downloadCanvas } from '../utils/download'
import './ToolPage.css'

const ratioPresets = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4/3 },
  { label: '3:2', value: 3/2 },
  { label: '16:9', value: 16/9 },
  { label: '9:16', value: 9/16 },
  { label: '3:4', value: 3/4 },
  { label: '2:3', value: 2/3 },
]

export default function ImageCropper() {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [aspectRatio, setAspectRatio] = useState(null)
  const [cropped, setCropped] = useState(false)
  const croppedRef = useRef(null)
  const dragging = useRef(null)
  const startRef = useRef(null)
  const pendingImg = useRef(null)

  const onImageLoad = useCallback((img) => {
    pendingImg.current = img
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    const margin = 0.1
    const cx = Math.round(img.naturalWidth * margin)
    const cy = Math.round(img.naturalHeight * margin)
    setCrop({ x: cx, y: cy, w: img.naturalWidth - cx * 2, h: img.naturalHeight - cy * 2 })
    setCropped(false)
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

  // Draw overlay
  useEffect(() => {
    if (!loaded || !overlayRef.current || !canvasRef.current) return
    const oc = overlayRef.current
    const canvas = canvasRef.current
    oc.width = canvas.width
    oc.height = canvas.height
    const ctx = oc.getContext('2d')
    ctx.clearRect(0, 0, oc.width, oc.height)

    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, oc.width, oc.height)
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h)

    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      const lx = crop.x + (crop.w / 3) * i
      const ly = crop.y + (crop.h / 3) * i
      ctx.beginPath(); ctx.moveTo(lx, crop.y); ctx.lineTo(lx, crop.y + crop.h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(crop.x, ly); ctx.lineTo(crop.x + crop.w, ly); ctx.stroke()
    }

    const hs = 10
    ctx.fillStyle = '#e94560'
    const corners = [
      [crop.x, crop.y], [crop.x + crop.w, crop.y],
      [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h],
    ]
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - hs/2, cy - hs/2, hs, hs)
    })
  }, [crop, loaded])

  const getScale = () => {
    const c = overlayRef.current
    return c ? c.width / c.getBoundingClientRect().width : 1
  }

  const getPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect()
    const s = getScale()
    const t = e.touches ? e.touches[0] : e
    return { x: (t.clientX - rect.left) * s, y: (t.clientY - rect.top) * s }
  }

  const hitTest = (pos) => {
    const hs = 14
    const corners = ['tl', 'tr', 'bl', 'br']
    const pts = [
      { x: crop.x, y: crop.y },
      { x: crop.x + crop.w, y: crop.y },
      { x: crop.x, y: crop.y + crop.h },
      { x: crop.x + crop.w, y: crop.y + crop.h },
    ]
    for (let i = 0; i < 4; i++) {
      if (Math.abs(pos.x - pts[i].x) < hs && Math.abs(pos.y - pts[i].y) < hs)
        return corners[i]
    }
    if (pos.x > crop.x && pos.x < crop.x + crop.w && pos.y > crop.y && pos.y < crop.y + crop.h)
      return 'move'
    return null
  }

  const onDown = (e) => {
    const pos = getPos(e)
    const hit = hitTest(pos)
    if (!hit) return
    e.preventDefault()
    dragging.current = hit
    startRef.current = { ...pos, crop: { ...crop } }
  }

  const onMove = (e) => {
    if (!dragging.current) return
    e.preventDefault()
    const pos = getPos(e)
    const dx = pos.x - startRef.current.x
    const dy = pos.y - startRef.current.y
    const sc = startRef.current.crop
    let nx = sc.x, ny = sc.y, nw = sc.w, nh = sc.h

    if (dragging.current === 'move') {
      nx = Math.max(0, Math.min(imgSize.w - sc.w, sc.x + dx))
      ny = Math.max(0, Math.min(imgSize.h - sc.h, sc.y + dy))
    } else {
      const isLeft = dragging.current.includes('l')
      const isTop = dragging.current.includes('t')

      if (isLeft) { nx = sc.x + dx; nw = sc.w - dx }
      else { nw = sc.w + dx }

      if (aspectRatio) {
        nh = nw / aspectRatio
        if (isTop) ny = sc.y + sc.h - nh
      } else {
        if (isTop) { ny = sc.y + dy; nh = sc.h - dy }
        else { nh = sc.h + dy }
      }

      if (nw < 20) nw = 20
      if (nh < 20) nh = 20
      if (nx < 0) { nw += nx; nx = 0 }
      if (ny < 0) { nh += ny; ny = 0 }
      if (nx + nw > imgSize.w) nw = imgSize.w - nx
      if (ny + nh > imgSize.h) nh = imgSize.h - ny
    }

    setCrop({ x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) })
  }

  const onUp = () => { dragging.current = null }

  const doCrop = () => {
    const result = cropImage(canvasRef.current, crop.x, crop.y, crop.w, crop.h)
    croppedRef.current = result
    setCropped(true)
  }

  const download = (type, ext) => {
    downloadCanvas(croppedRef.current || canvasRef.current, `cropped.${ext}`, type)
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Image Cropper</h1>
        <p>Crop images with precision. Free crop or aspect ratio presets with rule-of-thirds guide.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label">Aspect Ratio</label>
              <div className="btn-group">
                {ratioPresets.map(r => (
                  <button key={r.label}
                    className={`tb-btn ${aspectRatio === r.value ? 'active' : ''}`}
                    onClick={() => {
                      setAspectRatio(r.value)
                      if (r.value) {
                        const nw = crop.w
                        const nh = Math.round(nw / r.value)
                        setCrop(c => ({ ...c, h: Math.min(nh, imgSize.h - c.y), w: nw }))
                      }
                      setCropped(false)
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <button className="primary-btn" onClick={doCrop}>Crop Image</button>
          </div>

          <div className="tool-hint">
            Drag corners to resize. Drag inside to move. Crop: {crop.w}x{crop.h}px
          </div>

          <div className="canvas-area">
            <div className="canvas-frame" style={{ position: 'relative' }}>
              {!cropped ? (
                <>
                  <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '65vh' }} />
                  <canvas ref={overlayRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
                    onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                    onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                  />
                </>
              ) : croppedRef.current && (
                <img src={croppedRef.current.toDataURL()} alt="Cropped"
                  style={{ maxWidth: '100%', maxHeight: '65vh' }} />
              )}
            </div>
            <div className="canvas-info">
              {cropped ? `Cropped: ${crop.w}x${crop.h}px` : `Original: ${imgSize.w}x${imgSize.h}px`}
            </div>
          </div>

          <div className="save-bar">
            <button className="save-btn" onClick={() => download('image/png', 'png')} disabled={!cropped}>PNG</button>
            <button className="save-btn secondary" onClick={() => download('image/jpeg', 'jpg')} disabled={!cropped}>JPG</button>
            <button className="save-btn secondary" onClick={() => download('image/webp', 'webp')} disabled={!cropped}>WebP</button>
            {cropped && <button className="tb-btn" onClick={() => setCropped(false)}>Edit Crop</button>}
            <button className="tb-btn" onClick={() => { setLoaded(false); setCropped(false) }}>New Image</button>
          </div>
        </div>
      )}
    </div>
  )
}
