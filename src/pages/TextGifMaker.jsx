import { useState, useRef, useEffect, useCallback } from 'react'
import { encodeGIF } from '../utils/gifEncoder'
import './ImageToGif.css'
import './TextGifMaker.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILIES = ['Arial', 'Impact', 'Georgia', 'Verdana', 'Courier New', 'Times New Roman', 'Comic Sans MS']

const TEXT_ANIMS = [
  { id: 'static',     label: 'Static',      hint: 'Text always visible, no animation' },
  { id: 'typewriter', label: 'Typewriter',  hint: 'Text types letter by letter' },
  { id: 'fade-in',    label: 'Fade In',     hint: 'Text fades from transparent to full' },
  { id: 'slide-up',   label: 'Slide Up',    hint: 'Text slides up into position from below' },
  { id: 'slide-down', label: 'Slide Down',  hint: 'Text slides in from above' },
  { id: 'zoom-in',    label: 'Zoom In',     hint: 'Text scales up from tiny to full size' },
  { id: 'blink',      label: 'Blink',       hint: 'Text blinks on and off' },
]

const POS_PRESETS = [
  { l: 'Top',    x: 0.5, y: 0.10 },
  { l: 'Middle', x: 0.5, y: 0.50 },
  { l: 'Bottom', x: 0.5, y: 0.88 },
  { l: 'Top-L',  x: 0.1, y: 0.10 },
  { l: 'Top-R',  x: 0.9, y: 0.10 },
  { l: 'Bot-L',  x: 0.1, y: 0.88 },
  { l: 'Bot-R',  x: 0.9, y: 0.88 },
]

function formatBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

// ─── Animation state per frame ────────────────────────────────────────────────

