const express = require('express');
const compression = require('compression');
const cors = require('cors');
const bodyParser = require('express').json;
const { getApiKeys } = require('./config/apiKeys');
const { CredentialManager } = require('./utils/credentialManager');
const { googleSearchHandler } = require('./handlers/googleSearch');

const PORT = process.env.PORT || 8080;

function startServer() {
  const app = express();
  app.use(cors());
  app.use(compression());
  app.use(bodyParser({ limit: '1mb' }));

  const keys = getApiKeys();
  const credentialManager = new CredentialManager(keys);

  app.post('/sse', async (req, res) => {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // flush headers if possible
    try { if (res.flush) res.flush(); } catch (e) {}

    req.on('close', () => {
      console.log('Client disconnected');
      try { res.end(); } catch (e) {}
    });

    const payload = req.body || {};
    if (payload.type !== 'google_search' || !payload.data || !payload.data.query) {
      const err = { error: 'invalid_request', details: 'type must be google_search and data.query required' };
      res.write(`data: ${JSON.stringify(err)}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
      return;
    }

    try {
      await googleSearchHandler(payload.data, res, credentialManager);
    } catch (e) {
      const err = { error: 'internal_error', details: e && e.message };
      try {
        res.write(`data: ${JSON.stringify(err)}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch (writeErr) {}
    }
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
