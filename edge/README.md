# Edge Gateway - Cloudflare Worker

A lightweight edge gateway layer that sits between the frontend and Go backend services, providing intelligent routing, caching, and a foundation for future edge-hosted "microprocesses."

## Architecture

```
Frontend (React)
     ↓
Edge Gateway (Cloudflare Worker) ← This service
     ↓
Backend Go Services (Regional: EU, US, Asia)
     ↓
Cassandra (Shared storage)
```

## Why Cloudflare Workers?

1. **True Edge Deployment**: Runs at 300+ locations globally, close to users
2. **Low Latency**: Sub-10ms response times at the edge
3. **Serverless**: No infrastructure to manage, auto-scaling
4. **TypeScript Support**: Native TypeScript support
5. **Cost Effective**: Pay per request, very low cost for this use case
6. **Future Ready**: Durable Objects enable stateful edge processes

## Features

### 1. Smart Region Routing

- **Priority-based selection**:
  1. User's `preferredRegion` (if valid)
  2. `x-user-region` header
  3. Geographic routing (Cloudflare country code)
  4. Default region fallback

- **Extensible**: Easy to swap routing strategies (latency-based, load-based, etc.)

### 2. Edge Caching

- In-memory cache for recent game sessions
- TTL-based expiration (configurable)
- Reduces backend load
- Foundation for future edge-hosted state

### 3. Future "Microprocess" Ready

The architecture is designed to support:
- **Edge-hosted game rooms**: Use Cloudflare Durable Objects
- **Real-time coordination**: Edge-to-edge communication
- **Lightweight game state**: Keep frequently accessed state at edge
- **Backend offloading**: Only hit backend for persistence/heavy computation

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

### Installation

```bash
cd edge
npm install
```

### Configuration

#### Option 1: Environment Variables (Cloudflare Dashboard)

Set these in your Cloudflare Workers dashboard:

```
BACKEND_REGIONS_JSON = '[{"id":"eu","baseUrl":"https://eu.api.example.com"},{"id":"us","baseUrl":"https://us.api.example.com"}]'
DEFAULT_REGION = "eu"
BACKEND_TIMEOUT_MS = "5000"
CACHE_TTL_MS = "30000"
```

#### Option 2: Local Development (.dev.vars)

Create `.dev.vars` file:

```bash
BACKEND_REGIONS_JSON='[{"id":"eu","baseUrl":"http://localhost:8081"},{"id":"us","baseUrl":"http://localhost:8082"}]'
DEFAULT_REGION="eu"
BACKEND_TIMEOUT_MS="5000"
CACHE_TTL_MS="30000"
```

#### Option 3: Wrangler Secrets

```bash
wrangler secret put BACKEND_REGIONS_JSON
wrangler secret put DEFAULT_REGION
# etc.
```

### Development

```bash
# Start local development server
npm run dev

# Type checking
npm run typecheck
```

### Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Deploy to production environment
npm run deploy:prod
```

## API Endpoints

### POST /edge/game/start

**Request:**
```json
{
  "userId": "user123",
  "preferredRegion": "eu"  // optional
}
```

**Response:**
```json
{
  "gameId": "abc123",
  "seed": 987654321,
  "startAt": 1733850000000,
  "tickMs": 100,
  "backendRegion": "eu"
}
```

### POST /edge/game/exit

**Request:**
```json
{
  "gameId": "abc123",
  "userId": "user123",
  "backendRegion": "eu"  // optional if cached
}
```

**Response:**
```json
{
  "ok": true
}
```

### GET /edge/health

**Response:**
```json
{
  "status": "ok",
  "cache": {
    "size": 5,
    "ttl": 30000
  },
  "regions": ["eu", "us", "asia"]
}
```

## Region Selection Logic

The edge gateway uses a priority-based region selection:

1. **Preferred Region**: If `preferredRegion` is provided and valid
2. **Header Hint**: `x-user-region` header
3. **Geographic Routing**: Maps country code to region:
   - EU countries → `eu`
   - US/CA/MX → `us`
   - Asia countries → `asia`
4. **Default**: Falls back to configured default region

### Extending Region Selection

To add a new strategy (e.g., latency-based):

```typescript
// src/region-selector.ts
export class LatencyBasedSelector implements RegionSelectionStrategy {
  selectRegion(request, config) {
    // Measure latency to each region
    // Return fastest region
  }
}

// src/index.ts
const regionSelector = new LatencyBasedSelector();
```

## Caching

The edge gateway caches game sessions with a configurable TTL:

- **Purpose**: Reduce backend load, enable future edge features
- **Storage**: In-memory (per worker instance)
- **TTL**: Default 30 seconds (configurable)
- **Future**: Can migrate to Cloudflare KV or Durable Objects for distributed caching

### Cache Structure

```typescript
{
  gameId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  backendRegion: string;
  cachedAt: number; // timestamp
}
```

## Future: Edge "Microprocesses"

The architecture is designed to support edge-hosted game processes:

### Concept

Instead of all game logic running in the backend, lightweight "microprocesses" can run at the edge:

- **Real-time coordination**: Edge-to-edge communication
- **Low latency**: Sub-10ms updates
- **Backend offloading**: Only hit backend for persistence

### Implementation Path

1. **Current**: Edge routes and caches
2. **Next**: Use Cloudflare Durable Objects for stateful game rooms
3. **Future**: Edge-to-edge real-time updates, backend only for persistence

### Example: Edge Game Room

```typescript
// Future: Durable Object for game room
export class GameRoom {
  state: DurableObjectState;
  
  async fetch(request: Request) {
    // Handle real-time game updates
    // Coordinate between edge instances
    // Only persist to backend periodically
  }
}
```

## Error Handling

- **Validation**: Returns 400 for invalid requests
- **Backend Errors**: Forwards backend errors with 500 status
- **Timeouts**: Configurable timeout (default 5s)
- **Logging**: Structured console logs for debugging

## Monitoring

The edge gateway logs:
- `[EDGE] Starting game for user X, routing to region Y`
- `[EDGE] Game started: gameId in region Y`
- `[EDGE] Exiting game X in region Y`
- `[EDGE] Error starting game: ...`

Use Cloudflare Workers Analytics to monitor:
- Request count
- Error rate
- Response times
- Cache hit rate (future)

## Testing

### Local Testing

```bash
# Start local backend instances
# Then test edge gateway:
curl -X POST http://localhost:8787/edge/game/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "preferredRegion": "eu"}'
```

### Integration Testing

Test with actual Cloudflare Workers deployment:

```bash
# Deploy to staging
wrangler deploy --env staging

# Test endpoints
curl -X POST https://your-worker.your-subdomain.workers.dev/edge/game/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123"}'
```

## Notes

- **Field Names**: The code assumes backend uses `userId`/`gameId`. Adjust `backend-client.ts` if your backend uses `user_id`/`game_id`.
- **CORS**: Currently allows all origins. Adjust in `handlers.ts` for production.
- **Distributed State**: Current cache is per-instance. For distributed caching, use Cloudflare KV or Durable Objects.

