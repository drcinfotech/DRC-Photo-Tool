import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { compressImage } from '../utils/imageProcessing'
import { downloadBlob, formatFileSize } from '../utils/download'
import './ToolPage.css'

export default function ImageCompressor() {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [quality, setQuality] = useState(0.7)
  const [format, setFormat] = useState('image/jpeg')
  const [origSize, setOrigSize] = useState(0)
  const [compSize, setCompSize] = useState(0)
  const [compBlob, setCompBlob] = useState(null)
  const [compUrl, setCompUrl] = useState(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [showOriginal, setShowOriginal] = useState(false)
  const [origUrl, setOrigUrl] = useState(null)
  const pendingImg = useRef(null)
  const pendingFile = useRef(null)
  const canvasReady = useRef(false)

  const onImageLoad = useCallback((img, file) => {
    pendingImg.current = img
    pendingFile.current = file
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    setOrigSize(file.size)
    setCompBlob(null)
    setCompUrl(null)
    setCompSize(0)
    canvasReady.current = false
    setLoaded(true)
  }, [])

  // Draw to canvas after it mounts
  useEffect(() => {
    if (!loaded || !pendingImg.current || !canvasRef.current) return
    const img = pendingImg.current
    const canvas = canvasRef.current
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    setOrigUrl(canvas.toDataURL())
    canvasReady.current = true
    pendingImg.current = null
    pendingFile.current = null
  }, [loaded])

  const compress = async () => {
    if (!canvasRef.current || !canvasReady.current) return
    const blob = await compressImage(canvasRef.current, format, quality)
    setCompBlob(blob)
    setCompSize(blob.size)
    setCompUrl(URL.createObjectURL(blob))
  }

  // Auto-compress when settings change
  useEffect(() => {
    if (loaded && canvasReady.current) compress()
  }, [quality, format, loaded])

  // Also compress once canvas is ready (initial load)
  useEffect(() => {
    if (origUrl && canvasReady.current) compress()
  }, [origUrl])

  const savings = origSize > 0 ? Math.round((1 - compSize / origSize) * 100) : 0
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png'

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Image Compressor</h1>
        <p>Reduce file size with quality control. See before & after comparison.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label">Format</label>
              <div className="btn-group">
                {[
                  { v: 'image/jpeg', l: 'JPG' },
                  { v: 'image/webp', l: 'WebP' },
                  { v: 'image/png', l: 'PNG' },
                ].map(f => (
                  <button key={f.v} className={`tb-btn ${format === f.v ? 'active' : ''}`}
                    onClick={() => setFormat(f.v)}>{f.l}</button>
                ))}
              </div>
            </div>

            <div className="toolbar-group" style={{ flex: 1, maxWidth: 300 }}>
              <label className="toolbar-label">Quality: {Math.round(quality * 100)}%</label>
              <input type="range" min="0.05" max="1" step="0.05" value={quality}
                onChange={e => setQuality(+e.target.value)} style={{ width: '100%' }} />
            </div>

            <button className="primary-btn" onClick={() => downloadBlob(compBlob, `compressed.${ext}`)}
              disabled={!compBlob}>
              Download {ext.toUpperCase()}
            </button>
          </div>

          <div className="size-compare">
            <div className="size-card">
              <span className="size-label">Original</span>
              <strong>{formatFileSize(origSize)}</strong>
            </div>
            <div className="size-arrow">&rarr;</div>
            <div className="size-card compressed">
              <span className="size-label">Compressed</span>
              <strong>{formatFileSize(compSize)}</strong>
            </div>
            <div className={`size-card savings ${savings > 0 ? 'positive' : 'negative'}`}>
              <span className="size-label">Savings</span>
              <strong>{savings > 0 ? `-${savings}%` : `+${Math.abs(savings)}%`}</strong>
            </div>
          </div>

          <div className="canvas-area">
            <div className="compare-toggle">
              <button className={`tb-btn ${!showOriginal ? 'active' : ''}`} onClick={() => setShowOriginal(false)}>Compressed</button>
              <button className={`tb-btn ${showOriginal ? 'active' : ''}`} onClick={() => setShowOriginal(true)}>Original</button>
            </div>
            <div className="canvas-frame">
              {showOriginal ? (
                <img src={origUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: '60vh' }} />
              ) : compUrl ? (
                <img src={compUrl} alt="Compressed" style={{ maxWidth: '100%', maxHeight: '60vh' }} />
              ) : null}
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="canvas-info">{imgSize.w} x {imgSize.h}px</div>
          </div>

          <div className="save-bar">
            <button className="tb-btn" onClick={() => { setLoaded(false); setCompBlob(null); setCompUrl(null); canvasReady.current = false }}>New Image</button>
          </div>
        </div>
      )}
    </div>
  )
}
