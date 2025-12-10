/**
 * Type definitions for the edge gateway service
 */

// Backend region configuration
export interface BackendRegion {
  id: string;
  baseUrl: string;
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

// Edge API response types (what we return to frontend)
export interface EdgeStartGameResponse {
  gameId: string;
  seed: number;
  startAt: number;
  tickMs: number;
  backendRegion: string;
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
}

// Edge configuration
export interface EdgeConfig {
  backendRegions: BackendRegion[];
  defaultRegion: string;
  backendTimeout: number; // milliseconds
  cacheTTL: number; // milliseconds
}

