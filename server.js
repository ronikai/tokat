/* TOKAT BAR — yerel sunucu (sifir bagimlilik)
   Calistirmak icin: node server.js
   Ayni WiFi'daki iki bilgisayar bu adresten oynar. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const START_PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[\\/])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadi: ' + urlPath);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function listen(port, tries) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries > 0) {
      listen(port + 1, tries - 1);
    } else {
      console.error('Sunucu baslatilamadi:', e.message);
      process.exit(1);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    const ips = lanIPs();
    console.log('');
    console.log('  ================================');
    console.log('        TOKAT BAR  hazir');
    console.log('  ================================');
    console.log('');
    console.log('  Bu bilgisayarda:   http://localhost:' + port);
    if (!ips.length) {
      console.log('  Ayni WiFi icin bir ag baglantisi bulunamadi.');
    } else {
      ips.forEach((ip) => console.log('  Arkadasin icin:    http://' + ip + ':' + port));
    }
    console.log('');
    console.log('  Kapatmak icin bu pencereyi kapat.');
    console.log('');
  });
}

listen(START_PORT, 20);
