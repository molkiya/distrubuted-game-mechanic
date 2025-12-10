/**
 * Cloudflare Worker Entry Point
 * 
 * This edge gateway sits between the frontend and backend Go services.
 * 
 * Architecture:
 * 
 *   Frontend (React)
 *        ↓
 *   Edge Gateway (Cloudflare Worker) ← You are here
 *        ↓
 *   Backend Go Services (Regional instances)
 *        ↓
 *   Cassandra (Shared storage)
 * 
 * Responsibilities:
 * 1. Smart routing: Selects the best backend region based on:
 *    - User preference
 *    - Geographic location (Cloudflare country code)
 *    - Header hints
 * 
 * 2. Caching: Caches game sessions at the edge to:
 *    - Reduce backend load
 *    - Enable future "microprocess" features
 * 
 * 3. Future extensibility: Designed to support:
 *    - Edge-hosted game state ("microprocesses")
 *    - Real-time coordination at the edge
 *    - Edge-to-edge communication for multiplayer
 * 
 * How to extend for "microprocesses":
 * - Use Cloudflare Durable Objects for stateful edge processes
 * - Each game room could be a Durable Object
 * - Edge can coordinate real-time updates without hitting backend
 * - Backend only handles persistence and heavy computation
 */

import { loadConfig } from './config';
import { createRegionSelector } from './region-selector';
import { GameSessionCache } from './cache';
import { handleStartGame, handleExitGame, handleOptions } from './handlers';

// Global cache instance (per worker instance)
// In production, consider using Cloudflare KV or Durable Objects for distributed state
let globalCache: GameSessionCache | null = null;

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Record<string, any>): Promise<Response> {
    // Initialize configuration
    const config = loadConfig(env);

    // Initialize cache (lazy initialization)
    if (!globalCache) {
      globalCache = new GameSessionCache(config.cacheTTL);
      
      // Periodic cleanup (every 5 minutes)
      // In production, use Cloudflare Cron Triggers
      setInterval(() => {
        globalCache?.cleanup();
      }, 5 * 60 * 1000);
    }

    // Initialize region selector
    const regionSelector = createRegionSelector();

    // Route requests
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    // Route handlers
    if (path === '/edge/game/start' && method === 'POST') {
      return handleStartGame(request, config, regionSelector, globalCache);
    }

    if (path === '/edge/game/exit' && method === 'POST') {
      return handleExitGame(request, config, globalCache);
    }

    // Health check endpoint
    if (path === '/edge/health' && method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          cache: globalCache.getStats(),
          regions: config.backendRegions.map((r) => r.id),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

