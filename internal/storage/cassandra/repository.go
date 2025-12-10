package cassandra

import (
	"context"
	"fmt"
	"time"

	"github.com/gocql/gocql"
	"github.com/distrubuted-game-mechanic/internal/models"
	"github.com/distrubuted-game-mechanic/internal/storage"
	"github.com/distrubuted-game-mechanic/pkg/logger"
)

// Repository implements SessionRepository using Cassandra
type Repository struct {
	client  *Client
	logger  *logger.Logger
	timeout time.Duration
}

// NewRepository creates a new Cassandra-based session repository
func NewRepository(client *Client, log *logger.Logger, timeout time.Duration) *Repository {
	return &Repository{
		client:  client,
		logger:  log,
		timeout: timeout,
	}
}

// CreateSession creates a new session in Cassandra
func (r *Repository) CreateSession(ctx context.Context, session *models.Session) error {
	query := fmt.Sprintf(`
		INSERT INTO %s.sessions (session_id, user_id, region, started_at, status)
		VALUES (?, ?, ?, ?, ?)
		IF NOT EXISTS`, r.client.Keyspace())

	// Use context timeout if available, otherwise use configured timeout
	queryCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		queryCtx, cancel = context.WithTimeout(ctx, r.timeout)
		defer cancel()
	}

	// Check if context is already cancelled
	select {
	case <-queryCtx.Done():
		return fmt.Errorf("context cancelled: %w", queryCtx.Err())
	default:
	}

	applied, err := r.client.Session().Query(query,
		session.SessionID,
		session.UserID,
		session.Region,
		session.StartedAt,
		session.Status,
	).WithContext(queryCtx).ScanCAS(nil)

	if err != nil {
		r.logger.Error("Failed to create session in Cassandra",
			logger.F("session_id", session.SessionID),
			logger.F("error", err.Error()))
		return fmt.Errorf("failed to create session: %w", err)
	}

	if !applied {
		return storage.ErrSessionExists
	}

	r.logger.Debug("Session created", logger.F("session_id", session.SessionID))
	return nil
}

// GetSession retrieves a session by ID
func (r *Repository) GetSession(ctx context.Context, sessionID string) (*models.Session, error) {
	query := fmt.Sprintf(`
		SELECT session_id, user_id, region, started_at, status
		FROM %s.sessions
		WHERE session_id = ?`, r.client.Keyspace())

	// Use context timeout if available
	queryCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		queryCtx, cancel = context.WithTimeout(ctx, r.timeout)
		defer cancel()
	}

	// Check if context is already cancelled
	select {
	case <-queryCtx.Done():
		return nil, fmt.Errorf("context cancelled: %w", queryCtx.Err())
	default:
	}

	var session models.Session
	err := r.client.Session().Query(query, sessionID).WithContext(queryCtx).Scan(
		&session.SessionID,
		&session.UserID,
		&session.Region,
		&session.StartedAt,
		&session.Status,
	)

	if err != nil {
		if err == gocql.ErrNotFound {
			return nil, storage.ErrSessionNotFound
		}
		r.logger.Error("Failed to get session from Cassandra",
			logger.F("session_id", sessionID),
			logger.F("error", err.Error()))
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return &session, nil
}

// UpdateSession updates a session's status
func (r *Repository) UpdateSession(ctx context.Context, sessionID string, status string) error {
	query := fmt.Sprintf(`
		UPDATE %s.sessions
		SET status = ?
		WHERE session_id = ?
		IF EXISTS`, r.client.Keyspace())

	// Use context timeout if available
	queryCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		queryCtx, cancel = context.WithTimeout(ctx, r.timeout)
		defer cancel()
	}

	// Check if context is already cancelled
	select {
	case <-queryCtx.Done():
		return fmt.Errorf("context cancelled: %w", queryCtx.Err())
	default:
	}

	applied, err := r.client.Session().Query(query, status, sessionID).WithContext(queryCtx).ScanCAS(nil)
	if err != nil {
		r.logger.Error("Failed to update session in Cassandra",
			logger.F("session_id", sessionID),
			logger.F("error", err.Error()))
		return fmt.Errorf("failed to update session: %w", err)
	}

	if !applied {
		return storage.ErrSessionNotFound
	}

	r.logger.Debug("Session updated", logger.F("session_id", sessionID), logger.F("status", status))
	return nil
}

// GetSessionsByUserID retrieves all sessions for a user using the secondary index
func (r *Repository) GetSessionsByUserID(ctx context.Context, userID string) ([]*models.Session, error) {
	query := fmt.Sprintf(`
		SELECT session_id, user_id, region, started_at, status
		FROM %s.sessions
		WHERE user_id = ?`, r.client.Keyspace())

	// Use context timeout if available
	queryCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		queryCtx, cancel = context.WithTimeout(ctx, r.timeout)
		defer cancel()
	}

	// Check if context is already cancelled
	select {
	case <-queryCtx.Done():
		return nil, fmt.Errorf("context cancelled: %w", queryCtx.Err())
	default:
	}

	iter := r.client.Session().Query(query, userID).WithContext(queryCtx).Iter()
	defer iter.Close()

	var sessions []*models.Session
	var session models.Session

	for iter.Scan(
		&session.SessionID,
		&session.UserID,
		&session.Region,
		&session.StartedAt,
		&session.Status,
	) {
		s := session // Copy to avoid pointer issues
		sessions = append(sessions, &s)
	}

	if err := iter.Close(); err != nil {
		r.logger.Error("Failed to get sessions by user ID from Cassandra",
			logger.F("user_id", userID),
			logger.F("error", err.Error()))
		return nil, fmt.Errorf("failed to get sessions: %w", err)
	}

	return sessions, nil
}

