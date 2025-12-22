# Distributed Game Backend

> [🇷🇺 Русская версия](README.ru.md)

A production-style distributed game system with **AWS Lambda microbackends** for real-time tick broadcasting, **Cloudflare Workers** edge gateway, and **Apache Cassandra/DynamoDB** for storage.

## 🎮 Key Features

- **Real-time Tick Broadcasting**: AWS Lambda microbackends broadcast game ticks to players via WebSocket
- **Multi-region Deployment**: Deploy to 8+ AWS regions for lowest latency
- **Latency Enforcement**: Automatic player kick if latency exceeds thresholds
- **Deterministic Game Engine**: Identical state computation across all regions
- **Edge Gateway**: Cloudflare Workers for intelligent routing
- **Scalable Storage**: DynamoDB for Lambda, Cassandra for main backend

## 📐 Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐
│   Player    │────▶│  Edge GW    │────▶│  Tick Broadcaster       │
│  (Browser)  │     │ (Cloudflare)│     │  (AWS Lambda)           │
└─────────────┘     └─────────────┘     └─────────────────────────┘
      ▲                                           │
      │         WebSocket (ticks every 100ms)     │
      └───────────────────────────────────────────┘
```

**Full architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)

## 📂 Project Structure

```
.
├── tick-broadcaster/       # AWS Lambda microbackend (NEW)
│   ├── src/
│   │   ├── handlers/       # WebSocket, HTTP, tick handlers
│   │   ├── engine.ts       # Deterministic game engine
│   │   └── utils/          # Latency, WebSocket utilities
│   └── serverless.yml      # Serverless Framework config
├── frontend/               # React app with WebSocket client
│   └── src/
│       ├── App.tsx         # Main component
│       └── utils/
│           ├── api.ts      # API client
│           └── websocket.ts # WebSocket client
├── edge/                   # Cloudflare Workers gateway
│   └── src/
│       ├── handlers.ts     # Request handlers
│       └── config.ts       # Region configuration
├── deterministic-backend/  # Go backend (legacy/optional)
├── cmd/server/             # Go main server
└── internal/               # Go internal packages
```

## 🚀 Quick Start

### 1. Deploy Tick Broadcaster (AWS Lambda)

```bash
cd tick-broadcaster
npm install
npm run build

# Deploy to all regions
npm run deploy:all

# Or deploy to specific region
npm run deploy:eu      # EU (Ireland)
npm run deploy:us      # US East (N. Virginia)
npm run deploy:asia    # Asia (Tokyo)
```

### 2. Deploy Edge Gateway (Cloudflare Workers)

```bash
cd edge
npm install

# Update wrangler.toml with tick-broadcaster endpoints
npm run deploy
```

### 3. Run Frontend

```bash
cd frontend
npm install

# Set environment variables
export REACT_APP_TICK_EU_WS=wss://xxx.execute-api.eu-west-1.amazonaws.com/prod
export REACT_APP_TICK_US_WS=wss://xxx.execute-api.us-east-1.amazonaws.com/prod

npm start
```

## ⚡ Latency Thresholds

The system enforces latency thresholds for fair gameplay:

| Threshold | Default | Description |
|-----------|---------|-------------|
| Max Latency | 150ms | Player kicked if RTT exceeds |
| Max Jitter | 50ms | Player kicked if unstable |
| Warning Latency | 100ms | Player warned |
| Warning Jitter | 30ms | Player warned |

## 🌍 Supported Regions

| Region | Location | Endpoint |
|--------|----------|----------|
| us-east-1 | N. Virginia | Americas |
| eu-west-1 | Ireland | Europe |
| ap-northeast-1 | Tokyo | East Asia |
| + 5 more | Global | See docs |

## 🔧 Configuration

### Tick Broadcaster Environment

```yaml
MAX_LATENCY_MS: 150          # Max allowed latency
MAX_JITTER_MS: 50            # Max allowed jitter
WARNING_LATENCY_MS: 100      # Warning threshold
WARNING_JITTER_MS: 30        # Warning jitter
DEFAULT_TICK_MS: 100         # Tick interval
COUNTDOWN_MS: 3000           # Countdown before start
```

### Edge Gateway Environment

```yaml
TICK_EU_HTTP: https://xxx.execute-api.eu-west-1.amazonaws.com/prod
TICK_EU_WS: wss://xxx.execute-api.eu-west-1.amazonaws.com/prod
TICK_US_HTTP: https://xxx.execute-api.us-east-1.amazonaws.com/prod
TICK_US_WS: wss://xxx.execute-api.us-east-1.amazonaws.com/prod
USE_TICK_BROADCASTER: true
```

## 📡 WebSocket Protocol

### Client → Server

```typescript
// Join session
{ "action": "join", "sessionId": "abc-123", "userId": "user_123" }

// Ping for latency measurement
{ "action": "ping", "clientTimestamp": 1703123456789 }
```

### Server → Client

```typescript
// Game tick (broadcast every 100ms)
{
  "type": "tick",
  "step": 150,
  "value": 42,
  "round": 2,
  "broken": false,
  "serverTimestamp": 1703123456789
}

// Player kicked
{
  "type": "kicked",
  "reason": "Average latency 180ms exceeds maximum 150ms",
  "avgLatency": 180,
  "maxLatency": 150
}
```

## 🧪 Testing

```bash
# Test tick broadcaster
cd tick-broadcaster
npm test

# Test Go backend
go test ./internal/service/...

# Test frontend
cd frontend
npm test
```

## 📖 Documentation

- [Full Architecture](ARCHITECTURE.md) - System design with diagrams
- [Tick Broadcaster](tick-broadcaster/README.md) - Lambda microbackend docs
- [Deterministic Backend](deterministic-backend/README.md) - Go backend docs
- [Frontend](frontend/README.md) - React app docs

## 🔄 Migration from Client-Side Ticks

The previous architecture computed ticks client-side. The new architecture:

| Aspect | Old (Client-Side) | New (Server-Side) |
|--------|-------------------|-------------------|
| Tick Location | Browser | AWS Lambda |
| Sync Method | Time-based | WebSocket broadcast |
| Cheating | Possible | Prevented |
| Latency Sensitivity | No | Yes (thresholds) |
| Fair Play | Honor system | Enforced |

## 📈 Future Enhancements

- [ ] Provisioned Concurrency (eliminate cold starts)
- [ ] Global DynamoDB Tables
- [ ] Adaptive Tick Rate
- [ ] Player Grouping by Latency
- [ ] Analytics Pipeline (Kinesis)
- [ ] Game Replay System

## 📜 License

MIT
