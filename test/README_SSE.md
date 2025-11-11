Testing SSE endpoints

Files:
- test/sse.html       -> Browser GET EventSource test (connects to GET /sse)
- test/sse_post.html  -> Browser POST streaming test (fetch + ReadableStream to POST /sse)
- test/sse_client.js  -> Node POST client that prints streaming chunks (POST /sse)

Quick manual tests:
1) Start server:
   node ./src/index.js

2) Browser GET (EventSource):
   Open http://localhost:8080/test/sse.html and click Start.

3) Browser POST (fetch streaming):
   Open http://localhost:8080/test/sse_post.html and click Start.

4) Node POST client:
   node ./test/sse_client.js

Notes:
- For browser POST streaming, modern browsers expose the ReadableStream on the response body. `sse_post.html` demonstrates consuming chunked SSE via fetch.
- If you see "Client disconnected (unexpected)", the client closed the connection before the server finished streaming. Ensure clients keep the connection open and consume the stream (don't call response.json()).
