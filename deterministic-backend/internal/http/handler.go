package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/engine"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/store"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/types"
)

// Handler holds HTTP handlers and dependencies
type Handler struct {
	store store.Store
}

// NewHandler creates a new HTTP handler
func NewHandler(store store.Store) *Handler {
	return &Handler{
		store: store,
	}
}

// Routes sets up all HTTP routes
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// API v1 routes
	r.Route("/v1", func(r chi.Router) {
		r.Post("/sessions", h.CreateSession)
		r.Get("/sessions/{id}", h.GetSession)
		r.Get("/sessions/{id}/state", h.GetSessionState)
		r.Post("/sessions/{id}/stop", h.StopSession)
	})

	// Health check
	r.Get("/healthz", h.Health)

	return r
}

// Health handles health check requests
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// CreateSession handles POST /v1/sessions
func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req types.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	// Validate tickMs
	if req.TickMs <= 0 {
		h.respondError(w, http.StatusBadRequest, "invalid tick_ms", "tick_ms must be greater than 0")
		return
	}

	// Generate session ID (format: sess_xxx)
	sessionID := "sess_" + uuid.New().String()

	// Generate seed (UUID as string for now, can be changed to uint64)
	seed := uuid.New().String()

	// Determine start time
	var startAt time.Time
	if req.StartAt != nil && *req.StartAt != "" {
		// Parse provided start_at
		parsed, err := time.Parse(time.RFC3339, *req.StartAt)
		if err != nil {
			h.respondError(w, http.StatusBadRequest, "invalid start_at", "start_at must be in RFC3339 format")
			return
		}
		startAt = parsed
	} else {
		// Default: now + 3 seconds delay
		startAt = time.Now().Add(3 * time.Second)
	}

	// Create session
	session := &types.Session{
		ID:        sessionID,
		Seed:      seed,
		StartAt:   startAt,
		TickMs:    req.TickMs,
		Metadata:  req.Metadata,
		Status:    "running",
		CreatedAt: time.Now(),
	}

	// Store session
	if err := h.store.CreateSession(ctx, session); err != nil {
		if err == store.ErrSessionExists {
			h.respondError(w, http.StatusConflict, "session already exists", err.Error())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create session", err.Error())
		return
	}

	// Return response
	response := types.CreateSessionResponse{
		ID:       session.ID,
		Seed:     session.Seed,
		StartAt:  session.StartAt.Format(time.RFC3339),
		TickMs:   session.TickMs,
		Metadata: session.Metadata,
		Status:   session.Status,
	}

	h.respondJSON(w, http.StatusCreated, response)
}

// GetSession handles GET /v1/sessions/{id}
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		h.respondError(w, http.StatusBadRequest, "invalid session id", "session id is required")
		return
	}

	// Get session from store
	session, err := h.store.GetSession(ctx, sessionID)
	if err != nil {
		if err == store.ErrSessionNotFound {
			h.respondError(w, http.StatusNotFound, "session not found", err.Error())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to get session", err.Error())
		return
	}

	// Return response
	response := types.GetSessionResponse{
		ID:       session.ID,
		Seed:     session.Seed,
		StartAt:  session.StartAt.Format(time.RFC3339),
		TickMs:   session.TickMs,
		Metadata: session.Metadata,
		Status:   session.Status,
	}

	h.respondJSON(w, http.StatusOK, response)
}

// GetSessionState handles GET /v1/sessions/{id}/state
func (h *Handler) GetSessionState(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		h.respondError(w, http.StatusBadRequest, "invalid session id", "session id is required")
		return
	}

	// Get session from store
	session, err := h.store.GetSession(ctx, sessionID)
	if err != nil {
		if err == store.ErrSessionNotFound {
			h.respondError(w, http.StatusNotFound, "session not found", err.Error())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to get session", err.Error())
		return
	}

	// Parse seed from string to int64
	// If seed is UUID, convert to int64 hash; if already numeric, parse directly
	seed, err := parseSeedToInt64(session.Seed)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "invalid seed format", err.Error())
		return
	}

	// Compute current state using deterministic engine
	now := time.Now()
	state := engine.StateAt(
		seed,
		session.StartAt,
		int64(session.TickMs),
		now,
	)

	// Return response
	response := types.SessionStateResponse{
		Step:       state.Step,
		Value:      state.Value,
		Round:      state.Round,
		Broken:     state.Broken,
		ComputedAt: now.Format(time.RFC3339),
	}

	h.respondJSON(w, http.StatusOK, response)
}

// StopSession handles POST /v1/sessions/{id}/stop
func (h *Handler) StopSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		h.respondError(w, http.StatusBadRequest, "invalid session id", "session id is required")
		return
	}

	// Get session
	session, err := h.store.GetSession(ctx, sessionID)
	if err != nil {
		if err == store.ErrSessionNotFound {
			h.respondError(w, http.StatusNotFound, "session not found", err.Error())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to get session", err.Error())
		return
	}

	// Check if already stopped
	if session.Status == "stopped" {
		h.respondError(w, http.StatusBadRequest, "session already stopped", "session is already stopped")
		return
	}

	// Update session status
	session.Status = "stopped"
	now := time.Now()
	session.StoppedAt = &now

	if err := h.store.UpdateSession(ctx, session); err != nil {
		h.respondError(w, http.StatusInternalServerError, "failed to stop session", err.Error())
		return
	}

	// Return response
	response := types.StopSessionResponse{
		ID:     session.ID,
		Status: session.Status,
	}

	h.respondJSON(w, http.StatusOK, response)
}

// respondJSON sends a JSON response
func (h *Handler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// respondError sends an error response
func (h *Handler) respondError(w http.ResponseWriter, status int, errorMsg, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(types.ErrorResponse{
		Error:   errorMsg,
		Message: message,
	})
}

// parseSeedToInt64 converts a seed string (UUID or numeric) to int64.
// This is a helper function to convert the stored seed string to the int64
// format required by the engine.
func parseSeedToInt64(seedStr string) (int64, error) {
	// Try parsing as numeric first
	if seed, err := strconv.ParseInt(seedStr, 10, 64); err == nil {
		return seed, nil
	}

	// If it's a UUID, convert to int64 by hashing
	// Simple hash: sum of all bytes
	var hash int64
	for _, b := range []byte(seedStr) {
		hash = hash*31 + int64(b)
	}
	// Ensure positive
	if hash < 0 {
		hash = -hash
	}
	return hash, nil
}
