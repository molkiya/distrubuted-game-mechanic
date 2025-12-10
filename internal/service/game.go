package service

import (
	"context"
	"fmt"
	"time"

	"github.com/distrubuted-game-mechanic/internal/models"
	"github.com/distrubuted-game-mechanic/internal/storage"
	"github.com/google/uuid"
)

// GameService handles game-related business logic
type GameService struct {
	storage storage.SessionStorage
	region  string
}

// NewGameService creates a new game service
func NewGameService(storage storage.SessionStorage, region string) *GameService {
	return &GameService{
		storage: storage,
		region:  region,
	}
}

// StartGame starts a new game session for a user
func (s *GameService) StartGame(ctx context.Context, userID string) (*models.Session, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id is required")
	}

	// Check if user has an active session
	sessions, err := s.storage.GetSessionsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user sessions: %w", err)
	}

	for _, session := range sessions {
		if session.Status == "active" {
			return nil, fmt.Errorf("user already has an active session: %s", session.SessionID)
		}
	}

	// Create new session
	sessionID := uuid.New().String()
	session := &models.Session{
		SessionID: sessionID,
		UserID:    userID,
		Region:    s.region,
		StartedAt: time.Now(),
		Status:    "active",
	}

	if err := s.storage.CreateSession(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	return session, nil
}

// ExitGame exits a game session
func (s *GameService) ExitGame(ctx context.Context, sessionID string) (*models.Session, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("session_id is required")
	}

	session, err := s.storage.GetSession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	if session.Status == "exited" {
		return nil, fmt.Errorf("session already exited")
	}

	if err := s.storage.UpdateSession(ctx, sessionID, "exited"); err != nil {
		return nil, fmt.Errorf("failed to update session: %w", err)
	}

	// Update the returned session status
	session.Status = "exited"
	return session, nil
}

// GetSession retrieves a session by ID
func (s *GameService) GetSession(ctx context.Context, sessionID string) (*models.Session, error) {
	return s.storage.GetSession(ctx, sessionID)
}

