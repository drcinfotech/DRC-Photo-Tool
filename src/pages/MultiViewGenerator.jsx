import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { editImageWithPrompt, isGeminiConfigured } from '../utils/gemini'
import './ToolPage.css'
import './AIImageGenerator.css'
import './MultiViewGenerator.css'

const VIEWS = [
  {
    id: 'left',
    label: 'Left Side',
    icon: '◀',
    prompt: 'Generate the EXACT same subject from a pure left-side profile view (90 degrees rotated, camera on the left). Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, sharp focus, same art style as the input.',
  },
  {
    id: 'right',
    label: 'Right Side',
    icon: '▶',
    prompt: 'Generate the EXACT same subject from a pure right-side profile view (90 degrees rotated, camera on the right). Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, sharp focus, same art style as the input.',
  },
  {
    id: 'three-quarter-left',
    label: '3/4 Left',
    icon: '◣',
    prompt: 'Generate the EXACT same subject from a 3/4 left angle view (45 degrees, camera slightly to the left). Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, same art style as the input.',
  },
  {
    id: 'three-quarter-right',
    label: '3/4 Right',
    icon: '◢',
    prompt: 'Generate the EXACT same subject from a 3/4 right angle view (45 degrees, camera slightly to the right). Preserve identical identity, facial features, hairstyle, skin tone, clothing, pose, lighting, and background style. Photorealistic, same art style as the input.',
  },
  {
    id: 'back',
    label: 'Back View',
    icon: '▲',
    prompt: 'Generate the EXACT same subject from a full back view (180 degrees, camera behind). Preserve identical hairstyle, clothing, body shape, lighting, and background style. Photorealistic, sharp focus, same art style as the input.',
  },
  {
    id: 'top',
    label: 'Top View',
    icon: '⬆',
    prompt: 'Generate the EXACT same subject from a top-down aerial view. Preserve identical clothing, hairstyle, body shape, lighting, and background style. Photorealistic, same art style as the input.',
  },
]

const DEFAULT_SELECTED = ['left', 'right', 'three-quarter-left', 'three-quarter-right']

