const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const PLANTS_CONFIG = [
  {
    name: "Fiddle Leaf Fig",
    input: "assets/originals/fiddle-leaf-fig-original.jpg",
    output: "public/plants/fiddle-leaf-fig.webp",
    whiteThresh: 215, // pixels with min(R,G,B) > whiteThresh and low saturation
    satThresh: 22,
    floorThresh: 190
  },
  {
    name: "White Rose Plant",
    input: "assets/originals/rose-plant-white-original.jpg",
    output: "public/plants/rose-plant-white.webp",
    whiteThresh: 205,
    satThresh: 20,
    floorThresh: 185
  },
  {
    name: "Fan Palm Tree",
    input: "assets/originals/fan-palm-tree-original.jpg",
    output: "public/plants/fan-palm-tree.webp",
    whiteThresh: 210,
    satThresh: 22,
    floorThresh: 185
  },
  {
    name: "Monstera Deliciosa",
    input: "assets/originals/monstera-deliciosa-original.jpg",
    output: "public/plants/monstera-deliciosa.webp",
    whiteThresh: 210,
    satThresh: 22,
    floorThresh: 185
  },
  {
    name: "Areca Palm Tree",
    input: "assets/originals/areca-palm-tree-original.jpg",
    output: "public/plants/areca-palm-tree.webp",
    whiteThresh: 225,
    satThresh: 20,
    floorThresh: 195
  }
];

async function removeBackgroundAndFit(cfg) {
  console.log(`Processing ${cfg.name}...`);
  const image = sharp(cfg.input);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels; // 4 (RGBA)

  // Array marking background pixels (1 = background, 0 = foreground)
  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h * 2);
  let qHead = 0;
  let qTail = 0;

  function pushQ(x, y) {
    queue[qTail++] = x;
    queue[qTail++] = y;
  }

  function isBgPixel(r, g, b, x, y) {
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const sat = maxVal - minVal;

    // Very bright near-white studio background
    if (minVal >= cfg.whiteThresh && sat <= cfg.satThresh) return true;
    
    // Soft floor shadow near bottom/sides if low saturation
    if (minVal >= cfg.floorThresh && sat <= 15) return true;

    // Light gray floor contact at borders
    if ((x < w * 0.15 || x > w * 0.85 || y > h * 0.92) && minVal >= 170 && sat <= 12) return true;

    return false;
  }

  // Seed borders
  for (let x = 0; x < w; x++) {
    for (let y of [0, 1, h - 2, h - 1]) {
      const idx = y * w + x;
      const r = data[idx * ch];
      const g = data[idx * ch + 1];
      const b = data[idx * ch + 2];
      if (isBgPixel(r, g, b, x, y)) {
        isBg[idx] = 1;
        pushQ(x, y);
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x of [0, 1, w - 2, w - 1]) {
      const idx = y * w + x;
      if (isBg[idx] === 0) {
        const r = data[idx * ch];
        const g = data[idx * ch + 1];
        const b = data[idx * ch + 2];
        if (isBgPixel(r, g, b, x, y)) {
          isBg[idx] = 1;
          pushQ(x, y);
        }
      }
    }
  }

  // BFS Flood fill
  const dxs = [1, -1, 0, 0];
  const dys = [0, 0, 1, -1];

  while (qHead < qTail) {
    const cx = queue[qHead++];
    const cy = queue[qHead++];

    for (let d = 0; d < 4; d++) {
      const nx = cx + dxs[d];
      const ny = cy + dys[d];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (isBg[nIdx] === 0) {
          const r = data[nIdx * ch];
          const g = data[nIdx * ch + 1];
          const b = data[nIdx * ch + 2];
          if (isBgPixel(r, g, b, nx, ny)) {
            isBg[nIdx] = 1;
            pushQ(nx, ny);
          }
        }
      }
    }
  }

  // Eliminate any trapped background islands between leaves for foliage plants
  if (cfg.name !== "White Rose Plant") {
    for (let i = 0; i < w * h; i++) {
      if (isBg[i] === 0) {
        const r = data[i * ch];
        const g = data[i * ch + 1];
        const b = data[i * ch + 2];
        const minVal = Math.min(r, g, b);
        const sat = Math.max(r, g, b) - minVal;
        if (minVal >= 215 && sat <= 14) {
          isBg[i] = 1;
        }
      }
    }
  }

  // Build alpha channel with edge smoothing (alpha matting)
  const alphaBuffer = Buffer.alloc(w * h * 4);

  let minX = w, maxX = 0, minY = h, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pIdx = idx * 4;
      const r = data[idx * ch];
      const g = data[idx * ch + 1];
      const b = data[idx * ch + 2];

      alphaBuffer[pIdx] = r;
      alphaBuffer[pIdx + 1] = g;
      alphaBuffer[pIdx + 2] = b;

      if (isBg[idx] === 1) {
        alphaBuffer[pIdx + 3] = 0;
      } else {
        // Check neighbors for antialiasing
        let bgNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (isBg[ny * w + nx] === 1) bgNeighbors++;
            }
          }
        }

        if (bgNeighbors > 0) {
          // Soft edge: fade alpha slightly
          const factor = (9 - bgNeighbors) / 9;
          alphaBuffer[pIdx + 3] = Math.round(255 * factor);
        } else {
          alphaBuffer[pIdx + 3] = 255;
        }

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Foreground bounding box
  const fgW = Math.max(1, maxX - minX + 1);
  const fgH = Math.max(1, maxY - minY + 1);
  console.log(`  BBox: ${minX},${minY} to ${maxX},${maxY} (${fgW}x${fgH})`);

  // Extract cropped plant
  const cropped = await sharp(alphaBuffer, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: fgW, height: fgH })
    .png()
    .toBuffer();

  // Target: square 600x600, plant centered horizontally, pot at bottom with 8% margin (~48px)
  const targetSize = 600;
  const marginPx = Math.round(targetSize * 0.08); // 48px
  const maxAvailH = targetSize - marginPx * 2; // 504px
  const maxAvailW = targetSize - marginPx * 2; // 504px

  const scale = Math.min(maxAvailW / fgW, maxAvailH / fgH);
  const scaledW = Math.round(fgW * scale);
  const scaledH = Math.round(fgH * scale);

  const resized = await sharp(cropped)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .toBuffer();

  const leftPad = Math.round((targetSize - scaledW) / 2);
  const topPad = targetSize - marginPx - scaledH; // Pot placed at the bottom with 8% bottom margin

  // Composite onto transparent 600x600 canvas
  const finalImage = await sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    {
      input: resized,
      left: Math.max(0, leftPad),
      top: Math.max(0, topPad)
    }
  ])
  .webp({ quality: 80, effort: 6, alphaQuality: 85 })
  .toBuffer();

  fs.mkdirSync(path.dirname(cfg.output), { recursive: true });
  fs.writeFileSync(cfg.output, finalImage);
  const stat = fs.statSync(cfg.output);
  console.log(`  Saved ${cfg.output} (${(stat.size / 1024).toFixed(1)} KB)`);
}

(async () => {
  for (const cfg of PLANTS_CONFIG) {
    await removeBackgroundAndFit(cfg);
  }
  console.log("ALL 5 PLANTS CUTOUT COMPLETE!");
})();
