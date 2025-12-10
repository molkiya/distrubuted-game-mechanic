package store

import (
	"context"

	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/types"
)

// Store defines the interface for session storage.
// This abstraction allows swapping implementations (Redis, Cassandra, etc.)
// without changing the rest of the codebase.
type Store interface {
	// CreateSession creates a new session
	CreateSession(ctx context.Context, session *types.Session) error

	// GetSession retrieves a session by ID
	GetSession(ctx context.Context, id string) (*types.Session, error)

	// UpdateSession updates an existing session
	UpdateSession(ctx context.Context, session *types.Session) error

	// DeleteSession deletes a session (optional, for cleanup)
	DeleteSession(ctx context.Context, id string) error
}

// Errors
var (
	ErrSessionNotFound = &StoreError{Message: "session not found"}
	ErrSessionExists  = &StoreError{Message: "session already exists"}
)

// StoreError represents a storage error
type StoreError struct {
	Message string
}

func (e *StoreError) Error() string {
	return e.Message
}