export default function MultiViewGenerator() {
  const [frontImage, setFrontImage] = useState(null) // data URL
  const [frontDims, setFrontDims] = useState(null)
  const [selected, setSelected] = useState(new Set(DEFAULT_SELECTED))
  const [results, setResults] = useState({}) // { viewId: { url, blob, error } }
  const [processing, setProcessing] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [globalError, setGlobalError] = useState('')
  const [matchOriginalSize, setMatchOriginalSize] = useState(true)
  const inputRef = useRef(null)

  const handleUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setFrontImage(dataUrl)
      setResults({})
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

  const toggleView = (id) => {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
    img.onerror = () => reject(new Error('Failed to load generated image'))
    img.src = URL.createObjectURL(blob)
  })

  const generateAll = async () => {
    if (!frontImage || !isGeminiConfigured() || selected.size === 0) return

    const [header, base64Data] = frontImage.split(',')
    const mimeMatch = header.match(/data:([^;]+);/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'

    setProcessing(true)
    setGlobalError('')
    setResults({})

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min total

    const views = VIEWS.filter(v => selected.has(v.id))
    const output = {}

    for (let i = 0; i < views.length; i++) {
      const v = views[i]
      setProgressMsg(`Generating ${v.label}... (${i + 1}/${views.length})`)
      try {
        const result = await editImageWithPrompt({
          prompt: v.prompt,
          imageBase64: base64Data,
          mimeType,
          signal: controller.signal,
        })
        let finalBlob = result.blob
        if (matchOriginalSize && frontDims) {
          try {
            finalBlob = await resizeBlob(result.blob, frontDims.w, frontDims.h)
          } catch { /* keep raw */ }
        }
        output[v.id] = { url: URL.createObjectURL(finalBlob), blob: finalBlob, label: v.label }
        setResults({ ...output })
      } catch (err) {
        console.error(`Failed ${v.label}:`, err)
        output[v.id] = { error: err.message || 'Generation failed', label: v.label }
        setResults({ ...output })
        if (err.name === 'AbortError') {
          setGlobalError('Generation timed out (5 min).')
          break
        }
      }
    }

    clearTimeout(timeout)
    setProcessing(false)
    setProgressMsg('')
  }

  const downloadOne = (viewId) => {
    const r = results[viewId]
    if (!r?.blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(r.blob)
    link.download = `${viewId}-view.png`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const downloadAllZip = async () => {
    const entries = Object.entries(results).filter(([, r]) => r?.blob)
    if (entries.length === 0) return
    const zip = new JSZip()
    for (const [id, r] of entries) {
      zip.file(`${id}-view.png`, r.blob)
    }
    if (frontImage) {
      const [, frontBase64] = frontImage.split(',')
      zip.file('front-original.png', frontBase64, { base64: true })
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(zipBlob)
    link.download = `multi-view-${Date.now()}.zip`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const reset = () => {
    setFrontImage(null)
    setFrontDims(null)
    setResults({})
    setGlobalError('')
  }

  const hasAnyResult = Object.values(results).some(r => r?.blob)

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>3D Multi-View Generator</h1>
        <p>Upload a front-facing photo. AI generates left, right, back & 3/4 views — like a 3D turnaround sheet. Powered by Google Gemini.</p>
      </div>

      <div className="tool-workspace">
        {!isGeminiConfigured() && (
          <div className="ai-error">
            Gemini API key missing. Add <code>VITE_GEMINI_API_KEY</code> to <code>.env.local</code> and restart.
          </div>
        )}

        {/* Upload */}
        {!frontImage && (
          <div className="b64-upload"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept="image/*"
              onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}
              style={{ display: 'none' }} />
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>Drop a front-facing photo or click to upload</p>
            <small>Best results: clear front-view photo of person, product or object</small>
          </div>
        )}

        {frontImage && (
          <>
            {/* Front preview + view selection */}
            <div className="mv-layout">
              <div className="mv-front-card">
                <span className="toolbar-label">Front (Original)</span>
                <img src={frontImage} alt="Front" />
                {frontDims && (
                  <div className="canvas-info">{frontDims.w} x {frontDims.h}px</div>
                )}
                <button className="tb-btn" onClick={reset} disabled={processing}>Change Photo</button>
              </div>

              <div className="mv-controls">
                <div className="toolbar-label">Select views to generate:</div>
                <div className="mv-view-chips">
                  {VIEWS.map(v => (
                    <button key={v.id}
                      className={`preset-chip mv-chip ${selected.has(v.id) ? 'active' : ''}`}
                      onClick={() => toggleView(v.id)}
                      disabled={processing}>
                      <span className="mv-chip-icon">{v.icon}</span> {v.label}
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

                <button className="primary-btn ai-btn" onClick={generateAll}
                  disabled={processing || selected.size === 0 || !isGeminiConfigured()}>
                  {processing ? 'Generating...' : `✨ Generate ${selected.size} View${selected.size !== 1 ? 's' : ''}`}
                </button>

                <div className="tool-hint">
                  Each view takes 20–60 seconds. Identity and clothing are preserved across all angles.
                </div>
              </div>
            </div>

            {/* Progress */}
            {processing && (
              <div className="processing-bar">
                <div className="processing-spinner"></div>
                <span>{progressMsg || 'Working...'}</span>
              </div>
            )}

            {globalError && <div className="ai-error">{globalError}</div>}

            {/* Results grid */}
            {(Object.keys(results).length > 0) && (
              <div className="mv-results">
                <h3>Generated Views</h3>
                <div className="mv-results-grid">
                  {VIEWS.filter(v => selected.has(v.id)).map(v => {
                    const r = results[v.id]
                    return (
                      <div key={v.id} className="mv-result-card">
                        <div className="mv-result-label">
                          <span className="mv-chip-icon">{v.icon}</span> {v.label}
                        </div>
                        {!r && <div className="mv-placeholder">Pending...</div>}
                        {r?.error && <div className="mv-error">{r.error}</div>}
                        {r?.url && (
                          <>
                            <img src={r.url} alt={v.label} />
                            <button className="tb-btn" onClick={() => downloadOne(v.id)}>
                              Download
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {hasAnyResult && !processing && (
                  <div className="save-bar">
                    <button className="save-btn" onClick={downloadAllZip}>
                      Download All as ZIP
                    </button>
                    <button className="save-btn secondary" onClick={generateAll}
                      disabled={!isGeminiConfigured()}>
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
