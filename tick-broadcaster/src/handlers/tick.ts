/**
 * Tick broadcaster - broadcasts game ticks to all connected players
 * 
 * This runs as a Lambda that periodically broadcasts tick updates
 * to all WebSocket connections for active sessions.
 * 
 * For sub-second ticks (e.g., 100ms), we use an internal loop
 * rather than CloudWatch Events (minimum 1 minute).
 */

import { Handler } from 'aws-lambda';
import {
  getActiveSessions,
  getConnectionsBySession,
  updateSessionStatus,
  updateSessionState,
  deleteConnection,
} from '../db/dynamodb';
import { broadcastToConnections, buildEndpointUrl } from '../utils/websocket';
import { stateAt, getCurrentStep, msUntilNextTick } from '../engine';
import { TickMessage, CountdownMessage, GameSession } from '../types';
import { getCurrentEndpoints } from '../config';

// Maximum runtime for a single Lambda invocation (keep under Lambda timeout)
const MAX_RUNTIME_MS = 25000; // 25 seconds (with 30s Lambda timeout)

/**
 * Main tick broadcast handler
 * 
 * Runs a loop that broadcasts ticks for all active sessions.
 * This is more efficient than spawning a Lambda per tick.
 */
export const handleTickBroadcast: Handler = async (event, context) => {
  console.log('[TICK_BROADCAST] Starting tick broadcaster');
  
  const startTime = Date.now();
  let tickCount = 0;
  let lastSessionCheck = 0;
  let activeSessions: GameSession[] = [];
  
  // Build WebSocket endpoint URL
  // In production, get this from environment or API Gateway
  const endpoints = getCurrentEndpoints();
  const wsEndpoint = endpoints.wsEndpoint.replace('wss://', 'https://');
  
  try {
    // Main broadcast loop
    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      const now = Date.now();
      
      // Refresh session list every 5 seconds
      if (now - lastSessionCheck > 5000) {
        activeSessions = await getActiveSessions();
        lastSessionCheck = now;
        console.log(`[TICK_BROADCAST] Active sessions: ${activeSessions.length}`);
      }
      
      if (activeSessions.length === 0) {
        // No active sessions, wait a bit
        await sleep(1000);
        continue;
      }
      
      // Process each session
      for (const session of activeSessions) {
        try {
          await processSessionTick(session, wsEndpoint, now);
          tickCount++;
        } catch (error) {
          console.error(`[TICK_BROADCAST] Error processing session ${session.sessionId}:`, error);
        }
      }
      
      // Calculate time until next tick (use smallest tickMs across all sessions)
      const minTickMs = Math.min(...activeSessions.map(s => s.tickMs));
      const minSession = activeSessions.find(s => s.tickMs === minTickMs)!;
      const waitMs = msUntilNextTick(minSession.startAt, minTickMs, now);
      
      // Wait until next tick (minimum 10ms to prevent tight loop)
      if (waitMs > 10) {
        await sleep(Math.min(waitMs, 100)); // Cap at 100ms for responsiveness
      } else {
        await sleep(10);
      }
    }
  } catch (error) {
    console.error('[TICK_BROADCAST] Fatal error:', error);
  }
  
  console.log(`[TICK_BROADCAST] Completed. Ticks broadcast: ${tickCount}`);
  
  return { tickCount };
};

/**
 * Process a single tick for a session
 */
async function processSessionTick(
  session: GameSession,
  wsEndpoint: string,
  now: number
): Promise<void> {
  // Get all connections for this session
  const connections = await getConnectionsBySession(session.sessionId);
  
  if (connections.length === 0) {
    return; // No players connected
  }
  
  const connectionIds = connections.map(c => c.connectionId);
  
  // Check if session should start
  if (session.status === 'waiting' && now >= session.startAt) {
    // Transition to running
    await updateSessionStatus(session.sessionId, 'running');
    session.status = 'running';
    console.log(`[TICK_BROADCAST] Session ${session.sessionId} started`);
  }
  
  // If still waiting, send countdown
  if (session.status === 'waiting') {
    const remainingMs = session.startAt - now;
    const countdownMsg: CountdownMessage = {
      type: 'countdown',
      remainingMs,
      startAt: session.startAt,
    };
    
    const failed = await broadcastToConnections(wsEndpoint, connectionIds, countdownMsg);
    await cleanupFailedConnections(failed);
    return;
  }
  
  // Session is running - compute and broadcast current state
  const state = stateAt(session.seed, session.startAt, session.tickMs, now);
  
  // Update session state in DB (for monitoring/debugging)
  if (state.step !== session.currentStep) {
    await updateSessionState(
      session.sessionId,
      state.step,
      state.value,
      state.round
    );
  }
  
  // Broadcast tick to all players
  const tickMsg: TickMessage = {
    type: 'tick',
    step: state.step,
    value: state.value,
    round: state.round,
    broken: state.broken,
    serverTimestamp: now,
  };
  
  const failed = await broadcastToConnections(wsEndpoint, connectionIds, tickMsg);
  await cleanupFailedConnections(failed);
  
  // Log breaks for debugging
  if (state.broken) {
    console.log(`[TICK_BROADCAST] Session ${session.sessionId} BREAK at step ${state.step}, round ${state.round}`);
  }
}

/**
 * Remove failed connections from DB
 */
async function cleanupFailedConnections(connectionIds: string[]): Promise<void> {
  for (const connectionId of connectionIds) {
    try {
      await deleteConnection(connectionId);
    } catch (error) {
      console.error(`[CLEANUP] Failed to delete connection ${connectionId}:`, error);
    }
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

