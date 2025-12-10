# Deterministic Real-Time Session Service

> [🇷🇺 Русская версия](README.ru.md)

A production-ready Go HTTP API service that provides deterministic real-time session management. The service enables clients to independently compute synchronized game states using seed-based deterministic algorithms, eliminating the need for continuous backend communication.

## Overview

This service provides:

- **Deterministic Real-Time Engine**: Clients can compute identical game states using seed, start time, and tick interval
- **Session Management API**: RESTful endpoints for creating, retrieving, and stopping sessions
- **Scalable Architecture**: Backend only stores session configuration, not real-time state

## High-Level Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ HTTP
       ↓
┌──────────────────┐
│  Go HTTP API     │
│  (Chi Router)    │
└──────┬───────────┘
       │
       ↓
┌──────────────────┐
│  Redis Store     │
│  (Session Config)│
└──────────────────┘

Client computes state using:
- seed (from session)
- startAt (from session)
- tickMs (from session)
- now (local time)
→ Deterministic State
```

### Components

1. **Go HTTP API**: RESTful service using Chi router
2. **Redis Store**: Session configuration storage (can be swapped for Cassandra/PostgreSQL)
3. **Deterministic Engine**: Pure function that computes state from `(seed, startAt, tickMs, now)`

### Key Design Principle

**Deterministic Synchronization**: Instead of streaming every state update from the backend, the service distributes:
- `seed`: Determines the break pattern
- `startAt`: Synchronized start time
- `tickMs`: Tick interval

Clients independently compute the same state using these parameters, ensuring synchronized behavior across all players globally.

## Quick Start

### Prerequisites

- Go 1.22+
- Redis (or Docker for Redis)

### Running Locally

**Option 1: Using Docker Compose**

```bash
# Start Redis
docker-compose up redis

# In another terminal, run the API
go run ./cmd/api
```

**Option 2: Local Redis**

```bash
# Start Redis locally (if installed)
redis-server

# Run the API
go run ./cmd/api
```

The server will start on `http://localhost:8080` (configurable via `PORT` env var).

### Configuration

Environment variables:

- `PORT` - Server port (default: `8080`)
- `REDIS_ADDR` - Redis address (default: `localhost:6379`)
- `REDIS_PASSWORD` - Redis password (default: empty)
- `REDIS_DB` - Redis database number (default: `0`)

## API Examples

### Create Session

```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "tick_ms": 100,
    "metadata": {"game_type": "counter"}
  }'
```

**Response:**
```json
{
  "id": "sess_abc-123-def",
  "seed": "550e8400-e29b-41d4-a716-446655440000",
  "start_at": "2024-01-15T10:30:03Z",
  "tick_ms": 100,
  "metadata": {"game_type": "counter"},
  "status": "running"
}
```

### Get Session

```bash
curl http://localhost:8080/v1/sessions/sess_abc-123-def
```

**Response:**
```json
{
  "id": "sess_abc-123-def",
  "seed": "550e8400-e29b-41d4-a716-446655440000",
  "start_at": "2024-01-15T10:30:03Z",
  "tick_ms": 100,
  "metadata": {"game_type": "counter"},
  "status": "running"
}
```

### Get Session State

**Option 1: Client-side computation (recommended)**

Get session config and compute state locally:

```bash
# Get session config
curl http://localhost:8080/v1/sessions/sess_abc-123-def

# Use the returned seed, start_at, tick_ms to compute state
# using engine.StateAt(seed, startAt, tickMs, now)
```

**Option 2: Server-side computation**

```bash
curl http://localhost:8080/v1/sessions/sess_abc-123-def/state
```

**Response:**
```json
{
  "step": 42,
  "value": 15,
  "round": 1,
  "broken": false,
  "computed_at": "2024-01-15T10:30:45Z"
}
```

**Note**: The `/v1/sessions/{id}/state` endpoint is documented in the OpenAPI spec but may need to be implemented in the handler.

### Stop Session

```bash
curl -X POST http://localhost:8080/v1/sessions/sess_abc-123-def/stop
```

**Response:**
```json
{
  "id": "sess_abc-123-def",
  "status": "stopped"
}
```

### Health Check

```bash
curl http://localhost:8080/healthz
```

**Response:**
```json
{
  "status": "ok"
}
```

## Project Structure

```
deterministic-backend/
├── cmd/
│   └── api/              # Main server entrypoint
├── internal/
│   ├── engine/           # Deterministic state computation
│   ├── http/             # HTTP handlers and routing
│   ├── store/            # Storage interface + Redis implementation
│   ├── types/             # Shared DTOs and models
│   └── config/            # Configuration management
├── docs/
│   └── openapi.yaml      # OpenAPI 3.0 specification
├── README.md
└── ARCHITECTURE.md
```

## Testing

```bash
# Run all tests
go test ./...

# Run with coverage
go test -cover ./...

# Run specific package tests
go test ./internal/engine/...
go test ./internal/http/...
```

## Building

```bash
# Build binary
go build -o bin/api ./cmd/api

# Run binary
./bin/api
```

## Docker Compose

A `docker-compose.yml` file is provided for local development:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

Run with:
```bash
docker-compose up redis
```

## Deterministic Engine Usage

The engine is a pure function that computes state from session parameters:

```go
import "github.com/distrubuted-game-mechanic/deterministic-backend/internal/engine"

// Get session from API
session := getSessionFromAPI(id)

// Parse seed (convert string to int64)
seed := parseSeed(session.Seed)

// Compute current state
state := engine.StateAt(
    seed,
    session.StartAt,
    int64(session.TickMs),
    time.Now(),
)

// state.Step, state.Value, state.Round, state.Broken
```

## Why This Design?

1. **Scalability**: Backend doesn't need to handle thousands of state updates per second
2. **Latency Independence**: Players see the same pattern despite network latency
3. **Bandwidth Efficiency**: No continuous WebSocket/SSE connections required
4. **Resilience**: Client can continue running even if backend is temporarily unavailable

## License

MIT
