import { useState, useRef, useEffect, useCallback } from 'react'
import { encodeGIF } from '../utils/gifEncoder'
import './ImageToGif.css'
import './SingleAnimator.css'

// ─── Animation definitions ────────────────────────────────────────────────────

const ANIM_TYPES = [
  { id: 'strike',  label: 'Strike',   hint: 'Raise up, strike down, bounce — perfect for hammer/gavel' },
  { id: 'shake',   label: 'Shake',    hint: 'Left-right vibration with natural decay feel' },
  { id: 'bounce',  label: 'Bounce',   hint: 'Up-down bounce with gravity feel' },
  { id: 'spin',    label: 'Spin',     hint: 'Full 360° rotation around pivot' },
  { id: 'pulse',   label: 'Pulse',    hint: 'Grow and shrink pulsing effect' },
  { id: 'wobble',  label: 'Wobble',   hint: 'Left-right rocking rotation' },
]

// Linear interpolation between keyframes
function interpKF(t, kfs) {
  if (t <= kfs[0].t) return kfs[0]
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1]
  let a = kfs[0], b = kfs[1]
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].t >= t) { b = kfs[i]; a = kfs[i - 1]; break }
  }
  const p = (t - a.t) / (b.t - a.t)
  const out = {}
  for (const k in a) if (k !== 't') out[k] = a[k] + (b[k] - a[k]) * p
  return out
}

// Returns { rotate (deg), dx (px), dy (px), scale }
// intensity: 0.3–2.0, maxPx: max pixel displacement
function getTransform(type, t, intensity, maxPx) {
  const i = intensity
  switch (type) {
    case 'strike': {
      const kf = interpKF(t, [
        { t: 0.00, r: 0.00,  dy: 0.00  },
        { t: 0.18, r: -0.75, dy: -0.50 },  // raise
        { t: 0.42, r: 0.22,  dy: 0.30  },  // strike impact
        { t: 0.57, r: -0.10, dy: -0.08 },  // bounce 1
        { t: 0.72, r: 0.04,  dy: 0.04  },  // bounce 2
        { t: 0.88, r: -0.01, dy: -0.01 },  // settle
        { t: 1.00, r: 0.00,  dy: 0.00  },
      ])
      return { rotate: kf.r * 48 * i, dx: 0, dy: kf.dy * maxPx * i * 0.7, scale: 1 }
    }
    case 'shake': {
      const dx = Math.sin(t * Math.PI * 4) * maxPx * i * 0.8
      const dy = Math.sin(t * Math.PI * 8) * maxPx * i * 0.1
      return { rotate: Math.sin(t * Math.PI * 4) * 4 * i, dx, dy, scale: 1 }
    }
    case 'bounce': {
      const dy = -Math.abs(Math.sin(t * Math.PI * 2)) * maxPx * i
      const squish = 1 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.08 * i
      return { rotate: 0, dx: 0, dy, scale: squish }
    }
    case 'spin':
      return { rotate: t * 360, dx: 0, dy: 0, scale: 1 }
    case 'pulse': {
      const s = 1 + Math.sin(t * Math.PI * 2) * 0.3 * i
      return { rotate: 0, dx: 0, dy: 0, scale: Math.max(0.2, s) }
    }
    case 'wobble': {
      const r = Math.sin(t * Math.PI * 2) * 28 * i
      return { rotate: r, dx: Math.sin(t * Math.PI * 2) * maxPx * i * 0.1, dy: 0, scale: 1 }
    }
    default:
      return { rotate: 0, dx: 0, dy: 0, scale: 1 }
  }
}

// Draw single animation frame onto ctx
// pivotImgX/Y: pivot position in image pixels
// offX/Y: top-left image offset in canvas
function drawFrame(ctx, img, tr, pivotImgX, pivotImgY, offX, offY, iW, iH) {
  const { rotate, dx, dy, scale } = tr
  const pivCX = offX + pivotImgX  // pivot in canvas coords
  const pivCY = offY + pivotImgY
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.save()
  ctx.translate(pivCX + dx, pivCY + dy)
  ctx.rotate(rotate * Math.PI / 180)
  ctx.scale(scale, scale)
  ctx.drawImage(img, -pivotImgX, -pivotImgY, iW, iH)
  ctx.restore()
}

