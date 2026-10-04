const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(__dirname, reqPath);

  // Prevenir Directory Traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Acesso Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ficheiro não encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log('  ✝ BStudy • Bíblia e Caderno Apple Pencil para iPad');
  console.log('================================================================');
  console.log(`\n  Local (neste computador):  http://localhost:${PORT}`);

  // Encontrar o IP da rede Wi-Fi para o iPad
  const interfaces = os.networkInterfaces();
  let wifiIp = null;
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        wifiIp = net.address;
        break;
      }
    }
  }

  if (wifiIp) {
    console.log(`  No seu iPad (Safari):      http://${wifiIp}:${PORT}`);
    console.log('\n  Dica para o iPad: No Safari, toque em "Partilhar" (quadrado com');
    console.log('  seta para cima) e selecione "Adicionar ao Ecrã Principal"');
    console.log('  para abrir em Ecrã Inteiro como uma App nativa!\n');
  }
  console.log('================================================================');
});
