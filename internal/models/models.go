package models

import "time"

// Session represents a game session
type Session struct {
	SessionID string    `json:"session_id"`
	UserID    string    `json:"user_id"`
	Region    string    `json:"region"`
	StartedAt time.Time `json:"started_at"`
	Status    string    `json:"status"` // "active", "exited"
}

// Region represents a regional server instance
type Region struct {
	Region   string    `json:"region"`
	BaseURL  string    `json:"base_url"`
	LastSeen time.Time `json:"last_seen"`
	IsMain   bool      `json:"is_main"`
}

// StartGameRequest represents the request to start a game
type StartGameRequest struct {
	UserID string `json:"user_id"`
	Region string `json:"region,omitempty"` // Optional: preferred region
}

// StartGameResponse represents the response when starting a game
type StartGameResponse struct {
	SessionID string    `json:"session_id"`
	UserID    string    `json:"user_id"`
	Region    string    `json:"region"`
	StartedAt time.Time `json:"started_at"`
	Status    string    `json:"status"`
}

// ExitGameResponse represents the response when exiting a game
type ExitGameResponse struct {
	SessionID string    `json:"session_id"`
	UserID    string    `json:"user_id"`
	ExitedAt  time.Time `json:"exited_at"`
	Status    string    `json:"status"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// RegisterRegionRequest represents a region registration request
type RegisterRegionRequest struct {
	Region  string `json:"region"`
	BaseURL string `json:"base_url"`
}

