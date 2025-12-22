/**
 * Latency measurement and threshold utilities
 */

import { LatencyThresholds, LatencyStatusMessage, KickedMessage } from '../types';
import { getLatencyThresholds } from '../config';

/**
 * Calculate average latency from samples
 */
export function calculateAvgLatency(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((a, b) => a + b, 0);
  return Math.round(sum / samples.length);
}

/**
 * Calculate jitter (standard deviation of latency)
 */
export function calculateJitter(samples: number[]): number {
  if (samples.length < 2) return 0;
  
  const avg = calculateAvgLatency(samples);
  const squaredDiffs = samples.map(sample => Math.pow(sample - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / samples.length;
  
  return Math.round(Math.sqrt(avgSquaredDiff));
}

/**
 * Add a new latency sample and maintain rolling window
 */
export function addLatencySample(
  history: number[],
  newSample: number,
  maxSamples: number
): number[] {
  const updated = [...history, newSample];
  if (updated.length > maxSamples) {
    return updated.slice(-maxSamples);
  }
  return updated;
}

/**
 * Check latency status against thresholds
 */
export type LatencyStatus = 'ok' | 'warning' | 'critical';

export interface LatencyCheckResult {
  status: LatencyStatus;
  avgLatency: number;
  jitter: number;
  shouldKick: boolean;
  message?: string;
}

export function checkLatencyThresholds(
  samples: number[],
  thresholds?: LatencyThresholds
): LatencyCheckResult {
  const config = thresholds || getLatencyThresholds();
  const avgLatency = calculateAvgLatency(samples);
  const jitter = calculateJitter(samples);
  
  // Check if should be kicked
  if (avgLatency > config.maxLatencyMs || jitter > config.maxJitterMs) {
    let reason = '';
    if (avgLatency > config.maxLatencyMs) {
      reason = `Average latency ${avgLatency}ms exceeds maximum ${config.maxLatencyMs}ms`;
    } else {
      reason = `Jitter ${jitter}ms exceeds maximum ${config.maxJitterMs}ms`;
    }
    
    return {
      status: 'critical',
      avgLatency,
      jitter,
      shouldKick: true,
      message: reason,
    };
  }
  
  // Check if in warning zone
  if (avgLatency > config.warningLatencyMs || jitter > config.warningJitterMs) {
    let reason = '';
    if (avgLatency > config.warningLatencyMs) {
      reason = `High latency detected: ${avgLatency}ms (warning threshold: ${config.warningLatencyMs}ms)`;
    } else {
      reason = `High jitter detected: ${jitter}ms (warning threshold: ${config.warningJitterMs}ms)`;
    }
    
    return {
      status: 'warning',
      avgLatency,
      jitter,
      shouldKick: false,
      message: reason,
    };
  }
  
  return {
    status: 'ok',
    avgLatency,
    jitter,
    shouldKick: false,
  };
}

/**
 * Create latency status message for client
 */
export function createLatencyStatusMessage(
  checkResult: LatencyCheckResult
): LatencyStatusMessage {
  return {
    type: 'latency_status',
    avgLatency: checkResult.avgLatency,
    jitter: checkResult.jitter,
    status: checkResult.status,
    message: checkResult.message,
  };
}

/**
 * Create kicked message for client
 */
export function createKickedMessage(
  checkResult: LatencyCheckResult,
  thresholds?: LatencyThresholds
): KickedMessage {
  const config = thresholds || getLatencyThresholds();
  
  return {
    type: 'kicked',
    reason: checkResult.message || 'Connection quality too poor for real-time gameplay',
    avgLatency: checkResult.avgLatency,
    jitter: checkResult.jitter,
    maxLatency: config.maxLatencyMs,
    maxJitter: config.maxJitterMs,
  };
}

/**
 * Calculate round-trip time from client and server timestamps
 */
export function calculateRTT(
  clientSentTimestamp: number,
  serverReceivedTimestamp: number,
  serverSentTimestamp: number,
  clientReceivedTimestamp: number
): number {
  // RTT = (clientReceived - clientSent) - (serverSent - serverReceived)
  // This accounts for server processing time
  const totalTime = clientReceivedTimestamp - clientSentTimestamp;
  const serverProcessingTime = serverSentTimestamp - serverReceivedTimestamp;
  return Math.max(0, totalTime - serverProcessingTime);
}

/**
 * Simplified RTT calculation using just ping/pong timestamps
 * Assumes network latency is symmetric
 */
export function calculateSimpleRTT(
  pingTimestamp: number,
  pongTimestamp: number
): number {
  return Math.max(0, pongTimestamp - pingTimestamp);
}

