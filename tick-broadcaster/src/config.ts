/**
 * Configuration for tick-broadcaster Lambda
 */

import { LatencyThresholds, AWSRegion, RegionEndpoint } from './types';

// Latency thresholds loaded from environment
export function getLatencyThresholds(): LatencyThresholds {
  return {
    maxLatencyMs: parseInt(process.env.MAX_LATENCY_MS || '150', 10),
    maxJitterMs: parseInt(process.env.MAX_JITTER_MS || '50', 10),
    warningLatencyMs: parseInt(process.env.WARNING_LATENCY_MS || '100', 10),
    warningJitterMs: parseInt(process.env.WARNING_JITTER_MS || '30', 10),
    sampleCount: parseInt(process.env.LATENCY_SAMPLES || '5', 10),
    measurementIntervalMs: parseInt(process.env.MEASUREMENT_INTERVAL_MS || '1000', 10),
  };
}

// Tick configuration
export function getTickConfig() {
  return {
    defaultTickMs: parseInt(process.env.DEFAULT_TICK_MS || '100', 10),
    countdownMs: parseInt(process.env.COUNTDOWN_MS || '3000', 10), // 3 seconds countdown
  };
}

// DynamoDB table names
export function getTableNames() {
  return {
    connections: process.env.CONNECTIONS_TABLE || 'tick-broadcaster-connections-dev',
    sessions: process.env.SESSIONS_TABLE || 'tick-broadcaster-sessions-dev',
  };
}

// Current region
export function getCurrentRegion(): AWSRegion {
  return (process.env.REGION || process.env.AWS_REGION || 'eu-west-1') as AWSRegion;
}

// All available regions with their endpoints
export function getRegionEndpoints(): RegionEndpoint[] {
  const stage = process.env.STAGE || 'dev';
  
  // These would be populated after deployment
  // In production, use CloudFormation outputs or SSM Parameter Store
  return [
    {
      region: 'us-east-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.us-east-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.us-east-1.amazonaws.com/${stage}`,
      displayName: 'US East (N. Virginia)',
    },
    {
      region: 'us-west-2',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.us-west-2.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.us-west-2.amazonaws.com/${stage}`,
      displayName: 'US West (Oregon)',
    },
    {
      region: 'eu-west-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.eu-west-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.eu-west-1.amazonaws.com/${stage}`,
      displayName: 'EU (Ireland)',
    },
    {
      region: 'eu-central-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.eu-central-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.eu-central-1.amazonaws.com/${stage}`,
      displayName: 'EU (Frankfurt)',
    },
    {
      region: 'ap-northeast-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.ap-northeast-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.ap-northeast-1.amazonaws.com/${stage}`,
      displayName: 'Asia Pacific (Tokyo)',
    },
    {
      region: 'ap-southeast-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.ap-southeast-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.ap-southeast-1.amazonaws.com/${stage}`,
      displayName: 'Asia Pacific (Singapore)',
    },
    {
      region: 'ap-south-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.ap-south-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.ap-south-1.amazonaws.com/${stage}`,
      displayName: 'Asia Pacific (Mumbai)',
    },
    {
      region: 'sa-east-1',
      wsEndpoint: `wss://REPLACE_WITH_ACTUAL.execute-api.sa-east-1.amazonaws.com/${stage}`,
      httpEndpoint: `https://REPLACE_WITH_ACTUAL.execute-api.sa-east-1.amazonaws.com/${stage}`,
      displayName: 'South America (São Paulo)',
    },
  ];
}

// Get endpoint for current region
export function getCurrentEndpoints() {
  const region = getCurrentRegion();
  const stage = process.env.STAGE || 'dev';
  const apiGatewayId = process.env.API_GATEWAY_ID || 'REPLACE_WITH_ACTUAL';
  const wsApiGatewayId = process.env.WS_API_GATEWAY_ID || 'REPLACE_WITH_ACTUAL';
  
  return {
    wsEndpoint: `wss://${wsApiGatewayId}.execute-api.${region}.amazonaws.com/${stage}`,
    httpEndpoint: `https://${apiGatewayId}.execute-api.${region}.amazonaws.com/${stage}`,
  };
}

// Connection TTL in seconds (1 hour)
export const CONNECTION_TTL_SECONDS = parseInt(process.env.CONNECTION_TTL_SECONDS || '3600', 10);

// Session TTL in seconds (24 hours)
export const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL_SECONDS || '86400', 10);

