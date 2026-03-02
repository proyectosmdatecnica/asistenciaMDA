const http = require('http');
const PORT = 7071;

let agents = [];

const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (req.method === 'GET' && url.startsWith('/api/agents')) {
    const body = JSON.stringify(agents.map(a => a.email));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  if (req.method === 'POST' && url.startsWith('/api/agents')) {
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
        if (!agents.some(a => a.email === email)) {
          agents.push({ email, addedAt: Date.now() });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
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
