/**
 * Region Selection Strategy
 * 
 * This module implements extensible region selection logic.
 * The strategy can be easily extended to support:
 * - Geographic routing based on user location
 * - Load-based routing
 * - Latency-based routing
 * - User preference history
 */

import { BackendRegion, EdgeConfig } from './types';

/**
 * Region selection strategy interface
 * Makes it easy to swap strategies later
 */
export interface RegionSelectionStrategy {
  selectRegion(
    request: {
      preferredRegion?: string;
      headers: Headers;
      cf?: any; // Cloudflare request context
    },
    config: EdgeConfig
  ): BackendRegion;
}

/**
 * Simple region selection strategy
 * 
 * Priority:
 * 1. preferredRegion if provided and valid
 * 2. x-user-region header if present
 * 3. Cloudflare country code (if available)
 * 4. Default region
 */
export class SimpleRegionSelector implements RegionSelectionStrategy {
  selectRegion(
    request: {
      preferredRegion?: string;
      headers: Headers;
      cf?: any;
    },
    config: EdgeConfig
  ): BackendRegion {
    // 1. Check preferred region (highest priority)
    if (request.preferredRegion) {
      const region = config.backendRegions.find((r) => r.id === request.preferredRegion);
      if (region) {
        return region;
      }
      // Log warning but continue with fallback
      console.warn(`Preferred region "${request.preferredRegion}" not found, using fallback`);
    }

    // 2. Check x-user-region header
    const userRegionHeader = request.headers.get('x-user-region');
    if (userRegionHeader) {
      const region = config.backendRegions.find((r) => r.id === userRegionHeader.toLowerCase());
      if (region) {
        return region;
      }
    }

    // 3. Use Cloudflare country code if available (geo routing)
    if (request.cf?.country) {
      const countryRegion = this.mapCountryToRegion(request.cf.country, config);
      if (countryRegion) {
        return countryRegion;
      }
    }

    // 4. Fallback to default region
    const defaultRegion = config.backendRegions.find((r) => r.id === config.defaultRegion);
    if (!defaultRegion) {
      throw new Error(`Default region "${config.defaultRegion}" not found`);
    }
    return defaultRegion;
  }

  /**
   * Maps country code to region
   * 
   * This is a simple mapping - in production, you might use:
   * - A more sophisticated geo-IP database
   * - Latency measurements
   * - Load balancing data
   */
  private mapCountryToRegion(countryCode: string, config: EdgeConfig): BackendRegion | null {
    // Simple continent-based mapping
    const countryToRegion: Record<string, string> = {
      // Europe
      GB: 'eu',
      FR: 'eu',
      DE: 'eu',
      IT: 'eu',
      ES: 'eu',
      NL: 'eu',
      // Add more EU countries...
      
      // Americas
      US: 'us',
      CA: 'us',
      MX: 'us',
      BR: 'us',
      // Add more Americas countries...
      
      // Asia
      CN: 'asia',
      JP: 'asia',
      KR: 'asia',
      IN: 'asia',
      SG: 'asia',
      // Add more Asia countries...
    };

    const regionId = countryToRegion[countryCode.toUpperCase()];
    if (regionId) {
      const region = config.backendRegions.find((r) => r.id === regionId);
      if (region) {
        return region;
      }
    }

    return null;
  }
}

/**
 * Factory function to create region selector
 * 
 * This makes it easy to swap strategies:
 * - return new LatencyBasedSelector();
 * - return new LoadBasedSelector();
 * - return new HybridSelector();
 */
export function createRegionSelector(): RegionSelectionStrategy {
  return new SimpleRegionSelector();
}

