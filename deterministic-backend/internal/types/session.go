package types

import (
	"encoding/json"
	"time"
)

// Session represents a deterministic real-time session
type Session struct {
	ID        string          `json:"id"`
	Seed      string          `json:"seed"` // UUID or uint64 as string
	StartAt   time.Time       `json:"start_at"`
	TickMs    int             `json:"tick_ms"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	Status    string          `json:"status"` // "running", "stopped"
	CreatedAt time.Time       `json:"created_at"`
	StoppedAt *time.Time      `json:"stopped_at,omitempty"`
}

// State represents the computed state at a given step
type State struct {
	Counter  int  `json:"counter"`
	IsBroken bool `json:"is_broken"`
	Round    int  `json:"round"`
	Step     int  `json:"step"`
}

// CreateSessionRequest represents a request to create a session
type CreateSessionRequest struct {
	TickMs   int             `json:"tick_ms"`
	StartAt  *string         `json:"start_at,omitempty"` // Optional RFC3339 string
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// CreateSessionResponse represents the response when creating a session
type CreateSessionResponse struct {
	ID       string          `json:"id"`
	Seed     string          `json:"seed"` // UUID or uint64 as string
	StartAt  string          `json:"start_at"` // RFC3339
	TickMs   int             `json:"tick_ms"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
	Status   string          `json:"status"` // "running"
}

// GetSessionResponse represents the response when getting a session
type GetSessionResponse struct {
	ID       string          `json:"id"`
	Seed     string          `json:"seed"`
	StartAt  string          `json:"start_at"` // RFC3339
	TickMs   int             `json:"tick_ms"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
	Status   string          `json:"status"` // "running" or "stopped"
}

// StopSessionResponse represents the response when stopping a session
type StopSessionResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"` // "stopped"
}

// SessionStateResponse represents the response when getting session state
type SessionStateResponse struct {
	Step      int64  `json:"step"`
	Value     int64  `json:"value"`
	Round     int64  `json:"round"`
	Broken    bool   `json:"broken"`
	ComputedAt string `json:"computed_at"` // RFC3339
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

