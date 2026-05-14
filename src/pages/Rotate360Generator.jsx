import { useState, useRef, useEffect, useCallback } from 'react'
import JSZip from 'jszip'
import { editImageWithPrompt, isGeminiConfigured } from '../utils/gemini'
import './ToolPage.css'
import './AIImageGenerator.css'
import './MultiViewGenerator.css'
import './Rotate360Generator.css'

const FRAME_PRESETS = [
  { count: 8, label: '8 frames (45° steps)' },
  { count: 12, label: '12 frames (30° steps)' },
  { count: 16, label: '16 frames (22.5° steps)' },
  { count: 24, label: '24 frames (15° steps)' },
]

const promptForAngle = (angle) => {
  const rounded = Math.round(angle)
  if (rounded === 0) {
    return 'Show the EXACT same subject from the front (0 degrees). Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, sharp focus, same art style as input.'
  }
  const clockwise = rounded <= 180
  const abs = clockwise ? rounded : 360 - rounded
  const direction = clockwise ? 'to the right (clockwise)' : 'to the left (counter-clockwise)'
  return `Generate the EXACT same subject rotated ${abs} degrees ${direction} around the vertical (Y) axis. Show the subject as if a camera is orbiting at this exact angle. Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, sharp focus, same art style as input. This is frame ${rounded}° of a smooth 360-degree turnaround sequence.`
}

