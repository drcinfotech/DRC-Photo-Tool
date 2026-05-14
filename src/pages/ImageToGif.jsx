import { useState, useRef } from 'react'
import { encodeGIF } from '../utils/gifEncoder'
import SingleAnimator from './SingleAnimator'
import TextGifMaker from './TextGifMaker'
import './ToolPage.css'
import './ImageToGif.css'

// ─── Constants ───────────────────────────────────────────────────────────────

const ANIM_STYLES = [
  { id: 'normal',   label: 'Normal',   hint: 'Cycle through frames as-is' },
  { id: 'bounce',   label: 'Bounce',   hint: 'Forward then reverse (ping-pong)' },
  { id: 'fade',     label: 'Fade',     hint: 'Smooth crossfade between frames' },
  { id: 'zoom-in',  label: 'Zoom In',  hint: 'Each frame progressively zooms in' },
  { id: 'zoom-out', label: 'Zoom Out', hint: 'Each frame progressively zooms out' },
  { id: 'slide',    label: 'Slide',    hint: 'Slide transition between frames' },
]

const MAX_SIZES = [320, 480, 640, 800]
const LOOP_OPTS = [
  { label: 'Infinite', value: 0 },
  { label: '1×', value: 1 },
  { label: '3×', value: 3 },
  { label: '5×', value: 5 },
]

function formatBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

// ─── Animation style processors ──────────────────────────────────────────────

