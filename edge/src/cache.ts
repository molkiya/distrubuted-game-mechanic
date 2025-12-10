/**
 * In-Memory Cache for Game Sessions
 * 
 * This cache stores recent game sessions at the edge to:
 * - Reduce backend load for repeated requests
 * - Enable future "microprocess" features (edge-hosted game state)
 * - Support real-time coordination at the edge
 * 
 * Note: In Cloudflare Workers, this is per-instance memory.
 * For distributed caching, consider using Cloudflare KV or Durable Objects.
 */

import { CachedGameSession } from './types';

/**
 * Simple in-memory cache with TTL
 * 
 * In production, you might want to use:
 * - Cloudflare KV for distributed edge caching
 * - Durable Objects for stateful edge processes
 * - Redis for shared cache across edge instances
 */
export class GameSessionCache {
  private cache: Map<string, CachedGameSession> = new Map();
  private ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
  }

  /**
   * Get a cached game session
   * Returns null if not found or expired
   */
  get(gameId: string): CachedGameSession | null {
    const cached = this.cache.get(gameId);
    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - cached.cachedAt > this.ttl) {
      this.cache.delete(gameId);
      return null;
    }

    return cached;
  }

  /**
   * Store a game session in cache
   */
  set(session: CachedGameSession): void {
    this.cache.set(session.gameId, {
      ...session,
      cachedAt: Date.now(),
    });
  }

  /**
   * Remove a game session from cache
   */
  delete(gameId: string): void {
    this.cache.delete(gameId);
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [gameId, session] of this.cache.entries()) {
      if (now - session.cachedAt > this.ttl) {
        this.cache.delete(gameId);
      }
    }
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
    };
  }
}

