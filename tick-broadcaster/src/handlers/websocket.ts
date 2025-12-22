/**
 * WebSocket handlers for tick-broadcaster Lambda
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  createConnection,
  getConnection,
  deleteConnection,
  updateConnectionLatency,
  updateConnectionStatus,
  getSession,
} from '../db/dynamodb';
import { sendToConnection, buildEndpointUrl } from '../utils/websocket';
import {
  addLatencySample,
  checkLatencyThresholds,
  createLatencyStatusMessage,
  createKickedMessage,
} from '../utils/latency';
import { getLatencyThresholds, getCurrentRegion, getCurrentEndpoints } from '../config';
import {
  PlayerConnection,
  JoinSessionMessage,
  PingMessage,
  SessionJoinedMessage,
  PongMessage,
  ErrorMessage,
} from '../types';

const OK_RESPONSE: APIGatewayProxyResult = { statusCode: 200, body: 'OK' };
const ERROR_RESPONSE = (message: string): APIGatewayProxyResult => ({
  statusCode: 500,
  body: JSON.stringify({ error: message }),
});

/**
 * Handle WebSocket $connect
 * 
 * Creates a new connection record in DynamoDB.
 * Connection is in 'connecting' state until player joins a session.
 */
export const handleConnect: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const now = Date.now();
  
  console.log(`[CONNECT] ${connectionId}`);
  
  try {
    // Create connection record (not yet associated with a session)
    const connection: PlayerConnection = {
      connectionId,
      sessionId: '', // Will be set when joining
      userId: '',
      region: getCurrentRegion(),
      joinedAt: now,
      ttl: Math.floor(now / 1000) + 3600, // 1 hour TTL
      latencyHistory: [],
      avgLatency: 0,
      jitter: 0,
      lastPingAt: 0,
      lastPongAt: 0,
      status: 'connecting',
    };
    
    await createConnection(connection);
    
    return OK_RESPONSE;
  } catch (error) {
    console.error('[CONNECT] Error:', error);
    return ERROR_RESPONSE('Failed to create connection');
  }
};

/**
 * Handle WebSocket $disconnect
 * 
 * Cleans up connection record from DynamoDB.
 */
export const handleDisconnect: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  
  console.log(`[DISCONNECT] ${connectionId}`);
  
  try {
    await deleteConnection(connectionId);
    return OK_RESPONSE;
  } catch (error) {
    console.error('[DISCONNECT] Error:', error);
    return OK_RESPONSE; // Still return OK to not retry
  }
};

/**
 * Handle WebSocket $default route
 * 
 * Handles unknown messages - returns error.
 */
export const handleDefault: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const endpoint = buildEndpointUrl(
    event.requestContext.domainName!,
    event.requestContext.stage!
  );
  
  console.log(`[DEFAULT] ${connectionId}:`, event.body);
  
  const errorMsg: ErrorMessage = {
    type: 'error',
    code: 'UNKNOWN_ACTION',
    message: 'Unknown action. Supported: join, ping',
  };
  
  await sendToConnection(endpoint, connectionId, errorMsg);
  
  return OK_RESPONSE;
};

/**
 * Handle 'join' action
 * 
 * Associates connection with a game session.
 * Sends session details and begins latency measurement.
 */
