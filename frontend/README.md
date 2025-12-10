# Deterministic Game Counter - React Frontend

A minimal React + TypeScript frontend that demonstrates deterministic game logic with a counter that increments and randomly breaks based on server-provided seed and timing.

## Features

- **Deterministic Counter**: Counter behavior is reproducible across all clients using the same seed and timing
- **Countdown Timer**: Shows countdown until game start (based on `startAt` from server)
- **Automatic Breaks**: Counter resets based on deterministic pseudo-random number generation
- **Real-time Updates**: Counter updates every `tickMs` milliseconds
- **Console Logging**: Debug information logged to console for monitoring

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx           # Main component with game logic
│   ├── App.css           # Styles
│   ├── index.tsx         # Entry point
│   ├── index.css         # Global styles
│   ├── types.ts          # TypeScript type definitions
│   └── utils/
│       ├── api.ts        # API client functions
│       └── rng.ts         # Deterministic RNG implementation
├── public/
│   └── index.html        # HTML template
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

### Prerequisites

- Node.js 16+ and npm/yarn
- Backend server running on `http://localhost:8080` (or configure via `.env`)

### Installation

```bash
cd frontend
npm install
```

### Configuration

Create a `.env` file (or copy from `.env.example`):

```bash
REACT_APP_API_URL=http://localhost:8080
```

### Running

```bash
npm start
```

The app will open at `http://localhost:3000`.

## How Determinism Works

### Key Concepts

1. **Seed**: Provided by the server, ensures all clients start with the same base value
2. **Step Index**: Calculated as `floor((currentTime - startAt) / tickMs)`
   - Represents how many ticks have elapsed since game start
   - Same time = same step across all clients
3. **Deterministic RNG**: Linear Congruential Generator (LCG) that takes `(seed, step)` and returns the same value for the same inputs

### Deterministic Flow

```
Server provides: { seed, startAt, tickMs }
                ↓
Client calculates: step = floor((now - startAt) / tickMs)
                ↓
Client computes: rngValue = deterministicRNG(seed, step)
                ↓
Client decides: shouldBreak = (rngValue % 50 === 0)
                ↓
Same (seed, step) → Same rngValue → Same break decision
```

### Example

Given:
- `seed = 987654321`
- `startAt = 1733850000000`
- `tickMs = 100`

At time `1733850000100` (100ms after start):
- `step = floor((1733850000100 - 1733850000000) / 100) = 1`
- `rngValue = deterministicRNG(987654321, 1)`
- All clients with the same seed will get the same `rngValue` and make the same break decision

## API Integration

### Start Game

```typescript
POST /game/start
Request: { "userId": "user123" }
Response: {
  "gameId": "abc123",
  "seed": 987654321,
  "startAt": 1733850000000,
  "tickMs": 100
}
```

### Exit Game

```typescript
POST /game/exit
Request: { "gameId": "abc123", "userId": "user123" }
Response: { "ok": true }
```

## Console Logging

The app logs important events to the console:

- `[API] Starting game for user: ...` - When API call is made
- `[GAME START] Counter started` - When countdown ends and counter begins
- `[BREAK] Step: X, RNG: Y, Counter reset to 0` - When counter breaks
- `[TICK] Step: X, RNG: Y, Counter: Z` - Every 10th step (for debugging)

## Customization

### Break Probability

Change the break probability in `App.tsx`:

```typescript
if (shouldBreak(prev.seed, step, 50)) { // 1 in 50 chance
```

### RNG Algorithm

Modify `src/utils/rng.ts` to use a different deterministic RNG algorithm if needed.

### Styling

Modify `src/App.css` to customize the appearance.

## Development

### Building for Production

```bash
npm run build
```

### Type Checking

TypeScript is configured with strict mode. Run:

```bash
npx tsc --noEmit
```

## Notes

- The counter uses `Date.now()` for timing, which relies on the client's system clock
- For true synchronization, consider using server time synchronization
- The deterministic RNG ensures same behavior given same inputs, but timing differences between clients may cause slight step index differences
- All randomness is deterministic and reproducible

