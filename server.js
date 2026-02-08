// server.js - 简单的健康检查页面
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'activation-code-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        activate: '/api/activate?code=YOUR_CODE',
        status: '/api/status'
      }
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
