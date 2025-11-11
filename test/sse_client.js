const http = require('http');

const data = JSON.stringify({
  type: 'google_search',
  data: { query: "I'm looking for a replacement for my refrigerator.", max_results: 5 }
});

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/sse',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  console.log('headers:', res.headers);

  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    // print raw chunk received (SSE may arrive in pieces)
    process.stdout.write('\n--- chunk ---\n');
    process.stdout.write(chunk);
  });

  res.on('end', () => {
    console.log('\n\nresponse ended');
  });
});

req.on('error', (e) => {
  console.error('problem with request:', e);
});

req.write(data);
req.end();
