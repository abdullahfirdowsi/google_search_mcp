const express = require('express');
const compression = require('compression');
const cors = require('cors');
const bodyParser = require('express').json;
const path = require('path');
const { getApiKeys } = require('./config/apiKeys');
const { CredentialManager } = require('./utils/credentialManager');
const { googleSearchHandler } = require('./handlers/googleSearch');

const PORT = process.env.PORT || 8080;

function startServer() {
  const app = express();
  app.use(cors());
  // Serve test files (so /test/sse.html is accessible)
  app.use('/test', express.static(path.join(__dirname, '..', 'test')));
  // Configure compression but disable it entirely for the SSE endpoints to avoid buffering
  app.use(compression({
    filter: (req, res) => {
      try {
        // Disable compression for any SSE route (GET or POST) to avoid buffering
        if (req.path && req.path.startsWith('/sse')) return false;
        const accept = (req.headers && req.headers.accept) || '';
        if (accept.indexOf('text/event-stream') !== -1) return false;
      } catch (e) {}
      return compression.filter(req, res);
    }
  }));
  app.use(bodyParser({ limit: '1mb' }));

  const keys = getApiKeys();
  const credentialManager = new CredentialManager(keys);

  // Health check endpoint for load balancers and Render
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Browser-friendly SSE endpoint (GET) so EventSource can connect.
  // Use query params: ?query=...&max_results=5
  app.get('/sse', (req, res) => {
    const payload = { type: 'google_search', data: { query: req.query.query, max_results: parseInt(req.query.max_results || '10', 10) } };
    // reuse POST SSE behavior by delegating to the same internal flow
    // we'll emulate the same streaming handshake below

    // SSE headers (required for Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    try { if (typeof res.flushHeaders === 'function') res.flushHeaders(); } catch (e) {}

    let closed = false;
    let finished = false;
    req.on('close', () => {
      if (!finished) console.log('Client disconnected (unexpected)');
      closed = true;
    });

    if (!payload.data.query) {
      const err = { error: 'invalid_request', details: 'query param required' };
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(err)}\n\n`);
      res.write(`event: message\n`);
      res.write(`data: [END]\n\n`);
      try { finished = true; res.end(); } catch (e) {}
      return;
    }

    // Simulate async streaming: send a few progress chunks every 0.5s
    const progressChunks = ['client connected (GET)', 'dispatching query', 'collecting results'];
    let idx = 0;
    const interval = setInterval(() => {
      if (closed) { clearInterval(interval); return; }
  const chunkPayload = { type: 'progress', data: { text: progressChunks[idx], seq: idx + 1, total: progressChunks.length } };
  console.log(`[SSE] sending progress ${idx + 1}/${progressChunks.length}`);
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(chunkPayload)}\n\n`);
      try { if (typeof res.flush === 'function') res.flush(); } catch (e) {}
      idx++;
      if (idx >= progressChunks.length) {
        clearInterval(interval);
        (async () => {
          try {
            await googleSearchHandler(payload.data, res, credentialManager);
          } catch (e) {
            const err = { error: 'internal_error', details: e && e.message };
            try { res.write(`event: message\n`); res.write(`data: ${JSON.stringify(err)}\n\n`); } catch (writeErr) {}
          } finally {
            if (!closed) {
                  try { res.write(`event: message\n`); res.write(`data: [END]\n\n`); } catch (e) {}
                  try { finished = true; res.end(); } catch (e) {}
                }
          }
        })();
      }
    }, 500);
  });

  app.post('/sse', async (req, res) => {
    console.log('[SSE] POST /sse connection from', req.ip || req.socket.remoteAddress || 'unknown');
    
    // SSE headers (required for Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // tell some proxies not to buffer the response
    res.setHeader('X-Accel-Buffering', 'no');
    // try to disable content encoding for this response
    res.setHeader('Content-Encoding', 'identity');

    // flush headers so client sees them immediately
    try { if (typeof res.flushHeaders === 'function') res.flushHeaders(); } catch (e) {}

    // send an initial ping/handshake so some clients don't consider the connection idle
    try {
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      try { if (typeof res.flush === 'function') res.flush(); } catch (e) {}
    } catch (e) {}

    let closed = false;
    let finished = false; // set to true when we intentionally finish the response

    req.on('close', () => {
      if (!finished) console.log('Client disconnected (unexpected)');
      else console.log('Client disconnected (normal)');
      closed = true;
    });

    const payload = req.body || {};
  console.log('[SSE] POST payload:', JSON.stringify(payload).slice(0,1000));
    if (payload.type !== 'google_search' || !payload.data || !payload.data.query) {
      const err = { error: 'invalid_request', details: 'type must be google_search and data.query required' };
      // send SSE-formatted error event
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(err)}\n\n`);
      // final marker and close
      res.write(`event: message\n`);
      res.write(`data: [END]\n\n`);
      try { finished = true; res.end(); } catch (e) {}
      return;
    }

    // Simulate async streaming: send a few progress chunks every 0.5s
    const progressChunks = [
      'client connected',
      'dispatching query',
      'collecting results'
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (closed) {
        clearInterval(interval);
        return;
      }

  const chunkPayload = { type: 'progress', data: { text: progressChunks[idx], seq: idx + 1, total: progressChunks.length } };
  console.log(`[SSE] sending progress ${idx + 1}/${progressChunks.length}`);
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(chunkPayload)}\n\n`);
      try { if (typeof res.flush === 'function') res.flush(); } catch (e) {}

      idx++;
      if (idx >= progressChunks.length) {
        clearInterval(interval);

        // call handler to perform search and stream final payload (handler writes events but does NOT end response)
        (async () => {
          try {
            await googleSearchHandler(payload.data, res, credentialManager);
          } catch (e) {
            const err = { error: 'internal_error', details: e && e.message };
            try {
              res.write(`event: message\n`);
              res.write(`data: ${JSON.stringify(err)}\n\n`);
            } catch (writeErr) {}
          } finally {
            if (!closed) {
              // final done event and close connection
              try {
                res.write(`event: message\n`);
                res.write(`data: [END]\n\n`);
              } catch (e) {}
              try { finished = true; res.end(); } catch (e) {}
            }
          }
        })();
      }
    }, 500);
  });

  const server = app.listen(PORT, () => {
    console.log(`[INFO] Google Search MCP Server running on port ${PORT}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
