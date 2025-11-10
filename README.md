# Google Search MCP (SSE)

A small Machine-to-Cloud Protocol (MCP) server that exposes a single SSE endpoint `/sse` and forwards requests to the Google Custom Search API. It supports credential rotation (primary/secondary), retries with backoff, response normalization and streaming via SSE.

Quick start (PowerShell):

1. Copy environment variables:

```powershell
cp .env.example .env
# Edit .env with your credentials if needed
```

2. Install and run:

```powershell
npm install
npm start
```

Endpoints
- POST /sse  (Content-Type: application/json)
  - body: { "type":"google_search", "data": { "query":"...", "max_results":10 } }
  - Response: SSE stream of normalized JSON events and a final `data: [DONE]` event.

Docker

Build and run locally:

```powershell
docker build -t google-search-mcp .
docker run -p 8080:8080 --env-file .env google-search-mcp
```

Notes
- The server uses environment variables (see `.env.example`).
- The server currently returns a single SSE event containing an array of normalized items, then `data: [DONE]`. If you prefer one event per item, the handler can be adjusted.
