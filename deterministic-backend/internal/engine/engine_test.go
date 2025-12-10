package engine

import (
	"testing"
	"time"
)

func TestStepAt(t *testing.T) {
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	tests := []struct {
		name     string
		now      time.Time
		expected int64
	}{
		{
			name:     "before start",
			now:      startAt.Add(-1 * time.Second),
			expected: 0,
		},
		{
			name:     "at start",
			now:      startAt,
			expected: 0,
		},
		{
			name:     "after 1 tick",
			now:      startAt.Add(100 * time.Millisecond),
			expected: 1,
		},
		{
			name:     "after 5 ticks",
			now:      startAt.Add(500 * time.Millisecond),
			expected: 5,
		},
		{
			name:     "after 10.5 ticks (should floor)",
			now:      startAt.Add(1050 * time.Millisecond),
			expected: 10,
		},
		{
			name:     "after 100 ticks",
			now:      startAt.Add(10 * time.Second),
			expected: 100,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StepAt(startAt, tickMs, tt.now)
			if result != tt.expected {
				t.Errorf("Expected step %d, got %d", tt.expected, result)
			}
		})
	}
}

func TestStateAt_BeforeStart(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt.Add(-1 * time.Second)

	state := StateAt(seed, startAt, tickMs, now)

	if state.Step != 0 {
		t.Errorf("Expected step 0, got %d", state.Step)
	}
	if state.Value != 0 {
		t.Errorf("Expected value 0, got %d", state.Value)
	}
	if state.Round != 0 {
		t.Errorf("Expected round 0, got %d", state.Round)
	}
	if state.Broken {
		t.Error("Expected Broken=false, got true")
	}
}

func TestStateAt_AtStart(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt

	state := StateAt(seed, startAt, tickMs, now)

	if state.Step != 0 {
		t.Errorf("Expected step 0, got %d", state.Step)
	}
	if state.Value != 1 {
		t.Errorf("Expected value 1 (first increment), got %d", state.Value)
	}
	if state.Round != 0 {
		t.Errorf("Expected round 0, got %d", state.Round)
	}
}

func TestStateAt_Determinism(t *testing.T) {
	// Test that same inputs produce same outputs
	seed := int64(987654321)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt.Add(5000 * time.Millisecond) // 50 steps

	// Run multiple times
	results := make([]State, 10)
	for i := 0; i < 10; i++ {
		results[i] = StateAt(seed, startAt, tickMs, now)
	}

	// All results should be identical
	first := results[0]
	for i, result := range results {
		if result != first {
			t.Errorf("Non-deterministic at iteration %d: first %+v, got %+v", i, first, result)
		}
	}
}

