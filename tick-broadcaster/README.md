# Tick Broadcaster - AWS Lambda Microbackend

> [🇷🇺 Русская версия](README.ru.md)

## Overview

The Tick Broadcaster is an AWS Lambda microbackend that runs closest to players to minimize latency. Instead of clients computing game ticks locally, this service:

1. **Runs in multiple AWS regions** (EU, US, Asia, etc.)
2. **Broadcasts game ticks** via WebSocket to all connected players
3. **Measures player latency** and enforces thresholds
4. **Kicks players** with poor connection quality

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tick Broadcaster                         │
│                    (AWS Lambda per region)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  us-east-1  │    │  eu-west-1  │    │ ap-northeast-1│         │
│  │   Lambda    │    │   Lambda    │    │    Lambda    │          │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘          │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌─────────────────────────────────────────────────────┐        │
│  │            API Gateway WebSocket API                │        │
│  │  - $connect: Player connects                        │        │
│  │  - $disconnect: Player disconnects                  │        │
│  │  - join: Player joins session                       │        │
│  │  - ping: Latency measurement                        │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │                    DynamoDB                          │        │
│  │  - Sessions: Game session configuration             │        │
│  │  - Connections: Player connections + latency        │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

        ▲               ▲               ▲
        │               │               │
   WebSocket       WebSocket       WebSocket
        │               │               │
   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
   │ Player  │    │ Player  │    │ Player  │
   │   US    │    │   EU    │    │  Asia   │
   └─────────┘    └─────────┘    └─────────┘
```

## Latency Thresholds

The system enforces latency thresholds to ensure fair gameplay:

| Threshold | Default | Description |
|-----------|---------|-------------|
| `MAX_LATENCY_MS` | 150ms | Maximum average latency before kick |
| `MAX_JITTER_MS` | 50ms | Maximum jitter (std dev) before kick |
| `WARNING_LATENCY_MS` | 100ms | Latency threshold for warning |
| `WARNING_JITTER_MS` | 30ms | Jitter threshold for warning |
| `LATENCY_SAMPLES` | 5 | Number of samples for averaging |

### How It Works

1. **Ping/Pong**: Clients send `ping` messages with their timestamp
2. **RTT Calculation**: Server calculates round-trip time
3. **Rolling Average**: Last N samples are averaged
4. **Jitter Calculation**: Standard deviation of samples
5. **Threshold Check**: If exceeded, player is warned or kicked

### Player States

```
connecting → ready → playing → kicked/disconnected
                ↑       │
                └───────┘ (if latency improves)
```

## Message Types

### Client → Server

```typescript
// Join a game session
{ "action": "join", "sessionId": "abc-123", "userId": "user_123" }

// Ping for latency measurement
{ "action": "ping", "clientTimestamp": 1703123456789 }
```

### Server → Client

```typescript
// Session joined confirmation
{
  "type": "session_joined",
  "sessionId": "abc-123",
  "seed": 987654321,
  "startAt": 1703123456789,
  "tickMs": 100,
  "region": "eu-west-1",
  "wsEndpoint": "wss://xxx.execute-api.eu-west-1.amazonaws.com/prod"
}

// Countdown before game starts
{
  "type": "countdown",
  "remainingMs": 2500,
  "startAt": 1703123456789
}

// Game tick (broadcast every tickMs)
{
  "type": "tick",
  "step": 150,
  "value": 42,
  "round": 2,
  "broken": false,
  "serverTimestamp": 1703123456789
}

// Pong response for latency measurement
{
  "type": "pong",
  "clientTimestamp": 1703123456789,
  "serverTimestamp": 1703123456800
}

// Latency warning
{
  "type": "latency_status",
  "avgLatency": 120,
  "jitter": 35,
  "status": "warning",
  "message": "High latency detected"
}

// Player kicked
{
  "type": "kicked",
  "reason": "Average latency 180ms exceeds maximum 150ms",
  "avgLatency": 180,
  "jitter": 45,
  "maxLatency": 150,
  "maxJitter": 50
}
```

## Deployment

### Prerequisites

- AWS CLI configured
- Node.js 18+
- Serverless Framework 3.x

### Deploy to All Regions

```bash
npm install
npm run build
npm run deploy:all
```

### Deploy to Specific Region

```bash
npm run deploy:eu    # EU (Ireland)
npm run deploy:us    # US East (N. Virginia)
npm run deploy:asia  # Asia (Tokyo)
```

### Environment Variables

```yaml
MAX_LATENCY_MS: 150          # Maximum allowed latency
MAX_JITTER_MS: 50            # Maximum allowed jitter
WARNING_LATENCY_MS: 100      # Warning threshold
WARNING_JITTER_MS: 30        # Warning jitter threshold
LATENCY_SAMPLES: 5           # Samples for averaging
DEFAULT_TICK_MS: 100         # Default tick interval
COUNTDOWN_MS: 3000           # Countdown before start
```

## Local Development

```bash
npm install
npm run build
npm run local
```

This starts serverless-offline for local testing.

## Why Lambda for Tick Broadcasting?

### Pros

1. **Geographic Distribution**: Deploy to 20+ AWS regions worldwide
2. **Auto-scaling**: Handles spikes in player connections
3. **Cost-effective**: Pay only for compute time used
4. **Low Latency**: Lambda@Edge runs close to players

### Cons

1. **Cold Starts**: Initial connection may have ~100ms delay
2. **WebSocket Limits**: API Gateway WebSocket has limits
3. **Tick Precision**: Sub-100ms ticks may have jitter

### Mitigations

- **Provisioned Concurrency**: Eliminates cold starts
- **Internal Tick Loop**: 25-second Lambda with internal loop
- **Latency Thresholds**: Only accept low-latency players

