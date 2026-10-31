const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
const uuid = process.env.UUID || process.env.APP_KEY;
const wsPath = process.env.WSPATH || process.env.API_ROUTE || '/api/v1/sync';
const port = parseInt(process.env.PORT || '8080', 10);
const xrayPort = 18080;
if (!uuid) { console.error('UUID required'); process.exit(1); }
const bin = path.join(__dirname, 'web-worker');
if (!fs.existsSync(bin)) {
  try { execSync('node setup.js', { stdio: 'inherit', cwd: __dirname }); }
  catch (e) { process.exit(1); }
}
const cfg = {
  log: { loglevel: 'warning' },
  inbounds: [{
    listen: '127.0.0.1', port: xrayPort,
    protocol: 'vless',
    settings: { clients: [{ id: uuid }], decryption: 'none' },
    streamSettings: { network: 'ws', wsSettings: { path: wsPath } },
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] }
  }],
  outbounds: [
    { protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIPv4' } },
    { protocol: 'blackhole', tag: 'block' }
  ],
  routing: {
    domainStrategy: 'IPIfNonMatch',
    rules: [
      { type: 'field', outboundTag: 'block', protocol: ['bittorrent'] },
      { type: 'field', outboundTag: 'block', ip: ['geoip:private'] },
      { type: 'field', outboundTag: 'block', domain: ['geosite:private'] }
    ]
  },
  dns: { servers: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'], queryStrategy: 'UseIPv4' }
};
const cfgPath = path.join('/tmp', 'runtime-' + crypto.randomBytes(4).toString('hex') + '.json');
fs.writeFileSync(cfgPath, JSON.stringify(cfg));
const child = spawn(bin, ['run', '-c', cfgPath], { stdio: 'inherit', cwd: __dirname });
child.on('exit', (c) => process.exit(c || 0));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});
server.on('upgrade', (req, socket, head) => {
  const urlPath = (req.url || '').split('?')[0];
  if (urlPath !== wsPath) { socket.destroy(); return; }
  const upstream = net.connect(xrayPort, '127.0.0.1', () => {
    let raw = req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n';
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
    }
    raw += '\r\n';
    upstream.write(raw);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
server.listen(port, '0.0.0.0', () => console.log('front listening on ' + port));
process.on('SIGTERM', () => { try { child.kill('SIGTERM'); } catch (e) {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); });
