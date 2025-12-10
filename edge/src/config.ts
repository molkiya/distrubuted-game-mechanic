/**
 * Configuration management for the edge gateway
 * 
 * Reads configuration from environment variables (Cloudflare Workers)
 * or provides defaults for local development.
 */

import { EdgeConfig, BackendRegion } from './types';

/**
 * Loads configuration from environment variables
 * 
 * Example environment variables:
 * - BACKEND_REGIONS: JSON string like '[{"id":"eu","baseUrl":"http://localhost:8081"},{"id":"us","baseUrl":"http://localhost:8082"}]'
 * - DEFAULT_REGION: "eu"
 * - BACKEND_TIMEOUT_MS: "5000"
 * - CACHE_TTL_MS: "30000"
 */
export function loadConfig(env: Record<string, any>): EdgeConfig {
  // Parse backend regions from environment
  let backendRegions: BackendRegion[];
  try {
    const regionsStr = env.BACKEND_REGIONS || env.BACKEND_REGIONS_JSON;
    if (regionsStr) {
      backendRegions = JSON.parse(regionsStr);
    } else {
      // Default regions for local development
      backendRegions = [
        { id: 'eu', baseUrl: 'http://localhost:8081' },
        { id: 'us', baseUrl: 'http://localhost:8082' },
        { id: 'asia', baseUrl: 'http://localhost:8083' },
      ];
    }
  } catch (e) {
    throw new Error(`Invalid BACKEND_REGIONS configuration: ${e}`);
  }

  // Validate regions
  if (!Array.isArray(backendRegions) || backendRegions.length === 0) {
    throw new Error('BACKEND_REGIONS must be a non-empty array');
  }

  // Default region
  const defaultRegion = env.DEFAULT_REGION || 'eu';

  // Validate default region exists
  if (!backendRegions.find((r) => r.id === defaultRegion)) {
    throw new Error(`DEFAULT_REGION "${defaultRegion}" not found in BACKEND_REGIONS`);
  }

  // Timeout settings
  const backendTimeout = parseInt(env.BACKEND_TIMEOUT_MS || '5000', 10);
  const cacheTTL = parseInt(env.CACHE_TTL_MS || '30000', 10); // 30 seconds default

  return {
    backendRegions,
    defaultRegion,
    backendTimeout,
    cacheTTL,
  };
}

