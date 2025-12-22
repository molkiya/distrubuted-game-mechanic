# Architecture Documentation

> [🇷🇺 Русская версия](ARCHITECTURE.ru.md)

## Overview

This service implements a **deterministic real-time session engine** that enables clients to independently compute synchronized game states without continuous backend communication.

> **Note**: This is the legacy backend used for client-side tick computation. For the new architecture with server-side tick broadcasting via AWS Lambda, see the main [ARCHITECTURE.md](../ARCHITECTURE.md).

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

## Relationship with Tick Broadcaster

The deterministic engine in this backend is **the same algorithm** used in the AWS Lambda tick-broadcaster (`/tick-broadcaster/src/engine.ts`):

| Component | Role |
|-----------|------|
| This Backend | Session creation, legacy client-side tick support |
| Tick Broadcaster Lambda | Server-side tick computation and broadcasting |
| Client | Receives ticks from Lambda OR computes locally (legacy) |

Both use the same:
- xorshift64 PRNG algorithm
- Break interval computation
- State simulation logic

This ensures identical behavior regardless of where the computation happens.

## Algorithm

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

## API Endpoints

### POST /v1/sessions
Create a new game session.

### GET /v1/sessions/{id}
Get session configuration.

### POST /v1/sessions/{id}/stop
Stop an active session.

## Storage

**Redis** (current implementation):
- Fast, simple, TTL support
- Session configuration only (no tick history)

**Interface abstraction** allows swapping to:
- Cassandra (for distributed, replicated storage)
- DynamoDB (for AWS Lambda integration)
- PostgreSQL

## When to Use This Backend

Use this backend when:
- Supporting legacy clients that compute ticks locally
- You need a lightweight session management service
- Running in environments without AWS Lambda

Use the **Tick Broadcaster Lambda** instead when:
- You need server-authoritative game state
- Players require synchronized tick reception
- You want to enforce latency thresholds

## See Also

- [Main Architecture](../ARCHITECTURE.md) - Full system architecture with Lambda tick broadcasting
- [Tick Broadcaster](../tick-broadcaster/README.md) - AWS Lambda microbackend documentation
