# Distributed Game Backend

> [🇷🇺 Русская версия](README.ru.md)

A production-style Go backend for a geographically distributed game system with a main server and regional instances, using **Apache Cassandra** for highly scalable, distributed session storage.

## Architecture

The system consists of:
- **Main Server**: Central instance that maintains a registry of regional servers and can proxy requests
- **Regional Servers**: Instances in different regions (EU, US, Asia, etc.) that handle game sessions locally

### Project Structure

```
.
├── cmd/
│   └── server/          # Main application entrypoint
├── internal/
│   ├── api/             # HTTP handlers and middleware
│   ├── config/          # Configuration management
│   ├── models/          # Data structures
│   ├── service/         # Business logic (game, region)
│   └── storage/         # Storage layer
│       ├── cassandra/   # Cassandra client and repository
│       └── memory.go    # In-memory storage (for regions)
├── pkg/
│   └── logger/          # Structured logging
└── go.mod
```

## Features

- **Game Session Management**: Start and exit game sessions
- **Distributed Storage**: Apache Cassandra for highly scalable, distributed session storage
- **Geographic Distribution**: Support for multiple regional instances
- **Region Registration**: Automatic heartbeat/registration with main server
- **Request Proxying**: Main server can proxy requests to regional instances
- **Structured Logging**: Request ID tracking and structured logs
- **Health Checks**: `/health` endpoint for monitoring
- **Context-Aware Operations**: All database operations support context for timeouts and cancellation

## Configuration

The application is configured via environment variables:

### Server Configuration
- `HOST` - Server host (default: `0.0.0.0`)
- `PORT` - Server port (default: `8080`)
- `REGION` - Region identifier (e.g., `eu`, `us`, `asia`)
- `IS_MAIN` - Whether this is the main server (`true`/`false`)
- `MAIN_SERVER_URL` - URL of the main server (required if `IS_MAIN=false`)
- `REGISTER_INTERVAL_SECONDS` - Heartbeat interval in seconds (default: `30`)

### Cassandra Configuration
- `CASSANDRA_HOSTS` - Comma-separated list of Cassandra hosts (default: `localhost:9042`)
- `CASSANDRA_KEYSPACE` - Keyspace name (default: `game_backend`)
- `CASSANDRA_USERNAME` - Username for authentication (optional)
- `CASSANDRA_PASSWORD` - Password for authentication (optional)
- `CASSANDRA_CONSISTENCY` - Consistency level: `ONE`, `QUORUM`, `ALL`, etc. (default: `QUORUM`)
- `CASSANDRA_TIMEOUT_SECONDS` - Query timeout in seconds (default: `5`)

## Running Locally

### Prerequisites

1. **Cassandra must be running** before starting the application. The app will fail to start if it cannot connect to Cassandra.

2. **Start Cassandra locally** (using Docker):
```bash
docker run -d --name cassandra -p 9042:9042 cassandra:4.1
```

Or use the provided `docker-compose.yml` which includes Cassandra.

### Single Instance (Main Server)

```bash
export HOST=0.0.0.0
export PORT=8080
export REGION=main
export IS_MAIN=true
export CASSANDRA_HOSTS=localhost:9042
export CASSANDRA_KEYSPACE=game_backend

go run cmd/server/main.go
```

**Note**: The application automatically creates the keyspace and table schema on startup if they don't exist.

### Regional Instance

```bash
export HOST=0.0.0.0
export PORT=8081
export REGION=eu
export IS_MAIN=false
export MAIN_SERVER_URL=http://localhost:8080
export CASSANDRA_HOSTS=localhost:9042
export CASSANDRA_KEYSPACE=game_backend

go run cmd/server/main.go
```

## Running with Docker Compose

A `docker-compose.yml` file is provided to run the complete stack:

```bash
docker-compose up
```

This starts:
- **Cassandra** on port `9042` (CQL) and ports `7000-7001` (inter-node communication)
- **Main server** on port `8080`
- **EU regional server** on port `8081`
- **US regional server** on port `8082`

All services are automatically configured to connect to the shared Cassandra instance. The schema (keyspace and tables) is automatically created on first startup.

### Verifying Cassandra

You can connect to Cassandra using `cqlsh`:

```bash
docker exec -it game-cassandra cqlsh
```

Then query the sessions:

```sql
USE game_backend;
SELECT * FROM sessions;
```

## API Endpoints

### Health Check

```bash
curl http://localhost:8080/health
```

Response:
```json
{"status":"ok"}
```

### Start Game

```bash
curl -X POST http://localhost:8080/game/start \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user123"}'
```

