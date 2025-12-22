/**
 * Configuration for the edge gateway
 */

import { EdgeConfig, BackendRegion, TickBroadcasterRegion } from './types';

// Default backend regions (Go backend services)
const DEFAULT_BACKEND_REGIONS: BackendRegion[] = [
  { id: 'eu', baseUrl: 'http://localhost:8081' },
  { id: 'us', baseUrl: 'http://localhost:8082' },
  { id: 'asia', baseUrl: 'http://localhost:8083' },
];

// Default tick broadcaster regions (AWS Lambda)
const DEFAULT_TICK_BROADCASTER_REGIONS: TickBroadcasterRegion[] = [
  {
    id: 'us-east-1',
    httpEndpoint: 'https://REPLACE.execute-api.us-east-1.amazonaws.com/prod',
    wsEndpoint: 'wss://REPLACE.execute-api.us-east-1.amazonaws.com/prod',
    displayName: 'US East (N. Virginia)',
  },
  {
    id: 'eu-west-1',
    httpEndpoint: 'https://REPLACE.execute-api.eu-west-1.amazonaws.com/prod',
    wsEndpoint: 'wss://REPLACE.execute-api.eu-west-1.amazonaws.com/prod',
    displayName: 'EU (Ireland)',
  },
  {
    id: 'ap-northeast-1',
    httpEndpoint: 'https://REPLACE.execute-api.ap-northeast-1.amazonaws.com/prod',
    wsEndpoint: 'wss://REPLACE.execute-api.ap-northeast-1.amazonaws.com/prod',
    displayName: 'Asia (Tokyo)',
  },
];

// Region mapping: user-friendly region ID to AWS region
const REGION_MAPPING: Record<string, string> = {
  'eu': 'eu-west-1',
  'us': 'us-east-1',
  'asia': 'ap-northeast-1',
  // Direct mappings
  'eu-west-1': 'eu-west-1',
  'us-east-1': 'us-east-1',
  'ap-northeast-1': 'ap-northeast-1',
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(env: Record<string, any>): EdgeConfig {
  // Parse backend regions from env or use defaults
  let backendRegions = DEFAULT_BACKEND_REGIONS;
  if (env.BACKEND_REGIONS) {
    try {
      backendRegions = JSON.parse(env.BACKEND_REGIONS);
    } catch {
      console.warn('Failed to parse BACKEND_REGIONS, using defaults');
    }
  }

  // Parse tick broadcaster regions from env or use defaults
  let tickBroadcasterRegions = DEFAULT_TICK_BROADCASTER_REGIONS;
  if (env.TICK_BROADCASTER_REGIONS) {
    try {
      tickBroadcasterRegions = JSON.parse(env.TICK_BROADCASTER_REGIONS);
    } catch {
      console.warn('Failed to parse TICK_BROADCASTER_REGIONS, using defaults');
    }
  }

  // Override individual tick broadcaster endpoints from env
  if (env.TICK_US_HTTP) {
    const usRegion = tickBroadcasterRegions.find(r => r.id === 'us-east-1');
    if (usRegion) {
      usRegion.httpEndpoint = env.TICK_US_HTTP;
      usRegion.wsEndpoint = env.TICK_US_WS || usRegion.wsEndpoint;
    }
  }
  if (env.TICK_EU_HTTP) {
    const euRegion = tickBroadcasterRegions.find(r => r.id === 'eu-west-1');
    if (euRegion) {
      euRegion.httpEndpoint = env.TICK_EU_HTTP;
      euRegion.wsEndpoint = env.TICK_EU_WS || euRegion.wsEndpoint;
    }
  }
  if (env.TICK_ASIA_HTTP) {
    const asiaRegion = tickBroadcasterRegions.find(r => r.id === 'ap-northeast-1');
    if (asiaRegion) {
      asiaRegion.httpEndpoint = env.TICK_ASIA_HTTP;
      asiaRegion.wsEndpoint = env.TICK_ASIA_WS || asiaRegion.wsEndpoint;
    }
  }

  return {
    backendRegions,
    tickBroadcasterRegions,
    defaultRegion: env.DEFAULT_REGION || 'eu-west-1',
    backendTimeout: parseInt(env.BACKEND_TIMEOUT || '10000', 10),
    cacheTTL: parseInt(env.CACHE_TTL || '30000', 10),
    useTickBroadcaster: env.USE_TICK_BROADCASTER !== 'false', // Default to true
  };
}

/**
 * Map user region preference to AWS region
 */
export function mapToAWSRegion(region: string): string {
  return REGION_MAPPING[region.toLowerCase()] || region;
}

/**
 * Get latency thresholds (for client reference)
 */
export function getLatencyThresholds() {
  return {
    maxLatencyMs: 150,
    maxJitterMs: 50,
    warningLatencyMs: 100,
    warningJitterMs: 30,
  };
}
