// API request and response types
export interface StartGameRequest {
  userId: string;
  preferredRegion?: string;
}

export interface StartGameResponse {
  gameId: string;
  seed: number;
  startAt: number; // Unix timestamp in milliseconds
  tickMs: number;
  region: string;
  wsEndpoint: string;
  httpEndpoint: string;
}

export interface ExitGameRequest {
  gameId: string;
  userId: string;
}

export interface ExitGameResponse {
  ok: boolean;
}

// Game state types
export interface GameState {
  gameId: string | null;
  userId: string;
  seed: number | null;
  startAt: number | null; // Unix timestamp in milliseconds
  tickMs: number | null;
  counter: number;
  step: number;
  round: number;
  isRunning: boolean;
  countdown: number | null; // Milliseconds until start
  region: string | null;
  wsEndpoint: string | null;
}

// Latency state
export interface LatencyState {
  avgLatency: number;
  jitter: number;
  status: 'ok' | 'warning' | 'critical' | 'unknown';
  message?: string;
  samples: number[];
}

// Connection state
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'joined' | 'kicked' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  kickReason?: string;
}

// WebSocket message types (server -> client)
export interface TickMessage {
  type: 'tick';
  step: number;
  value: number;
  round: number;
  broken: boolean;
  serverTimestamp: number;
}

export interface PongMessage {
  type: 'pong';
  clientTimestamp: number;
  serverTimestamp: number;
}

export interface SessionJoinedMessage {
  type: 'session_joined';
  sessionId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  region: string;
  wsEndpoint: string;
}

export interface CountdownMessage {
  type: 'countdown';
  remainingMs: number;
  startAt: number;
}

export interface LatencyStatusMessage {
  type: 'latency_status';
  avgLatency: number;
  jitter: number;
  status: 'ok' | 'warning' | 'critical';
  message?: string;
}

export interface KickedMessage {
  type: 'kicked';
  reason: string;
  avgLatency: number;
  jitter: number;
  maxLatency: number;
  maxJitter: number;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ServerMessage = 
  | TickMessage 
  | PongMessage 
  | SessionJoinedMessage 
  | CountdownMessage 
  | LatencyStatusMessage 
  | KickedMessage 
  | ErrorMessage;

// Latency thresholds (should match server config)
export const LATENCY_THRESHOLDS = {
  maxLatencyMs: 150,
  maxJitterMs: 50,
  warningLatencyMs: 100,
  warningJitterMs: 30,
};
