/**
 * DynamoDB client and operations for tick-broadcaster
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { GameSession, PlayerConnection } from '../types';
import { getTableNames, CONNECTION_TTL_SECONDS, SESSION_TTL_SECONDS } from '../config';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const tables = getTableNames();

// ==================== Session Operations ====================

export async function createSession(session: GameSession): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  
  await docClient.send(new PutCommand({
    TableName: tables.sessions,
    Item: {
      ...session,
      ttl,
    },
  }));
}

export async function getSession(sessionId: string): Promise<GameSession | null> {
  const result = await docClient.send(new GetCommand({
    TableName: tables.sessions,
    Key: { sessionId },
  }));
  
  return result.Item as GameSession | null;
}

export async function updateSessionStatus(
  sessionId: string, 
  status: GameSession['status']
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tables.sessions,
    Key: { sessionId },
    UpdateExpression: 'SET #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status },
  }));
}

export async function updateSessionState(
  sessionId: string,
  step: number,
  value: number,
  round: number
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tables.sessions,
    Key: { sessionId },
    UpdateExpression: 'SET currentStep = :step, currentValue = :value, currentRound = :round',
    ExpressionAttributeValues: {
      ':step': step,
      ':value': value,
      ':round': round,
    },
  }));
}

export async function getActiveSessions(): Promise<GameSession[]> {
  const result = await docClient.send(new ScanCommand({
    TableName: tables.sessions,
    FilterExpression: '#status IN (:waiting, :running)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':waiting': 'waiting',
      ':running': 'running',
    },
  }));
  
  return (result.Items || []) as GameSession[];
}

// ==================== Connection Operations ====================

export async function createConnection(connection: PlayerConnection): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
  
  await docClient.send(new PutCommand({
    TableName: tables.connections,
    Item: {
      ...connection,
      ttl,
    },
  }));
}

export async function getConnection(connectionId: string): Promise<PlayerConnection | null> {
  const result = await docClient.send(new GetCommand({
    TableName: tables.connections,
    Key: { connectionId },
  }));
  
  return result.Item as PlayerConnection | null;
}

export async function updateConnectionLatency(
  connectionId: string,
  latencyHistory: number[],
  avgLatency: number,
  jitter: number,
  lastPongAt: number
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tables.connections,
    Key: { connectionId },
    UpdateExpression: `
      SET latencyHistory = :history,
          avgLatency = :avg,
          jitter = :jitter,
          lastPongAt = :pongAt
    `,
    ExpressionAttributeValues: {
      ':history': latencyHistory,
      ':avg': avgLatency,
      ':jitter': jitter,
      ':pongAt': lastPongAt,
    },
  }));
}

export async function updateConnectionStatus(
  connectionId: string,
  status: PlayerConnection['status'],
  kickReason?: string
): Promise<void> {
  const updateExpr = kickReason
    ? 'SET #status = :status, kickReason = :reason'
    : 'SET #status = :status';
  
  const exprValues: Record<string, any> = { ':status': status };
  if (kickReason) {
    exprValues[':reason'] = kickReason;
  }
  
  await docClient.send(new UpdateCommand({
    TableName: tables.connections,
    Key: { connectionId },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: exprValues,
  }));
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: tables.connections,
    Key: { connectionId },
  }));
}

export async function getConnectionsBySession(sessionId: string): Promise<PlayerConnection[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: tables.connections,
    IndexName: 'sessionId-index',
    KeyConditionExpression: 'sessionId = :sessionId',
    FilterExpression: '#status IN (:ready, :playing)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':sessionId': sessionId,
      ':ready': 'ready',
      ':playing': 'playing',
    },
  }));
  
  return (result.Items || []) as PlayerConnection[];
}

export async function getActiveConnections(): Promise<PlayerConnection[]> {
  const result = await docClient.send(new ScanCommand({
    TableName: tables.connections,
    FilterExpression: '#status IN (:ready, :playing)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':ready': 'ready',
      ':playing': 'playing',
    },
  }));
  
  return (result.Items || []) as PlayerConnection[];
}

export async function updateConnectionPingTime(
  connectionId: string,
  lastPingAt: number
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tables.connections,
    Key: { connectionId },
    UpdateExpression: 'SET lastPingAt = :pingAt',
    ExpressionAttributeValues: { ':pingAt': lastPingAt },
  }));
}