Response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123",
  "region": "eu",
  "started_at": "2024-01-15T10:30:00Z",
  "status": "active"
}
```

Optional: Specify preferred region:
```bash
curl -X POST http://localhost:8080/game/start \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user123", "region": "us"}'
```

### Exit Game

```bash
curl -X POST http://localhost:8080/game/exit \
  -H "Content-Type: application/json" \
  -d '{"session_id": "550e8400-e29b-41d4-a716-446655440000"}'
```

Response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123",
  "exited_at": "2024-01-15T10:35:00Z",
  "status": "exited"
}
```

### Verifying Data in Cassandra

After creating a session, you can verify it's stored in Cassandra:

```bash
# Connect to Cassandra container
docker exec -it game-cassandra cqlsh

# Query all sessions
USE game_backend;
SELECT * FROM sessions;

# Query sessions for a specific user
SELECT * FROM sessions WHERE user_id = 'user123';
```

### Region Registration (Main Server Only)

```bash
curl -X POST http://localhost:8080/api/regions/register \
  -H "Content-Type: application/json" \
  -d '{"region": "asia", "base_url": "http://localhost:8083"}'
```

## Testing

Run unit tests:

```bash
go test ./internal/service/...
```

Run all tests with coverage:

```bash
go test -v -cover ./...
```

## Development

### Code Style

The code follows Go standard formatting. Run:

```bash
go fmt ./...
```

### Building

Build the binary:

```bash
go build -o bin/server cmd/server/main.go
```

Run the binary:

```bash
./bin/server
```

## Design Decisions

### Framework Choice: Chi Router

We chose **chi** over other options because:
- **Lightweight**: Minimal dependencies, built on `net/http`
- **Production-ready**: Used by many production systems
- **Middleware support**: Excellent middleware ecosystem
- **Standard library**: Doesn't abstract away `net/http`, making it easy to understand

Alternatives considered:
- **Gin**: More features but heavier, more opinionated
- **net/http only**: More verbose, less convenient routing
- **Echo**: Similar to Gin, slightly different API

### Storage: Apache Cassandra

We use **Apache Cassandra** for session storage because:

#### Why Cassandra?

1. **Horizontal Scalability**: Add nodes without downtime, scales linearly
2. **High Write Performance**: Optimized for write-heavy workloads (perfect for game sessions)
3. **High Availability**: Multi-region replication, no single point of failure
4. **Low Latency**: Designed for real-time applications
5. **Distributed by Design**: Built for geographically distributed systems

#### Schema Design

The Cassandra schema is automatically created on startup. Here's the CQL schema:

```sql
-- Keyspace
CREATE KEYSPACE IF NOT EXISTS game_backend
WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1
};

USE game_backend;

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id text PRIMARY KEY,
    user_id text,
    region text,
    started_at timestamp,
    status text
);

-- Secondary index for user-based queries
CREATE INDEX IF NOT EXISTS ON sessions (user_id);
```

**Schema Notes**:
- **Primary Key**: `session_id` for fast lookups by session ID
- **Secondary Index**: `user_id` for efficient queries by user (used to check for active sessions)
- **Replication**: Uses `SimpleStrategy` with replication factor 1 for local development
  - In production, use `NetworkTopologyStrategy` with appropriate replication factors per datacenter

#### Alternative Schema (Production)

For production with better distribution, consider:

```sql
CREATE TABLE sessions (
    region text,
    user_id text,
    session_id text,
    started_at timestamp,
    status text,
    PRIMARY KEY ((region, user_id), session_id)
) WITH CLUSTERING ORDER BY (session_id DESC);
```

This would partition by region and user, but requires changes to query patterns.

#### Verifying Data in Cassandra

After starting a game session, verify it's stored:

```bash
# Connect to Cassandra
docker exec -it game-cassandra cqlsh

# Query sessions
USE game_backend;
SELECT * FROM sessions;

# Query by user
SELECT * FROM sessions WHERE user_id = 'user123';
```

### Region Selection: Simple Round-Robin

The current implementation uses a simple round-robin approach:
- If a preferred region is specified and available, use it
- Otherwise, select the first non-main region
- Easy to extend with:
  - Latency-based selection
  - Load-based selection
  - Geographic proximity
  - User preference history

## Future Enhancements

- [x] Persistent storage (Cassandra) ✅
- [ ] Advanced region selection (latency, load balancing)
- [ ] Session migration between regions
- [ ] Metrics and observability (Prometheus, OpenTelemetry)
- [ ] Authentication and authorization
- [ ] Rate limiting
- [ ] WebSocket support for real-time game updates
- [ ] Distributed tracing

## License

MIT

