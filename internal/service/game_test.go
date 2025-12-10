package service

import (
	"context"
	"testing"
	"time"

	"github.com/distrubuted-game-mechanic/internal/storage"
)

func TestGameService_StartGame(t *testing.T) {
	memStorage := storage.NewMemoryStorage()
	service := NewGameService(memStorage, "test-region")

	tests := []struct {
		name      string
		userID    string
		wantError bool
		errorMsg  string
	}{
		{
			name:      "successful game start",
			userID:    "user123",
			wantError: false,
		},
		{
			name:      "empty user ID",
			userID:    "",
			wantError: true,
			errorMsg:  "user_id is required",
		},
	}

	ctx := context.Background()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session, err := service.StartGame(ctx, tt.userID)

			if tt.wantError {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errorMsg != "" && err.Error() != tt.errorMsg {
					t.Errorf("expected error message %q, got %q", tt.errorMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if session == nil {
				t.Errorf("expected session but got nil")
				return
			}

			if session.UserID != tt.userID {
				t.Errorf("expected user ID %q, got %q", tt.userID, session.UserID)
			}

			if session.Region != "test-region" {
				t.Errorf("expected region %q, got %q", "test-region", session.Region)
			}

			if session.Status != "active" {
				t.Errorf("expected status %q, got %q", "active", session.Status)
			}

			if session.SessionID == "" {
				t.Errorf("expected session ID to be set")
			}
		})
	}
}

func TestGameService_StartGame_DuplicateSession(t *testing.T) {
	memStorage := storage.NewMemoryStorage()
	service := NewGameService(memStorage, "test-region")
	ctx := context.Background()

	userID := "user123"

	// Start first game
	session1, err := service.StartGame(ctx, userID)
	if err != nil {
		t.Fatalf("unexpected error starting first game: %v", err)
	}

	if session1.Status != "active" {
		t.Errorf("expected first session to be active")
	}

	// Try to start second game - should fail
	_, err = service.StartGame(ctx, userID)
	if err == nil {
		t.Errorf("expected error when starting duplicate session, got none")
		return
	}

	if err.Error() != "user already has an active session: "+session1.SessionID {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestGameService_ExitGame(t *testing.T) {
	memStorage := storage.NewMemoryStorage()
	service := NewGameService(memStorage, "test-region")
	ctx := context.Background()

	// Start a game first
	session, err := service.StartGame(ctx, "user123")
	if err != nil {
		t.Fatalf("unexpected error starting game: %v", err)
	}

	tests := []struct {
		name      string
		sessionID string
		wantError bool
		errorMsg  string
	}{
		{
			name:      "successful game exit",
			sessionID: session.SessionID,
			wantError: false,
		},
		{
			name:      "empty session ID",
			sessionID: "",
			wantError: true,
			errorMsg:  "session_id is required",
		},
		{
			name:      "non-existent session",
			sessionID: "non-existent",
			wantError: true,
			errorMsg:  "session not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exitedSession, err := service.ExitGame(ctx, tt.sessionID)

			if tt.wantError {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errorMsg != "" && err.Error() != tt.errorMsg && err.Error() != "session not found: session not found" {
					t.Errorf("expected error message containing %q, got %q", tt.errorMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if exitedSession == nil {
				t.Errorf("expected session but got nil")
				return
			}

			if exitedSession.Status != "exited" {
				t.Errorf("expected status %q, got %q", "exited", exitedSession.Status)
			}
		})
	}
}

func TestGameService_ExitGame_AlreadyExited(t *testing.T) {
	memStorage := storage.NewMemoryStorage()
	service := NewGameService(memStorage, "test-region")
	ctx := context.Background()

	// Start and exit a game
	session, err := service.StartGame(ctx, "user123")
	if err != nil {
		t.Fatalf("unexpected error starting game: %v", err)
	}

	_, err = service.ExitGame(ctx, session.SessionID)
	if err != nil {
		t.Fatalf("unexpected error exiting game: %v", err)
	}

	// Try to exit again - should fail
	_, err = service.ExitGame(ctx, session.SessionID)
	if err == nil {
		t.Errorf("expected error when exiting already exited session, got none")
		return
	}

	if err.Error() != "session already exited" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestGameService_GetSession(t *testing.T) {
	memStorage := storage.NewMemoryStorage()
	service := NewGameService(memStorage, "test-region")
	ctx := context.Background()

	// Start a game
	expectedSession, err := service.StartGame(ctx, "user123")
	if err != nil {
		t.Fatalf("unexpected error starting game: %v", err)
	}

	// Retrieve the session
	retrievedSession, err := service.GetSession(ctx, expectedSession.SessionID)
	if err != nil {
		t.Fatalf("unexpected error getting session: %v", err)
	}

	if retrievedSession.SessionID != expectedSession.SessionID {
		t.Errorf("expected session ID %q, got %q", expectedSession.SessionID, retrievedSession.SessionID)
	}

	if retrievedSession.UserID != expectedSession.UserID {
		t.Errorf("expected user ID %q, got %q", expectedSession.UserID, retrievedSession.UserID)
	}

	// Check that timestamps are reasonable (within 1 second)
	timeDiff := retrievedSession.StartedAt.Sub(expectedSession.StartedAt)
	if timeDiff < 0 {
		timeDiff = -timeDiff
	}
	if timeDiff > time.Second {
		t.Errorf("timestamp difference too large: %v", timeDiff)
	}
}

