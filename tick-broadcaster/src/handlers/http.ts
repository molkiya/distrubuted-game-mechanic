/**
 * HTTP handlers for session management
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  createSession,
  getSession,
  getConnectionsBySession,
} from '../db/dynamodb';
import { getTickConfig, getCurrentRegion, getCurrentEndpoints, SESSION_TTL_SECONDS } from '../config';
import { GameSession, CreateSessionRequest, CreateSessionResponse, GetSessionResponse } from '../types';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: object, statusCode: number = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
    body: JSON.stringify(data),
  };
}

function errorResponse(message: string, statusCode: number = 400): APIGatewayProxyResult {
  return jsonResponse({ error: message }, statusCode);
}

/**
 * POST /sessions - Create a new game session
 * 
 * This creates a session that the tick-broadcaster will start broadcasting
 * when the startAt time is reached.
 */
export const handleCreateSession: APIGatewayProxyHandler = async (event) => {
  console.log('[CREATE_SESSION] Request received');
  
  try {
    // Parse request
    const body: CreateSessionRequest = JSON.parse(event.body || '{}');
    
    if (!body.userId) {
      return errorResponse('userId is required');
    }
    
    const tickConfig = getTickConfig();
    const region = getCurrentRegion();
    const endpoints = getCurrentEndpoints();
    const now = Date.now();
    
    // Generate session parameters
    const sessionId = uuidv4();
    const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const startAt = now + tickConfig.countdownMs; // Start after countdown
    const tickMs = tickConfig.defaultTickMs;
    
    // Create session in DynamoDB
    const session: GameSession = {
      sessionId,
      seed,
      startAt,
      tickMs,
      status: 'waiting',
      region,
      createdAt: now,
      ttl: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
      currentStep: 0,
      currentValue: 0,
      currentRound: 0,
    };
    
    await createSession(session);
    
    // Return session info
    const response: CreateSessionResponse = {
      sessionId,
      seed,
      startAt,
      tickMs,
      region,
      wsEndpoint: endpoints.wsEndpoint,
      httpEndpoint: endpoints.httpEndpoint,
    };
    
    console.log(`[CREATE_SESSION] Created session ${sessionId} in region ${region}`);
    
    return jsonResponse(response, 201);
  } catch (error) {
    console.error('[CREATE_SESSION] Error:', error);
    return errorResponse('Failed to create session', 500);
  }
};

/**
 * GET /sessions/{sessionId} - Get session details
 */
export const handleGetSession: APIGatewayProxyHandler = async (event) => {
  const sessionId = event.pathParameters?.sessionId;
  
  if (!sessionId) {
    return errorResponse('sessionId is required');
  }
  
  console.log(`[GET_SESSION] ${sessionId}`);
  
  try {
    const session = await getSession(sessionId);
    
    if (!session) {
      return errorResponse('Session not found', 404);
    }
    
    // Get player count
    const connections = await getConnectionsBySession(sessionId);
    const endpoints = getCurrentEndpoints();
    
    const response: GetSessionResponse = {
      sessionId: session.sessionId,
      seed: session.seed,
      startAt: session.startAt,
      tickMs: session.tickMs,
      status: session.status,
      region: session.region,
      playerCount: connections.length,
      wsEndpoint: endpoints.wsEndpoint,
    };
    
    return jsonResponse(response);
  } catch (error) {
    console.error('[GET_SESSION] Error:', error);
    return errorResponse('Failed to get session', 500);
  }
};

