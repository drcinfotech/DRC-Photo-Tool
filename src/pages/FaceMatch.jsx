import { useState, useCallback, useEffect } from 'react'
import * as faceapi from '@vladmandic/face-api'
import JSZip from 'jszip'
import './ToolPage.css'
import './FaceMatch.css'

const MAX_REF_PHOTOS = 5
const MIN_DETECT_CONFIDENCE = 0.6
const MIN_FACE_SIZE = 80 // px — skip tiny/unreliable faces
const getDetectOptions = () => new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECT_CONFIDENCE })

// Centroid of N descriptors = "average face" of the same person across angles.
// More robust than min-distance (which loosens as you add more refs).
const meanDescriptor = (descriptors) => {
  if (!descriptors.length) return null
  const dim = descriptors[0].length
  const out = new Float32Array(dim)
  for (const d of descriptors) {
    for (let i = 0; i < dim; i++) out[i] += d[i]
  }
  for (let i = 0; i < dim; i++) out[i] /= descriptors.length
  return out
}

export default function FaceMatch() {
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  // Reference faces: [{ url, name, descriptor, status: 'ok' | 'no-face' | 'error' }]
  const [refs, setRefs] = useState([])
  const [processingRefs, setProcessingRefs] = useState(false)

  // ZIP
  const [zipFile, setZipFile] = useState(null)
  const [zipName, setZipName] = useState('')
  const [totalImages, setTotalImages] = useState(0)

  // Processing
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)

  // Results
  const [matches, setMatches] = useState([])
  const [noMatch, setNoMatch] = useState([])
  const [threshold, setThreshold] = useState(0.42)
  const [done, setDone] = useState(false)

  const loadModels = async () => {
    if (modelsLoaded) return
    setLoadingModels(true)
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      setModelsLoaded(true)
    } catch (err) {
      console.error('Failed to load face models:', err)
      setProgress('Failed to load AI models. Please refresh.')
    }
    setLoadingModels(false)
  }

  useEffect(() => { loadModels() }, [])

  const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })

  const processRefImage = async (file) => {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImageFromUrl(url)
      const detection = await faceapi
        .detectSingleFace(img, getDetectOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()
      if (detection) {
        return { url, name: file.name, descriptor: detection.descriptor, status: 'ok' }
      }
      return { url, name: file.name, descriptor: null, status: 'no-face' }
    } catch {
      return { url, name: file.name, descriptor: null, status: 'error' }
    }
  }

  const handleRefPhotos = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    if (!modelsLoaded) await loadModels()

    const remaining = MAX_REF_PHOTOS - refs.length
    const toProcess = files.slice(0, remaining)
    if (files.length > remaining) {
      setProgress(`Only ${remaining} more photo(s) allowed. Max ${MAX_REF_PHOTOS}.`)
    }

    setProcessingRefs(true)
    const results = await Promise.all(toProcess.map(processRefImage))
    setRefs(prev => [...prev, ...results])
    setProcessingRefs(false)

    const okCount = results.filter(r => r.status === 'ok').length
    const failCount = results.length - okCount
    if (okCount === 0) {
      setProgress('No face detected in uploaded photo(s). Try clearer front-facing photos.')
    } else if (failCount > 0) {
      setProgress(`${okCount} face(s) added. ${failCount} photo(s) had no detectable face.`)
    } else {
      setProgress(`${okCount} reference face(s) added.`)
    }
    setTimeout(() => setProgress(''), 3500)
  }, [modelsLoaded, refs.length])

  const removeRef = (idx) => {
    setRefs(prev => {
      const r = prev[idx]
      if (r && r.url) URL.revokeObjectURL(r.url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const clearRefs = () => {
    refs.forEach(r => r.url && URL.revokeObjectURL(r.url))
    setRefs([])
  }

  const handleZip = (file) => {
    if (!file) return
    setZipFile(file)
    setZipName(file.name)
    setMatches([])
    setNoMatch([])
    setDone(false)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const zip = await JSZip.loadAsync(e.target.result)
        let count = 0
        zip.forEach((path, entry) => {
          if (!entry.dir && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path)) count++
        })
        setTotalImages(count)
        setProgress(`ZIP loaded: ${count} images found`)
        setTimeout(() => setProgress(''), 3000)
      } catch {
        setProgress('Invalid ZIP file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const validDescriptors = refs.filter(r => r.status === 'ok').map(r => r.descriptor)

  const startMatching = async () => {
    if (!zipFile || validDescriptors.length === 0 || !modelsLoaded) return
    setProcessing(true)
    setMatches([])
    setNoMatch([])
    setDone(false)
    setProgress('Reading ZIP file...')
    setProgressPct(0)

    try {
      const zipData = await zipFile.arrayBuffer()
      const zip = await JSZip.loadAsync(zipData)

      const imageEntries = []
      zip.forEach((path, entry) => {
        if (!entry.dir && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path)) {
          imageEntries.push({ path, entry })
        }
      })

      const matched = []
      const notMatched = []

      // Use mean descriptor (centroid) as the single reference — more refs = tighter, not looser
      const refMean = meanDescriptor(validDescriptors)
      const refFaceMatcher = new faceapi.FaceMatcher([
        new faceapi.LabeledFaceDescriptors('ref', [refMean])
      ], threshold)

      for (let i = 0; i < imageEntries.length; i++) {
        const { path, entry } = imageEntries[i]
        const fileName = path.split('/').pop()
        setProgress(`Processing ${i + 1}/${imageEntries.length}: ${fileName}`)
        setProgressPct(Math.round(((i + 1) / imageEntries.length) * 100))

        try {
          const blob = await entry.async('blob')
          const url = URL.createObjectURL(blob)
          const img = await loadImageFromUrl(url)

          const detections = await faceapi
            .detectAllFaces(img, getDetectOptions())
            .withFaceLandmarks()
            .withFaceDescriptors()

          let isMatch = false
          let bestScore = 0

          for (const det of detections) {
            if (det.detection.score < MIN_DETECT_CONFIDENCE) continue
            const box = det.detection.box
            if (box.width < MIN_FACE_SIZE || box.height < MIN_FACE_SIZE) continue
            const match = refFaceMatcher.findBestMatch(det.descriptor)
            if (match.label === 'ref') {
              isMatch = true
              bestScore = Math.max(bestScore, 1 - match.distance)
            }
          }

          if (isMatch) {
            matched.push({ name: fileName, url, score: bestScore, blob })
          } else {
            notMatched.push(fileName)
            URL.revokeObjectURL(url)
          }
        } catch {
          notMatched.push(fileName)
        }
      }

      setMatches(matched)
      setNoMatch(notMatched)
      setDone(true)
      setProcessing(false)
      setProgress(`Done! ${matched.length} match(es) found out of ${imageEntries.length} images.`)
    } catch (err) {
      setProcessing(false)
      setProgress('Error processing ZIP: ' + err.message)
    }
  }

  const downloadMatches = async () => {
    if (matches.length === 0) return
    setProgress('Creating ZIP...')
    const zip = new JSZip()

    for (const m of matches) {
      const data = await m.blob.arrayBuffer()
      zip.file(m.name, data)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(content)
    link.download = `matched-faces-${matches.length}.zip`
    link.click()
    URL.revokeObjectURL(link.href)
    setProgress('')
  }

  const validRefCount = validDescriptors.length
  const sensitivityLabel =
    threshold <= 0.4 ? 'Very Strict' :
    threshold <= 0.48 ? 'Strict' :
    threshold <= 0.55 ? 'Balanced' : 'Loose'

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Face Match Finder</h1>
        <p>Upload 1–{MAX_REF_PHOTOS} reference photos of the same person + a ZIP of images. More reference angles = more accurate same-person matches.</p>
      </div>

      <div className="tool-workspace">
        {loadingModels && (
          <div className="processing-bar">
            <div className="processing-spinner"></div>
            <span>Loading Face Recognition AI models...</span>
          </div>
        )}

        <div className="fm-upload-grid">
          {/* Reference Photos */}
          <div className="fm-upload-card">
            <h3>1. Reference Faces ({validRefCount}/{MAX_REF_PHOTOS})</h3>
            <p>Upload photos of the SAME person. Different angles & lighting boost accuracy.</p>

            {refs.length > 0 && (
              <div className="fm-ref-grid">
                {refs.map((r, i) => (
                  <div key={i} className={`fm-ref-thumb fm-ref-${r.status}`}>
                    <img src={r.url} alt={r.name} />
                    <button className="fm-ref-remove" onClick={() => removeRef(i)} title="Remove">×</button>
                    {r.status !== 'ok' && <div className="fm-ref-badge">No face</div>}
                  </div>
                ))}
              </div>
            )}

            {refs.length < MAX_REF_PHOTOS && (
              <label className="fm-drop-area">
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files.length) handleRefPhotos(e.target.files)
                    e.target.value = ''
                  }} />
                {processingRefs ? (
                  <>
                    <div className="processing-spinner"></div>
                    <span>Detecting faces...</span>
                  </>
                ) : (
                  <>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span>{refs.length === 0 ? 'Upload Face Photo(s)' : `Add more (${refs.length}/${MAX_REF_PHOTOS})`}</span>
                  </>
                )}
              </label>
            )}

            {refs.length > 0 && (
              <button className="tb-btn fm-clear-btn" onClick={clearRefs}>Clear All</button>
            )}
          </div>

          {/* ZIP Upload */}
          <div className="fm-upload-card">
            <h3>2. Image Collection (ZIP)</h3>
            <p>Upload a ZIP file containing images</p>
            {zipFile ? (
              <div className="fm-ref-preview">
                <div className="fm-zip-info">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5">
                    <path d="M21 8v13H3V3h12l6 5z"/><path d="M15 3v5h6"/>
                  </svg>
                  <strong>{zipName}</strong>
                  <span>{totalImages} images found</span>
                </div>
                <button className="tb-btn" onClick={() => { setZipFile(null); setZipName(''); setTotalImages(0); setDone(false); setMatches([]) }}>Change</button>
              </div>
            ) : (
              <label className="fm-drop-area">
                <input type="file" accept=".zip" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleZip(e.target.files[0])} />
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 8v13H3V3h12l6 5z"/><path d="M15 3v5h6"/>
                </svg>
                <span>Upload ZIP File</span>
              </label>
            )}
          </div>
        </div>

        {/* Threshold */}
        <div className="tool-toolbar">
          <div className="toolbar-group">
            <label className="toolbar-label">Match Strictness: {Math.round((1 - threshold) * 100)}%</label>
            <input type="range" min="0.3" max="0.6" step="0.05" value={threshold}
              onChange={e => setThreshold(+e.target.value)} style={{ width: '150px' }} />
            <span className="tb-hint">{sensitivityLabel}</span>
          </div>

          <button className="primary-btn ai-btn" onClick={startMatching}
            disabled={validRefCount === 0 || !zipFile || processing || !modelsLoaded}>
            {processing ? 'Processing...' : '🔍 Find Matching Faces'}
          </button>
        </div>

        {/* Progress */}
        {(progress || processing) && (
          <div className="processing-bar">
            {processing && <div className="processing-spinner"></div>}
            <span>{progress}</span>
            {processing && progressPct > 0 && (
              <div className="fm-progress-bar">
                <div className="fm-progress-fill" style={{ width: `${progressPct}%` }}></div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {done && (
          <div className="fm-results">
            <div className="fm-results-header">
              <h3>Results: {matches.length} match{matches.length !== 1 ? 'es' : ''} found</h3>
              {matches.length > 0 && (
                <button className="save-btn" onClick={downloadMatches}>
                  Download Matched ({matches.length}) as ZIP
                </button>
              )}
            </div>

            {matches.length > 0 ? (
              <div className="fm-match-grid">
                {matches.map((m, i) => (
                  <div key={i} className="fm-match-card">
                    <img src={m.url} alt={m.name} />
                    <div className="fm-match-info">
                      <span className="fm-match-name">{m.name}</span>
                      <span className="fm-match-score">{Math.round(m.score * 100)}% match</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fm-no-results">
                No matching faces found. Try loosening strictness slightly, or add more reference photos (different angles).
              </div>
            )}

            {noMatch.length > 0 && (
              <details className="fm-no-match-details">
                <summary>{noMatch.length} images did not match</summary>
                <div className="fm-no-match-list">
                  {noMatch.map((n, i) => <span key={i}>{n}</span>)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
