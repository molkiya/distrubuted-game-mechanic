import { StartGameRequest, StartGameResponse, ExitGameRequest, ExitGameResponse } from '../types';

// API base URL - points to edge gateway or directly to tick-broadcaster
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Tick broadcaster regions (populated after deployment)
export const TICK_BROADCASTER_REGIONS = {
  'us-east-1': {
    name: 'US East (N. Virginia)',
    httpEndpoint: process.env.REACT_APP_TICK_US_HTTP || 'https://REPLACE.execute-api.us-east-1.amazonaws.com/prod',
    wsEndpoint: process.env.REACT_APP_TICK_US_WS || 'wss://REPLACE.execute-api.us-east-1.amazonaws.com/prod',
  },
  'eu-west-1': {
    name: 'EU (Ireland)',
    httpEndpoint: process.env.REACT_APP_TICK_EU_HTTP || 'https://REPLACE.execute-api.eu-west-1.amazonaws.com/prod',
    wsEndpoint: process.env.REACT_APP_TICK_EU_WS || 'wss://REPLACE.execute-api.eu-west-1.amazonaws.com/prod',
  },
  'ap-northeast-1': {
    name: 'Asia (Tokyo)',
    httpEndpoint: process.env.REACT_APP_TICK_ASIA_HTTP || 'https://REPLACE.execute-api.ap-northeast-1.amazonaws.com/prod',
    wsEndpoint: process.env.REACT_APP_TICK_ASIA_WS || 'wss://REPLACE.execute-api.ap-northeast-1.amazonaws.com/prod',
  },
};

/**
 * Starts a new game session via tick-broadcaster
 * 
 * The tick-broadcaster creates a session and returns:
 * - Session parameters (seed, startAt, tickMs)
 * - WebSocket endpoint for tick streaming
 * - HTTP endpoint for session management
 */
export async function startGame(request: StartGameRequest): Promise<StartGameResponse> {
  // Determine which tick-broadcaster region to use
  const region = request.preferredRegion || 'eu-west-1';
  const regionConfig = TICK_BROADCASTER_REGIONS[region as keyof typeof TICK_BROADCASTER_REGIONS] 
    || TICK_BROADCASTER_REGIONS['eu-west-1'];
  
  // Try tick-broadcaster first
  try {
    const response = await fetch(`${regionConfig.httpEndpoint}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    console.warn('[API] Tick-broadcaster not available, falling back to edge gateway');
  }

  // Fallback to edge gateway
  const response = await fetch(`${API_BASE_URL}/edge/game/start`, {
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

  const data = await response.json();
  
  // Add wsEndpoint if not present (for legacy edge gateway)
  if (!data.wsEndpoint) {
    const backendRegion = data.region || data.backendRegion || 'eu-west-1';
    const tickRegion = TICK_BROADCASTER_REGIONS[backendRegion as keyof typeof TICK_BROADCASTER_REGIONS]
      || TICK_BROADCASTER_REGIONS['eu-west-1'];
    data.wsEndpoint = tickRegion.wsEndpoint;
    data.httpEndpoint = tickRegion.httpEndpoint;
    data.region = backendRegion;
  }

  return data;
}

/**
 * Exits a game session
 */
export async function exitGame(request: ExitGameRequest): Promise<ExitGameResponse> {
  const response = await fetch(`${API_BASE_URL}/edge/game/exit`, {
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

/**
 * Measure latency to a tick-broadcaster region
 */
export async function measureLatencyToRegion(region: string): Promise<number> {
  const regionConfig = TICK_BROADCASTER_REGIONS[region as keyof typeof TICK_BROADCASTER_REGIONS];
  if (!regionConfig) {
    throw new Error(`Unknown region: ${region}`);
  }

  const start = Date.now();
  
  try {
    await fetch(`${regionConfig.httpEndpoint}/health`, {
      method: 'GET',
      mode: 'cors',
    });
    return Date.now() - start;
  } catch (error) {
    return Infinity; // Region not reachable
  }
}

/**
 * Find the best region based on latency
 */
export async function findBestRegion(): Promise<string> {
  const results: { region: string; latency: number }[] = [];

  await Promise.all(
    Object.keys(TICK_BROADCASTER_REGIONS).map(async (region) => {
      try {
        const latency = await measureLatencyToRegion(region);
        results.push({ region, latency });
      } catch {
        results.push({ region, latency: Infinity });
      }
    })
  );

  results.sort((a, b) => a.latency - b.latency);
  
  console.log('[API] Region latencies:', results);
  
  return results[0]?.region || 'eu-west-1';
}
