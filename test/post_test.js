(async () => {
  const query = `I'm looking for a replacement for my refrigerator.\nBrand: LG\nModel Number: LRDCS2603S\nSame brand preference: No\nBudget limit: No limit`;
  try {
    const res = await fetch('http://localhost:8080/sse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'google_search', data: { query, max_results: 10 } })
    });

    console.log('HTTP', res.status, Object.fromEntries(res.headers.entries()));
    if (!res.ok) {
      console.error('HTTP error', res.status);
      const txt = await res.text();
      console.error(txt);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value));
    }
  } catch (err) {
    console.error('Request failed', err);
  }
})();
