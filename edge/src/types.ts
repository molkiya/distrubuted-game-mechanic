/**
 * Type definitions for the edge gateway service
 */

// Backend region configuration
export interface BackendRegion {
  id: string;
  baseUrl: string;
}

// Tick broadcaster region configuration
export interface TickBroadcasterRegion {
  id: string;
  httpEndpoint: string;
  wsEndpoint: string;
  displayName: string;
}

// Request types
export interface StartGameRequest {
  userId: string;
  preferredRegion?: string;
}

export interface ExitGameRequest {
  gameId: string;
  userId: string;
  backendRegion?: string;
}

// Backend API response types (what we receive from Go backend)
export interface BackendStartGameResponse {
  gameId: string;
  seed: number;
  startAt: number;
  tickMs: number;
}

export interface BackendExitGameResponse {
  ok: boolean;
}

// Tick broadcaster response types
export interface TickBroadcasterCreateSessionResponse {
  sessionId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  region: string;
  wsEndpoint: string;
  httpEndpoint: string;
}

// Edge API response types (what we return to frontend)
export interface EdgeStartGameResponse {
  gameId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  backendRegion: string;
  // New fields for tick-broadcaster
  region: string;
  wsEndpoint: string;
  httpEndpoint: string;
}

export interface EdgeExitGameResponse {
  ok: boolean;
}

// Cached game session data
export interface CachedGameSession {
  gameId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  backendRegion: string;
  cachedAt: number; // Timestamp when cached
  // New fields
  wsEndpoint?: string;
  httpEndpoint?: string;
}

// Edge configuration
export interface EdgeConfig {
  backendRegions: BackendRegion[];
  tickBroadcasterRegions: TickBroadcasterRegion[];
  defaultRegion: string;
  backendTimeout: number; // milliseconds
  cacheTTL: number; // milliseconds
  useTickBroadcaster: boolean; // Whether to use tick-broadcaster instead of backend
}

// Latency thresholds (for client reference)
export interface LatencyThresholds {
  maxLatencyMs: number;
  maxJitterMs: number;
  warningLatencyMs: number;
  warningJitterMs: number;
}
