import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startGame, exitGame, findBestRegion } from './utils/api';
import { WebSocketClient, WebSocketClientCallbacks } from './utils/websocket';
import { 
  GameState, 
  LatencyState, 
  ConnectionState,
  TickMessage,
  CountdownMessage,
  SessionJoinedMessage,
  KickedMessage,
  ErrorMessage,
  LATENCY_THRESHOLDS,
} from './types';
import './App.css';

/**
 * Main App Component
 * 
 * Implements a real-time game counter that:
 * - Connects to the nearest tick-broadcaster Lambda via WebSocket
 * - Receives tick updates from the server (not computed locally)
 * - Monitors latency and displays warnings
 * - Gets kicked if latency exceeds thresholds
 */
function App() {
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    gameId: null,
    userId: '',
    seed: null,
    startAt: null,
    tickMs: null,
    counter: 0,
    step: 0,
    round: 0,
    isRunning: false,
    countdown: null,
    region: null,
    wsEndpoint: null,
  });

  // Connection state
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'disconnected',
  });

  // Latency state
  const [latency, setLatency] = useState<LatencyState>({
    avgLatency: 0,
    jitter: 0,
    status: 'unknown',
    samples: [],
  });

  // Input state
  const [userIdInput, setUserIdInput] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('auto');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // WebSocket client ref
  const wsClientRef = useRef<WebSocketClient | null>(null);

  /**
   * WebSocket callbacks
   */
  const wsCallbacks: WebSocketClientCallbacks = {
    onConnectionChange: useCallback((status, errorMsg) => {
      setConnection({ status, error: errorMsg, kickReason: status === 'kicked' ? errorMsg : undefined });
    }, []),

    onTick: useCallback((tick: TickMessage) => {
      setGameState((prev) => ({
        ...prev,
        counter: tick.value,
        step: tick.step,
        round: tick.round,
        isRunning: true,
        countdown: null,
      }));

      // Log breaks
      if (tick.broken) {
        console.log(`[TICK] BREAK at step ${tick.step}, round ${tick.round}`);
      }
    }, []),

    onCountdown: useCallback((countdown: CountdownMessage) => {
      setGameState((prev) => ({
        ...prev,
        countdown: Math.ceil(countdown.remainingMs / 1000),
        isRunning: false,
      }));
    }, []),

    onSessionJoined: useCallback((session: SessionJoinedMessage) => {
      console.log('[SESSION] Joined:', session);
      setGameState((prev) => ({
        ...prev,
        gameId: session.sessionId,
        seed: session.seed,
        startAt: session.startAt,
        tickMs: session.tickMs,
        region: session.region,
      }));
    }, []),

    onLatencyUpdate: useCallback((newLatency: LatencyState) => {
      setLatency(newLatency);
    }, []),

    onKicked: useCallback((kicked: KickedMessage) => {
      setError(`Kicked: ${kicked.reason}`);
      setGameState((prev) => ({
        ...prev,
        isRunning: false,
      }));
    }, []),

    onError: useCallback((err: ErrorMessage) => {
      setError(`${err.code}: ${err.message}`);
    }, []),
  };

  // Initialize WebSocket client
  useEffect(() => {
    wsClientRef.current = new WebSocketClient(wsCallbacks);
    return () => {
      wsClientRef.current?.disconnect();
    };
  }, []);

  /**
   * Generates a random user ID
   */
  const generateUserId = () => {
    const randomId = `user_${Math.random().toString(36).substring(2, 11)}`;
    setUserIdInput(randomId);
  };

  /**
   * Handles starting a new game
   */
  const handleStartGame = async () => {
    const userId = userIdInput.trim();
    if (!userId) {
      setError('Please enter a user ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find best region if auto
      let region = selectedRegion;
      if (region === 'auto') {
        console.log('[REGION] Finding best region...');
        region = await findBestRegion();
        console.log(`[REGION] Selected: ${region}`);
      }

      console.log('[API] Starting game for user:', userId, 'in region:', region);
      const response = await startGame({ userId, preferredRegion: region });

      console.log('[API] Game started:', response);

      // Update game state
      setGameState({
        gameId: response.gameId,
        userId: userId,
        seed: response.seed,
        startAt: response.startAt,
        tickMs: response.tickMs,
        counter: 0,
        step: 0,
        round: 0,
        isRunning: false,
        countdown: Math.ceil((response.startAt - Date.now()) / 1000),
        region: response.region,
        wsEndpoint: response.wsEndpoint,
      });

      // Connect to WebSocket
      if (response.wsEndpoint) {
        console.log('[WS] Connecting to:', response.wsEndpoint);
        wsClientRef.current?.connect(response.wsEndpoint);
        
        // Wait for connection then join session
        setTimeout(() => {
          wsClientRef.current?.joinSession(response.gameId, userId);
        }, 500);
      } else {
        setError('No WebSocket endpoint available');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start game';
      setError(errorMessage);
      console.error('[ERROR] Failed to start game:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles exiting the current game
   */
  const handleExitGame = async () => {
    if (!gameState.gameId || !gameState.userId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[API] Exiting game:', gameState.gameId);
      
      // Disconnect WebSocket
      wsClientRef.current?.disconnect();

      await exitGame({
        gameId: gameState.gameId,
        userId: gameState.userId,
      });

      console.log('[API] Game exited successfully');

      // Reset game state
      setGameState({
        gameId: null,
        userId: '',
        seed: null,
        startAt: null,
        tickMs: null,
        counter: 0,
        step: 0,
        round: 0,
        isRunning: false,
        countdown: null,
        region: null,
        wsEndpoint: null,
      });

      setLatency({
        avgLatency: 0,
        jitter: 0,
        status: 'unknown',
        samples: [],
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exit game';
      setError(errorMessage);
      console.error('[ERROR] Failed to exit game:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Get latency status color
   */
  const getLatencyColor = () => {
    switch (latency.status) {
      case 'ok': return '#4caf50';
      case 'warning': return '#ff9800';
      case 'critical': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  /**
   * Get connection status display
   */
  const getConnectionStatus = () => {
    switch (connection.status) {
      case 'disconnected': return { text: 'Disconnected', color: '#9e9e9e' };
      case 'connecting': return { text: 'Connecting...', color: '#2196f3' };
      case 'connected': return { text: 'Connected', color: '#4caf50' };
      case 'joined': return { text: 'In Game', color: '#4caf50' };
      case 'kicked': return { text: 'Kicked', color: '#f44336' };
      case 'error': return { text: 'Error', color: '#f44336' };
      default: return { text: 'Unknown', color: '#9e9e9e' };
    }
  };

  const connStatus = getConnectionStatus();

  return (
    <div className="app">
      <div className="container">
        <h1>🎮 Real-Time Game Counter</h1>
        <p className="subtitle">Powered by AWS Lambda Tick Broadcaster</p>

        {/* Connection & Latency Status */}
        <div className="status-bar">
          <div className="status-item">
            <span className="status-dot" style={{ backgroundColor: connStatus.color }}></span>
            <span>{connStatus.text}</span>
          </div>
          {gameState.region && (
            <div className="status-item">
              <span>📍 {gameState.region}</span>
            </div>
          )}
          {latency.status !== 'unknown' && (
            <div className="status-item">
              <span className="status-dot" style={{ backgroundColor: getLatencyColor() }}></span>
              <span>{latency.avgLatency}ms (±{latency.jitter}ms)</span>
            </div>
          )}
        </div>

        {/* User ID Input */}
        <div className="input-group">
          <label htmlFor="userId">User ID:</label>
          <div className="input-row">
            <input
              id="userId"
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="Enter user ID or generate one"
              disabled={isLoading || gameState.isRunning}
            />
            <button
              type="button"
              onClick={generateUserId}
              disabled={isLoading || gameState.isRunning}
              className="btn-secondary"
            >
              Generate
            </button>
          </div>
        </div>

        {/* Region Selection */}
        <div className="input-group">
          <label htmlFor="region">Region:</label>
          <select
            id="region"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            disabled={isLoading || gameState.isRunning}
          >
            <option value="auto">Auto (Best Latency)</option>
            <option value="us-east-1">US East (N. Virginia)</option>
            <option value="eu-west-1">EU (Ireland)</option>
            <option value="ap-northeast-1">Asia (Tokyo)</option>
          </select>
        </div>

        {/* Game Controls */}
        <div className="button-group">
          <button
            onClick={handleStartGame}
            disabled={isLoading || gameState.isRunning || !userIdInput.trim()}
            className="btn-primary"
          >
            {isLoading ? 'Starting...' : 'Start Game'}
          </button>
          <button
            onClick={handleExitGame}
            disabled={isLoading || !gameState.gameId}
            className="btn-danger"
          >
            {isLoading ? 'Exiting...' : 'Exit Game'}
          </button>
        </div>

        {/* Error Display */}
        {error && <div className="error">{error}</div>}

        {/* Latency Warning */}
        {latency.status === 'warning' && (
          <div className="warning">
            ⚠️ High latency detected! Your connection may affect gameplay.
            {latency.message && <p>{latency.message}</p>}
          </div>
        )}

        {/* Kicked Message */}
        {connection.status === 'kicked' && (
          <div className="error kicked">
            ❌ You have been disconnected due to poor connection quality.
            <p>Average latency: {latency.avgLatency}ms (max: {LATENCY_THRESHOLDS.maxLatencyMs}ms)</p>
            <p>Jitter: {latency.jitter}ms (max: {LATENCY_THRESHOLDS.maxJitterMs}ms)</p>
          </div>
        )}

        {/* Game Status */}
        {gameState.gameId && (
          <div className="game-status">
            <h2>Game Status</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="label">Game ID:</span>
                <span className="value">{gameState.gameId}</span>
              </div>
              <div className="status-item">
                <span className="label">User ID:</span>
                <span className="value">{gameState.userId}</span>
              </div>
              <div className="status-item">
                <span className="label">Seed:</span>
                <span className="value">{gameState.seed}</span>
              </div>
              <div className="status-item">
                <span className="label">Tick Interval:</span>
                <span className="value">{gameState.tickMs}ms</span>
              </div>
              <div className="status-item">
                <span className="label">Round:</span>
                <span className="value">{gameState.round}</span>
              </div>
              <div className="status-item">
                <span className="label">Status:</span>
                <span className={`value ${gameState.isRunning ? 'running' : 'waiting'}`}>
                  {gameState.isRunning ? 'Running' : 'Waiting to start'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Countdown */}
        {gameState.countdown !== null && gameState.countdown > 0 && (
          <div className="countdown">
            <h2>Starting in...</h2>
            <div className="countdown-number">{gameState.countdown}</div>
          </div>
        )}

        {/* Counter Display */}
        {gameState.isRunning && (
          <div className="counter">
            <h2>Counter</h2>
            <div className="counter-value">{gameState.counter}</div>
            <p className="counter-info">Step: {gameState.step}</p>
          </div>
        )}

        {/* Latency Graph */}
        {latency.samples.length > 0 && (
          <div className="latency-monitor">
            <h3>Latency Monitor</h3>
            <div className="latency-graph">
              {latency.samples.map((sample, i) => (
                <div
                  key={i}
                  className="latency-bar"
                  style={{
                    height: `${Math.min(sample / 2, 100)}%`,
                    backgroundColor: sample > 150 ? '#f44336' : sample > 100 ? '#ff9800' : '#4caf50',
                  }}
                  title={`${sample}ms`}
                />
              ))}
            </div>
            <div className="latency-stats">
              <span>Avg: {latency.avgLatency}ms</span>
              <span>Jitter: ±{latency.jitter}ms</span>
              <span>Max allowed: {LATENCY_THRESHOLDS.maxLatencyMs}ms</span>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="info">
          <h3>How it works</h3>
          <ul>
            <li>🌍 Connects to the nearest AWS Lambda (tick-broadcaster)</li>
            <li>📡 Receives tick updates via WebSocket in real-time</li>
            <li>⏱️ Measures your latency continuously</li>
            <li>⚠️ Warns if latency exceeds {LATENCY_THRESHOLDS.warningLatencyMs}ms</li>
            <li>❌ Disconnects if latency exceeds {LATENCY_THRESHOLDS.maxLatencyMs}ms</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
