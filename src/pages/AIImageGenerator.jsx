import { useState, useRef } from 'react'
import { generateImageFromText, editImageWithPrompt, isGeminiConfigured } from '../utils/gemini'
import './ToolPage.css'
import './AIImageGenerator.css'

const SIZES = [
  { label: '512x512', w: 512, h: 512 },
  { label: '768x768', w: 768, h: 768 },
  { label: '1024x1024', w: 1024, h: 1024 },
  { label: '1280x720', w: 1280, h: 720 },
  { label: '720x1280', w: 720, h: 1280 },
]

const STYLES = [
  { label: 'Default', value: '' },
  { label: 'Realistic', value: ', ultra realistic, photorealistic, 8k' },
  { label: 'Anime', value: ', anime style, studio ghibli, vibrant colors' },
  { label: '3D Render', value: ', 3d render, octane render, cinema 4d, detailed' },
  { label: 'Oil Painting', value: ', oil painting, masterpiece, classical art style' },
  { label: 'Watercolor', value: ', watercolor painting, soft colors, artistic' },
  { label: 'Digital Art', value: ', digital art, concept art, artstation, trending' },
  { label: 'Pixel Art', value: ', pixel art, 16-bit, retro game style' },
  { label: 'Sketch', value: ', pencil sketch, hand drawn, detailed linework' },
  { label: 'Cinematic', value: ', cinematic lighting, dramatic, film still, bokeh' },
]

const EXAMPLE_PROMPTS = [
  'Shift Desire Car, red sports car, sunset background',
  'A cute cat wearing sunglasses on a beach',
  'Mountain landscape with aurora borealis, 4k wallpaper',
  'Iron Man suit in a futuristic lab, neon lights',
  'Beautiful Indian bride in red lehenga, wedding photography',
  'Cyberpunk city at night with neon signs, rain',
  'A dragon flying over a medieval castle',
  'Cute baby panda eating bamboo, cartoon style',
]

const ENGINES = [
  { value: 'gemini', label: 'Gemini (High Quality)' },
  { value: 'pollinations', label: 'Pollinations (Free Fallback)' },
]

