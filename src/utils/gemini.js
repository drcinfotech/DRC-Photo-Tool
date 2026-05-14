// Gemini API wrapper for image generation and editing.
// Uses gemini-2.5-flash-image-preview (aka "Nano Banana") — supports both
// text→image and image+text→image in a single endpoint.

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const PRIMARY_MODEL = import.meta.env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

// Fallback chain — if primary 404s, try these in order. First success is cached.
const FALLBACK_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
  'gemini-2.0-flash-exp',
]

const MODEL_CHAIN = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter(m => m !== PRIMARY_MODEL)]
let cachedWorkingModel = null

const endpointFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export const isGeminiConfigured = () => !!API_KEY && API_KEY.length > 20

// Map UI size presets → aspect ratio hint Gemini understands in the prompt.
const aspectHintFromSize = (w, h) => {
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.05) return 'square 1:1 aspect ratio'
  if (ratio > 1.5) return 'wide 16:9 landscape aspect ratio'
  if (ratio < 0.7) return 'tall 9:16 portrait aspect ratio'
  if (ratio > 1) return 'landscape aspect ratio'
  return 'portrait aspect ratio'
}

const extractImageFromResponse = (json) => {
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) {
      return { mimeType: inline.mimeType || inline.mime_type || 'image/png', base64: inline.data }
    }
  }
  return null
}

const base64ToBlob = (base64, mimeType) => {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

const tryModel = async (model, parts, signal) => {
  const res = await fetch(`${endpointFor(model)}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  })

  if (!res.ok) {
    let errorBody = null
    try { errorBody = await res.json() } catch { /* ignore */ }
    const msg = errorBody?.error?.message || `Gemini API ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.notFound = res.status === 404 || /not.*found|not.*supported/i.test(msg)
    throw err
  }

  const json = await res.json()
  const img = extractImageFromResponse(json)
  if (!img) {
    const blockReason = json?.promptFeedback?.blockReason
    throw new Error(blockReason ? `Blocked: ${blockReason}` : 'No image returned by Gemini')
  }
  return { blob: base64ToBlob(img.base64, img.mimeType), mimeType: img.mimeType }
}

const callGemini = async (parts, signal) => {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key missing. Add VITE_GEMINI_API_KEY to .env.local and restart dev server.')
  }

  // Try cached working model first, else walk the chain on "not found" errors.
  const order = cachedWorkingModel
    ? [cachedWorkingModel, ...MODEL_CHAIN.filter(m => m !== cachedWorkingModel)]
    : MODEL_CHAIN

  let lastErr = null
  for (const model of order) {
    try {
      const result = await tryModel(model, parts, signal)
      cachedWorkingModel = model
      return result
    } catch (err) {
      lastErr = err
      // Only continue to next model if the model itself is unavailable.
      // Other errors (quota, block, bad request) should surface immediately.
      if (!err.notFound) throw err
    }
  }
  throw lastErr || new Error('No Gemini image model available')
}

export const generateImageFromText = async ({ prompt, width, height, signal }) => {
  const aspect = aspectHintFromSize(width, height)
  const fullPrompt = `${prompt.trim()}. ${aspect}. High quality, detailed.`
  return callGemini([{ text: fullPrompt }], signal)
}

export const editImageWithPrompt = async ({ prompt, imageBase64, mimeType = 'image/png', signal }) => {
  return callGemini(
    [
      { text: prompt.trim() },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
    signal
  )
}