export const handleJoinSession: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const endpoint = buildEndpointUrl(
    event.requestContext.domainName!,
    event.requestContext.stage!
  );
  
  console.log(`[JOIN] ${connectionId}`);
  
  try {
    // Parse message
    const message: JoinSessionMessage = JSON.parse(event.body || '{}');
    
    if (!message.sessionId || !message.userId) {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'INVALID_REQUEST',
        message: 'sessionId and userId are required',
      };
      await sendToConnection(endpoint, connectionId, errorMsg);
      return OK_RESPONSE;
    }
    
    // Get session
    const session = await getSession(message.sessionId);
    if (!session) {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'SESSION_NOT_FOUND',
        message: `Session ${message.sessionId} not found`,
      };
      await sendToConnection(endpoint, connectionId, errorMsg);
      return OK_RESPONSE;
    }
    
    // Update connection with session info
    const connection = await getConnection(connectionId);
    if (!connection) {
      return ERROR_RESPONSE('Connection not found');
    }
    
    const updatedConnection: PlayerConnection = {
      ...connection,
      sessionId: message.sessionId,
      userId: message.userId,
      status: 'ready',
    };
    
    await createConnection(updatedConnection); // Overwrites existing
    
    // Send session details
    const endpoints = getCurrentEndpoints();
    const joinedMsg: SessionJoinedMessage = {
      type: 'session_joined',
      sessionId: session.sessionId,
      seed: session.seed,
      startAt: session.startAt,
      tickMs: session.tickMs,
      region: session.region,
      wsEndpoint: endpoints.wsEndpoint,
    };
    
    await sendToConnection(endpoint, connectionId, joinedMsg);
    
    console.log(`[JOIN] ${connectionId} joined session ${message.sessionId}`);
    
    return OK_RESPONSE;
  } catch (error) {
    console.error('[JOIN] Error:', error);
    
    const errorMsg: ErrorMessage = {
      type: 'error',
      code: 'JOIN_FAILED',
      message: 'Failed to join session',
    };
    await sendToConnection(endpoint, connectionId, errorMsg);
    
    return OK_RESPONSE;
  }
};

/**
 * Handle 'ping' action
 * 
 * Responds with 'pong' for latency measurement.
 * Tracks latency history and checks against thresholds.
 */
export const handlePing: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const endpoint = buildEndpointUrl(
    event.requestContext.domainName!,
    event.requestContext.stage!
  );
  const serverTimestamp = Date.now();
  
  try {
    // Parse message
    const message: PingMessage = JSON.parse(event.body || '{}');
    const clientTimestamp = message.clientTimestamp || 0;
    
    // Get connection
    const connection = await getConnection(connectionId);
    if (!connection) {
      return OK_RESPONSE; // Connection gone
    }
    
    // Calculate latency from previous pong (if we have one)
    let latency = 0;
    if (connection.lastPongAt > 0 && clientTimestamp > 0) {
      // Simplified: measure time since last pong
      latency = serverTimestamp - clientTimestamp;
    }
    
    // Update latency history
    const thresholds = getLatencyThresholds();
    let newHistory = connection.latencyHistory;
    
    if (latency > 0) {
      newHistory = addLatencySample(
        connection.latencyHistory,
        latency,
        thresholds.sampleCount
      );
    }
    
    // Check latency thresholds
    const checkResult = checkLatencyThresholds(newHistory, thresholds);
    
    // Update connection with new latency data
    await updateConnectionLatency(
      connectionId,
      newHistory,
      checkResult.avgLatency,
      checkResult.jitter,
      serverTimestamp
    );
    
    // Send pong response
    const pongMsg: PongMessage = {
      type: 'pong',
      clientTimestamp,
      serverTimestamp,
    };
    await sendToConnection(endpoint, connectionId, pongMsg);
    
    // Send latency status if in warning or critical zone
    if (checkResult.status !== 'ok' && newHistory.length >= thresholds.sampleCount) {
      if (checkResult.shouldKick) {
        // Kick the player
        const kickMsg = createKickedMessage(checkResult, thresholds);
        await sendToConnection(endpoint, connectionId, kickMsg);
        
        // Update connection status
        await updateConnectionStatus(connectionId, 'kicked', checkResult.message);
        
        console.log(`[KICK] ${connectionId}: ${checkResult.message}`);
      } else {
        // Send warning
        const statusMsg = createLatencyStatusMessage(checkResult);
        await sendToConnection(endpoint, connectionId, statusMsg);
        
        console.log(`[LATENCY WARNING] ${connectionId}: ${checkResult.message}`);
      }
    }
    
    return OK_RESPONSE;
  } catch (error) {
    console.error('[PING] Error:', error);
    return OK_RESPONSE;
  }
};

