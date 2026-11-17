const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 3008;

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];
  let relPath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');

  // Support clean URLs (e.g. /whiteboard -> whiteboard.html, /test-ui -> test_ui.html)
  if (relPath === 'whiteboard') {
    relPath = 'whiteboard.html';
  } else if (relPath === 'test-ui' || relPath === 'ncert' || relPath === 'ncert-reading-engine') {
    relPath = 'test_ui.html';
  }

  let filePath = path.resolve(ROOT_DIR, relPath);

  // Serve lightweight inline SVG favicon so browsers do not log 404 on /favicon.ico
  if (cleanUrl === '/favicon.ico') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563eb"/><text x="32" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="30" fill="#ffffff">H</text></svg>';
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(svg);
    return;
  }

  // Prevent directory traversal outside frontend root
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Forbidden');
    return;
  }

  // Fallback to index.html for SPA routes or missing HTML routes
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const extCheck = path.extname(filePath).toLowerCase();
    if (!extCheck || extCheck === '.html') {
      filePath = path.join(ROOT_DIR, 'index.html');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[FRONTEND SERVER] Serving HAPS-AI frontend at http://localhost:${PORT}`);
});

