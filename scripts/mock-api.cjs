const http = require('http');
const PORT = 7071;

let agents = [];
let pending = [];

const server = http.createServer((req, res) => {
  const url = req.url || '';
  // CORS: allow requests from localhost dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.startsWith('/api/agents')) {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const pendingQuery = u.searchParams.get('pending');
    if (pendingQuery === '1' || pendingQuery === 'true') {
      const body = JSON.stringify(pending.map(p => p.email));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    const body = JSON.stringify(agents.map(a => a.email));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  if (req.method === 'POST' && url.startsWith('/api/agents')) {
    // create pending request (requires approval)
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const obj = JSON.parse(data || '{}');
        const email = (obj.email || '').toLowerCase();
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Email requerido');
          return;
        }
        if (!agents.some(a => a.email === email) && !pending.some(p => p.email === email)) {
          pending.push({ email, requestedAt: Date.now() });
        }
        // return 202 Accepted to indicate pending approval
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: 'pending' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('JSON malformado');
      }
    });
    return;
  }

  // Approve pending request
  if (req.method === 'POST' && url.startsWith('/api/agents/approve')) {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const obj = JSON.parse(data || '{}');
        const email = (obj.email || '').toLowerCase();
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Email requerido');
          return;
        }
        const idx = pending.findIndex(p => p.email === email);
        if (idx !== -1) {
          pending.splice(idx, 1);
          if (!agents.some(a => a.email === email)) agents.push({ email, addedAt: Date.now() });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No pending request' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('JSON malformado');
      }
    });
    return;
  }

  // Reject pending request
  if (req.method === 'POST' && url.startsWith('/api/agents/reject')) {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const obj = JSON.parse(data || '{}');
        const email = (obj.email || '').toLowerCase();
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Email requerido');
          return;
        }
        const idx = pending.findIndex(p => p.email === email);
        if (idx !== -1) {
          pending.splice(idx, 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No pending request' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('JSON malformado');
      }
    });
    return;
  }

  // Simple handler for requests endpoint to avoid errors
  if (req.method === 'GET' && url.startsWith('/api/requests')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([]));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Mock API listening on http://localhost:${PORT}`));
