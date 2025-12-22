/**
 * Request Handlers for Edge Gateway
 * 
 * These handlers implement the edge layer's public API:
 * - POST /edge/game/start - Creates game session via tick-broadcaster
 * - POST /edge/game/exit - Exits game session
 * 
 * The edge layer now routes to tick-broadcaster Lambda for real-time tick streaming.
 */

import {
  StartGameRequest,
  ExitGameRequest,
  EdgeStartGameResponse,
  EdgeExitGameResponse,
  EdgeConfig,
  TickBroadcasterCreateSessionResponse,
} from './types';
import { RegionSelectionStrategy } from './region-selector';
import { GameSessionCache } from './cache';
import { callBackendStartGame, callBackendExitGame } from './backend-client';
import { mapToAWSRegion, getLatencyThresholds } from './config';

/**
 * Handles POST /edge/game/start
 * 
 * Flow:
 * 1. Parse and validate request
 * 2. Select appropriate tick-broadcaster region
 * 3. Call tick-broadcaster to create session
 * 4. Cache the response
 * 5. Return response with WebSocket endpoint
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

    // Map preferred region to AWS region
    const preferredAWSRegion = body.preferredRegion 
      ? mapToAWSRegion(body.preferredRegion) 
      : undefined;

    // Select tick-broadcaster region
    const selectedRegion = selectTickBroadcasterRegion(
      request,
      config,
      preferredAWSRegion
    );

    console.log(`[EDGE] Starting game for user ${body.userId}, routing to tick-broadcaster ${selectedRegion.id}`);

    // Call tick-broadcaster to create session
    const tickResponse = await createTickBroadcasterSession(
      selectedRegion.httpEndpoint,
      body,
      config.backendTimeout
    );

    // Cache the session for future reference
    cache.set({
      gameId: tickResponse.sessionId,
      seed: tickResponse.seed,
      startAt: tickResponse.startAt,
      tickMs: tickResponse.tickMs,
      backendRegion: selectedRegion.id,
      cachedAt: Date.now(),
      wsEndpoint: tickResponse.wsEndpoint,
      httpEndpoint: tickResponse.httpEndpoint,
    });

    // Return response with WebSocket endpoint
    const edgeResponse: EdgeStartGameResponse = {
      gameId: tickResponse.sessionId,
      seed: tickResponse.seed,
      startAt: tickResponse.startAt,
      tickMs: tickResponse.tickMs,
      backendRegion: selectedRegion.id,
      region: selectedRegion.id,
      wsEndpoint: tickResponse.wsEndpoint,
      httpEndpoint: tickResponse.httpEndpoint,
    };

    console.log(`[EDGE] Game started: ${tickResponse.sessionId} in region ${selectedRegion.id}`);

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
 * Select the best tick-broadcaster region based on request context
 */
function selectTickBroadcasterRegion(
  request: Request,
  config: EdgeConfig,
  preferredRegion?: string
) {
  // 1. Use preferred region if valid
  if (preferredRegion) {
    const region = config.tickBroadcasterRegions.find(r => r.id === preferredRegion);
    if (region) {
      return region;
    }
  }

  // 2. Use x-user-region header if provided
  const headerRegion = request.headers.get('x-user-region');
  if (headerRegion) {
    const awsRegion = mapToAWSRegion(headerRegion);
    const region = config.tickBroadcasterRegions.find(r => r.id === awsRegion);
    if (region) {
      return region;
    }
  }

  // 3. Use Cloudflare country code for geo-routing
  const cf = (request as any).cf;
  if (cf?.country) {
    const region = getRegionFromCountry(cf.country, config);
    if (region) {
      return region;
    }
  }

  // 4. Default to configured default region
  const defaultRegion = config.tickBroadcasterRegions.find(
    r => r.id === config.defaultRegion
  );
  if (defaultRegion) {
    return defaultRegion;
  }

  // 5. Fallback to first available region
  return config.tickBroadcasterRegions[0];
}

/**
 * Map country code to AWS region
 */
function getRegionFromCountry(country: string, config: EdgeConfig) {
  // Americas
  const americasCountries = ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE'];
  if (americasCountries.includes(country)) {
    return config.tickBroadcasterRegions.find(r => r.id === 'us-east-1');
  }

  // Asia Pacific
  const asiaCountries = ['JP', 'KR', 'CN', 'TW', 'HK', 'SG', 'TH', 'VN', 'ID', 'MY', 'PH', 'AU', 'NZ', 'IN'];
  if (asiaCountries.includes(country)) {
    return config.tickBroadcasterRegions.find(r => r.id === 'ap-northeast-1');
  }

  // Europe and others -> EU
  return config.tickBroadcasterRegions.find(r => r.id === 'eu-west-1');
}

/**
 * Call tick-broadcaster to create a session
 */
async function createTickBroadcasterSession(
  httpEndpoint: string,
  request: StartGameRequest,
  timeout: number
): Promise<TickBroadcasterCreateSessionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${httpEndpoint}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tick-broadcaster error: ${response.status} - ${error}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handles POST /edge/game/exit
 * 
 * Flow:
 * 1. Parse and validate request
 * 2. Clear cache entry
 * 3. Return success (session will timeout on tick-broadcaster)
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

    console.log(`[EDGE] Exiting game ${body.gameId}`);

    // Clear cache entry
    cache.delete(body.gameId);

    // Note: Session will timeout on tick-broadcaster automatically
    // In production, you might want to call tick-broadcaster to stop session

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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-region',
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
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-region',
    },
  });
}
