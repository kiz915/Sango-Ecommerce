const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '_site');
const DATA_DIR = path.join(__dirname, '_data');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=UTF-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Cached products list
let cachedProducts = null;
function getProductsData() {
  if (cachedProducts) return cachedProducts;
  try {
    const plantsFile = path.join(DATA_DIR, 'plants.json');
    if (fs.existsSync(plantsFile)) {
      const data = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
      cachedProducts = data.products || [];
      return cachedProducts;
    }
  } catch (e) {
    console.error('Error reading plants.json:', e);
  }
  return [];
}

const server = http.createServer((req, res) => {
  // Security headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.stripe.com;");

  // Common CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Health check endpoint
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // The storefront talks to Supabase directly; there is no local /api. Never fake success here.
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let filePath = safePath.startsWith('uploads') || safePath.startsWith('\\uploads')
      ? path.join(__dirname, safePath)
      : path.join(PUBLIC_DIR, safePath);

    // If path is a directory, look for index.html inside it
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // Clean URL support: e.g. /about -> /about.html
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    }

    // 404 fallback
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const notFoundPath = path.join(PUBLIC_DIR, '404.html');
      if (fs.existsSync(notFoundPath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        return fs.createReadStream(notFoundPath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Set appropriate caching headers
    // Versioned assets (?v=hash) and media are immutable; HTML and un-versioned JS/CSS always revalidate
    const versioned = parsedUrl.searchParams.has('v');
    const isMedia = !['.html', '.js', '.css', '.json'].includes(ext);
    const cacheControl = (versioned || isMedia)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache, must-revalidate';

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const compressible = ['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg'].includes(ext);

    let stream = fs.createReadStream(filePath);

    if (compressible && acceptEncoding.includes('br')) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Content-Encoding': 'br'
      });
      stream = stream.pipe(zlib.createBrotliCompress());
    } else if (compressible && acceptEncoding.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Content-Encoding': 'gzip'
      });
      stream = stream.pipe(zlib.createGzip());
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl
      });
    }

    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    });
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Production server running at http://${HOST}:${PORT}`);
  console.log(`Serving static files from ${PUBLIC_DIR}`);
});