func TestStateAt_StepProgression(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	// Test that step increases with time
	steps := []int64{0, 1, 5, 10, 50, 100}
	prevStep := int64(-1)

	for _, expectedStep := range steps {
		now := startAt.Add(time.Duration(expectedStep) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		if state.Step != expectedStep {
			t.Errorf("At step %d: expected Step=%d, got %d", expectedStep, expectedStep, state.Step)
		}

		// Step should always increase
		if state.Step <= prevStep {
			t.Errorf("Step should increase: prev=%d, current=%d", prevStep, state.Step)
		}

		prevStep = state.Step
	}
}

func TestStateAt_ValueIncrements(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	// Test first few steps (before any break)
	// Value should increment with step
	for step := int64(0); step < 10; step++ {
		now := startAt.Add(time.Duration(step) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		expectedValue := step + 1 // Value starts at 1 (after first increment)
		if state.Value != expectedValue {
			t.Errorf("At step %d: expected Value=%d, got %d", step, expectedValue, state.Value)
		}
	}
}

func TestStateAt_BreaksOccur(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	// Find a step where a break occurs
	// Breaks occur every 100-300 steps, so we should find one by step 400
	var breakStep int64
	var breakState State

	for step := int64(0); step < 400; step++ {
		now := startAt.Add(time.Duration(step) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		if state.Broken {
			breakStep = step
			breakState = state
			break
		}
	}

	if breakStep == 0 {
		t.Fatal("No break found in first 400 steps")
	}

	// Verify break properties
	if breakState.Value != 0 {
		t.Errorf("After break: expected Value=0, got %d", breakState.Value)
	}
	if breakState.Round == 0 {
		t.Error("After break: expected Round > 0, got 0")
	}
	if !breakState.Broken {
		t.Error("After break: expected Broken=true, got false")
	}

	// Verify break is deterministic
	now := startAt.Add(time.Duration(breakStep) * time.Duration(tickMs) * time.Millisecond)
	state2 := StateAt(seed, startAt, tickMs, now)

	if state2 != breakState {
		t.Errorf("Break not deterministic: first %+v, second %+v", breakState, state2)
	}
}

func TestStateAt_RoundIncrements(t *testing.T) {
	seed := int64(999999)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	// Track rounds as we progress
	maxStep := int64(1000)
	roundsSeen := make(map[int64]bool)
	maxRound := int64(0)

	for step := int64(0); step < maxStep; step++ {
		now := startAt.Add(time.Duration(step) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		if state.Round > maxRound {
			maxRound = state.Round
		}
		roundsSeen[state.Round] = true
	}

	// Should have seen multiple rounds (breaks occur every 100-300 steps)
	if maxRound == 0 {
		t.Error("Expected at least one round increment, got 0")
	}

	// Verify round progression is monotonic (doesn't decrease)
	prevRound := int64(-1)
	for step := int64(0); step < maxStep; step++ {
		now := startAt.Add(time.Duration(step) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		if state.Round < prevRound {
			t.Errorf("Round decreased: step %d, prev round %d, current round %d", step, prevRound, state.Round)
		}
		prevRound = state.Round
	}
}

func TestStateAt_ValueResetsOnBreak(t *testing.T) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)

	// Find break step
	var breakStep int64
	for step := int64(0); step < 400; step++ {
		now := startAt.Add(time.Duration(step) * time.Duration(tickMs) * time.Millisecond)
		state := StateAt(seed, startAt, tickMs, now)

		if state.Broken {
			breakStep = step
			break
		}
	}

	if breakStep == 0 {
		t.Fatal("No break found")
	}

	// Value before break should be > 0
	beforeBreak := breakStep - 1
	nowBefore := startAt.Add(time.Duration(beforeBreak) * time.Duration(tickMs) * time.Millisecond)
	stateBefore := StateAt(seed, startAt, tickMs, nowBefore)

	if stateBefore.Value == 0 {
		t.Error("Value before break should be > 0")
	}

	// Value at break should be 0
	nowAt := startAt.Add(time.Duration(breakStep) * time.Duration(tickMs) * time.Millisecond)
	stateAt := StateAt(seed, startAt, tickMs, nowAt)

	if stateAt.Value != 0 {
		t.Errorf("Value at break should be 0, got %d", stateAt.Value)
	}

	// Value after break should start incrementing again
	afterBreak := breakStep + 1
	nowAfter := startAt.Add(time.Duration(afterBreak) * time.Duration(tickMs) * time.Millisecond)
	stateAfter := StateAt(seed, startAt, tickMs, nowAfter)

	if stateAfter.Value != 1 {
		t.Errorf("Value after break should be 1, got %d", stateAfter.Value)
	}
}

func TestStateAt_DifferentSeeds(t *testing.T) {
	// Different seeds should produce different break patterns
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt.Add(500 * time.Second) // 5000 steps

	seed1 := int64(111111)
	seed2 := int64(222222)

	state1 := StateAt(seed1, startAt, tickMs, now)
	state2 := StateAt(seed2, startAt, tickMs, now)

	// Same step, but different values due to different break patterns
	if state1.Step != state2.Step {
		t.Errorf("Steps should be same: %d vs %d", state1.Step, state2.Step)
	}

	// Values and rounds should likely be different (different break patterns)
	// But they could theoretically be the same, so we just verify they're valid
	if state1.Value < 0 || state2.Value < 0 {
		t.Error("Values should be non-negative")
	}
	if state1.Round < 0 || state2.Round < 0 {
		t.Error("Rounds should be non-negative")
	}
}

func BenchmarkStateAt(b *testing.B) {
	seed := int64(12345)
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt.Add(1000 * time.Second) // 10000 steps

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		StateAt(seed, startAt, tickMs, now)
	}
}

func BenchmarkStepAt(b *testing.B) {
	startAt := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	tickMs := int64(100)
	now := startAt.Add(1000 * time.Second)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		StepAt(startAt, tickMs, now)
	}
}
