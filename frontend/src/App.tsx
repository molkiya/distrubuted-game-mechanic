import React, { useState, useEffect, useRef } from 'react';
import { startGame, exitGame } from './utils/api';
import { deterministicRNG, shouldBreak } from './utils/rng';
import { GameState } from './types';
import './App.css';

/**
 * Main App Component
 * 
 * Implements a deterministic game counter that:
 * - Starts at a server-specified time (startAt)
 * - Increments every tickMs milliseconds
 * - Randomly breaks (resets) based on deterministic RNG using (seed, step)
 * - Ensures same behavior across all clients given same inputs
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
    isRunning: false,
    countdown: null,
  });

  // Input state
  const [userIdInput, setUserIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs to manage timers and prevent memory leaks
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Generates a random user ID
   */
  const generateUserId = () => {
    const randomId = `user_${Math.random().toString(36).substring(2, 11)}`;
    setUserIdInput(randomId);
  };

  /**
   * Calculates the current step index based on elapsed time
   * 
   * Step = floor((currentTime - startAt) / tickMs)
   * 
   * This step index is used with the seed to generate deterministic
   * pseudo-random values. The same step at the same time will produce
   * the same RNG value across all clients.
   */
  const getCurrentStep = (startAt: number, tickMs: number): number => {
    const now = Date.now();
    const elapsed = now - startAt;
    return Math.floor(elapsed / tickMs);
  };

  /**
   * Handles the game tick logic
   * 
   * Every tick:
   * 1. Calculate current step based on elapsed time
   * 2. Use deterministic RNG with (seed, step) to decide if counter breaks
   * 3. Either increment counter or reset to 0
   * 4. Log break events for debugging
   */
  const handleTick = () => {
    setGameState((prev) => {
      if (!prev.isRunning || !prev.startAt || !prev.tickMs || !prev.seed) {
        return prev;
      }

      const step = getCurrentStep(prev.startAt, prev.tickMs);
      const rngValue = deterministicRNG(prev.seed, step);

      // Check if counter should break (1 in 50 chance, deterministically)
      if (shouldBreak(prev.seed, step, 50)) {
        console.log(`[BREAK] Step: ${step}, RNG: ${rngValue}, Counter reset to 0`);
        return { ...prev, counter: 0 };
      }

      // Increment counter
      const newCounter = prev.counter + 1;
      if (step % 10 === 0) {
        // Log every 10th step for debugging
        console.log(`[TICK] Step: ${step}, RNG: ${rngValue}, Counter: ${newCounter}`);
      }

      return { ...prev, counter: newCounter };
    });
  };

  /**
   * Starts the countdown and game tick interval
   */
  useEffect(() => {
    if (!gameState.startAt || !gameState.tickMs) {
      return;
    }

    // Clear any existing intervals
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Countdown interval: update countdown every 100ms
    countdownIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = gameState.startAt! - now;

      if (remaining <= 0) {
        // Start the game
        setGameState((prev) => ({
          ...prev,
          isRunning: true,
          countdown: null,
        }));
        console.log('[GAME START] Counter started');

        // Start tick interval
        tickIntervalRef.current = setInterval(handleTick, gameState.tickMs!);
      } else {
        // Update countdown
        setGameState((prev) => ({
          ...prev,
          countdown: Math.ceil(remaining / 1000), // Convert to seconds
        }));
      }
    }, 100);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [gameState.startAt, gameState.tickMs]);

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
      console.log('[API] Starting game for user:', userId);
      const response = await startGame({ userId });

      console.log('[API] Game started:', response);

      setGameState({
        gameId: response.gameId,
        userId: userId,
        seed: response.seed,
        startAt: response.startAt,
        tickMs: response.tickMs,
        counter: 0,
        isRunning: false,
        countdown: Math.ceil((response.startAt - Date.now()) / 1000),
      });
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
      await exitGame({
        gameId: gameState.gameId,
        userId: gameState.userId,
      });

      console.log('[API] Game exited successfully');

      // Clear all timers
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      // Reset game state
      setGameState({
        gameId: null,
        userId: '',
        seed: null,
        startAt: null,
        tickMs: null,
        counter: 0,
        isRunning: false,
        countdown: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exit game';
      setError(errorMessage);
      console.error('[ERROR] Failed to exit game:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>Deterministic Game Counter</h1>

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
            <p className="counter-info">
              Step: {gameState.startAt && gameState.tickMs
                ? getCurrentStep(gameState.startAt, gameState.tickMs)
                : 0}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

