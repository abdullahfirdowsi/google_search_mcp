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

  // Build search query variants to improve chances of matching products when user posts detailed multi-line input
  function buildVariants(raw) {
    if (!raw) return [];
    const variants = [];
    const asOneLine = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    // original raw
    variants.push(raw);
    // normalized single-line version
    if (asOneLine !== raw) variants.push(asOneLine);

    // remove common labels like "Brand:", "Model Number:", "Same brand preference:", "Budget limit:" to form a compact product query
    const stripped = asOneLine.replace(/Brand:\s*/i, '')
      .replace(/Model Number:\s*/i, '')
      .replace(/Same brand preference:\s*/i, '')
      .replace(/Budget limit:\s*/i, '')
      .replace(/\s{2,}/g, ' ').trim();
    if (stripped && stripped !== asOneLine) variants.push(stripped);

    // try to extract brand and model tokens (simple heuristics)
    const brandMatch = stripped.match(/\b(LG|Samsung|Whirlpool|Frigidaire|GE|Bosch|Kenmore)\b/i);
    const modelMatch = stripped.match(/([A-Za-z0-9\-]{4,})/g);
    const model = modelMatch ? modelMatch.find(t => /\d/.test(t)) : null;
    if (brandMatch && model) {
      const b = brandMatch[1];
      variants.unshift(`${b} ${model}`);
      variants.push(`${b} ${model}`);
    }
    if (model) variants.push(model);

    // shorter variants: first sentence or first 6 words
    const firstWords = stripped.split(' ').slice(0, 6).join(' ');
    if (firstWords && firstWords !== stripped) variants.push(firstWords);

    // dedupe and return
    return Array.from(new Set(variants)).filter(Boolean);
  }

  const variants = buildVariants(query);
  if (!variants.length) {
    const err = formatError('Empty query', 'no query provided');
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(err)}\n\n`);
    return;
  }

  // Try each variant until we find results. For each variant, we still respect credential rotation and retry on quota errors.
  for (const qVariant of variants) {
    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
      const cred = credentialManager.getCurrent();
      if (!cred) {
        const err = formatError('API quota exceeded on all credentials', 'no valid credentials available');
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(err)}\n\n`);
        return;
      }

      const useLabel = cred.label || (credentialManager.index === 0 ? 'Primary' : 'Secondary');
      console.log(`[INFO] Using ${useLabel} key for query: ${qVariant}`);

      const url = 'https://www.googleapis.com/customsearch/v1';
      const params = {
        q: qVariant,
        key: cred.key,
        cx: cred.cx,
        num: Math.min(max_results || 10, 10),
        safe: 'off'
      };

      try {
        // indicate progress: attempting this variant
        try { res.write(`data: ${JSON.stringify({ type: 'progress', data: { text: `Searching: ${qVariant}` } })}\n\n`); } catch (e) {}
        const resp = await axios.get(url, { params, timeout: 12000 });
        const items = (resp.data && resp.data.items) || [];

        if (!items.length) {
          console.log(`[WARN] No results for query: ${qVariant}`);
          // try next variant
          break;
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
              query_used: qVariant,
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
          if (attempt < maxAttempts) {
            const backoffMs = 1000 * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          const e = formatError('Search request failed', message);
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(e)}\n\n`);
          console.log(`[ERROR] Search request failed for query=${qVariant} message=${message}`);
          return;
        }
      }
    }
    // continue to next variant
  }

  // no variants produced results
  const err = formatError(`No search results found for query variants`, 'items array empty');
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(err)}\n\n`);
  console.log(`[WARN] No results for all variants of query: ${query}`);
}

module.exports = {
  googleSearchHandler
};
