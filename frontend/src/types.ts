// API request and response types
export interface StartGameRequest {
  userId: string;
}

export interface StartGameResponse {
  gameId: string;
  seed: number;
  startAt: number; // Unix timestamp in milliseconds
  tickMs: number;
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
  isRunning: boolean;
  countdown: number | null; // Milliseconds until start
}

