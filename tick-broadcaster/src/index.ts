/**
 * Tick Broadcaster - AWS Lambda Microbackend
 * 
 * This microbackend runs on AWS Lambda closest to players to minimize latency.
 * It broadcasts game ticks via WebSocket to all connected players.
 * 
 * Key features:
 * - Multi-region deployment (EU, US, Asia, etc.)
 * - WebSocket API for real-time tick broadcasting
 * - Latency measurement and thresholds
 * - Automatic player kick for poor connections
 * - Deterministic game engine for state computation
 */

// Re-export handlers for serverless.yml
export { handleConnect, handleDisconnect, handleDefault, handleJoinSession, handlePing } from './handlers/websocket';
export { handleCreateSession, handleGetSession } from './handlers/http';
export { handleTickBroadcast } from './handlers/tick';
export { handleLatencyMonitor, handleStaleConnectionCleanup } from './handlers/latency';

// Re-export types
export * from './types';

// Re-export engine
export { stateAt, getCurrentStep, msUntilNextTick } from './engine';

// Re-export config
export { getLatencyThresholds, getTickConfig, getCurrentRegion, getRegionEndpoints } from './config';

