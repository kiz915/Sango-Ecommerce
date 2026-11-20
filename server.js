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
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.stripe.com;");

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

    // REST API endpoints fallback (if running standalone static server)
    if (pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');

      if (pathname === '/api/products' || pathname === '/api/products/') {
        const category = parsedUrl.searchParams.get('category');
        let products = getProductsData();
        if (category && category !== 'all') {
          products = products.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
        }
        res.writeHead(200);
        return res.end(JSON.stringify(products));
      }

      if (pathname.startsWith('/api/products/')) {
        const slug = pathname.replace('/api/products/', '').replace(/\/$/, '');
        const products = getProductsData();
        const found = products.find(p => p.slug === slug);
        if (found) {
          res.writeHead(200);
          return res.end(JSON.stringify(found));
        }
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Product not found' }));
      }

      if (pathname === '/api/coupons/validate') {
        const code = parsedUrl.searchParams.get('code');
        if (code && code.toUpperCase() === 'WELCOME10') {
          res.writeHead(200);
          return res.end(JSON.stringify({ valid: true, discountPercent: 10, code: 'WELCOME10' }));
        }
        res.writeHead(400);
        return res.end(JSON.stringify({ valid: false, message: 'Invalid coupon code' }));
      }

      // Default mock 200 for other /api requests (e.g. cart sync, contact)
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, message: 'API simulated successfully' }));
    }

    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, safePath);

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
    const cacheControl = ext === '.html'
      ? 'no-cache, must-revalidate'
      : 'public, max-age=31536000, immutable';

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
