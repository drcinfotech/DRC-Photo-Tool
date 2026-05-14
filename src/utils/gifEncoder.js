// Pure JS GIF89a encoder with LZW compression.
// No external dependencies.

// ─── Binary helpers ──────────────────────────────────────────────────────────

function pushWord(arr, val) {
  arr.push(val & 0xFF, (val >> 8) & 0xFF)
}
function pushStr(arr, str) {
  for (let i = 0; i < str.length; i++) arr.push(str.charCodeAt(i))
}

// ─── Color quantization (popularity, 5-bit per channel) ──────────────────────

function quantize(data, maxColors) {
  const freq = new Map()
  for (let i = 0; i < data.length; i += 4) {
    // Reduce to 5 bits per channel for key
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    freq.set(key, (freq.get(key) || 0) + 1)
  }
  const raw = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([k]) => [((k >> 10) & 0x1F) << 3, ((k >> 5) & 0x1F) << 3, (k & 0x1F) << 3])

  // Palette size must be power of 2, minimum 4 entries (bits >= 2)
  let bits = 2
  while ((1 << bits) < raw.length) bits++
  bits = Math.min(8, Math.max(2, bits))
  const size = 1 << bits
  while (raw.length < size) raw.push([0, 0, 0])
  return { palette: raw, bits }
}

function mapToIndices(data, palette) {
  const n = palette.length
  const indices = new Uint8Array(data.length >> 2)
  // Cache: 5-bit per channel key → palette index (max 32768 unique keys)
  const cache = new Int32Array(32768).fill(-1)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const ck = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    let idx = cache[ck]
    if (idx < 0) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      let minD = 1e9, best = 0
      for (let j = 0; j < n; j++) {
        const dr = r - palette[j][0], dg = g - palette[j][1], db = b - palette[j][2]
        const d = dr * dr + dg * dg + db * db
        if (d < minD) { minD = d; best = j; if (d === 0) break }
      }
      cache[ck] = idx = best
    }
    indices[p] = idx
  }
  return indices
}

// ─── GIF LZW encoding ────────────────────────────────────────────────────────

function lzwEncode(indices, minCode) {
  const CLEAR = 1 << minCode
  const EOI = CLEAR + 1
  let acc = 0, bitsInAcc = 0
  const bytes = []
  let codeSize = minCode + 1
  let nextLimit = 1 << codeSize
  let nextCode = EOI + 1
  let table = new Map()

  function emit(code) {
    acc |= code << bitsInAcc
    bitsInAcc += codeSize
    while (bitsInAcc >= 8) { bytes.push(acc & 0xFF); acc >>>= 8; bitsInAcc -= 8 }
  }
  function reset() {
    table = new Map(); codeSize = minCode + 1; nextLimit = 1 << codeSize; nextCode = EOI + 1
  }

  emit(CLEAR)
  if (indices.length === 0) {
    emit(EOI)
    if (bitsInAcc) bytes.push(acc & 0xFF)
    return new Uint8Array(bytes)
  }

  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i]
    // key encodes (prefix, suffix): prefix ≤ 4095, suffix ≤ 255
    const key = (prefix << 8) | suffix
    const code = table.get(key)
    if (code !== undefined) {
      prefix = code
    } else {
      emit(prefix)
      if (nextCode <= 0xFFF) {
        table.set(key, nextCode++)
        if (nextCode > nextLimit && codeSize < 12) { codeSize++; nextLimit <<= 1 }
      } else {
        emit(CLEAR); reset()
      }
      prefix = suffix
    }
  }
  emit(prefix)
  emit(EOI)
  if (bitsInAcc) bytes.push(acc & 0xFF)
  return new Uint8Array(bytes)
}

// ─── GIF sub-block packer ─────────────────────────────────────────────────────

function packSubBlocks(bytes) {
  const numFull = Math.floor(bytes.length / 255)
  const rem = bytes.length % 255
  const total = bytes.length + numFull + (rem > 0 ? 1 : 0) + 1
  const out = new Uint8Array(total)
  let o = 0, i = 0
  while (i < bytes.length) {
    const count = Math.min(255, bytes.length - i)
    out[o++] = count
    out.set(bytes.subarray(i, i + count), o)
    o += count; i += count
  }
  out[o] = 0 // block terminator
  return out
}

// ─── Main GIF encoder ─────────────────────────────────────────────────────────

/**
 * frames: Array of { data: Uint8ClampedArray, width: number, height: number, delay: number (ms) }
 * options: { loop: number }  — loop=0 means infinite
 */
export function encodeGIF(frames, { loop = 0 } = {}) {
  if (!frames.length) throw new Error('No frames provided')
  const { width, height } = frames[0]
  const parts = []

  // GIF89a header
  const hdr = [71, 73, 70, 56, 57, 97] // "GIF89a"
  pushWord(hdr, width); pushWord(hdr, height)
  hdr.push(0x70, 0x00, 0x00) // packed: no global CT, color res=8 | bg=0 | aspect=0
  parts.push(new Uint8Array(hdr))

  // Netscape Application Extension — enables looping
  const ns = [0x21, 0xFF, 0x0B]
  pushStr(ns, 'NETSCAPE2.0')
  ns.push(0x03, 0x01)
  pushWord(ns, loop)
  ns.push(0x00)
  parts.push(new Uint8Array(ns))

  for (const { data, delay = 100 } of frames) {
    const { palette, bits } = quantize(data, 256)
    const indices = mapToIndices(data, palette)
    const centisecs = Math.max(2, Math.round(delay / 10))
    const palSize = 1 << bits
    const lzwMin = Math.max(2, bits)

    // Graphic Control Extension
    const gce = [0x21, 0xF9, 0x04, 0x00]
    pushWord(gce, centisecs)
    gce.push(0x00, 0x00)
    parts.push(new Uint8Array(gce))

    // Image Descriptor with local color table flag
    const desc = [0x2C]
    pushWord(desc, 0); pushWord(desc, 0)       // left, top
    pushWord(desc, width); pushWord(desc, height)
    desc.push(0x80 | (bits - 1))               // local CT present, size = bits-1
    parts.push(new Uint8Array(desc))

    // Local Color Table
    const lct = new Uint8Array(palSize * 3)
    for (let i = 0; i < Math.min(palette.length, palSize); i++) {
      lct[i * 3] = palette[i][0]; lct[i * 3 + 1] = palette[i][1]; lct[i * 3 + 2] = palette[i][2]
    }
    parts.push(lct)

    // LZW compressed image data
    const compressed = lzwEncode(indices, lzwMin)
    const subBlocks = packSubBlocks(compressed)
    const imgPart = new Uint8Array(1 + subBlocks.length)
    imgPart[0] = lzwMin
    imgPart.set(subBlocks, 1)
    parts.push(imgPart)
  }

  parts.push(new Uint8Array([0x3B])) // GIF trailer

  // Concatenate all parts into single Uint8Array
  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}
