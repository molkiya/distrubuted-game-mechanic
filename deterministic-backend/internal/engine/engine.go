package engine

import (
	"math"
	"time"
)

// State represents the computed deterministic state at a given point in time.
// All fields are computed deterministically from (seed, startAt, tickMs, now).
type State struct {
	Step   int64 // Number of ticks since start (0-based)
	Value  int64 // Counter value (resets on break)
	Round  int64 // Round number (increments after each break)
	Broken bool  // Whether the sequence is currently 'broken' (just reset)
}

// StateAt computes the deterministic state at a given time.
//
// This is a pure function: same inputs always produce same outputs.
// No network calls, no side effects, fully deterministic.
//
// Parameters:
//   - seed: The base seed value (determines break pattern)
//   - startAt: When the session started
//   - tickMs: Tick interval in milliseconds
//   - now: Current time to compute state for
//
// Returns:
//   - State with Step, Value, Round, and Broken fields
func StateAt(seed int64, startAt time.Time, tickMs int64, now time.Time) State {
	// If before start, return initial state
	if now.Before(startAt) {
		return State{
			Step:   0,
			Value:  0,
			Round:  0,
			Broken: false,
		}
	}

	// Calculate step: floor((now - startAt) / tickMs)
	step := StepAt(startAt, tickMs, now)

	if step < 0 {
		return State{
			Step:   0,
			Value:  0,
			Round:  0,
			Broken: false,
		}
	}

	// Simulate from step 0 to current step to compute state
	// This ensures deterministic computation regardless of step value
	currentValue := int64(0)
	currentRound := int64(0)
	stepWithinRound := int64(0)
	isBroken := false

	// Track when the next break should occur
	nextBreakAt := computeBreakInterval(seed, currentRound)

	for s := int64(0); s <= step; s++ {
		// Check if we should break at this step
		if stepWithinRound >= nextBreakAt && s > 0 {
			// Break: reset counter and increment round
			currentRound++
			stepWithinRound = 0
			currentValue = 0
			isBroken = true
			// Compute next break interval for new round
			nextBreakAt = computeBreakInterval(seed, currentRound)
		} else {
			// Increment counter
			stepWithinRound++
			currentValue++
			isBroken = false
		}
	}

	return State{
		Step:   step,
		Value:  currentValue,
		Round:  currentRound,
		Broken: isBroken,
	}
}

// StepAt calculates the step index from time.
// This is a pure utility function.
//
// Formula: step = floor((now - startAt) / tickMs)
// If now < startAt, returns 0 (not negative).
//
// Parameters:
//   - startAt: Session start time
//   - tickMs: Tick interval in milliseconds
//   - now: Current time
//
// Returns:
//   - Step index (0-based, 0 if before start)
func StepAt(startAt time.Time, tickMs int64, now time.Time) int64 {
	if now.Before(startAt) {
		return 0
	}

	elapsed := now.Sub(startAt).Milliseconds()
	step := int64(math.Floor(float64(elapsed) / float64(tickMs)))

	if step < 0 {
		return 0
	}

	return step
}

// computeBreakInterval determines when the next break should occur.
// Uses a deterministic PRNG based on seed and round.
//
// Returns a value between 100 and 300 steps (inclusive).
// The exact value is deterministic: same (seed, round) → same interval.
//
// Algorithm:
// 1. Combine seed and round to create unique input
// 2. Use xorshift PRNG to generate pseudo-random value
// 3. Map to range [100, 300]
func computeBreakInterval(seed int64, round int64) int64 {
	// Combine seed and round for unique input
	combined := seed ^ round

	// Use xorshift64 for deterministic pseudo-random number
	rng := xorshift64(uint64(combined))

	// Map to range [100, 300]
	// rng is in range [0, 2^64-1], we want [100, 300]
	// interval = 100 + (rng % 201)
	interval := 100 + int64(rng%201)

	return interval
}

// xorshift64 implements a 64-bit xorshift PRNG.
// This is a pure function: same input → same output.
//
// Xorshift is fast, has good statistical properties, and is deterministic.
// Used here to generate break intervals deterministically.
func xorshift64(state uint64) uint64 {
	state ^= state << 13
	state ^= state >> 7
	state ^= state << 17
	return state
}