function applyStyle(canvases, style, w, h) {
  switch (style) {
    case 'bounce': {
      const rev = [...canvases].reverse().slice(1, canvases.length - 1)
      return [...canvases, ...rev]
    }

    case 'fade': {
      const result = []
      for (let i = 0; i < canvases.length; i++) {
        result.push(canvases[i])
        const next = canvases[(i + 1) % canvases.length]
        for (let f = 1; f <= 3; f++) {
          const alpha = f / 4
          const c = makeCanvas(w, h)
          const ctx = c.getContext('2d')
          ctx.drawImage(canvases[i], 0, 0)
          ctx.globalAlpha = alpha
          ctx.drawImage(next, 0, 0)
          ctx.globalAlpha = 1
          result.push(c)
        }
      }
      return result
    }

    case 'zoom-in': {
      return canvases.map((src, i) => {
        const zoom = 1 + (i / Math.max(1, canvases.length - 1)) * 0.35
        return zoomCanvas(src, w, h, zoom)
      })
    }

    case 'zoom-out': {
      return canvases.map((src, i) => {
        const zoom = 1.35 - (i / Math.max(1, canvases.length - 1)) * 0.35
        return zoomCanvas(src, w, h, zoom)
      })
    }

    case 'slide': {
      const result = []
      for (let i = 0; i < canvases.length; i++) {
        result.push(canvases[i])
        const next = canvases[(i + 1) % canvases.length]
        for (let f = 1; f <= 4; f++) {
          const pct = f / 5
          const c = makeCanvas(w, h)
          const ctx = c.getContext('2d')
          ctx.drawImage(canvases[i], -Math.round(w * pct), 0)
          ctx.drawImage(next, Math.round(w * (1 - pct)), 0)
          result.push(c)
        }
      }
      return result
    }

    default: // normal
      return canvases
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

function zoomCanvas(src, w, h, zoom) {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-w / 2, -h / 2)
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  return c
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImageToGif() {
  const [gifMode, setGifMode]       = useState('multi') // 'multi' | 'animator'
  const [images, setImages]         = useState([])      // [{ id, src, name }]
  const [animStyle, setAnimStyle]   = useState('normal')
  const [delay, setDelay]           = useState(200)     // ms per frame
  const [maxSize, setMaxSize]       = useState(640)
  const [loop, setLoop]             = useState(0)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress]     = useState('')
  const [gifUrl, setGifUrl]         = useState(null)
  const [gifSize, setGifSize]       = useState(0)
  const [gifDims, setGifDims]       = useState(null)
  const inputRef = useRef(null)

  // ── Image management ──────────────────────────────────────────────────────

  const addImages = (files) => {
    const valid = [...files].filter(f => f.type.startsWith('image/'))
    const newImgs = valid.map(f => ({
      id: Math.random().toString(36).slice(2),
      src: URL.createObjectURL(f),
      name: f.name,
    }))
    setImages(prev => [...prev, ...newImgs])
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files)
  }

  const removeImage = (id) => setImages(prev => prev.filter(img => img.id !== id))

  const moveImage = (id, dir) => {
    setImages(prev => {
      const idx = prev.findIndex(img => img.id === id)
      if (idx < 0) return prev
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // ── GIF generation ────────────────────────────────────────────────────────

  const loadImg = (src) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })

  const imgToCanvas = (img, outW, outH) => {
    const c = makeCanvas(outW, outH)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
    const scale = Math.min(outW / img.naturalWidth, outH / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh)
    return c
  }

  const generateGIF = async () => {
    if (images.length < 3) return
    setGenerating(true)
    setGifUrl(null)
    setGifSize(0)
    setGifDims(null)

    try {
      setProgress('Loading images...')
      await new Promise(r => setTimeout(r, 10))

      const loaded = await Promise.all(images.map(img => loadImg(img.src)))

      // Output dimensions from first image, capped at maxSize
      const firstImg = loaded[0]
      const scale = Math.min(1, maxSize / Math.max(firstImg.naturalWidth, firstImg.naturalHeight))
      const outW = Math.max(2, Math.round(firstImg.naturalWidth * scale))
      const outH = Math.max(2, Math.round(firstImg.naturalHeight * scale))

      setProgress('Preparing frames...')
      await new Promise(r => setTimeout(r, 10))

      // Normalize all images to same canvas size
      const canvases = loaded.map(img => imgToCanvas(img, outW, outH))

      setProgress('Applying animation style...')
      await new Promise(r => setTimeout(r, 10))

      const styledFrames = applyStyle(canvases, animStyle, outW, outH)

      setProgress(`Encoding ${styledFrames.length} frames to GIF...`)
      await new Promise(r => setTimeout(r, 10))

      const gifFrames = styledFrames.map(c => ({
        data: c.getContext('2d').getImageData(0, 0, outW, outH).data,
        width: outW,
        height: outH,
        delay,
      }))

      const gifBytes = encodeGIF(gifFrames, { loop })
      const blob = new Blob([gifBytes], { type: 'image/gif' })
      const url = URL.createObjectURL(blob)
      setGifUrl(url)
      setGifSize(blob.size)
      setGifDims({ w: outW, h: outH, frames: styledFrames.length })
      setProgress('')
    } catch (err) {
      console.error('GIF generation failed:', err)
      setProgress('Error: ' + err.message)
      setTimeout(() => setProgress(''), 4000)
    }

    setGenerating(false)
  }

  const downloadGIF = () => {
    if (!gifUrl) return
    const link = document.createElement('a')
    link.href = gifUrl
    link.download = `animated-${Date.now()}.gif`
    link.click()
  }

  const reset = () => {
    setImages([])
    setGifUrl(null)
    setGifSize(0)
    setGifDims(null)
    setProgress('')
  }

  const canGenerate = images.length >= 3 && !generating

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Image to GIF</h1>
        <p>Combine 3 or more images into an animated GIF. Choose animation styles, speed, size and loop count.</p>
      </div>

      <div className="tool-workspace">

        {/* ── Mode toggle ─────────────────────────────────────────────────── */}
        <div className="tool-toolbar">
          <div className="toolbar-group">
            <div className="btn-group">
              <button className={`tb-btn ${gifMode === 'multi' ? 'active' : ''}`}
                onClick={() => setGifMode('multi')}>
                Multi Image GIF
              </button>
              <button className={`tb-btn ${gifMode === 'animator' ? 'active' : ''}`}
                onClick={() => setGifMode('animator')}>
                Single Image Animator
              </button>
              <button className={`tb-btn ${gifMode === 'textgif' ? 'active' : ''}`}
                onClick={() => setGifMode('textgif')}>
                Image + Text GIF
              </button>
            </div>
          </div>
        </div>

        {/* ── Single Image Animator mode ───────────────────────────────────── */}
        {gifMode === 'animator' && <SingleAnimator />}

        {/* ── Image + Text GIF mode ────────────────────────────────────────── */}
        {gifMode === 'textgif' && <TextGifMaker />}

        {/* ── Multi Image GIF mode ─────────────────────────────────────────── */}
        {gifMode === 'multi' && <>

        {/* ── Upload area ─────────────────────────────────────────────────── */}
        <div className="gif-upload-row">
          <div className="gif-drop-zone"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept="image/*" multiple
              onChange={e => e.target.files.length && addImages(e.target.files)}
              style={{ display: 'none' }} />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Add Images</span>
            <small>Click or drop • Min 3 images</small>
          </div>

          {images.length > 0 && (
            <div className="gif-count-badge">
              {images.length} image{images.length !== 1 ? 's' : ''} added
              {images.length < 3 && (
                <span className="gif-warn"> (need at least {3 - images.length} more)</span>
              )}
            </div>
          )}
        </div>

        {/* ── Image list ──────────────────────────────────────────────────── */}
        {images.length > 0 && (
          <div className="gif-image-list">
            {images.map((img, idx) => (
              <div key={img.id} className="gif-image-card">
                <div className="gif-frame-num">{idx + 1}</div>
                <img src={img.src} alt={img.name} className="gif-thumb" />
                <div className="gif-card-info">
                  <span className="gif-card-name" title={img.name}>{img.name}</span>
                </div>
                <div className="gif-card-actions">
                  <button className="gif-order-btn"
                    onClick={() => moveImage(img.id, -1)}
                    disabled={idx === 0} title="Move up">▲</button>
                  <button className="gif-order-btn"
                    onClick={() => moveImage(img.id, 1)}
                    disabled={idx === images.length - 1} title="Move down">▼</button>
                  <button className="gif-remove-btn"
                    onClick={() => removeImage(img.id)} title="Remove">×</button>
                </div>
              </div>
            ))}

            {/* Plus button to add more */}
            <div className="gif-add-more"
              onClick={() => inputRef.current?.click()}
              title="Add more images">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Add More</span>
            </div>
          </div>
        )}

        {/* ── Settings ────────────────────────────────────────────────────── */}
        {images.length > 0 && (
          <div className="gif-settings">
            {/* Animation style */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Animation Style</label>
              <div className="gif-style-chips">
                {ANIM_STYLES.map(s => (
                  <button key={s.id}
                    className={`preset-chip ${animStyle === s.id ? 'active' : ''}`}
                    onClick={() => setAnimStyle(s.id)}
                    title={s.hint}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="gif-style-hint">
                {ANIM_STYLES.find(s => s.id === animStyle)?.hint}
              </div>
            </div>

            {/* Speed */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Frame Speed: {delay}ms per frame</label>
              <div className="gif-speed-wrap">
                <span className="gif-speed-label">Slow</span>
                <input type="range" min="50" max="1000" step="25" value={delay}
                  onChange={e => setDelay(+e.target.value)} className="gif-slider" />
                <span className="gif-speed-label">Fast</span>
              </div>
              <div className="gif-speed-presets">
                {[{ l: 'Very Fast', v: 50 }, { l: 'Fast', v: 100 }, { l: 'Normal', v: 200 }, { l: 'Slow', v: 500 }].map(p => (
                  <button key={p.v} className={`preset-chip ${delay === p.v ? 'active' : ''}`}
                    onClick={() => setDelay(p.v)}>{p.l}</button>
                ))}
              </div>
            </div>

            {/* Max size */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Max Output Size (longer edge)</label>
              <div className="gif-speed-presets">
                {MAX_SIZES.map(s => (
                  <button key={s} className={`preset-chip ${maxSize === s ? 'active' : ''}`}
                    onClick={() => setMaxSize(s)}>{s}px</button>
                ))}
              </div>
            </div>

            {/* Loop */}
            <div className="gif-setting-row">
              <label className="toolbar-label">Loop</label>
              <div className="gif-speed-presets">
                {LOOP_OPTS.map(o => (
                  <button key={o.value} className={`preset-chip ${loop === o.value ? 'active' : ''}`}
                    onClick={() => setLoop(o.value)}>{o.label}</button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <div className="gif-generate-row">
              <button className="primary-btn ai-btn"
                onClick={generateGIF}
                disabled={!canGenerate}>
                {generating ? 'Generating...' : `✨ Generate GIF (${images.length} images)`}
              </button>
              <button className="tb-btn danger" onClick={reset} disabled={generating}>
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* ── Progress ────────────────────────────────────────────────────── */}
        {(generating || progress) && (
          <div className="processing-bar">
            {generating && <div className="processing-spinner" />}
            <span>{progress || 'Processing...'}</span>
          </div>
        )}

        {/* ── GIF preview & download ──────────────────────────────────────── */}
        {gifUrl && !generating && (
          <div className="gif-result">
            <div className="gif-result-header">
              <h3>Generated GIF</h3>
              {gifDims && (
                <span className="gif-result-meta">
                  {gifDims.w} × {gifDims.h}px &bull; {gifDims.frames} frames &bull; {formatBytes(gifSize)}
                </span>
              )}
            </div>
            <div className="gif-preview-wrap">
              <img src={gifUrl} alt="Generated GIF" className="gif-preview-img" />
            </div>
            <div className="save-bar">
              <button className="save-btn" onClick={downloadGIF}>
                Download GIF
              </button>
              <button className="save-btn secondary" onClick={generateGIF}>
                Regenerate
              </button>
              <button className="tb-btn" onClick={() => { setGifUrl(null); setGifSize(0) }}>
                Clear Result
              </button>
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {images.length === 0 && (
          <div className="tool-hint" style={{ textAlign: 'center', padding: '24px' }}>
            Upload at least 3 images to create an animated GIF.
            Supports JPG, PNG, WebP and more.
          </div>
        )}

        </> /* end multi mode */}

      </div>
    </div>
  )
}
