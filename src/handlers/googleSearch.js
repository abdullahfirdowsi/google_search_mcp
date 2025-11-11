const axios = require('axios');
const { formatError } = require('../utils/errorHandler');

/**
 * googleSearchHandler performs a Custom Search and streams a single SSE event
 * containing normalized items and metadata, followed by data: [DONE]
 *
 * payload: { query, max_results }
 * res: express response (SSE)
 * credentialManager: instance of CredentialManager
 */
async function googleSearchHandler(payload, res, credentialManager) {
  const { query, max_results = 10 } = payload;
  const maxAttempts = 3; // initial + 2 retries
  let attempt = 0;

  while (attempt < maxAttempts) {
    const cred = credentialManager.getCurrent();
    if (!cred) {
      const err = formatError('API quota exceeded on all credentials', 'no valid credentials available');
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(err)}\n\n`);
      return;
    }

    const useLabel = cred.label || (credentialManager.index === 0 ? 'Primary' : 'Secondary');
    console.log(`[INFO] Using ${useLabel} key for query: ${query}`);

    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = {
      q: query,
      key: cred.key,
      cx: cred.cx,
      num: Math.min(max_results || 10, 10),
      safe: 'off'
    };

    try {
      const resp = await axios.get(url, { params, timeout: 12000 });
      const items = (resp.data && resp.data.items) || [];

      if (!items.length) {
        const err = formatError(`No search results found for query: ${query}`, 'items array empty');
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(err)}\n\n`);
        console.log(`[WARN] No results for query: ${query}`);
        return;
      }

      const normalized = items.map(it => ({
        title: it.title || '',
        link: it.link || it.formattedUrl || '',
        snippet: it.snippet || it.htmlSnippet || ''
      }));

      const payloadOut = {
        type: 'search_result',
        data: {
          items: normalized,
          metadata: {
            source: 'google_custom_search',
            query_used: query,
            timestamp: new Date().toISOString()
          }
        }
      };

      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(payloadOut)}\n\n`);
      try { if (typeof res.flush === 'function') res.flush(); } catch (e) {}
      console.log(`[SUCCESS] Returned ${normalized.length} results from google.com`);
      return;
    } catch (err) {
      attempt++;
      const status = err.response && err.response.status;
      const message = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message || '';

      const isRateLimit = status === 429 || /quota|rate limit|exceeded/i.test(message);

      if (isRateLimit) {
        console.log(`[WARN] Quota/rate limit detected (status=${status}). Switching credentials.`);
        credentialManager.rotateOnQuota();
        if (credentialManager.allExhausted()) {
          const e = formatError('API quota exceeded on all credentials', message);
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(e)}\n\n`);
          return;
        }
        // continue to next loop iteration and try with rotated cred
      } else {
        // if we still have attempts left, backoff then retry
        if (attempt < maxAttempts) {
          const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        const e = formatError('Search request failed', message);
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(e)}\n\n`);
        console.log(`[ERROR] Search request failed for query=${query} message=${message}`);
        return;
      }
    }
  }
}

module.exports = {
  googleSearchHandler
};
