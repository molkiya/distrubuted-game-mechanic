# Architecture Documentation

## Overview

This service implements a **deterministic real-time session engine** that enables clients to independently compute synchronized game states without continuous backend communication.

## Core Concept: Deterministic Engine

### The Engine Function

The heart of the system is a pure function:

```go
func StateAt(seed int64, startAt time.Time, tickMs int64, now time.Time) State
```

**Inputs:**
- `seed`: Base seed value that determines the break pattern
- `startAt`: When the session started (synchronized across all clients)
- `tickMs`: Tick interval in milliseconds
- `now`: Current time to compute state for

**Output:**
- `State` with:
  - `Step`: Number of ticks since start
  - `Value`: Current counter value (resets on break)
  - `Round`: Round number (increments after each break)
  - `Broken`: Whether the sequence just broke

### Determinism Guarantee

**Key Property**: Given the same `(seed, startAt, tickMs, now)`, the function **always** produces the same `State`.

This means:
- All clients with the same session parameters see identical states
- No network communication needed for state synchronization
- State can be computed at any time, past or future

### Algorithm

1. **Step Calculation**:
   ```
   step = floor((now - startAt) / tickMs)
   ```
   If `now < startAt`, step = 0 (before start).

2. **Break Pattern**:
   - Uses xorshift64 PRNG for deterministic randomness
   - Break interval: 100-300 steps (deterministic per round)
   - Interval derived from `(seed, round)` → same interval for same inputs

3. **State Simulation**:
   - Simulates from step 0 to current step
   - Tracks value increments and breaks
   - On break: `Round++`, `Value = 0`, `Broken = true`
   - After break: value increments again

### Example

```
Session: seed=12345, startAt=10:00:00, tickMs=100

Time: 10:00:00.000 → Step: 0,  Value: 1,  Round: 0, Broken: false
Time: 10:00:00.100 → Step: 1,  Value: 2,  Round: 0, Broken: false
Time: 10:00:00.200 → Step: 2,  Value: 3,  Round: 0, Broken: false
...
Time: 10:00:15.000 → Step: 150, Value: 0, Round: 1, Broken: true  (break occurred)
Time: 10:00:15.100 → Step: 151, Value: 1, Round: 1, Broken: false
```

All clients with the same seed see the break at step 150, regardless of location or latency.

## Why This Design is Scalable

### 1. No State Streaming Required

**Traditional Approach:**
- Backend streams every state update to clients
- 10,000 sessions × 10 ticks/second = 100,000 messages/second
- Requires WebSocket/SSE connections
- High bandwidth and backend load

**This Design:**
- Backend only stores session configuration (seed, startAt, tickMs)
- Clients compute state independently
- **Zero** real-time backend communication for state updates
- Backend load reduced by orders of magnitude

### 2. Edge/Node Independence

**Any edge node or client can reconstruct the same state:**

```
Edge Node A (EU):
  state = StateAt(seed, startAt, tickMs, now)
  → Same state as any other node

Edge Node B (US):
  state = StateAt(seed, startAt, tickMs, now)
  → Same state as Node A

Client (Browser):
  state = StateAt(seed, startAt, tickMs, now)
  → Same state as all nodes
```

**Benefits:**
- No central state server required
- Edge nodes can serve state computation
- Clients work offline (once they have session config)
- Geographic distribution doesn't affect synchronization

### 3. Storage Efficiency

**What We Store:**
- Session ID
- Seed (UUID or uint64)
- Start time
- Tick interval
- Metadata (optional)
- Status (running/stopped)

**What We Don't Store:**
- ❌ Every state update
- ❌ Timeline of values
- ❌ Break events
- ❌ Real-time state snapshots

**Storage Requirements:**
- Per session: ~200 bytes (vs. potentially MBs for state timelines)
- Scales linearly with number of sessions
- No time-series data growth

### 4. Horizontal Scalability

**Backend Services:**
- Stateless HTTP services
- Can scale horizontally (add more instances)
- No shared state between instances
- Load balancer distributes requests

**Storage:**
- Redis (current): Fast, simple, TTL support
- Cassandra (future): Distributed, replicated, high write throughput
- Interface abstraction allows swapping implementations

**Edge Layer:**
- Can run at CDN edge (Cloudflare Workers, etc.)
- No backend dependency for state computation
- Reduces latency and backend load

