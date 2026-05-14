// ===== FLOOD FILL (Magic Wand) =====
export function floodFillTransparent(imageData, startX, startY, tolerance) {
  const { width, height, data } = imageData;
  const idx = (startY * width + startX) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];
  if (ta === 0) return imageData;

  const visited = new Uint8Array(width * height);
  const stack = [startX, startY];

  while (stack.length > 0) {
    const cy = stack.pop();
    const cx = stack.pop();
    const pi = cy * width + cx;
    if (visited[pi]) continue;
    visited[pi] = 1;
    const i = pi * 4;
    if (
      Math.abs(data[i] - tr) <= tolerance &&
      Math.abs(data[i + 1] - tg) <= tolerance &&
      Math.abs(data[i + 2] - tb) <= tolerance &&
      Math.abs(data[i + 3] - ta) <= tolerance
    ) {
      data[i + 3] = 0;
      if (cx > 0) stack.push(cx - 1, cy);
      if (cx < width - 1) stack.push(cx + 1, cy);
      if (cy > 0) stack.push(cx, cy - 1);
      if (cy < height - 1) stack.push(cx, cy + 1);
    }
  }
  return imageData;
}

// ===== ADVANCED BACKGROUND REMOVER =====
// Multi-point border sampling with color clustering and iterative flood fill

function colorDistance(r1, g1, b1, r2, g2, b2) {
  // Weighted Euclidean distance in RGB space (human perception weighted)
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function sampleBorderColors(data, width, height, step = 4) {
  const colors = [];
  // Top and bottom edges
  for (let x = 0; x < width; x += step) {
    for (const y of [0, 1, height - 2, height - 1]) {
      if (y < 0 || y >= height) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] > 128) colors.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  // Left and right edges
  for (let y = 0; y < height; y += step) {
    for (const x of [0, 1, width - 2, width - 1]) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] > 128) colors.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return colors;
}

function clusterColors(colors, maxClusters = 5) {
  if (colors.length === 0) return [];
  // Simple k-means style clustering
  const clusters = [];
  const threshold = 40; // merge distance

  for (const c of colors) {
    let merged = false;
    for (const cl of clusters) {
      const dist = colorDistance(c[0], c[1], c[2], cl.r, cl.g, cl.b);
      if (dist < threshold) {
        cl.count++;
        cl.r = Math.round(cl.r + (c[0] - cl.r) / cl.count);
        cl.g = Math.round(cl.g + (c[1] - cl.g) / cl.count);
        cl.b = Math.round(cl.b + (c[2] - cl.b) / cl.count);
        merged = true;
        break;
      }
    }
    if (!merged && clusters.length < 20) {
      clusters.push({ r: c[0], g: c[1], b: c[2], count: 1 });
    }
  }

  // Sort by frequency and return top clusters
  clusters.sort((a, b) => b.count - a.count);
  return clusters.slice(0, maxClusters);
}

export function autoRemoveBackground(imageData, tolerance = 30) {
  const { width, height, data } = imageData;

  // Step 1: Sample colors from all borders (not just 4 corners)
  const borderColors = sampleBorderColors(data, width, height, Math.max(1, Math.floor(Math.min(width, height) / 100)));

  // Step 2: Cluster border colors to find dominant bg colors
  const bgClusters = clusterColors(borderColors, 5);
  if (bgClusters.length === 0) return imageData;

  // Step 3: Build a "background probability" map
  // Each pixel gets a score: how likely it is to be background
  const bgScore = new Float32Array(width * height);
  const scaledTol = tolerance * 1.8; // Perceptual tolerance scaling

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      const i = pi * 4;
      if (data[i + 3] === 0) { bgScore[pi] = 1; continue; }

      const r = data[i], g = data[i + 1], b = data[i + 2];
      let minDist = Infinity;

      for (const cl of bgClusters) {
        const dist = colorDistance(r, g, b, cl.r, cl.g, cl.b);
        if (dist < minDist) minDist = dist;
      }

      // Sigmoid-like scoring: close to bg color = high score
      if (minDist <= scaledTol * 0.5) {
        bgScore[pi] = 1.0;
      } else if (minDist <= scaledTol) {
        bgScore[pi] = 1.0 - (minDist - scaledTol * 0.5) / (scaledTol * 0.5);
      } else {
        bgScore[pi] = 0;
      }
    }
  }

  // Step 4: Flood fill from ALL border pixels that match bg colors
  const visited = new Uint8Array(width * height);
  const isBg = new Uint8Array(width * height);

  // Seed from all border pixels with high bg score
  const stack = [];
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const pi = y * width + x;
      if (bgScore[pi] > 0.3) stack.push(x, y);
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      const pi = y * width + x;
      if (bgScore[pi] > 0.3) stack.push(x, y);
    }
  }

  while (stack.length > 0) {
    const cy = stack.pop();
    const cx = stack.pop();
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    const pi = cy * width + cx;
    if (visited[pi]) continue;
    visited[pi] = 1;

    if (bgScore[pi] > 0.2) {
      isBg[pi] = 1;
      if (cx > 0) stack.push(cx - 1, cy);
      if (cx < width - 1) stack.push(cx + 1, cy);
      if (cy > 0) stack.push(cx, cy - 1);
      if (cy < height - 1) stack.push(cx, cy + 1);
    }
  }

  // Step 5: Apply with soft edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      const i = pi * 4;
      if (isBg[pi]) {
        // For edge pixels, use partial transparency based on bg score
        data[i + 3] = Math.round(data[i + 3] * (1 - bgScore[pi]));
      }
    }
  }

  return imageData;
}

// ===== EDGE REFINE (smooth edges after BG removal) =====
export function refineEdges(imageData, radius = 1) {
  const { width, height, data } = imageData;
  const copy = new Uint8ClampedArray(data);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;

      let transparentNeighbors = 0;
      let total = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ni = ((y + dy) * width + (x + dx)) * 4;
          total++;
          if (data[ni + 3] < 128) transparentNeighbors++;
        }
      }
      if (transparentNeighbors > 0) {
        const ratio = 1 - (transparentNeighbors / total);
        // Apply Gaussian-weighted alpha for smoother edges
        const alpha = Math.round(data[i + 3] * ratio * ratio);
        copy[i + 3] = alpha;
      }
    }
  }
  return new ImageData(copy, width, height);
}

// ===== IMAGE RESIZE =====
export function resizeImage(canvas, newWidth, newHeight) {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = newWidth;
  tmpCanvas.height = newHeight;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.imageSmoothingEnabled = true;
  tmpCtx.imageSmoothingQuality = 'high';
  tmpCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
  return tmpCanvas;
}

// ===== IMAGE COMPRESS =====
export function compressImage(canvas, format, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      format,
      quality
    );
  });
}

// ===== CROP =====
export function cropImage(canvas, x, y, w, h) {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return tmpCanvas;
}
