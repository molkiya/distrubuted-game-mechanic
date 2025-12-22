/**
 * WebSocket utilities for sending messages to connected clients
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';

// Cache API Gateway clients per endpoint
const apiClients = new Map<string, ApiGatewayManagementApiClient>();

function getApiClient(endpoint: string): ApiGatewayManagementApiClient {
  let client = apiClients.get(endpoint);
  if (!client) {
    client = new ApiGatewayManagementApiClient({ endpoint });
    apiClients.set(endpoint, client);
  }
  return client;
}

/**
 * Send a message to a specific connection
 * @returns true if message was sent, false if connection was gone
 */
export async function sendToConnection(
  endpoint: string,
  connectionId: string,
  message: object
): Promise<boolean> {
  const client = getApiClient(endpoint);
  
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    }));
    return true;
  } catch (error) {
    if (error instanceof GoneException) {
      console.log(`Connection ${connectionId} is gone`);
      return false;
    }
    throw error;
  }
}

/**
 * Send a message to multiple connections in parallel
 * @returns Array of connectionIds that failed (gone connections)
 */
export async function broadcastToConnections(
  endpoint: string,
  connectionIds: string[],
  message: object
): Promise<string[]> {
  const failedConnections: string[] = [];
  
  const results = await Promise.allSettled(
    connectionIds.map(async (connectionId) => {
      const success = await sendToConnection(endpoint, connectionId, message);
      if (!success) {
        failedConnections.push(connectionId);
      }
      return { connectionId, success };
    })
  );
  
  // Log any errors
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to send to ${connectionIds[index]}:`, result.reason);
      failedConnections.push(connectionIds[index]);
    }
  });
  
  return failedConnections;
}

/**
 * Forcefully disconnect a client
 */
export async function disconnectClient(
  endpoint: string,
  connectionId: string
): Promise<void> {
  const client = getApiClient(endpoint);
  
  try {
    await client.send(new DeleteConnectionCommand({
      ConnectionId: connectionId,
    }));
  } catch (error) {
    if (!(error instanceof GoneException)) {
      console.error(`Failed to disconnect ${connectionId}:`, error);
    }
  }
}

/**
 * Build WebSocket endpoint URL from API Gateway event
 */
export function buildEndpointUrl(
  domainName: string,
  stage: string
): string {
  return `https://${domainName}/${stage}`;
}