## Architecture Layers

```
┌─────────────────────────────────────────┐
│         Client Layer                   │
│  - Computes state using engine.StateAt │
│  - No backend calls for state updates   │
└─────────────────────────────────────────┘
                  ↑
                  │ (session config)
                  │
┌─────────────────────────────────────────┐
│         API Layer                       │
│  - POST /v1/sessions (create)           │
│  - GET /v1/sessions/{id} (get config)  │
│  - POST /v1/sessions/{id}/stop          │
└─────────────────────────────────────────┘
                  ↑
                  │
┌─────────────────────────────────────────┐
│         Storage Layer                   │
│  - Redis: session configuration only   │
│  - Interface allows swapping backends  │
└─────────────────────────────────────────┘
```

## Deterministic Engine Details

### Pseudo-Random Number Generation

Uses **xorshift64** for deterministic randomness:

```go
func xorshift64(state uint64) uint64 {
    state ^= state << 13
    state ^= state >> 7
    state ^= state << 17
    return state
}
```

**Properties:**
- Fast: O(1) computation
- Deterministic: same input → same output
- Good statistical properties
- No external dependencies

### Break Interval Calculation

```go
func computeBreakInterval(seed int64, round int64) int64 {
    combined := seed ^ round
    rng := xorshift64(uint64(combined))
    interval := 100 + int64(rng % 201)  // Range: [100, 300]
    return interval
}
```

**Determinism:**
- Same `(seed, round)` → same interval
- Different rounds → different intervals (within 100-300 range)
- Creates pseudo-random but reproducible break pattern

### State Computation Flow

```
Input: (seed, startAt, tickMs, now)
  ↓
Calculate: step = floor((now - startAt) / tickMs)
  ↓
Simulate from step 0 to step:
  - Track value increments
  - Check for breaks (based on interval)
  - On break: reset value, increment round
  ↓
Output: State{Step, Value, Round, Broken}
```

## Extensibility

### Adding New Deterministic Patterns

The engine can be extended with new patterns:

```go
// Example: Different break probability
func StateAtWithProbability(seed int64, startAt time.Time, tickMs int64, now time.Time, breakProb float64) State {
    // Custom break logic
}
```

### Storage Backend Swapping

The `Store` interface allows easy swapping:

```go
// Current: Redis
store := store.NewRedisStore(ttl)

// Future: Cassandra
store := store.NewCassandraStore(config)

// Future: PostgreSQL
store := store.NewPostgresStore(config)
```

No changes needed to handlers or business logic.

### Edge Deployment

The deterministic engine can run at the edge:

```typescript
// Cloudflare Worker example
import { StateAt } from './engine';

const state = StateAt(seed, startAt, tickMs, Date.now());
// No backend call needed
```

## Performance Characteristics

### Computation Complexity

- **StateAt**: O(step) - simulates from 0 to current step
- **Optimization**: For large steps, could use mathematical formula instead of simulation
- **Typical use case**: Steps < 10,000 → < 1ms computation time

### Storage Complexity

- **Create**: O(1) - single Redis SET
- **Get**: O(1) - single Redis GET
- **Update**: O(1) - single Redis SET
- **Space**: O(n) where n = number of sessions

### Scalability Limits

- **Sessions**: Limited by storage capacity (Redis/Cassandra)
- **State computation**: Limited by CPU (but clients compute, not backend)
- **API requests**: Limited by HTTP server capacity (can scale horizontally)

## Future Enhancements

1. **Optimized State Computation**: For very large steps, use mathematical formula instead of simulation
2. **Caching**: Cache computed states at edge (with TTL)
3. **Analytics**: Log break events for pattern analysis
4. **Multi-Pattern Support**: Different deterministic patterns per session type
5. **State History**: Optional storage of state snapshots for replay/debugging

## Conclusion

This architecture achieves scalability through:

1. **Deterministic computation**: Clients compute state independently
2. **Minimal storage**: Only session configuration, not state timelines
3. **Edge-friendly**: Can run at CDN edge without backend dependency
4. **Horizontal scaling**: Stateless services + distributed storage

The design separates concerns: backend coordinates and persists, clients compute deterministically, ensuring synchronized behavior globally while minimizing backend load.

