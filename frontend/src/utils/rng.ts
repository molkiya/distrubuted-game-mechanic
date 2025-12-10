/**
 * Deterministic Pseudo-Random Number Generator
 * 
 * Uses a Linear Congruential Generator (LCG) to produce deterministic
 * pseudo-random numbers based on a seed and step index.
 * 
 * Determinism: Given the same (seed, step), this function will always
 * return the same pseudo-random number, ensuring consistent behavior
 * across all clients globally.
 * 
 * @param seed - The base seed value (from server)
 * @param step - The current step index (time-based: floor((now - startAt) / tickMs))
 * @returns A pseudo-random number in the range [0, 2^31 - 1]
 */
export function deterministicRNG(seed: number, step: number): number {
  // LCG parameters (same as used in many standard libraries)
  // These constants ensure good statistical properties
  const a = 1664525; // multiplier
  const c = 1013904223; // increment
  const m = Math.pow(2, 32); // modulus

  // Combine seed and step to create a unique input
  // This ensures different steps produce different values even with same seed
  const combined = (seed ^ step) >>> 0; // XOR and ensure unsigned 32-bit

  // Apply LCG formula: (a * x + c) mod m
  let value = (a * combined + c) % m;

  // Ensure positive value
  return Math.abs(value);
}

/**
 * Determines if the counter should break (reset) at a given step
 * 
 * Uses deterministic RNG to decide breaks. The same (seed, step) will
 * always produce the same break decision across all clients.
 * 
 * @param seed - The game seed
 * @param step - Current step index
 * @param breakProbability - Probability of break (1/breakProbability chance)
 * @returns true if counter should break, false otherwise
 */
export function shouldBreak(seed: number, step: number, breakProbability: number = 50): boolean {
  const randomValue = deterministicRNG(seed, step);
  return randomValue % breakProbability === 0;
}

