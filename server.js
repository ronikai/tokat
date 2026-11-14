/* TOKAT BAR — yerel sunucu (sifir bagimlilik)
   - Statik dosyalari sunar
   - Ayni modemdeki iki bilgisayari WebSocket ile eslestirir (internet gerekmez)

   Calistirmak icin: node server.js  (ya da start.bat)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const START_PORT = Number(process.env.PORT) || 3000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

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

/* ===========================================================
   STATIK DOSYALAR
   =========================================================== */
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

/* ===========================================================
   MINIK WEBSOCKET SUNUCUSU
   =========================================================== */
function wsFrame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

function wsSend(sock, obj) {
  if (!sock || sock.destroyed || !sock.wsOpen) return;
  try { sock.write(wsFrame(0x1, Buffer.from(JSON.stringify(obj), 'utf8'))); } catch (e) { }
}

/* oda kodu -> { host, guest } */
const rooms = new Map();

function dropRoom(sock) {
  if (!sock.room) return;
  const r = rooms.get(sock.room);
  if (!r) return;
  const other = sock.role === 'host' ? r.guest : r.host;
  if (sock.role === 'host') {
    if (r.guest) wsSend(r.guest, { t: '__peer-left' });
    rooms.delete(sock.room);
  } else {
    r.guest = null;
    if (r.host) wsSend(r.host, { t: '__peer-left' });
  }
  if (other) other.roomPeerGone = true;
  sock.room = null;
}

function onMessage(sock, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || !m.t) return;

  if (m.t === 'ping') { wsSend(sock, { t: 'pong' }); return; }

  if (m.t === 'create') {
    const code = String(m.room || '').toUpperCase().slice(0, 8);
    if (!code) return;
    if (rooms.has(code)) { wsSend(sock, { t: '__error', code: 'taken' }); return; }
    rooms.set(code, { host: sock, guest: null });
    sock.room = code;
    sock.role = 'host';
    wsSend(sock, { t: '__wait' });
    return;
  }

  if (m.t === 'join') {
    const code = String(m.room || '').toUpperCase().slice(0, 8);
    const r = rooms.get(code);
    if (!r) { wsSend(sock, { t: '__error', code: 'noroom' }); return; }
    if (r.guest) { wsSend(sock, { t: '__error', code: 'full' }); return; }
    r.guest = sock;
    sock.room = code;
    sock.role = 'guest';
    wsSend(sock, { t: '__ready' });
    wsSend(r.host, { t: '__ready' });
    return;
  }

  /* geri kalan her sey odadaki diger oyuncuya aktarilir */
  const r = rooms.get(sock.room);
  if (!r) return;
  const other = sock.role === 'host' ? r.guest : r.host;
  if (other && other.wsOpen) wsSend(other, m);
}

function parseFrames(sock, chunk) {
  sock.buf = sock.buf && sock.buf.length ? Buffer.concat([sock.buf, chunk]) : chunk;
  for (; ;) {
    const b = sock.buf;
    if (b.length < 2) return;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return;
      len = Number(b.readBigUInt64BE(2)); off = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return;
    let mask = null;
    if (masked) { mask = b.slice(off, off + 4); off += 4; }
    const data = Buffer.from(b.slice(off, off + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    sock.buf = b.slice(off + len);

    if (opcode === 0x8) { try { sock.end(wsFrame(0x8, Buffer.alloc(0))); } catch (e) { } return; }
    if (opcode === 0x9) { try { sock.write(wsFrame(0xA, data)); } catch (e) { } continue; }
    if (opcode === 0xA) continue;
    if (opcode === 0x1) onMessage(sock, data.toString('utf8'));
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.url || '').split('?')[0] !== '/ws') {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.wsOpen = true;
  socket.buf = Buffer.alloc(0);
  socket.room = null;
  socket.role = null;
  socket.setNoDelay(true);

  socket.on('data', (chunk) => { try { parseFrames(socket, chunk); } catch (e) { } });
  socket.on('close', () => { socket.wsOpen = false; dropRoom(socket); });
  socket.on('error', () => { socket.wsOpen = false; dropRoom(socket); });
  socket.on('end', () => { socket.wsOpen = false; dropRoom(socket); });
});

/* ===========================================================
   BASLAT
   =========================================================== */
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
    if (e.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1);
    else { console.error('Sunucu baslatilamadi:', e.message); process.exit(1); }
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
      console.log('  Ayni modem icin ag baglantisi bulunamadi.');
    } else {
      ips.forEach((ip) => console.log('  Arkadasin icin:    http://' + ip + ':' + port));
    }
    console.log('');
    console.log('  Ayni modeme bagli olanlar bu adresle oynar (internet gerekmez).');
    console.log('  Kapatmak icin bu pencereyi kapat.');
    console.log('');
  });
}

listen(START_PORT, 20);