export default function AIImageGenerator() {
  const [mode, setMode] = useState('generate')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [size, setSize] = useState(SIZES[2])
  const [engine, setEngine] = useState(isGeminiConfigured() ? 'gemini' : 'pollinations')
  const [generating, setGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState(null)
  const [generatedBlob, setGeneratedBlob] = useState(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])

  // Edit mode
  const [editImage, setEditImage] = useState(null) // data URL
  const [editImageDims, setEditImageDims] = useState(null) // { w, h }
  const [editPrompt, setEditPrompt] = useState('')
  const [matchOriginalSize, setMatchOriginalSize] = useState(true)
  const editInputRef = useRef(null)

  // === TEXT TO IMAGE ===
  const generateFromText = async (inputPrompt) => {
    setGenerating(true)
    setError('')
    setGeneratedUrl(null)
    setGeneratedBlob(null)

    const fullPrompt = inputPrompt.trim() + style

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      let blob
      if (engine === 'gemini' && isGeminiConfigured()) {
        const result = await generateImageFromText({
          prompt: fullPrompt,
          width: size.w,
          height: size.h,
          signal: controller.signal,
        })
        blob = result.blob
      } else {
        const seed = Math.floor(Math.random() * 999999)
        const proxyUrl = `/api/generate/prompt/${encodeURIComponent(fullPrompt)}?width=${size.w}&height=${size.h}&nologo=true&seed=${seed}`
        const response = await fetch(proxyUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`Server returned ${response.status}`)
        blob = await response.blob()
        if (blob.size < 500) throw new Error('Empty response')
      }

      clearTimeout(timeout)
      const localUrl = URL.createObjectURL(blob)
      setGeneratedUrl(localUrl)
      setGeneratedBlob(blob)
      addToHistory(inputPrompt, localUrl)
    } catch (err) {
      handleError(err)
    }
    setGenerating(false)
  }

  // === IMAGE + PROMPT (image-to-image) ===
  const generateFromImage = async () => {
    if (!editImage || !editPrompt.trim()) return
    setGenerating(true)
    setError('')
    setGeneratedUrl(null)
    setGeneratedBlob(null)

    // Data URL looks like: data:image/png;base64,XXXXX
    const [header, base64Data] = editImage.split(',')
    const mimeMatch = header.match(/data:([^;]+);/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'

    const fullPrompt = editPrompt.trim() + style + ', high quality, detailed'

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      let blob
      if (engine === 'gemini' && isGeminiConfigured()) {
        const result = await editImageWithPrompt({
          prompt: fullPrompt,
          imageBase64: base64Data,
          mimeType,
          signal: controller.signal,
        })
        blob = result.blob
      } else {
        const response = await fetch('/api/img2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: fullPrompt,
            width: size.w,
            height: size.h,
            seed: Math.floor(Math.random() * 999999),
            model: 'flux',
            nologo: true,
            image: base64Data,
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          console.warn('POST img2img failed, falling back to text generation')
          clearTimeout(timeout)
          await generateFromText(editPrompt.trim() + ', based on reference photo, maintain likeness')
          return
        }
        blob = await response.blob()
        if (blob.size < 500) throw new Error('Empty response')
      }

      clearTimeout(timeout)

      // Match output to uploaded image's original dimensions if requested.
      let finalBlob = blob
      if (matchOriginalSize && editImageDims?.w && editImageDims?.h) {
        try {
          finalBlob = await resizeBlobToDimensions(blob, editImageDims.w, editImageDims.h)
        } catch (resizeErr) {
          console.warn('Resize failed, using original AI output:', resizeErr)
        }
      }

      const localUrl = URL.createObjectURL(finalBlob)
      setGeneratedUrl(localUrl)
      setGeneratedBlob(finalBlob)
      addToHistory(editPrompt, localUrl)
    } catch (err) {
      handleError(err)
    }
    setGenerating(false)
  }

  const addToHistory = (inputPrompt, url) => {
    setHistory(h => [{
      prompt: inputPrompt.trim(),
      style,
      url,
      size: size.label,
      time: new Date().toLocaleTimeString()
    }, ...h.slice(0, 19)])
  }

  const handleError = (err) => {
    console.error('Generate error:', err)
    if (err.name === 'AbortError') {
      setError('Generation timed out (2 min). AI is busy — please try again.')
    } else {
      setError(`Failed to generate: ${err.message}. Please try again.`)
    }
  }

  const handleEditUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setEditImage(dataUrl)
      const img = new Image()
      img.onload = () => setEditImageDims({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // Resize a blob to target w×h while preserving aspect ratio (contain fit, transparent padding).
  const resizeBlobToDimensions = (blob, targetW, targetH) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // Fit image into target while preserving aspect ratio (contain)
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

  const downloadImage = () => {
    const link = document.createElement('a')
    if (generatedBlob) {
      link.href = URL.createObjectURL(generatedBlob)
    } else if (generatedUrl) {
      link.href = generatedUrl
    }
    link.download = `ai-generated-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>AI Image Generator</h1>
        <p>Create stunning images from text prompts or transform uploaded photos. Powered by Google Gemini (high quality) with free fallback.</p>
      </div>

      <div className="tool-workspace">
        {/* Mode Toggle */}
        <div className="tool-toolbar">
          <div className="toolbar-group">
            <div className="btn-group">
              <button className={`tb-btn ${mode === 'generate' ? 'active' : ''}`}
                onClick={() => setMode('generate')}>Text to Image</button>
              <button className={`tb-btn ${mode === 'edit' ? 'active' : ''}`}
                onClick={() => setMode('edit')}>Image + Prompt</button>
            </div>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Engine</label>
            <select className="ai-select" value={engine}
              onChange={e => setEngine(e.target.value)}>
              {ENGINES.map(e => (
                <option key={e.value} value={e.value}
                  disabled={e.value === 'gemini' && !isGeminiConfigured()}>
                  {e.label}{e.value === 'gemini' && !isGeminiConfigured() ? ' — key missing' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Size</label>
            <select className="ai-select" value={size.label}
              onChange={e => setSize(SIZES.find(s => s.label === e.target.value))}>
              {SIZES.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Style selector */}
        <div className="ai-styles">
          <label className="toolbar-label">Style:</label>
          <div className="ai-style-chips">
            {STYLES.map(s => (
              <button key={s.label}
                className={`preset-chip ${style === s.value ? 'active' : ''}`}
                onClick={() => setStyle(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== TEXT TO IMAGE MODE ===== */}
        {mode === 'generate' && (
          <div className="ai-input-section">
            <textarea
              className="ai-prompt-input"
              placeholder={"Describe the image you want to create...\n\nType in any language — English, Hindi, Hinglish, etc.\n\nExample: A red sports car drifting on a mountain road, sunset, cinematic"}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) generateFromText(prompt) }}
            />
            <div className="ai-input-footer">
              <span className="tb-hint">Press Ctrl+Enter to generate</span>
              <button className="primary-btn ai-btn" onClick={() => generateFromText(prompt)}
                disabled={generating || !prompt.trim()}>
                {generating ? 'Generating...' : '✨ Generate Image'}
              </button>
            </div>

            <div className="ai-suggestions">
              <span className="toolbar-label">Try:</span>
              <div className="ai-suggestion-chips">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <button key={i} className="preset-chip" onClick={() => setPrompt(p)}>
                    {p.length > 40 ? p.substring(0, 40) + '...' : p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== IMAGE + PROMPT MODE ===== */}
        {mode === 'edit' && (
          <div className="ai-edit-section">
            <div className="ai-edit-grid">
              <div className="ai-edit-upload">
                {editImage ? (
                  <div className="ai-edit-preview">
                    <img src={editImage} alt="Upload" />
                    {editImageDims && (
                      <div className="canvas-info">{editImageDims.w} x {editImageDims.h}px</div>
                    )}
                    <button className="tb-btn" onClick={() => { setEditImage(null); setEditImageDims(null) }}>Change Photo</button>
                  </div>
                ) : (
                  <label className="fm-drop-area">
                    <input ref={editInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => e.target.files[0] && handleEditUpload(e.target.files[0])} />
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span>Upload Photo</span>
                  </label>
                )}
              </div>
              <div className="ai-edit-prompt-area">
                <textarea
                  className="ai-prompt-input"
                  placeholder={"Describe how to transform this image...\n\nExamples:\n• Convert to anime style\n• Make it a watercolor painting\n• Add sunset background\n• Make person wear a suit"}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  rows={5}
                />
                {editImageDims && (
                  <label className="b64-checkbox" style={{ marginTop: '0.5rem' }}>
                    <input type="checkbox" checked={matchOriginalSize}
                      onChange={e => setMatchOriginalSize(e.target.checked)} />
                    Match original size ({editImageDims.w} x {editImageDims.h}px)
                  </label>
                )}
                <button className="primary-btn ai-btn" onClick={generateFromImage}
                  disabled={generating || !editImage || !editPrompt.trim()}>
                  {generating ? 'Transforming...' : '✨ Transform Image'}
                </button>
              </div>
            </div>

            <div className="tool-hint">
              Upload your photo and describe the transformation. The AI will use your image as reference and apply the changes you describe. Output is auto-resized to match your uploaded image's dimensions when enabled.
            </div>
          </div>
        )}

        {/* Loading */}
        {generating && (
          <div className="processing-bar">
            <div className="processing-spinner"></div>
            <span>AI is working... This may take 30-90 seconds for new prompts. Please wait.</span>
          </div>
        )}

        {error && <div className="ai-error">{error}</div>}

        {/* Result */}
        {generatedUrl && !generating && (
          <div className="ai-result">
            {/* Show side by side in edit mode */}
            {mode === 'edit' && editImage && (
              <div className="ai-compare">
                <div className="ai-compare-item">
                  <span className="toolbar-label">Original</span>
                  <img src={editImage} alt="Original" />
                </div>
                <div className="ai-compare-arrow">→</div>
                <div className="ai-compare-item">
                  <span className="toolbar-label">Generated</span>
                  <img src={generatedUrl} alt="Generated" />
                </div>
              </div>
            )}

            {/* Full result display */}
            {mode === 'generate' && (
              <div className="canvas-frame">
                <img src={generatedUrl} alt="Generated" className="ai-result-img" />
              </div>
            )}

            <div className="save-bar">
              <button className="save-btn" onClick={downloadImage}>Download Image</button>
              <button className="save-btn secondary" onClick={() => {
                if (mode === 'generate') generateFromText(prompt)
                else generateFromImage()
              }}>
                Regenerate
              </button>
              <button className="tb-btn" onClick={() => { setGeneratedUrl(null); setGeneratedBlob(null) }}>Clear</button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="ai-history">
            <h3>Recent Generations</h3>
            <div className="ai-history-grid">
              {history.map((h, i) => (
                <div key={i} className="ai-history-card" onClick={() => { setGeneratedUrl(h.url); setGeneratedBlob(null) }}>
                  <img src={h.url} alt={h.prompt} />
                  <div className="ai-history-info">
                    <span className="ai-history-prompt">{h.prompt}</span>
                    <span className="ai-history-meta">{h.size} &bull; {h.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
