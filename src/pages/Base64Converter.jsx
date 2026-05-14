import { useState, useRef, useCallback } from 'react'
import './ToolPage.css'
import './Base64Converter.css'

const FILE_TYPES = {
  'image/png': { label: 'PNG Image', ext: 'png' },
  'image/jpeg': { label: 'JPG Image', ext: 'jpg' },
  'image/webp': { label: 'WebP Image', ext: 'webp' },
  'image/svg+xml': { label: 'SVG Image', ext: 'svg' },
  'image/gif': { label: 'GIF Image', ext: 'gif' },
  'application/pdf': { label: 'PDF Document', ext: 'pdf' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'Excel (.xlsx)', ext: 'xlsx' },
  'application/vnd.ms-excel': { label: 'Excel (.xls)', ext: 'xls' },
  'text/csv': { label: 'CSV File', ext: 'csv' },
  'application/json': { label: 'JSON File', ext: 'json' },
  'text/plain': { label: 'Text File', ext: 'txt' },
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function Base64Converter() {
  const [mode, setMode] = useState('to-base64') // to-base64 | from-base64
  const inputRef = useRef(null)

  // === File to Base64 state ===
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [base64Output, setBase64Output] = useState('')
  const [includePrefix, setIncludePrefix] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  // === Base64 to File state ===
  const [base64Input, setBase64Input] = useState('')
  const [decodedInfo, setDecodedInfo] = useState(null) // { type, ext, size, url }
  const [decodeError, setDecodeError] = useState('')

  // File → Base64
  const handleFileUpload = useCallback((file) => {
    if (!file) return
    setFileName(file.name)
    setFileType(file.type)
    setFileSize(file.size)
    setPreviewUrl(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const fullBase64 = e.target.result
      setBase64Output(fullBase64)

      if (file.type.startsWith('image/')) {
        setPreviewUrl(fullBase64)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0])
  }

  const getOutputText = () => {
    if (!base64Output) return ''
    if (includePrefix) return base64Output
    // Strip "data:...;base64," prefix
    const idx = base64Output.indexOf(',')
    return idx >= 0 ? base64Output.substring(idx + 1) : base64Output
  }

  const copyToClipboard = async () => {
    const text = getOutputText()
    if (!text) return

    // Primary: modern Clipboard API (requires HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      } catch { /* fall through to legacy */ }
    }

    // Fallback for HTTP / older browsers: hidden textarea + execCommand
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    document.body.removeChild(ta)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      alert('Copy failed. Please select the text and press Ctrl+C.')
    }
  }

  const downloadAsText = () => {
    const blob = new Blob([getOutputText()], { type: 'text/plain' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${fileName || 'file'}.base64.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Base64 → File
  const decodeBase64 = () => {
    setDecodeError('')
    setDecodedInfo(null)
    let input = base64Input.trim()
    if (!input) { setDecodeError('Please paste a Base64 string.'); return }

    let mimeType = 'application/octet-stream'
    let rawBase64 = input

    // Check if it has data URI prefix
    const match = input.match(/^data:([^;]+);base64,(.+)$/s)
    if (match) {
      mimeType = match[1]
      rawBase64 = match[2]
    } else {
      // Try to detect from content
      rawBase64 = input.replace(/\s/g, '')
      // Check magic bytes
      try {
        const bytes = atob(rawBase64.substring(0, 20))
        if (bytes.startsWith('\x89PNG')) mimeType = 'image/png'
        else if (bytes.startsWith('\xFF\xD8\xFF')) mimeType = 'image/jpeg'
        else if (bytes.startsWith('RIFF') && bytes.includes('WEBP')) mimeType = 'image/webp'
        else if (bytes.startsWith('GIF8')) mimeType = 'image/gif'
        else if (bytes.startsWith('%PDF')) mimeType = 'application/pdf'
        else if (bytes.startsWith('PK')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else if (bytes.startsWith('<svg') || bytes.startsWith('<?xml')) mimeType = 'image/svg+xml'
        else if (bytes.startsWith('{')) mimeType = 'application/json'
      } catch (err) {
        setDecodeError('Invalid Base64 string. Please check your input.')
        return
      }
    }

    try {
      const byteChars = atob(rawBase64)
      const byteArray = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i)
      }
      const blob = new Blob([byteArray], { type: mimeType })
      const url = URL.createObjectURL(blob)

      const typeInfo = FILE_TYPES[mimeType]
      setDecodedInfo({
        type: mimeType,
        label: typeInfo?.label || mimeType,
        ext: typeInfo?.ext || 'bin',
        size: blob.size,
        url,
        isImage: mimeType.startsWith('image/'),
      })
    } catch (err) {
      setDecodeError('Failed to decode. Check if the Base64 string is valid.')
    }
  }

  const downloadDecoded = () => {
    if (!decodedInfo) return
    const link = document.createElement('a')
    link.href = decodedInfo.url
    link.download = `decoded-file.${decodedInfo.ext}`
    link.click()
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Base64 Converter</h1>
        <p>Convert files to Base64 and Base64 back to files. Supports images, PDF, Excel, CSV and more.</p>
      </div>

      <div className="tool-workspace">
        {/* Mode Toggle */}
        <div className="tool-toolbar">
          <div className="toolbar-group">
            <div className="btn-group">
              <button className={`tb-btn ${mode === 'to-base64' ? 'active' : ''}`}
                onClick={() => setMode('to-base64')}>
                File → Base64
              </button>
              <button className={`tb-btn ${mode === 'from-base64' ? 'active' : ''}`}
                onClick={() => setMode('from-base64')}>
                Base64 → File
              </button>
            </div>
          </div>
        </div>

        {/* ====== FILE → BASE64 ====== */}
        {mode === 'to-base64' && (
          <div className="b64-section">
            {/* Upload */}
            <div className="b64-upload"
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}>
              <input ref={inputRef} type="file"
                accept="image/*,.pdf,.xlsx,.xls,.csv,.json,.txt"
                onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }} />
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p>Drop any file here or click to upload</p>
              <small>Images, PDF, Excel, CSV, JSON, Text</small>
            </div>

            {base64Output && (
              <>
                {/* File Info */}
                <div className="b64-info-bar">
                  <div className="b64-info-item">
                    <span>File:</span> <strong>{fileName}</strong>
                  </div>
                  <div className="b64-info-item">
                    <span>Type:</span> <strong>{FILE_TYPES[fileType]?.label || fileType}</strong>
                  </div>
                  <div className="b64-info-item">
                    <span>Size:</span> <strong>{formatSize(fileSize)}</strong>
                  </div>
                  <div className="b64-info-item">
                    <span>Base64 Length:</span> <strong>{getOutputText().length.toLocaleString()} chars</strong>
                  </div>
                </div>

                {/* Preview */}
                {previewUrl && (
                  <div className="b64-preview">
                    <img src={previewUrl} alt="Preview" />
                  </div>
                )}

                {/* Options */}
                <div className="b64-options">
                  <label className="b64-checkbox">
                    <input type="checkbox" checked={includePrefix}
                      onChange={e => setIncludePrefix(e.target.checked)} />
                    Include data URI prefix (data:...;base64,)
                  </label>
                </div>

                {/* Output */}
                <div className="b64-output-wrap">
                  <textarea className="b64-textarea" readOnly value={getOutputText()}
                    rows={8} onClick={e => e.target.select()} />
                </div>

                {/* Actions */}
                <div className="save-bar">
                  <button className="save-btn" onClick={copyToClipboard}>
                    {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button className="save-btn secondary" onClick={downloadAsText}>
                    Download as .txt
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ====== BASE64 → FILE ====== */}
        {mode === 'from-base64' && (
          <div className="b64-section">
            <div className="tool-hint">
              Paste a Base64 string below. Auto-detects file type from content (PNG, JPG, PDF, Excel, etc.)
            </div>

            <div className="b64-output-wrap">
              <textarea
                className="b64-textarea"
                rows={10}
                placeholder="Paste your Base64 string here...&#10;&#10;With or without data:...;base64, prefix"
                value={base64Input}
                onChange={e => { setBase64Input(e.target.value); setDecodedInfo(null); setDecodeError('') }}
              />
            </div>

            <div className="save-bar">
              <button className="primary-btn" onClick={decodeBase64}
                disabled={!base64Input.trim()}>
                Decode & Detect
              </button>
              {base64Input && (
                <button className="tb-btn" onClick={() => { setBase64Input(''); setDecodedInfo(null); setDecodeError('') }}>
                  Clear
                </button>
              )}
            </div>

            {decodeError && (
              <div className="b64-error">{decodeError}</div>
            )}

            {decodedInfo && (
              <div className="b64-result">
                <div className="b64-info-bar">
                  <div className="b64-info-item">
                    <span>Detected Type:</span> <strong>{decodedInfo.label}</strong>
                  </div>
                  <div className="b64-info-item">
                    <span>File Size:</span> <strong>{formatSize(decodedInfo.size)}</strong>
                  </div>
                  <div className="b64-info-item">
                    <span>Extension:</span> <strong>.{decodedInfo.ext}</strong>
                  </div>
                </div>

                {decodedInfo.isImage && (
                  <div className="b64-preview">
                    <img src={decodedInfo.url} alt="Decoded" />
                  </div>
                )}

                {decodedInfo.type === 'application/pdf' && (
                  <div className="b64-pdf-preview">
                    <iframe src={decodedInfo.url} title="PDF Preview" />
                  </div>
                )}

                <div className="save-bar">
                  <button className="save-btn" onClick={downloadDecoded}>
                    Download .{decodedInfo.ext}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
