import { useState, useRef, useCallback, useEffect } from 'react'
import FileUploader from '../components/FileUploader'
import { downloadCanvas, downloadSVG, formatFileSize } from '../utils/download'
import './ToolPage.css'

const formats = [
  { id: 'image/png', label: 'PNG', ext: 'png', desc: 'Lossless with transparency' },
  { id: 'image/jpeg', label: 'JPG', ext: 'jpg', desc: 'Smaller size, no transparency' },
  { id: 'image/webp', label: 'WebP', ext: 'webp', desc: 'Modern format, best compression' },
  { id: 'image/svg', label: 'SVG', ext: 'svg', desc: 'Scalable vector (PNG embedded)' },
]

export default function FormatConverter() {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [origFormat, setOrigFormat] = useState('')
  const [origSize, setOrigSize] = useState(0)
  const [targetFormat, setTargetFormat] = useState('image/png')
  const [quality, setQuality] = useState(0.92)
  const [converted, setConverted] = useState(null)
  const pendingImg = useRef(null)
  const pendingFile = useRef(null)

  const onImageLoad = useCallback((img, file) => {
    pendingImg.current = img
    pendingFile.current = file
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    setOrigFormat(file.type)
    setOrigSize(file.size)
    setConverted(null)
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
    pendingFile.current = null
  }, [loaded])

  const convert = () => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current

    if (targetFormat === 'image/svg') {
      const dataUrl = canvas.toDataURL('image/png')
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" xlink:href="${dataUrl}"/>
</svg>`
      const blob = new Blob([svgContent], { type: 'image/svg+xml' })
      setConverted({ url: URL.createObjectURL(blob), size: blob.size, ext: 'svg' })
      return
    }

    const q = targetFormat === 'image/png' ? undefined : quality

    let sourceCanvas = canvas
    if (targetFormat === 'image/jpeg') {
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width; tmp.height = canvas.height
      const ctx = tmp.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tmp.width, tmp.height)
      ctx.drawImage(canvas, 0, 0)
      sourceCanvas = tmp
    }

    sourceCanvas.toBlob((blob) => {
      const ext = formats.find(f => f.id === targetFormat)?.ext || 'png'
      setConverted({ url: URL.createObjectURL(blob), size: blob.size, ext })
    }, targetFormat, q)
  }

  const download = () => {
    if (targetFormat === 'image/svg') {
      downloadSVG(canvasRef.current, `converted.svg`)
    } else if (converted) {
      const link = document.createElement('a')
      link.href = converted.url
      link.download = `converted.${converted.ext}`
      link.click()
    }
  }

  const formatLabel = (type) => {
    if (type.includes('png')) return 'PNG'
    if (type.includes('jpeg') || type.includes('jpg')) return 'JPG'
    if (type.includes('webp')) return 'WebP'
    if (type.includes('svg')) return 'SVG'
    return type
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Format Converter</h1>
        <p>Convert images between PNG, JPG, WebP and SVG formats.</p>
      </div>

      {!loaded && <FileUploader onImageLoad={onImageLoad} />}

      {loaded && (
        <div className="tool-workspace">
          <div className="tool-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label">Convert to</label>
              <div className="btn-group">
                {formats.map(f => (
                  <button key={f.id}
                    className={`tb-btn ${targetFormat === f.id ? 'active' : ''}`}
                    onClick={() => { setTargetFormat(f.id); setConverted(null) }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {targetFormat !== 'image/png' && targetFormat !== 'image/svg' && (
              <div className="toolbar-group">
                <label className="toolbar-label">Quality: {Math.round(quality * 100)}%</label>
                <input type="range" min="0.1" max="1" step="0.05" value={quality}
                  onChange={e => { setQuality(+e.target.value); setConverted(null) }} />
              </div>
            )}

            <button className="primary-btn" onClick={convert}>Convert</button>
          </div>

          <div className="size-compare">
            <div className="size-card">
              <span className="size-label">Original ({formatLabel(origFormat)})</span>
              <strong>{formatFileSize(origSize)}</strong>
            </div>
            <div className="size-arrow">&rarr;</div>
            <div className="size-card compressed">
              <span className="size-label">{formats.find(f => f.id === targetFormat)?.label}</span>
              <strong>{converted ? formatFileSize(converted.size) : '...'}</strong>
            </div>
            <div className="size-card">
              <span className="size-label">Note</span>
              <small style={{ color: 'var(--text2)' }}>{formats.find(f => f.id === targetFormat)?.desc}</small>
            </div>
          </div>

          <div className="canvas-area">
            <div className="canvas-frame">
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '60vh' }} />
            </div>
            <div className="canvas-info">{imgSize.w} x {imgSize.h}px</div>
          </div>

          <div className="save-bar">
            <button className="save-btn" onClick={download} disabled={!converted}>
              Download {formats.find(f => f.id === targetFormat)?.label}
            </button>
            <button className="tb-btn" onClick={() => { setLoaded(false); setConverted(null) }}>New Image</button>
          </div>
        </div>
      )}
    </div>
  )
}
