/**
 * Latency monitor - periodically checks player latency and kicks high-latency players
 */

import { Handler } from 'aws-lambda';
import {
  getActiveConnections,
  updateConnectionStatus,
  deleteConnection,
} from '../db/dynamodb';
import { sendToConnection, disconnectClient } from '../utils/websocket';
import { checkLatencyThresholds, createKickedMessage, createLatencyStatusMessage } from '../utils/latency';
import { getLatencyThresholds, getCurrentEndpoints } from '../config';

/**
 * Latency monitor handler
 * 
 * Runs periodically to check player latency and kick those exceeding thresholds.
 */
export const handleLatencyMonitor: Handler = async (event, context) => {
  console.log('[LATENCY_MONITOR] Starting latency check');
  
  const endpoints = getCurrentEndpoints();
  const wsEndpoint = endpoints.wsEndpoint.replace('wss://', 'https://');
  const thresholds = getLatencyThresholds();
  
  let checked = 0;
  let warned = 0;
  let kicked = 0;
  
  try {
    const connections = await getActiveConnections();
    console.log(`[LATENCY_MONITOR] Checking ${connections.length} connections`);
    
    for (const connection of connections) {
      checked++;
      
      // Skip connections with insufficient samples
      if (connection.latencyHistory.length < thresholds.sampleCount) {
        continue;
      }
      
      // Check latency thresholds
      const checkResult = checkLatencyThresholds(connection.latencyHistory, thresholds);
      
      if (checkResult.status === 'ok') {
        continue;
      }
      
      if (checkResult.shouldKick) {
        // Kick the player
        kicked++;
        
        try {
          const kickMsg = createKickedMessage(checkResult, thresholds);
          await sendToConnection(wsEndpoint, connection.connectionId, kickMsg);
          
          // Update status and disconnect
          await updateConnectionStatus(connection.connectionId, 'kicked', checkResult.message);
          await disconnectClient(wsEndpoint, connection.connectionId);
          
          console.log(`[LATENCY_MONITOR] Kicked ${connection.connectionId}: ${checkResult.message}`);
        } catch (error) {
          console.error(`[LATENCY_MONITOR] Error kicking ${connection.connectionId}:`, error);
          // Clean up connection anyway
          await deleteConnection(connection.connectionId);
        }
      } else {
        // Send warning
        warned++;
        
        try {
          const statusMsg = createLatencyStatusMessage(checkResult);
          await sendToConnection(wsEndpoint, connection.connectionId, statusMsg);
          
          console.log(`[LATENCY_MONITOR] Warning ${connection.connectionId}: ${checkResult.message}`);
        } catch (error) {
          console.error(`[LATENCY_MONITOR] Error warning ${connection.connectionId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[LATENCY_MONITOR] Error:', error);
  }
  
  console.log(`[LATENCY_MONITOR] Complete. Checked: ${checked}, Warned: ${warned}, Kicked: ${kicked}`);
  
  return { checked, warned, kicked };
};

/**
 * Cleanup stale connections
 * 
 * Removes connections that haven't sent a ping in too long.
 */
export const handleStaleConnectionCleanup: Handler = async (event, context) => {
  console.log('[STALE_CLEANUP] Starting stale connection cleanup');
  
  const STALE_THRESHOLD_MS = 60000; // 1 minute without ping
  const now = Date.now();
  let cleaned = 0;
  
  try {
    const connections = await getActiveConnections();
    
    for (const connection of connections) {
      // If connection has never pinged and is old, or last ping was too long ago
      const lastActivity = connection.lastPingAt || connection.joinedAt;
      const timeSinceActivity = now - lastActivity;
      
      if (timeSinceActivity > STALE_THRESHOLD_MS) {
        cleaned++;
        
        try {
          await deleteConnection(connection.connectionId);
          console.log(`[STALE_CLEANUP] Removed stale connection ${connection.connectionId}`);
        } catch (error) {
          console.error(`[STALE_CLEANUP] Error removing ${connection.connectionId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[STALE_CLEANUP] Error:', error);
  }
  
  console.log(`[STALE_CLEANUP] Complete. Cleaned: ${cleaned}`);
  
  return { cleaned };
};

