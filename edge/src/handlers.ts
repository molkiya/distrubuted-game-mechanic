/**
 * Request Handlers for Edge Gateway
 * 
 * These handlers implement the edge layer's public API:
 * - POST /edge/game/start
 * - POST /edge/game/exit
 * 
 * The edge layer acts as:
 * 1. A smart router that selects the best backend region
 * 2. A caching layer to reduce backend load
 * 3. A foundation for future "microprocess" features (edge-hosted game state)
 */

import {
  StartGameRequest,
  ExitGameRequest,
  EdgeStartGameResponse,
  EdgeExitGameResponse,
  EdgeConfig,
} from './types';
import { RegionSelectionStrategy } from './region-selector';
import { GameSessionCache } from './cache';
import { callBackendStartGame, callBackendExitGame } from './backend-client';

/**
 * Handles POST /edge/game/start
 * 
 * Flow:
 * 1. Parse and validate request
 * 2. Select appropriate backend region
 * 3. Call backend /game/start
 * 4. Cache the response
 * 5. Return response with backendRegion info
 */
export async function handleStartGame(
  request: Request,
  config: EdgeConfig,
  regionSelector: RegionSelectionStrategy,
  cache: GameSessionCache
): Promise<Response> {
  try {
    // Parse request body
    const body: StartGameRequest = await request.json();

    // Validate request
    if (!body.userId || typeof body.userId !== 'string') {
      return jsonResponse(
        { error: 'Invalid request: userId is required' },
        400
      );
    }

    // Select backend region
    const selectedRegion = regionSelector.selectRegion(
      {
        preferredRegion: body.preferredRegion,
        headers: request.headers,
        cf: (request as any).cf, // Cloudflare request context
      },
      config
    );

    console.log(`[EDGE] Starting game for user ${body.userId}, routing to region ${selectedRegion.id}`);

    // Call backend
    const backendResponse = await callBackendStartGame(
      selectedRegion,
      body,
      config.backendTimeout
    );

    // Cache the session for future reference
    // This enables:
    // - Reducing backend load on subsequent requests
    // - Future "microprocess" features where edge manages game state
    cache.set({
      gameId: backendResponse.gameId,
      seed: backendResponse.seed,
      startAt: backendResponse.startAt,
      tickMs: backendResponse.tickMs,
      backendRegion: selectedRegion.id,
      cachedAt: Date.now(),
    });

    // Return response with backend region info
    const edgeResponse: EdgeStartGameResponse = {
      gameId: backendResponse.gameId,
      seed: backendResponse.seed,
      startAt: backendResponse.startAt,
      tickMs: backendResponse.tickMs,
      backendRegion: selectedRegion.id,
    };

    console.log(`[EDGE] Game started: ${backendResponse.gameId} in region ${selectedRegion.id}`);

    return jsonResponse(edgeResponse, 201);
  } catch (error) {
    console.error('[EDGE] Error starting game:', error);
    return jsonResponse(
      {
        error: 'Failed to start game',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * Handles POST /edge/game/exit
 * 
 * Flow:
 * 1. Parse and validate request
 * 2. Determine backend region (from request or cache lookup)
 * 3. Call backend /game/exit
 * 4. Clear cache entry
 * 5. Return response
 */
export async function handleExitGame(
  request: Request,
  config: EdgeConfig,
  cache: GameSessionCache
): Promise<Response> {
  try {
    // Parse request body
    const body: ExitGameRequest = await request.json();

    // Validate request
    if (!body.gameId || !body.userId) {
      return jsonResponse(
        { error: 'Invalid request: gameId and userId are required' },
        400
      );
    }

    // Determine backend region
    let backendRegion: { id: string; baseUrl: string } | null = null;

    // 1. Check if backendRegion is provided in request
    if (body.backendRegion) {
      backendRegion = config.backendRegions.find((r) => r.id === body.backendRegion) || null;
      if (!backendRegion) {
        return jsonResponse(
          { error: `Invalid backendRegion: ${body.backendRegion}` },
          400
        );
      }
    } else {
      // 2. Try to find in cache
      const cached = cache.get(body.gameId);
      if (cached) {
        backendRegion = config.backendRegions.find((r) => r.id === cached.backendRegion) || null;
        console.log(`[EDGE] Found game ${body.gameId} in cache, region: ${cached.backendRegion}`);
      }
    }

    // 3. Fallback: we need backendRegion to route the request
    if (!backendRegion) {
      // In a production system, you might:
      // - Query a central registry
      // - Try all regions (expensive)
      // - Return error asking client to provide backendRegion
      return jsonResponse(
        {
          error: 'backendRegion is required. Please provide it or ensure the game was started through this edge service.',
        },
        400
      );
    }

    console.log(`[EDGE] Exiting game ${body.gameId} in region ${backendRegion.id}`);

    // Call backend
    await callBackendExitGame(backendRegion, body, config.backendTimeout);

    // Clear cache entry
    cache.delete(body.gameId);

    console.log(`[EDGE] Game exited: ${body.gameId}`);

    const response: EdgeExitGameResponse = { ok: true };
    return jsonResponse(response, 200);
  } catch (error) {
    console.error('[EDGE] Error exiting game:', error);
    return jsonResponse(
      {
        error: 'Failed to exit game',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}

/**
 * Helper function to create JSON responses
 */
function jsonResponse(data: any, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Handles OPTIONS requests for CORS preflight
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

