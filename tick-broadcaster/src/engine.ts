/**
 * Deterministic game engine for tick-broadcaster
 * 
 * This is the same algorithm used in the Go backend, ported to TypeScript.
 * It ensures all Lambda instances compute identical game states.
 */

export interface GameState {
  step: number;
  value: number;
  round: number;
  broken: boolean;
}

/**
 * xorshift64 PRNG - fast, deterministic pseudo-random number generator
 */
function xorshift64(state: bigint): bigint {
  state ^= state << 13n;
  state ^= state >> 7n;
  state ^= state << 17n;
  return state & 0xFFFFFFFFFFFFFFFFn; // Keep it 64-bit
}

/**
 * Compute break interval for a given seed and round
 * Returns a value in range [100, 300]
 */
function computeBreakInterval(seed: number, round: number): number {
  const combined = BigInt(seed) ^ BigInt(round);
  const rng = xorshift64(combined < 0n ? -combined : combined);
  return 100 + Number(rng % 201n); // Range: [100, 300]
}

/**
 * Compute game state at a specific time
 * 
 * This is the core deterministic function. Given the same inputs,
 * it ALWAYS produces the same output, regardless of when or where
 * it's called.
 * 
 * @param seed - Base seed for randomness
 * @param startAt - When the session started (Unix timestamp ms)
 * @param tickMs - Tick interval in milliseconds
 * @param now - Current time to compute state for (Unix timestamp ms)
 * @returns GameState with step, value, round, and broken flag
 */
export function stateAt(
  seed: number,
  startAt: number,
  tickMs: number,
  now: number
): GameState {
  // Calculate current step
  const elapsed = now - startAt;
  if (elapsed < 0) {
    // Before start
    return { step: 0, value: 0, round: 0, broken: false };
  }
  
  const currentStep = Math.floor(elapsed / tickMs);
  
  // Simulate from step 0 to currentStep
  let value = 0;
  let round = 0;
  let broken = false;
  let stepsUntilBreak = computeBreakInterval(seed, round);
  let stepsSinceBreak = 0;
  
  for (let step = 0; step <= currentStep; step++) {
    broken = false;
    stepsSinceBreak++;
    
    if (stepsSinceBreak >= stepsUntilBreak) {
      // Break occurred
      broken = true;
      round++;
      value = 0;
      stepsUntilBreak = computeBreakInterval(seed, round);
      stepsSinceBreak = 0;
    } else {
      // Increment value
      value++;
    }
  }
  
  return { step: currentStep, value, round, broken };
}

/**
 * Check if a break occurred at a specific step
 * Used for real-time tick broadcasting
 */
export function checkBreakAtStep(
  seed: number,
  startAt: number,
  tickMs: number,
  step: number
): { value: number; round: number; broken: boolean } {
  // Compute state at the given step
  const now = startAt + (step * tickMs);
  return stateAt(seed, startAt, tickMs, now);
}

/**
 * Get current step from time
 */
export function getCurrentStep(startAt: number, tickMs: number, now: number = Date.now()): number {
  const elapsed = now - startAt;
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / tickMs);
}

/**
 * Calculate remaining time until next tick
 */
export function msUntilNextTick(startAt: number, tickMs: number, now: number = Date.now()): number {
  if (now < startAt) {
    return startAt - now; // Waiting for start
  }
  
  const elapsed = now - startAt;
  const currentStep = Math.floor(elapsed / tickMs);
  const nextTickAt = startAt + ((currentStep + 1) * tickMs);
  return nextTickAt - now;
}