// Draw amber pivot crosshair
function drawPivot(ctx, cx, cy) {
  ctx.save()
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 2
  ctx.beginPath(); ctx.moveTo(cx - 11, cy); ctx.lineTo(cx + 11, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy + 11); ctx.stroke()
  ctx.restore()
}

function formatBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

// ─── Component ───────────────────────────────────────────────────────────────

const MARGIN = 0.38  // canvas margin on each side as fraction of image size

export default function SingleAnimator() {
  const [image, setImage]       = useState(null)
  const [animType, setAnimType] = useState('strike')
  const [intensity, setIntensity] = useState(1.0)
  const [cycleMs, setCycleMs]   = useState(800)
  const [frameCount, setFrameCount] = useState(16)
  const [loop, setLoop]         = useState(0)
  const [pivotX, setPivotX]     = useState(0.65)  // relative to image (0–1)
  const [pivotY, setPivotY]     = useState(0.55)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [gifUrl, setGifUrl]     = useState(null)
  const [gifSize, setGifSize]   = useState(0)
  const [showPivot, setShowPivot] = useState(true)

  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const startRef  = useRef(null)
  const imgRef    = useRef(null)
  const inputRef  = useRef(null)

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setImage(e.target.result)
      setGifUrl(null)
      const img = new Image()
      img.onload = () => { imgRef.current = img }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  // ── Canvas dimensions helper ───────────────────────────────────────────────

  const getCanvasDims = useCallback((img, maxDim = 520) => {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const iW = Math.round(img.naturalWidth  * scale)
    const iH = Math.round(img.naturalHeight * scale)
    const cW = Math.round(iW * (1 + MARGIN * 2))
    const cH = Math.round(iH * (1 + MARGIN * 2))
    const offX = Math.round(iW * MARGIN)
    const offY = Math.round(iH * MARGIN)
    return { iW, iH, cW, cH, offX, offY }
  }, [])

  // ── Render one preview frame ───────────────────────────────────────────────

  const renderPreview = useCallback((t) => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const { iW, iH, cW, cH, offX, offY } = getCanvasDims(img, 480)
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width = cW; canvas.height = cH
    }

    const maxPx = Math.min(iW, iH) * 0.42
    const tr = getTransform(animType, t, intensity, maxPx)
    const ctx = canvas.getContext('2d')
    drawFrame(ctx, img, tr, pivotX * iW, pivotY * iH, offX, offY, iW, iH)

    if (showPivot) {
      drawPivot(ctx, offX + pivotX * iW, offY + pivotY * iH)
    }
  }, [animType, intensity, pivotX, pivotY, showPivot, getCanvasDims])

  // ── Animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!image) return
    startRef.current = null

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts
      const t = ((ts - startRef.current) % cycleMs) / cycleMs
      renderPreview(t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [image, cycleMs, renderPreview])

  // ── Click canvas to set pivot ──────────────────────────────────────────────

  const onCanvasClick = (e) => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width  / rect.width
    const sy = canvas.height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    const { iW, iH, offX, offY } = getCanvasDims(img, 480)
    const nx = Math.max(0, Math.min(1, (cx - offX) / iW))
    const ny = Math.max(0, Math.min(1, (cy - offY) / iH))
    setPivotX(nx); setPivotY(ny)
  }

  // ── Generate GIF ───────────────────────────────────────────────────────────

  const generateGIF = async () => {
    const img = imgRef.current
    if (!img) return
    setGenerating(true); setGifUrl(null); setGifSize(0)

    try {
      setProgress('Rendering frames...')
      await new Promise(r => setTimeout(r, 10))

      const maxGifDim = 480
      const { iW, iH, cW, cH, offX, offY } = getCanvasDims(img, maxGifDim)
      const maxPx = Math.min(iW, iH) * 0.42

      const offscreen = Object.assign(document.createElement('canvas'), { width: cW, height: cH })
      const ctx = offscreen.getContext('2d')
      const frameDuration = Math.round(cycleMs / frameCount)

      const gifFrames = []
      for (let fi = 0; fi < frameCount; fi++) {
        const t = fi / frameCount
        const tr = getTransform(animType, t, intensity, maxPx)
        drawFrame(ctx, img, tr, pivotX * iW, pivotY * iH, offX, offY, iW, iH)
        gifFrames.push({
          data: ctx.getImageData(0, 0, cW, cH).data,
          width: cW, height: cH, delay: frameDuration,
        })
      }

      setProgress(`Encoding ${frameCount} frames to GIF...`)
      await new Promise(r => setTimeout(r, 10))

      const bytes = encodeGIF(gifFrames, { loop })
      const blob  = new Blob([bytes], { type: 'image/gif' })
      setGifUrl(URL.createObjectURL(blob))
      setGifSize(blob.size)
      setProgress('')
    } catch (err) {
      console.error(err)
      setProgress('Error: ' + err.message)
      setTimeout(() => setProgress(''), 4000)
    }
    setGenerating(false)
  }

  const downloadGIF = () => {
    if (!gifUrl) return
    const a = document.createElement('a')
    a.href = gifUrl; a.download = `${animType}-${Date.now()}.gif`; a.click()
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="sa-root">

      {/* Upload */}
      {!image && (
        <div className="b64-upload"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept="image/*"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
            style={{ display: 'none' }} />
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>Drop a single image to animate</p>
          <small>One image → Animated GIF with motion effects</small>
        </div>
      )}

      {image && (
        <div className="sa-layout">

          {/* ── Live preview canvas ──────────────────────────────────────── */}
          <div className="sa-preview-col">
            <div className="toolbar-label" style={{ marginBottom: 6 }}>Live Preview</div>
            <div className="sa-canvas-wrap">
              <canvas ref={canvasRef} className="sa-canvas" onClick={onCanvasClick}
                title="Click to reposition pivot point" />
            </div>
            <div className="sa-pivot-bar">
              <label className="b64-checkbox">
                <input type="checkbox" checked={showPivot}
                  onChange={e => setShowPivot(e.target.checked)} />
                Show pivot
              </label>
              <span className="sa-pivot-coord">
                Pivot: {Math.round(pivotX * 100)}%, {Math.round(pivotY * 100)}%
              </span>
            </div>
            <div className="sa-canvas-hint">Click on preview to move pivot point</div>
          </div>

          {/* ── Settings ─────────────────────────────────────────────────── */}
          <div className="sa-settings-col">

            {/* Animation type */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Animation Type</label>
              <div className="gif-style-chips">
                {ANIM_TYPES.map(a => (
                  <button key={a.id}
                    className={`preset-chip ${animType === a.id ? 'active' : ''}`}
                    onClick={() => setAnimType(a.id)} title={a.hint}>
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="gif-style-hint">{ANIM_TYPES.find(a => a.id === animType)?.hint}</div>
            </div>

            {/* Intensity */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Intensity: {Math.round(intensity * 100)}%</label>
              <div className="gif-speed-wrap">
                <span className="gif-speed-label">Low</span>
                <input type="range" min="0.3" max="2" step="0.05" value={intensity}
                  onChange={e => setIntensity(+e.target.value)} className="gif-slider" />
                <span className="gif-speed-label">High</span>
              </div>
            </div>

            {/* Speed */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Cycle Speed: {cycleMs}ms</label>
              <div className="gif-speed-wrap">
                <span className="gif-speed-label">Fast</span>
                <input type="range" min="300" max="2000" step="50" value={cycleMs}
                  onChange={e => setCycleMs(+e.target.value)} className="gif-slider" />
                <span className="gif-speed-label">Slow</span>
              </div>
              <div className="gif-speed-presets">
                {[{ l: 'Fast', v: 400 }, { l: 'Normal', v: 800 }, { l: 'Slow', v: 1200 }, { l: 'Very Slow', v: 1800 }].map(p => (
                  <button key={p.v} className={`preset-chip ${cycleMs === p.v ? 'active' : ''}`}
                    onClick={() => setCycleMs(p.v)}>{p.l}</button>
                ))}
              </div>
            </div>

            {/* Pivot point */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Pivot Point</label>
              <div className="sa-pivot-slider-row">
                <span className="gif-speed-label sa-pivot-axis">X {Math.round(pivotX * 100)}%</span>
                <input type="range" min="0" max="1" step="0.01" value={pivotX}
                  onChange={e => setPivotX(+e.target.value)} className="gif-slider" />
              </div>
              <div className="sa-pivot-slider-row">
                <span className="gif-speed-label sa-pivot-axis">Y {Math.round(pivotY * 100)}%</span>
                <input type="range" min="0" max="1" step="0.01" value={pivotY}
                  onChange={e => setPivotY(+e.target.value)} className="gif-slider" />
              </div>
              <div className="gif-speed-presets">
                {[
                  { l: 'Center',  x: 0.5,  y: 0.5  },
                  { l: 'Top',     x: 0.5,  y: 0.05 },
                  { l: 'Bottom',  x: 0.5,  y: 0.95 },
                  { l: 'L Edge',  x: 0.05, y: 0.5  },
                  { l: 'R Edge',  x: 0.95, y: 0.5  },
                  { l: 'Gavel',   x: 0.78, y: 0.65 },
                ].map(p => (
                  <button key={p.l} className="preset-chip"
                    onClick={() => { setPivotX(p.x); setPivotY(p.y) }}>{p.l}</button>
                ))}
              </div>
            </div>

            {/* Frame count */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Smoothness (frames per cycle)</label>
              <div className="gif-speed-presets">
                {[8, 12, 16, 24].map(f => (
                  <button key={f} className={`preset-chip ${frameCount === f ? 'active' : ''}`}
                    onClick={() => setFrameCount(f)}>{f} frames</button>
                ))}
              </div>
            </div>

            {/* Loop */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Loop</label>
              <div className="gif-speed-presets">
                {[{ l: 'Infinite', v: 0 }, { l: '1×', v: 1 }, { l: '3×', v: 3 }, { l: '5×', v: 5 }].map(o => (
                  <button key={o.value} className={`preset-chip ${loop === o.value ? 'active' : ''}`}
                    onClick={() => setLoop(o.value)}>{o.l}</button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="gif-generate-row">
              <button className="primary-btn ai-btn" onClick={generateGIF} disabled={generating}>
                {generating ? 'Generating...' : `✨ Generate GIF (${frameCount} frames)`}
              </button>
              <button className="tb-btn"
                onClick={() => { setImage(null); imgRef.current = null; setGifUrl(null) }}>
                Change Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {(generating || progress) && (
        <div className="processing-bar">
          {generating && <div className="processing-spinner" />}
          <span>{progress || 'Processing...'}</span>
        </div>
      )}

      {/* GIF result */}
      {gifUrl && !generating && (
        <div className="gif-result">
          <div className="gif-result-header">
            <h3>Generated GIF</h3>
            <span className="gif-result-meta">{frameCount} frames &bull; {formatBytes(gifSize)}</span>
          </div>
          <div className="gif-preview-wrap">
            <img src={gifUrl} alt="Animated GIF" className="gif-preview-img" />
          </div>
          <div className="save-bar">
            <button className="save-btn" onClick={downloadGIF}>Download GIF</button>
            <button className="save-btn secondary" onClick={generateGIF}>Regenerate</button>
          </div>
        </div>
      )}

      {!image && (
        <div className="sa-quick-guide">
          <div className="sa-guide-title">Animation Modes</div>
          <div className="sa-guide-grid">
            {ANIM_TYPES.map(a => (
              <div key={a.id} className="sa-guide-item">
                <strong>{a.label}</strong>
                <span>{a.hint}</span>
              </div>
            ))}
          </div>
          <div className="sa-guide-tip">
            For hammer/gavel: use <strong>Strike</strong> mode with pivot preset <strong>Gavel</strong>
          </div>
        </div>
      )}

    </div>
  )
}
