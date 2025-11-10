# TASK: Create a Google Custom Search API MCP Server (Machine-to-Cloud Protocol Server)
This MCP Server will act as a centralized gateway for all AI agents in the “Elevator_Demo” system.
It should expose a **Server-Sent Events (SSE)** endpoint `/sse` that can handle requests from AI orchestrator agents for Google Search queries.

---

## 🧩 OBJECTIVE

Create a **Node.js (Express-based)** MCP Server that wraps around the **Google Custom Search API**, with the following capabilities:

1. Acts as a REST-to-SSE bridge for search queries.
2. Handles **Google Custom Search API calls** securely.
3. Provides structured, normalized JSON responses (title, link, snippet only).
4. Implements **credential rotation** (primary + secondary key fallback).
5. Includes **error handling**, **logging**, and **rate limit management**.
6. Dockerized for deployment on **Azure Container Apps**.
7. Exposes a **single SSE endpoint**: `/sse`.
8. Supports multiple agents: `Elevator_Product_Search`, `Elevator_AI_Product_Replacement`, `Elevator_AI_Parts_Replacement`.

---

## 🧠 FUNCTIONAL SPECIFICATIONS

### 1️⃣ API Endpoint (External)
- **Route:** `/sse`
- **Method:** `POST`
- **Content-Type:** `application/json`
- **Response Type:** `text/event-stream`
- **Purpose:** Accepts search payloads from AI agents and returns search results via SSE stream.

### 2️⃣ Input Payload Example
```json
{
  "type": "google_search",
  "data": {
    "query": "LG LSGS6338N range specifications",
    "max_results": 10
  }
}
```

### 3️⃣ Response Format (SSE Streamed Event)
Each result should be streamed as:
```
data: {
  "type": "search_result",
  "data": {
    "items": [
      {
        "title": "LG 30\" Slide-In Gas Range - LSGS6338N",
        "link": "https://www.lg.com/us/cooking-appliances/lg-LSGS6338N",
        "snippet": "30-inch gas range with ProBake Convection, EasyClean, and 5 sealed burners..."
      },
      ...
    ],
    "metadata": {
      "source": "google_custom_search",
      "query_used": "LG LSGS6338N range specifications",
      "timestamp": "2025-11-05T10:30:00Z"
    }
  }
}
```

At the end of stream:
```
data: [DONE]
```

---

## 🔐 GOOGLE CUSTOM SEARCH CONFIGURATION

### Primary Credential
```
API_KEY=AIzaSyBUjvUAcB7la76MpkUzQUKbI-PElF2Zl6o
CX_ID=c3d85b3ee2cff4170
```

### Secondary Credential (Fallback)
```
API_KEY_SECONDARY=AIzaSyD9YcEC3WoL2nVI6TqNh0BdqDdKD5puMEI
CX_ID_SECONDARY=f080b786cd52e44c4
```

### Request Example
```
GET https://www.googleapis.com/customsearch/v1?q={query}&key={API_KEY}&cx={CX_ID}&num=10&safe=off
```

---

## ⚙️ CORE FUNCTIONAL REQUIREMENTS

1. **Credential Rotation**
   - Use Primary by default.
   - On HTTP 429, “quota exceeded”, or “rate limit” → switch to Secondary.
   - If both exhausted → return `{ "error": "API quota exceeded on all credentials" }`.

2. **Retry Logic**
   - Retry each failed request up to **2 times** with exponential backoff (1s, 2s).

3. **Error Handling**
   - Return structured JSON errors like:
     ```json
     {
       "error": "No search results found for query",
       "details": "items array empty"
     }
     ```

4. **Response Normalization**
   - Return only essential fields:
     ```
     title, link, snippet
     ```
   - Include metadata:
     ```
     source, query_used, timestamp
     ```

5. **Logging**
   - Console logs for each query:
     ```
     [INFO] Using Primary key for query: LG LSGS6338N
     [WARN] Quota exceeded. Switching to secondary key.
     [SUCCESS] Returned 8 results from google.com
     ```

6. **Supported Capabilities**
   - `"google_search"`
   - `"extract_webpage_content"` *(future expansion optional)*
   - `"extract_multiple_webpages"` *(optional for product/parts pages)*

---

## 🧱 DIRECTORY STRUCTURE
```
google-search-mcp/
│
├── src/
│   ├── index.js             # Entry point
│   ├── handlers/
│   │   └── googleSearch.js  # Core search logic
│   ├── utils/
│   │   ├── credentialManager.js
│   │   └── errorHandler.js
│   └── config/
│       └── apiKeys.js
│
├── Dockerfile
├── package.json
├── .env
└── README.md
```

---

## 🐳 DOCKER CONFIGURATION

### **Dockerfile**
```Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
```

### **docker-compose.yml (optional local run)**
```yaml
version: "3.8"
services:
  google-search-mcp:
    build: .
    ports:
      - "8080:8080"
    environment:
      - API_KEY=${API_KEY}
      - CX_ID=${CX_ID}
      - API_KEY_SECONDARY=${API_KEY_SECONDARY}
      - CX_ID_SECONDARY=${CX_ID_SECONDARY}
```

---

## ☁️ DEPLOYMENT TARGET
Deploy this image to:
```
Azure Container Apps
Container URL: https://igentic-searchmcp-container.ashymoss-98305dc8.eastus.azurecontainerapps.io/sse
Type: Server-Sent Events (SSE)
```

---

## 🔄 TEST CASES

### ✅ Success Case
**Input:**
```json
{"type": "google_search", "data": {"query": "Samsung 30 inch gas range specifications"}}
```

**Expected Output:**
- SSE events streamed with titles, links, and snippets.
- Ends with `data: [DONE]`.

### ❌ Error Case (Quota Exceeded)
- Should switch credentials and retry automatically.

### ❌ Error Case (No Results)
- Returns:
  ```json
  {"error": "No search results found for Samsung 30 inch gas range"}
  ```

---

## 📘 NOTES FOR IMPLEMENTATION

- Use `express`, `axios`, `dotenv`, `cors`, and `compression`.
- Stream SSE responses using `res.write()` and `res.flush()`.
- Make sure to include appropriate headers:
  ```js
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  ```
- Handle clean disconnect with:
  ```js
  req.on('close', () => { console.log('Client disconnected'); });
  ```
- Implement fallback from primary to secondary credentials within `credentialManager.js`.

---

## 🎯 GOAL

Deliver a **production-grade Google Search MCP Server** that:
- Normalizes API outputs,
- Handles quotas automatically,
- Streams results as SSE events, and
- Serves as the shared search backend for:
  - Elevator_Product_Search
  - Elevator_AI_Product_Replacement
  - Elevator_AI_Parts_Replacement

Once deployed, I should be able to make POST requests from any AI Agent or Orchestrator like this:
```
POST https://igentic-searchmcp-container.ashymoss-98305dc8.eastus.azurecontainerapps.io/sse
Content-Type: application/json
{
  "type": "google_search",
  "data": {
    "query": "LG LSGS6338N specifications",
    "max_results": 10
  }
}
```

And receive a continuous event stream of normalized search results.

---

**Final Deliverables:**
- Fully functional Node.js MCP Server (`/sse`)
- Dockerfile
- `.env` config support
- Azure deployable container image
- Tested SSE streaming with real Google Custom Search results
