/**
 * Types for tick-broadcaster Lambda microbackend
 */

// Session stored in DynamoDB
export interface GameSession {
  sessionId: string;
  seed: number;
  startAt: number; // Unix timestamp ms
  tickMs: number;
  status: 'waiting' | 'running' | 'stopped';
  region: string;
  createdAt: number;
  ttl: number; // DynamoDB TTL
  
  // Tick state (computed but cached for efficiency)
  currentStep: number;
  currentValue: number;
  currentRound: number;
}

// Connection stored in DynamoDB
export interface PlayerConnection {
  connectionId: string;
  sessionId: string;
  userId: string;
  region: string;
  joinedAt: number;
  ttl: number;
  
  // Latency tracking
  latencyHistory: number[]; // Last N latency samples
  avgLatency: number;
  jitter: number; // Standard deviation of latency
  lastPingAt: number;
  lastPongAt: number;
  
  // Status
  status: 'connecting' | 'ready' | 'playing' | 'kicked' | 'disconnected';
  kickReason?: string;
}

// WebSocket message types (client -> server)
export interface JoinSessionMessage {
  action: 'join';
  sessionId: string;
  userId: string;
}

export interface PingMessage {
  action: 'ping';
  clientTimestamp: number;
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

export interface CountdownMessage {
  type: 'countdown';
  remainingMs: number;
  startAt: number;
}

// Latency thresholds configuration
export interface LatencyThresholds {
  maxLatencyMs: number; // Max allowed average latency
  maxJitterMs: number; // Max allowed jitter (standard deviation)
  warningLatencyMs: number; // Threshold for warning
  warningJitterMs: number;
  sampleCount: number; // Number of samples for averaging
  measurementIntervalMs: number; // How often to measure
}

// HTTP API types
export interface CreateSessionRequest {
  userId: string;
  preferredRegion?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  region: string;
  wsEndpoint: string;
  httpEndpoint: string;
}

export interface GetSessionResponse {
  sessionId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  status: string;
  region: string;
  playerCount: number;
  wsEndpoint: string;
}

// AWS regions mapping
export type AWSRegion = 
  | 'us-east-1' 
  | 'us-west-2' 
  | 'eu-west-1' 
  | 'eu-central-1'
  | 'ap-northeast-1' 
  | 'ap-southeast-1'
  | 'ap-south-1'
  | 'sa-east-1';

export interface RegionEndpoint {
  region: AWSRegion;
  wsEndpoint: string;
  httpEndpoint: string;
  displayName: string;
}