// t: 0→1 within the cycle
function getTextState(animType, t, fullText) {
  switch (animType) {
    case 'typewriter': {
      const chars = Math.max(1, Math.ceil(t * fullText.length))
      return { displayText: fullText.slice(0, chars), opacity: 1, offsetY: 0, scale: 1 }
    }
    case 'fade-in':
      return { displayText: fullText, opacity: t, offsetY: 0, scale: 1 }
    case 'slide-up':
      return { displayText: fullText, opacity: Math.min(1, t * 1.8), offsetY: (1 - t) * 70, scale: 1 }
    case 'slide-down':
      return { displayText: fullText, opacity: Math.min(1, t * 1.8), offsetY: -(1 - t) * 70, scale: 1 }
    case 'zoom-in':
      return { displayText: fullText, opacity: Math.min(1, t * 1.5), offsetY: 0, scale: Math.max(0.04, t) }
    case 'blink':
      return { displayText: fullText, opacity: Math.floor(t * 8) % 2 === 0 ? 1 : 0, offsetY: 0, scale: 1 }
    default: // static
      return { displayText: fullText, opacity: 1, offsetY: 0, scale: 1 }
  }
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function renderFrame(ctx, img, state, style, posX, posY, cW, cH) {
  // Background / image
  ctx.clearRect(0, 0, cW, cH)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cW, cH)
  if (img) ctx.drawImage(img, 0, 0, cW, cH)

  if (!state.displayText || state.opacity <= 0) return

  const lines  = state.displayText.split('\n')
  const fSize  = style.size
  const fontStr = `${style.bold ? 'bold ' : ''}${style.italic ? 'italic ' : ''}${fSize}px "${style.family}"`
  const lineH  = fSize * 1.35
  const tx     = posX * cW
  const ty     = posY * cH + state.offsetY
  const align  = style.align // 'left' | 'center' | 'right'

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, state.opacity))
  ctx.font        = fontStr
  ctx.textAlign   = align
  ctx.textBaseline = 'middle'

  // Scale transform (zoom-in)
  if (state.scale !== 1) {
    ctx.translate(tx, ty)
    ctx.scale(state.scale, state.scale)
    ctx.translate(-tx, -ty)
  }

  // Measure widest line for background box
  if (style.bgOpacity > 0) {
    const maxW = Math.max(...lines.map(l => { ctx.font = fontStr; return ctx.measureText(l).width }))
    const pad  = fSize * 0.35
    const boxH = lineH * lines.length + pad * 2
    const boxW = maxW + pad * 2
    const bx   = align === 'center' ? tx - boxW / 2
                : align === 'right'  ? tx - boxW
                : tx - pad
    const by   = ty - boxH / 2

    ctx.fillStyle = `rgba(0,0,0,${style.bgOpacity})`
    ctx.beginPath()
    const r = fSize * 0.2
    ctx.roundRect ? ctx.roundRect(bx, by, boxW, boxH, r)
                  : ctx.rect(bx, by, boxW, boxH)
    ctx.fill()
  }

  // Shadow
  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)'
    ctx.shadowBlur  = fSize * 0.2
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2
  }

  lines.forEach((line, li) => {
    const ly = ty + (li - (lines.length - 1) / 2) * lineH

    // Stroke/outline
    if (style.stroke && style.strokeWidth > 0) {
      ctx.save()
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth   = style.strokeWidth * 2
      ctx.lineJoin    = 'round'
      ctx.strokeText(line, tx, ly)
      ctx.restore()
    }

    ctx.fillStyle = style.color
    ctx.fillText(line, tx, ly)
  })

  ctx.restore()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TextGifMaker() {
  const [image, setImage]     = useState(null)
  const [text, setText]       = useState('Your Text Here')
  const [style, setStyle]     = useState({
    family:      'Impact',
    size:        56,
    color:       '#ffffff',
    bold:        true,
    italic:      false,
    align:       'center',
    shadow:      true,
    stroke:      true,
    strokeColor: '#000000',
    strokeWidth: 2,
    bgOpacity:   0,
  })
  const [posX, setPosX]       = useState(0.5)
  const [posY, setPosY]       = useState(0.88)
  const [animType, setAnimType] = useState('slide-up')
  const [frameCount, setFrameCount] = useState(16)
  const [delay, setDelay]     = useState(80)
  const [loop, setLoop]       = useState(0)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress]     = useState('')
  const [gifUrl, setGifUrl]         = useState(null)
  const [gifSize, setGifSize]       = useState(null)

  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const startRef  = useRef(null)
  const imgRef    = useRef(null)
  const inputRef  = useRef(null)
  const isDragging = useRef(false)

  // Upload
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

  const styleSet = (key, val) => setStyle(s => ({ ...s, [key]: val }))

  // ── Preview loop ────────────────────────────────────────────────────────────
  const effectiveFrames = animType === 'typewriter' ? Math.max(3, text.length) : frameCount
  const cycleDuration   = delay * effectiveFrames

  const draw = useCallback((t) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = imgRef.current

    // Set canvas size from image or default
    const maxDim = 520
    let cW, cH
    if (img) {
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      cW = Math.round(img.naturalWidth  * sc)
      cH = Math.round(img.naturalHeight * sc)
    } else { cW = maxDim; cH = Math.round(maxDim * 0.5625) }

    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width = cW; canvas.height = cH
    }

    const state = getTextState(animType, t, text)
    renderFrame(canvas.getContext('2d'), img, state, style, posX, posY, cW, cH)

    // Draw position crosshair
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.strokeStyle = 'rgba(251,191,36,0.7)'
    ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    const px = posX * cW, py = posY * cH
    ctx.beginPath(); ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 12); ctx.stroke()
    ctx.restore()
  }, [animType, text, style, posX, posY])

  useEffect(() => {
    startRef.current = null
    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts
      const t = (ts - startRef.current) % cycleDuration / cycleDuration
      draw(t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, cycleDuration])

  // ── Drag text position ──────────────────────────────────────────────────────
  const canvasCoordsToPos = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width  / rect.width
    const sy = canvas.height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    return {
      x: Math.max(0.05, Math.min(0.95, cx / canvas.width)),
      y: Math.max(0.05, Math.min(0.95, cy / canvas.height)),
    }
  }
  const onMouseDown = (e) => { isDragging.current = true; const p = canvasCoordsToPos(e); if (p) { setPosX(p.x); setPosY(p.y) } }
  const onMouseMove = (e) => { if (!isDragging.current) return; const p = canvasCoordsToPos(e); if (p) { setPosX(p.x); setPosY(p.y) } }
  const onMouseUp   = () => { isDragging.current = false }

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    return () => { window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('mousemove', onMouseMove) }
  }, [])

  // ── Generate GIF ────────────────────────────────────────────────────────────
  const generateGIF = async () => {
    setGenerating(true); setGifUrl(null); setGifSize(null)
    try {
      setProgress('Rendering frames...')
      await new Promise(r => setTimeout(r, 10))

      const img = imgRef.current
      const maxDim = 640
      let cW, cH
      if (img) {
        const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        cW = Math.round(img.naturalWidth * sc); cH = Math.round(img.naturalHeight * sc)
      } else { cW = maxDim; cH = Math.round(maxDim * 0.5625) }

      const offscreen = Object.assign(document.createElement('canvas'), { width: cW, height: cH })
      const ctx = offscreen.getContext('2d')
      const ef  = animType === 'typewriter' ? Math.max(3, text.length) : frameCount
      const fd  = animType === 'typewriter' ? delay : delay

      const gifFrames = []
      for (let fi = 0; fi < ef; fi++) {
        const t = ef <= 1 ? 1 : fi / (ef - 1)
        const state = getTextState(animType, t, text)
        renderFrame(ctx, img, state, style, posX, posY, cW, cH)
        gifFrames.push({
          data: ctx.getImageData(0, 0, cW, cH).data,
          width: cW, height: cH, delay: fd,
        })
      }

      setProgress(`Encoding ${ef} frames...`)
      await new Promise(r => setTimeout(r, 10))

      const bytes = encodeGIF(gifFrames, { loop })
      const blob  = new Blob([bytes], { type: 'image/gif' })
      setGifUrl(URL.createObjectURL(blob))
      setGifSize({ bytes: blob.size, w: cW, h: cH, frames: ef })
      setProgress('')
    } catch (err) {
      console.error(err); setProgress('Error: ' + err.message)
      setTimeout(() => setProgress(''), 4000)
    }
    setGenerating(false)
  }

  const downloadGIF = () => {
    if (!gifUrl) return
    const a = document.createElement('a')
    a.href = gifUrl; a.download = `text-gif-${Date.now()}.gif`; a.click()
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="sa-root">

      {/* ── Upload strip ──────────────────────────────────────────────────── */}
      <div className="tg-upload-strip">
        <div className="tg-upload-btn"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}>
          <input ref={inputRef} type="file" accept="image/*"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
            style={{ display: 'none' }} />
          {image
            ? <><img src={image} alt="bg" className="tg-upload-thumb" /><span>Change Image</span></>
            : <><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg><span>Upload Background Image</span><small>(optional)</small></>
          }
        </div>
        <div className="tool-hint" style={{ flex: 1, margin: 0 }}>
          Drag on preview to reposition text &bull; Amber crosshair shows text anchor
        </div>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="sa-layout">

        {/* Canvas preview */}
        <div className="sa-preview-col">
          <div className="toolbar-label" style={{ marginBottom: 6 }}>Live Preview (drag to move text)</div>
          <div className="sa-canvas-wrap" style={{ background: '#fff' }}>
            <canvas ref={canvasRef} className="sa-canvas"
              style={{ cursor: 'crosshair' }}
              onMouseDown={onMouseDown} />
          </div>
          <div className="sa-canvas-hint">Drag on preview to reposition text</div>
          <div className="gif-speed-presets" style={{ marginTop: 6 }}>
            {POS_PRESETS.map(p => (
              <button key={p.l} className="preset-chip" onClick={() => { setPosX(p.x); setPosY(p.y) }}>{p.l}</button>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="sa-settings-col">

          {/* Text input */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Text</label>
            <textarea className="tg-text-input" rows={3}
              value={text}
              onChange={e => { setText(e.target.value); setGifUrl(null) }}
              placeholder="Enter your text here..." />
          </div>

          {/* Font family */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Font</label>
            <div className="gif-style-chips tg-font-chips">
              {FONT_FAMILIES.map(f => (
                <button key={f}
                  className={`preset-chip ${style.family === f ? 'active' : ''}`}
                  style={{ fontFamily: f }}
                  onClick={() => styleSet('family', f)}>{f}</button>
              ))}
            </div>
          </div>

          {/* Font size + color */}
          <div className="gif-setting-row tg-row-split">
            <div className="tg-setting-half">
              <label className="toolbar-label">Size: {style.size}px</label>
              <div className="gif-speed-wrap">
                <span className="gif-speed-label">S</span>
                <input type="range" min="14" max="120" step="2" value={style.size}
                  onChange={e => styleSet('size', +e.target.value)} className="gif-slider" />
                <span className="gif-speed-label">XL</span>
              </div>
            </div>
            <div className="tg-setting-half">
              <label className="toolbar-label">Color</label>
              <div className="tg-color-row">
                <input type="color" className="tg-color-pick" value={style.color}
                  onChange={e => styleSet('color', e.target.value)} />
                {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44bbff', '#44ff88'].map(c => (
                  <button key={c} className="tg-swatch" style={{ background: c }}
                    onClick={() => styleSet('color', c)} />
                ))}
              </div>
            </div>
          </div>

          {/* Style toggles */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Style</label>
            <div className="gif-style-chips">
              {[
                { k: 'bold',   l: 'Bold' },
                { k: 'italic', l: 'Italic' },
                { k: 'shadow', l: 'Shadow' },
                { k: 'stroke', l: 'Outline' },
              ].map(({ k, l }) => (
                <button key={k} className={`preset-chip ${style[k] ? 'active' : ''}`}
                  onClick={() => styleSet(k, !style[k])}>{l}</button>
              ))}
            </div>
            {style.stroke && (
              <div className="tg-color-row" style={{ marginTop: 6 }}>
                <span className="gif-speed-label">Outline color</span>
                <input type="color" className="tg-color-pick" value={style.strokeColor}
                  onChange={e => styleSet('strokeColor', e.target.value)} />
                <span className="gif-speed-label">Width: {style.strokeWidth}</span>
                <input type="range" min="1" max="8" value={style.strokeWidth}
                  onChange={e => styleSet('strokeWidth', +e.target.value)} style={{ width: 80 }} />
              </div>
            )}
          </div>

          {/* Text align */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Alignment</label>
            <div className="gif-style-chips">
              {['left','center','right'].map(a => (
                <button key={a} className={`preset-chip ${style.align === a ? 'active' : ''}`}
                  onClick={() => styleSet('align', a)}>{a.charAt(0).toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
          </div>

          {/* Background box opacity */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Text Background Opacity: {Math.round(style.bgOpacity * 100)}%</label>
            <div className="gif-speed-wrap">
              <span className="gif-speed-label">None</span>
              <input type="range" min="0" max="0.95" step="0.05" value={style.bgOpacity}
                onChange={e => styleSet('bgOpacity', +e.target.value)} className="gif-slider" />
              <span className="gif-speed-label">Solid</span>
            </div>
          </div>

          {/* Text animation */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Text Animation</label>
            <div className="gif-style-chips">
              {TEXT_ANIMS.map(a => (
                <button key={a.id} className={`preset-chip ${animType === a.id ? 'active' : ''}`}
                  title={a.hint} onClick={() => { setAnimType(a.id); setGifUrl(null) }}>{a.label}</button>
              ))}
            </div>
            <div className="gif-style-hint">{TEXT_ANIMS.find(a => a.id === animType)?.hint}</div>
          </div>

          {/* Frame speed */}
          <div className="gif-setting-row">
            <label className="toolbar-label">
              {animType === 'typewriter' ? `Typing speed: ${delay}ms per character` : `Frame delay: ${delay}ms`}
            </label>
            <div className="gif-speed-wrap">
              <span className="gif-speed-label">Fast</span>
              <input type="range" min="30" max="500" step="10" value={delay}
                onChange={e => setDelay(+e.target.value)} className="gif-slider" />
              <span className="gif-speed-label">Slow</span>
            </div>
          </div>

          {/* Frame count (not for typewriter) */}
          {animType !== 'typewriter' && (
            <div className="gif-setting-row">
              <label className="toolbar-label">Smoothness (frames)</label>
              <div className="gif-speed-presets">
                {[8, 12, 16, 24].map(f => (
                  <button key={f} className={`preset-chip ${frameCount === f ? 'active' : ''}`}
                    onClick={() => setFrameCount(f)}>{f}</button>
                ))}
              </div>
            </div>
          )}

          {/* Loop */}
          <div className="gif-setting-row">
            <label className="toolbar-label">Loop</label>
            <div className="gif-speed-presets">
              {[{ l: 'Infinite', v: 0 }, { l: '1×', v: 1 }, { l: '3×', v: 3 }, { l: '5×', v: 5 }].map(o => (
                <button key={o.v} className={`preset-chip ${loop === o.v ? 'active' : ''}`}
                  onClick={() => setLoop(o.v)}>{o.l}</button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <div className="gif-generate-row">
            <button className="primary-btn ai-btn" onClick={generateGIF}
              disabled={generating || !text.trim()}>
              {generating ? 'Generating...' : `✨ Generate GIF`}
            </button>
          </div>

        </div>
      </div>

      {/* Progress */}
      {(generating || progress) && (
        <div className="processing-bar">
          {generating && <div className="processing-spinner" />}
          <span>{progress || 'Processing...'}</span>
        </div>
      )}

      {/* Result */}
      {gifUrl && !generating && (
        <div className="gif-result">
          <div className="gif-result-header">
            <h3>Generated GIF</h3>
            {gifSize && (
              <span className="gif-result-meta">
                {gifSize.w} × {gifSize.h}px &bull; {gifSize.frames} frames &bull; {formatBytes(gifSize.bytes)}
              </span>
            )}
          </div>
          <div className="gif-preview-wrap">
            <img src={gifUrl} alt="Text GIF" className="gif-preview-img" />
          </div>
          <div className="save-bar">
            <button className="save-btn" onClick={downloadGIF}>Download GIF</button>
            <button className="save-btn secondary" onClick={generateGIF}>Regenerate</button>
          </div>
        </div>
      )}
    </div>
  )
}
