#!/usr/bin/env node
/**
 * Generate ALL product images from _data/plants.json using image-map.json mapping
 * The image-map.json maps spreadsheet rows to image files in _xlsx-media
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Read products from plants.json
const plantsData = JSON.parse(fs.readFileSync('_data/plants.json', 'utf8'));
const products = plantsData.products || [];

// Read image mapping from image-map.json
const imageMap = JSON.parse(fs.readFileSync('scripts/image-map.json', 'utf8'));

console.log(`📦 Found ${products.length} products to process`);
console.log(`🗺️  Found ${imageMap.length} image mappings`);

const PROCESSED_DIR = 'public/plants';
const SOURCE_DIR = '_xlsx-media';

fs.mkdirSync(PROCESSED_DIR, { recursive: true });

async function processCutout(product, sourcePath, outputFilename, quality) {
  console.log(`Processing ${product.name} (${product.slug})...`);

  try {
    const image = sharp(sourcePath);
    const meta = await image.metadata();

    const targetH = 650;
    const targetW = Math.round((meta.width / meta.height) * targetH);

    const { data, info } = await image
      .resize(targetW, targetH)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const ch = info.channels;

    const visited = new Uint8Array(w * h);
    const queue = [];

    function isFoliageOrPot(r, g, b, x, y) {
      // Green foliage
      if (g > 40 && g > r * 1.05 && g > b * 1.05) return true;
      if (g > 60 && (g - r > 10 || g - b > 10)) return true;
      // Dark branches/pot
      if (r < 60 && g < 60 && b < 60 && y > h * 0.25) return true;
      // Terracotta / brown pot
      if (y > h * 0.55 && r > 90 && r > b * 1.25 && g > b) return true;
      // White flowers in rose/cherry
      if (product.name.includes("Rose") || product.name.includes("Cherry")) {
        if (y > h * 0.15 && y < h * 0.75 && x > w * 0.18 && x < w * 0.82) {
          if (r > 170 && g > 170 && b > 160 && (r - b > 5 || g - b > 5)) return true;
          if (product.name.includes("Cherry") && (r > 190 && b > 170)) return true;
        }
      }
      return false;
    }

    // Seed borders
    for (let x = 0; x < w; x++) {
      for (let dy of [0, 1, 2, h - 3, h - 2, h - 1]) {
        const idx = dy * w + x;
        if (visited[idx] === 0) {
          visited[idx] = 1;
          queue.push([x, dy, data[idx * ch], data[idx * ch + 1], data[idx * ch + 2]]);
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let dx of [0, 1, 2, w - 3, w - 2, w - 1]) {
        const idx = y * w + dx;
        if (visited[idx] === 0) {
          visited[idx] = 1;
          queue.push([dx, y, data[idx * ch], data[idx * ch + 1], data[idx * ch + 2]]);
        }
      }
    }

    // BFS flood fill
    let head = 0;
    while (head < queue.length) {
      const [cx, cy, pr, pg, pb] = queue[head++];
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nIdx = ny * w + nx;
          if (visited[nIdx] === 0) {
            const pIdx = nIdx * ch;
            const nr = data[pIdx];
            const ng = data[pIdx + 1];
            const nb = data[pIdx + 2];

            // Check if top-left red badge
            if (nx < w * 0.35 && ny < h * 0.25 && nr > 150 && ng < 90 && nb < 90) {
              visited[nIdx] = 1;
              queue.push([nx, ny, nr, ng, nb]);
              continue;
            }

            // Check if foliage or pot
            if (isFoliageOrPot(nr, ng, nb, nx, ny)) {
              continue; // Stop flood fill, it's the plant!
            }

            // Color distance to parent background pixel
            const dist = Math.sqrt((nr - pr) ** 2 + (ng - pg) ** 2 + (nb - pb) ** 2);
            const saturation = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);

            if (dist < 32 || (saturation < 20 && dist < 55)) {
              visited[nIdx] = 1;
              queue.push([nx, ny, nr, ng, nb]);
            }
          }
        }
      }
    }

    // Set alpha = 0 for background
    for (let i = 0; i < w * h; i++) {
      if (visited[i] === 1) {
        data[i * ch + 3] = 0;
      }
    }

    // Find bounding box
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (visited[y * w + x] === 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const fgW = Math.max(10, maxX - minX);
    const fgH = Math.max(10, maxY - minY);
    console.log(`  BBox: ${fgW}x${fgH} at (${minX}, ${minY})`);

    const plantCutout = await sharp(data, { raw: { width: w, height: h, channels: ch } })
      .extract({ left: minX, top: minY, width: fgW, height: fgH })
      .png()
      .toBuffer();

    const margin = Math.round(600 * 0.08); // 48px (~8%)
    const maxAvailableH = 600 - (margin * 2); // 504px
    const maxAvailableW = 600 - (margin * 2); // 504px

    const scale = Math.min(maxAvailableW / fgW, maxAvailableH / fgH);
    const scaledW = Math.round(fgW * scale);
    const scaledH = Math.round(fgH * scale);

    const left = Math.round((600 - scaledW) / 2);
    const top = 600 - margin - scaledH; // Pot at the bottom!

    const resizedCutout = await sharp(plantCutout)
      .resize(scaledW, scaledH)
      .toBuffer();

    const outPath = path.join(PROCESSED_DIR, outputFilename);

    // Try writing with target quality to stay strictly under 60 KB
    let q = quality || 75;
    let finalBuffer;
    while (q >= 40) {
      finalBuffer = await sharp({
        create: {
          width: 600,
          height: 600,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{ input: resizedCutout, left, top }])
        .webp({ quality: q, alphaQuality: 90 })
        .toBuffer();

      if (finalBuffer.length < 58000) break;
      q -= 5;
    }

    fs.writeFileSync(outPath, finalBuffer);

    // Also sync to _site/public/plants and _site/plants so dev server has it immediately
    const sitePub = path.join('_site', 'public', 'plants');
    const sitePlants = path.join('_site', 'plants');
    fs.mkdirSync(sitePub, { recursive: true });
    fs.mkdirSync(sitePlants, { recursive: true });
    fs.copyFileSync(outPath, path.join(sitePub, outputFilename));
    fs.copyFileSync(outPath, path.join(sitePlants, outputFilename));

    const finalSize = fs.statSync(outPath).size;
    console.log(`  Done: ${outPath} (${Math.round(finalSize / 1024)} KB, q=${q})`);
    return true;

  } catch (err) {
    console.error(`  ERROR processing ${product.name}:`, err.message);
    return false;
  }
}

async function main() {
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  // Create a map from image-map row index to product
  // The image-map.json has entries for rows 3-81 (0-indexed in array)
  // Products in plants.json are in the same order as the spreadsheet rows
  // Row 4 (index 1) = first product, Row 5 (index 2) = second product, etc.

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const mappingIndex = i + 1; // image-map.json index (row 4 = index 1)

    if (mappingIndex >= imageMap.length) {
      console.log(`⚠️  No image mapping for product ${i + 1}: ${product.name} (${product.slug})`);
      failCount++;
      continue;
    }

    const mapping = imageMap[mappingIndex];
    const sourceFile = mapping.file;
    const sourcePath = path.join(SOURCE_DIR, sourceFile);

    const outputFilename = product.slug + '.webp';
    const outPath = path.join(PROCESSED_DIR, outputFilename);

    // Skip if already processed
    if (fs.existsSync(outPath)) {
      console.log(`⏭️  Skipping ${product.name} (already exists)`);
      skippedCount++;
      continue;
    }

    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️  Source image not found: ${sourcePath} for ${product.name}`);
      failCount++;
      continue;
    }

    // Determine quality based on product type (from cutout_pipeline.js)
    let quality = 75;
    const name = product.name.toLowerCase();
    if (name.includes('fiddle leaf')) quality = 80;
    else if (name.includes('rose')) quality = 70;
    else if (name.includes('fan palm')) quality = 78;
    else if (name.includes('cherry')) quality = 80;
    else if (name.includes('areca palm')) quality = 72;
    else if (name.includes('monstera')) quality = 75;

    const success = await processCutout(product, sourcePath, outputFilename, quality);
    if (success) successCount++;
    else failCount++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Processed: ${successCount}`);
  console.log(`  ⏭️  Skipped (existing): ${skippedCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  📁 Total products: ${products.length}`);
}

main().catch(console.error);