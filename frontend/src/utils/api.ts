import { StartGameRequest, StartGameResponse, ExitGameRequest, ExitGameResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

/**
 * Starts a new game session
 */
export async function startGame(request: StartGameRequest): Promise<StartGameResponse> {
  const response = await fetch(`${API_BASE_URL}/game/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to start game' }));
    throw new Error(error.error || `HTTP ${response.status}: Failed to start game`);
  }

  return response.json();
}

/**
 * Exits a game session
 */
export async function exitGame(request: ExitGameRequest): Promise<ExitGameResponse> {
  const response = await fetch(`${API_BASE_URL}/game/exit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to exit game' }));
    throw new Error(error.error || `HTTP ${response.status}: Failed to exit game`);
  }

  return response.json();
}