export default function Rotate360Generator() {
  const [frontImage, setFrontImage] = useState(null)
  const [frontDims, setFrontDims] = useState(null)
  const [frameCount, setFrameCount] = useState(8)
  const [frames, setFrames] = useState([]) // [{ angle, url, blob, error }]
  const [processing, setProcessing] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [globalError, setGlobalError] = useState('')
  const [matchOriginalSize, setMatchOriginalSize] = useState(true)

  // Viewer state
  const [viewerIdx, setViewerIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(80) // ms per frame
  const dragRef = useRef({ active: false, startX: 0, startIdx: 0 })
  const playTimer = useRef(null)
  const inputRef = useRef(null)

  const handleUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setFrontImage(dataUrl)
      setFrames([])
      setViewerIdx(0)
      setGlobalError('')
      const img = new Image()
      img.onload = () => setFrontDims({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0])
  }

  const resizeBlob = (blob, targetW, targetH) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight)
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const dx = (targetW - drawW) / 2
      const dy = (targetH - drawH) / 2
      ctx.drawImage(img, dx, dy, drawW, drawH)
      canvas.toBlob((out) => {
        URL.revokeObjectURL(img.src)
        if (out) resolve(out)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/png', 1)
    }
    img.onerror = () => reject(new Error('Failed to load'))
    img.src = URL.createObjectURL(blob)
  })

  const generate360 = async () => {
    if (!frontImage || !isGeminiConfigured()) return

    const [header, base64Data] = frontImage.split(',')
    const mimeMatch = header.match(/data:([^;]+);/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'

    setProcessing(true)
    setGlobalError('')
    setFrames([])
    setViewerIdx(0)
    setPlaying(false)

    const step = 360 / frameCount
    const angles = Array.from({ length: frameCount }, (_, i) => i * step)
    const collected = angles.map(a => ({ angle: a }))

    const controller = new AbortController()
    // Generous timeout — 60s per frame
    const timeout = setTimeout(() => controller.abort(), frameCount * 60000 + 30000)

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i]
      setProgressMsg(`Generating frame ${i + 1}/${angles.length} (${Math.round(angle)}°)...`)

      try {
        // Use original front for 0°, else AI-generate
        if (angle === 0) {
          const blob = await (await fetch(frontImage)).blob()
          let finalBlob = blob
          if (matchOriginalSize && frontDims) {
            try { finalBlob = await resizeBlob(blob, frontDims.w, frontDims.h) } catch { /* keep */ }
          }
          collected[i] = { angle, url: URL.createObjectURL(finalBlob), blob: finalBlob }
        } else {
          const result = await editImageWithPrompt({
            prompt: promptForAngle(angle),
            imageBase64: base64Data,
            mimeType,
            signal: controller.signal,
          })
          let finalBlob = result.blob
          if (matchOriginalSize && frontDims) {
            try { finalBlob = await resizeBlob(result.blob, frontDims.w, frontDims.h) } catch { /* keep */ }
          }
          collected[i] = { angle, url: URL.createObjectURL(finalBlob), blob: finalBlob }
        }
        setFrames([...collected])
      } catch (err) {
        console.error(`Failed angle ${angle}:`, err)
        collected[i] = { angle, error: err.message || 'Generation failed' }
        setFrames([...collected])
        if (err.name === 'AbortError') {
          setGlobalError('Generation timed out.')
          break
        }
      }
    }

    clearTimeout(timeout)
    setProcessing(false)
    setProgressMsg('')
  }

  // Auto-play loop
  useEffect(() => {
    if (!playing || frames.length === 0) {
      if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null }
      return
    }
    const valid = frames.filter(f => f.url)
    if (valid.length < 2) { setPlaying(false); return }
    playTimer.current = setInterval(() => {
      setViewerIdx(idx => {
        // skip frames without url
        let next = (idx + 1) % frames.length
        let safety = 0
        while (!frames[next]?.url && safety < frames.length) {
          next = (next + 1) % frames.length
          safety++
        }
        return next
      })
    }, playSpeed)
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [playing, playSpeed, frames])

  // Drag to rotate
  const onPointerDown = (e) => {
    if (frames.length === 0) return
    setPlaying(false)
    dragRef.current = {
      active: true,
      startX: e.touches ? e.touches[0].clientX : e.clientX,
      startIdx: viewerIdx,
    }
    e.preventDefault()
  }
  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active || frames.length === 0) return
    const x = e.touches ? e.touches[0].clientX : e.clientX
    const dx = x - dragRef.current.startX
    // 1 frame per ~20px drag
    const delta = Math.round(dx / 20)
    const n = frames.length
    let newIdx = (dragRef.current.startIdx + delta) % n
    if (newIdx < 0) newIdx += n
    // skip missing
    let safety = 0
    while (!frames[newIdx]?.url && safety < n) {
      newIdx = (newIdx + 1) % n
      safety++
    }
    setViewerIdx(newIdx)
  }, [frames])
  const onPointerUp = () => { dragRef.current.active = false }

  useEffect(() => {
    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove)
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [onPointerMove])

  const downloadAllZip = async () => {
    const valid = frames.filter(f => f.blob)
    if (valid.length === 0) return
    const zip = new JSZip()
    valid.forEach((f, i) => {
      const idx = String(i).padStart(3, '0')
      const ang = String(Math.round(f.angle)).padStart(3, '0')
      zip.file(`frame-${idx}-${ang}deg.png`, f.blob)
    })
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(zipBlob)
    link.download = `rotate-360-${Date.now()}.zip`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const reset = () => {
    setFrontImage(null)
    setFrontDims(null)
    setFrames([])
    setViewerIdx(0)
    setPlaying(false)
    setGlobalError('')
  }

  const validCount = frames.filter(f => f.url).length
  const currentFrame = frames[viewerIdx]

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>360° Rotate Generator</h1>
        <p>Upload a photo. AI creates a smooth 360° turnaround — drag to spin or auto-play. Download all frames as a ZIP.</p>
      </div>

      <div className="tool-workspace">
        {!isGeminiConfigured() && (
          <div className="ai-error">
            Gemini API key missing. Add <code>VITE_GEMINI_API_KEY</code> to <code>.env.local</code> and restart.
          </div>
        )}

        {!frontImage && (
          <div className="b64-upload"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept="image/*"
              onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}
              style={{ display: 'none' }} />
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>
            </svg>
            <p>Drop a photo or click to upload</p>
            <small>Best results: clear front-facing subject, object or person</small>
          </div>
        )}

        {frontImage && (
          <>
            <div className="mv-layout">
              <div className="mv-front-card">
                <span className="toolbar-label">Input Photo</span>
                <img src={frontImage} alt="Input" />
                {frontDims && <div className="canvas-info">{frontDims.w} x {frontDims.h}px</div>}
                <button className="tb-btn" onClick={reset} disabled={processing}>Change Photo</button>
              </div>

              <div className="mv-controls">
                <div className="toolbar-label">Frame count (more = smoother, slower):</div>
                <div className="r360-frame-chips">
                  {FRAME_PRESETS.map(p => (
                    <button key={p.count}
                      className={`preset-chip ${frameCount === p.count ? 'active' : ''}`}
                      onClick={() => setFrameCount(p.count)}
                      disabled={processing}>
                      {p.label}
                    </button>
                  ))}
                </div>

                {frontDims && (
                  <label className="b64-checkbox">
                    <input type="checkbox" checked={matchOriginalSize}
                      onChange={e => setMatchOriginalSize(e.target.checked)}
                      disabled={processing} />
                    Match original size ({frontDims.w} x {frontDims.h}px)
                  </label>
                )}

                <button className="primary-btn ai-btn" onClick={generate360}
                  disabled={processing || !isGeminiConfigured()}>
                  {processing ? 'Generating...' : `✨ Generate 360° (${frameCount} frames)`}
                </button>

                <div className="tool-hint">
                  Each frame takes ~30–60s. Total: ~{Math.round(frameCount * 0.75)} min for {frameCount} frames.
                  Identity and background are preserved across rotation.
                </div>
              </div>
            </div>

            {processing && (
              <div className="processing-bar">
                <div className="processing-spinner"></div>
                <span>{progressMsg || 'Working...'} ({validCount}/{frameCount} done)</span>
              </div>
            )}

            {globalError && <div className="ai-error">{globalError}</div>}

            {/* 360 Viewer */}
            {validCount > 0 && (
              <div className="r360-viewer-section">
                <h3>360° Viewer</h3>
                <div className="r360-viewer"
                  onMouseDown={onPointerDown}
                  onTouchStart={onPointerDown}>
                  {currentFrame?.url ? (
                    <img src={currentFrame.url} alt={`${Math.round(currentFrame.angle)}°`}
                      draggable={false} />
                  ) : (
                    <div className="mv-placeholder">Frame pending...</div>
                  )}
                  <div className="r360-overlay-hint">
                    {Math.round(currentFrame?.angle ?? 0)}° — Drag to rotate
                  </div>
                </div>

                <div className="r360-controls">
                  <button className="tb-btn" onClick={() => setPlaying(p => !p)}
                    disabled={validCount < 2}>
                    {playing ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <label className="r360-speed-label">
                    Speed:
                    <input type="range" min="30" max="300" step="10"
                      value={playSpeed}
                      onChange={e => setPlaySpeed(+e.target.value)} />
                    <span>{playSpeed}ms</span>
                  </label>
                  <input type="range" min="0" max={frames.length - 1} value={viewerIdx}
                    onChange={e => { setPlaying(false); setViewerIdx(+e.target.value) }}
                    className="r360-scrubber" />
                  <span className="r360-frame-indicator">
                    Frame {viewerIdx + 1}/{frames.length}
                  </span>
                </div>

                {/* Thumbnails strip */}
                <div className="r360-thumbs">
                  {frames.map((f, i) => (
                    <button key={i}
                      className={`r360-thumb ${i === viewerIdx ? 'active' : ''}`}
                      onClick={() => { setPlaying(false); setViewerIdx(i) }}
                      disabled={!f.url}>
                      {f.url ? (
                        <img src={f.url} alt={`${Math.round(f.angle)}°`} />
                      ) : f.error ? (
                        <div className="r360-thumb-error">!</div>
                      ) : (
                        <div className="r360-thumb-loading">...</div>
                      )}
                      <span>{Math.round(f.angle)}°</span>
                    </button>
                  ))}
                </div>

                {!processing && validCount > 0 && (
                  <div className="save-bar">
                    <button className="save-btn" onClick={downloadAllZip}>
                      Download All Frames (ZIP)
                    </button>
                    <button className="save-btn secondary" onClick={generate360}>
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
