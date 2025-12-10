/**
 * Backend API Client
 * 
 * Handles communication with the Go backend services.
 * This abstraction makes it easy to:
 * - Add retry logic
 * - Add circuit breakers
 * - Add request/response transformation
 * - Mock for testing
 */

import {
  BackendRegion,
  StartGameRequest,
  ExitGameRequest,
  BackendStartGameResponse,
  BackendExitGameResponse,
} from './types';

/**
 * Calls the Go backend /game/start endpoint
 */
export async function callBackendStartGame(
  region: BackendRegion,
  request: StartGameRequest,
  timeout: number
): Promise<BackendStartGameResponse> {
  const url = `${region.baseUrl}/game/start`;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: request.userId,
        // Note: Backend might expect user_id instead of userId
        // Adjust based on your actual backend API
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Backend ${region.id} returned ${response.status}: ${errorText || 'Unknown error'}`
      );
    }

    const data = await response.json();
    
    // Transform backend response to match our expected format
    // Adjust field names based on your actual backend response
    return {
      gameId: data.game_id || data.gameId,
      seed: data.seed,
      startAt: data.start_at || data.startAt,
      tickMs: data.tick_ms || data.tickMs,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Backend ${region.id} request timeout after ${timeout}ms`);
    }
    
    throw error;
  }
}

/**
 * Calls the Go backend /game/exit endpoint
 */
export async function callBackendExitGame(
  region: BackendRegion,
  request: ExitGameRequest,
  timeout: number
): Promise<BackendExitGameResponse> {
  const url = `${region.baseUrl}/game/exit`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameId: request.gameId,
        userId: request.userId,
        // Note: Backend might expect game_id and user_id
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Backend ${region.id} returned ${response.status}: ${errorText || 'Unknown error'}`
      );
    }

    const data = await response.json();
    return {
      ok: data.ok === true,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Backend ${region.id} request timeout after ${timeout}ms`);
    }
    
    throw error;
  }
}

