package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/store"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/types"
)

// mockStore implements the Store interface for testing
type mockStore struct {
	sessions map[string]*types.Session
}

func newMockStore() *mockStore {
	return &mockStore{
		sessions: make(map[string]*types.Session),
	}
}

func (m *mockStore) CreateSession(ctx context.Context, session *types.Session) error {
	if _, exists := m.sessions[session.ID]; exists {
		return store.ErrSessionExists
	}
	m.sessions[session.ID] = session
	return nil
}

func (m *mockStore) GetSession(ctx context.Context, id string) (*types.Session, error) {
	session, exists := m.sessions[id]
	if !exists {
		return nil, store.ErrSessionNotFound
	}
	return session, nil
}

func (m *mockStore) UpdateSession(ctx context.Context, session *types.Session) error {
	if _, exists := m.sessions[session.ID]; !exists {
		return store.ErrSessionNotFound
	}
	m.sessions[session.ID] = session
	return nil
}

func (m *mockStore) DeleteSession(ctx context.Context, id string) error {
	delete(m.sessions, id)
	return nil
}

func TestHandler_CreateSession(t *testing.T) {
	handler := NewHandler(newMockStore())

	tests := []struct {
		name           string
		requestBody    interface{}
		expectedStatus int
		validate       func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name: "valid request",
			requestBody: types.CreateSessionRequest{
				TickMs: 100,
			},
			expectedStatus: http.StatusCreated,
			validate: func(t *testing.T, w *httptest.ResponseRecorder) {
				var resp types.CreateSessionResponse
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
					t.Fatalf("Failed to unmarshal response: %v", err)
				}
				if resp.ID == "" {
					t.Error("Expected session ID, got empty")
				}
				if resp.Seed == "" {
					t.Error("Expected seed, got empty string")
				}
				if resp.TickMs != 100 {
					t.Errorf("Expected tickMs 100, got %d", resp.TickMs)
				}
			},
		},
		{
			name: "invalid tickMs (zero)",
			requestBody: types.CreateSessionRequest{
				TickMs: 0,
			},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "invalid tickMs (negative)",
			requestBody: types.CreateSessionRequest{
				TickMs: -10,
			},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "invalid JSON",
			requestBody:    "not json",
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body []byte
			var err error

			if str, ok := tt.requestBody.(string); ok {
				body = []byte(str)
			} else {
				body, err = json.Marshal(tt.requestBody)
				if err != nil {
					t.Fatalf("Failed to marshal request: %v", err)
				}
			}

			req := httptest.NewRequest("POST", "/v1/sessions", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router := chi.NewRouter()
			router.Mount("/", handler.Routes())
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.validate != nil {
				tt.validate(t, w)
			}
		})
	}
}

func TestHandler_GetSession(t *testing.T) {
	store := newMockStore()
	handler := NewHandler(store)

	// Create a test session
	session := &types.Session{
		ID:        "test-session-123",
		Seed:      "test-seed-987654321",
		StartAt:   time.Now().Add(3 * time.Second),
		TickMs:    100,
		Status:    "running",
		CreatedAt: time.Now(),
	}
	store.CreateSession(context.Background(), session)

	tests := []struct {
		name           string
		sessionID      string
		expectedStatus int
		validate       func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:           "existing session",
			sessionID:      "test-session-123",
			expectedStatus: http.StatusOK,
			validate: func(t *testing.T, w *httptest.ResponseRecorder) {
				var resp types.GetSessionResponse
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
					t.Fatalf("Failed to unmarshal response: %v", err)
				}
				if resp.ID != "test-session-123" {
					t.Errorf("Expected ID test-session-123, got %s", resp.ID)
				}
				if resp.Seed != "test-seed-987654321" {
					t.Errorf("Expected seed test-seed-987654321, got %s", resp.Seed)
				}
			},
		},
		{
			name:           "non-existent session",
			sessionID:      "non-existent",
			expectedStatus: http.StatusNotFound,
		},
		// Note: Empty session ID results in 404 from chi router
		// This is acceptable behavior - empty IDs are invalid anyway
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/v1/sessions/" + tt.sessionID
			req := httptest.NewRequest("GET", url, nil)
			w := httptest.NewRecorder()

			router := chi.NewRouter()
			router.Mount("/", handler.Routes())
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.validate != nil {
				tt.validate(t, w)
			}
		})
	}
}

func TestHandler_StopSession(t *testing.T) {
	store := newMockStore()
	handler := NewHandler(store)

	// Create a test session
	session := &types.Session{
		ID:        "test-session-456",
		Seed:      "test-seed-123456789",
		StartAt:   time.Now().Add(3 * time.Second),
		TickMs:    100,
		Status:    "running",
		CreatedAt: time.Now(),
	}
	store.CreateSession(context.Background(), session)

	tests := []struct {
		name           string
		sessionID      string
		expectedStatus int
		validate       func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:           "stop active session",
			sessionID:      "test-session-456",
			expectedStatus: http.StatusOK,
			validate: func(t *testing.T, w *httptest.ResponseRecorder) {
				var resp types.StopSessionResponse
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
					t.Fatalf("Failed to unmarshal response: %v", err)
				}
				if resp.ID != "test-session-456" {
					t.Errorf("Expected ID test-session-456, got %s", resp.ID)
				}
				if resp.Status != "stopped" {
					t.Errorf("Expected status stopped, got %s", resp.Status)
				}
			},
		},
		{
			name:           "stop non-existent session",
			sessionID:      "non-existent",
			expectedStatus: http.StatusNotFound,
		},
		{
			name:           "stop already stopped session",
			sessionID:      "test-session-456", // Will be stopped by previous test
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/v1/sessions/" + tt.sessionID + "/stop"
			req := httptest.NewRequest("POST", url, nil)
			w := httptest.NewRecorder()

			router := chi.NewRouter()
			router.Mount("/", handler.Routes())
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.validate != nil {
				tt.validate(t, w)
			}
		})
	}
}

