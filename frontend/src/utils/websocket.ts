/**
 * WebSocket client for connecting to tick-broadcaster Lambda
 */

import {
  ServerMessage,
  TickMessage,
  PongMessage,
  SessionJoinedMessage,
  CountdownMessage,
  LatencyStatusMessage,
  KickedMessage,
  ErrorMessage,
  LatencyState,
  ConnectionStatus,
} from '../types';

// Ping interval in milliseconds
const PING_INTERVAL_MS = 1000;
const MAX_LATENCY_SAMPLES = 10;

export interface WebSocketClientCallbacks {
  onConnectionChange: (status: ConnectionStatus, error?: string) => void;
  onTick: (tick: TickMessage) => void;
  onCountdown: (countdown: CountdownMessage) => void;
  onSessionJoined: (session: SessionJoinedMessage) => void;
  onLatencyUpdate: (latency: LatencyState) => void;
  onKicked: (kicked: KickedMessage) => void;
  onError: (error: ErrorMessage) => void;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private latencySamples: number[] = [];
  private callbacks: WebSocketClientCallbacks;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(callbacks: WebSocketClientCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to WebSocket endpoint
   */
  connect(wsEndpoint: string): void {
    if (this.ws) {
      this.disconnect();
    }

    console.log(`[WS] Connecting to ${wsEndpoint}`);
    this.callbacks.onConnectionChange('connecting');

    try {
      this.ws = new WebSocket(wsEndpoint);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      this.callbacks.onConnectionChange('error', 'Failed to connect');
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    console.log('[WS] Disconnecting');
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }

    this.sessionId = null;
    this.userId = null;
    this.latencySamples = [];
    this.reconnectAttempts = 0;
    this.callbacks.onConnectionChange('disconnected');
  }

  /**
   * Join a game session
   */
  joinSession(sessionId: string, userId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] Cannot join session: not connected');
      return;
    }

    this.sessionId = sessionId;
    this.userId = userId;

    console.log(`[WS] Joining session ${sessionId}`);
    this.send({
      action: 'join',
      sessionId,
      userId,
    });
  }

  /**
   * Send a message
   */
  private send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send ping for latency measurement
   */
  private sendPing(): void {
    this.send({
      action: 'ping',
      clientTimestamp: Date.now(),
    });
  }

  /**
   * Handle WebSocket open
   */
  private handleOpen(): void {
    console.log('[WS] Connected');
    this.callbacks.onConnectionChange('connected');
    this.reconnectAttempts = 0;

    // Start ping interval for latency measurement
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL_MS);
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    console.log(`[WS] Closed: ${event.code} ${event.reason}`);
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Attempt reconnect if not intentionally closed
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.sessionId) {
      this.reconnectAttempts++;
      console.log(`[WS] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.callbacks.onConnectionChange('connecting');
      
      // Reconnect after delay
      setTimeout(() => {
        if (this.ws) {
          // The URL is stored in ws, but after close we can't access it
          // In real implementation, store the endpoint separately
          console.log('[WS] Reconnect not implemented in this demo');
        }
      }, 1000);
    } else {
      this.callbacks.onConnectionChange('disconnected');
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(event: Event): void {
    console.error('[WS] Error:', event);
    this.callbacks.onConnectionChange('error', 'WebSocket error');
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: ServerMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'tick':
          this.handleTick(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        case 'session_joined':
          this.handleSessionJoined(message);
          break;
        case 'countdown':
          this.handleCountdown(message);
          break;
        case 'latency_status':
          this.handleLatencyStatus(message);
          break;
        case 'kicked':
          this.handleKicked(message);
          break;
        case 'error':
          this.handleServerError(message);
          break;
        default:
          console.warn('[WS] Unknown message type:', message);
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }

  private handleTick(tick: TickMessage): void {
    this.callbacks.onTick(tick);
  }

  private handlePong(pong: PongMessage): void {
    // Calculate RTT
    const now = Date.now();
    const rtt = now - pong.clientTimestamp;
    
    // Add to samples
    this.latencySamples.push(rtt);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }

    // Calculate stats
    const avgLatency = this.calculateAverage(this.latencySamples);
    const jitter = this.calculateJitter(this.latencySamples);

    // Determine status
    let status: LatencyState['status'] = 'ok';
    if (avgLatency > 150 || jitter > 50) {
      status = 'critical';
    } else if (avgLatency > 100 || jitter > 30) {
      status = 'warning';
    }

    this.callbacks.onLatencyUpdate({
      avgLatency,
      jitter,
      status,
      samples: [...this.latencySamples],
    });
  }

  private handleSessionJoined(session: SessionJoinedMessage): void {
    console.log(`[WS] Joined session ${session.sessionId}`);
    this.callbacks.onConnectionChange('joined');
    this.callbacks.onSessionJoined(session);
  }

  private handleCountdown(countdown: CountdownMessage): void {
    this.callbacks.onCountdown(countdown);
  }

  private handleLatencyStatus(status: LatencyStatusMessage): void {
    this.callbacks.onLatencyUpdate({
      avgLatency: status.avgLatency,
      jitter: status.jitter,
      status: status.status,
      message: status.message,
      samples: this.latencySamples,
    });
  }

  private handleKicked(kicked: KickedMessage): void {
    console.log(`[WS] Kicked: ${kicked.reason}`);
    this.callbacks.onConnectionChange('kicked', kicked.reason);
    this.callbacks.onKicked(kicked);
    this.disconnect();
  }

  private handleServerError(error: ErrorMessage): void {
    console.error(`[WS] Server error: ${error.code} - ${error.message}`);
    this.callbacks.onError(error);
  }

  private calculateAverage(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((a, b) => a + b, 0);
    return Math.round(sum / samples.length);
  }

  private calculateJitter(samples: number[]): number {
    if (samples.length < 2) return 0;
    const avg = this.calculateAverage(samples);
    const squaredDiffs = samples.map((s) => Math.pow(s - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / samples.length;
    return Math.round(Math.sqrt(avgSquaredDiff));
  }
}

