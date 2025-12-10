package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/distrubuted-game-mechanic/internal/models"
	"github.com/distrubuted-game-mechanic/internal/service"
	"github.com/distrubuted-game-mechanic/internal/storage"
	"github.com/distrubuted-game-mechanic/pkg/logger"
)

// Handler holds all HTTP handlers
type Handler struct {
	gameService   *service.GameService
	regionService *service.RegionService
	regionStorage storage.RegionStorage
	isMain        bool
	logger        *logger.Logger
}

// NewHandler creates a new handler
func NewHandler(
	gameService *service.GameService,
	regionService *service.RegionService,
	regionStorage storage.RegionStorage,
	isMain bool,
	logger *logger.Logger,
) *Handler {
	return &Handler{
		gameService:   gameService,
		regionService: regionService,
		regionStorage: regionStorage,
		isMain:        isMain,
		logger:        logger,
	}
}

// Routes sets up all routes
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Health check
	r.Get("/health", h.Health)

	// API routes
	r.Route("/game", func(r chi.Router) {
		r.Post("/start", h.StartGame)
		r.Post("/exit", h.ExitGame)
	})

	// Region registration (only for main server)
	if h.isMain {
		r.Route("/api/regions", func(r chi.Router) {
			r.Post("/register", h.RegisterRegion)
		})
	}

	return r
}

// Health handles health check requests
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// StartGame handles game start requests
func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	var req models.StartGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	requestID := GetRequestID(r.Context())
	h.logger.Info("Starting game", logger.F("user_id", req.UserID), logger.F("request_id", requestID))

	// If this is the main server and a region is preferred, proxy to that region
	if h.isMain && req.Region != "" {
		resp, err := h.regionService.ProxyGameStart(req.UserID, req.Region)
		if err != nil {
			h.logger.Error("Failed to proxy game start", logger.F("error", err.Error()), logger.F("request_id", requestID))
			h.respondError(w, http.StatusInternalServerError, "failed to start game", err.Error())
			return
		}

		h.respondJSON(w, http.StatusCreated, resp)
		return
	}

	// Otherwise, handle locally
	session, err := h.gameService.StartGame(r.Context(), req.UserID)
	if err != nil {
		h.logger.Error("Failed to start game", logger.F("error", err.Error()), logger.F("request_id", requestID))
		statusCode := http.StatusInternalServerError
		if err.Error() == "user_id is required" {
			statusCode = http.StatusBadRequest
		} else if err.Error() == "user already has an active session" {
			statusCode = http.StatusConflict
		}
		h.respondError(w, statusCode, "failed to start game", err.Error())
		return
	}

	resp := models.StartGameResponse{
		SessionID: session.SessionID,
		UserID:    session.UserID,
		Region:    session.Region,
		StartedAt: session.StartedAt,
		Status:    session.Status,
	}

	h.respondJSON(w, http.StatusCreated, resp)
}

// ExitGame handles game exit requests
func (h *Handler) ExitGame(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	requestID := GetRequestID(r.Context())
	h.logger.Info("Exiting game", logger.F("session_id", req.SessionID), logger.F("request_id", requestID))

	session, err := h.gameService.ExitGame(r.Context(), req.SessionID)
	if err != nil {
		h.logger.Error("Failed to exit game", logger.F("error", err.Error()), logger.F("request_id", requestID))
		statusCode := http.StatusInternalServerError
		if err.Error() == "session_id is required" || err.Error() == "session not found" {
			statusCode = http.StatusNotFound
		} else if err.Error() == "session already exited" {
			statusCode = http.StatusConflict
		}
		h.respondError(w, statusCode, "failed to exit game", err.Error())
		return
	}

	resp := models.ExitGameResponse{
		SessionID: session.SessionID,
		UserID:    session.UserID,
		ExitedAt:  time.Now(),
		Status:    session.Status,
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// RegisterRegion handles region registration requests (main server only)
func (h *Handler) RegisterRegion(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRegionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	requestID := GetRequestID(r.Context())
	h.logger.Info("Registering region", logger.F("region", req.Region), logger.F("request_id", requestID))

	// Register the region in storage
	region := &models.Region{
		Region:   req.Region,
		BaseURL:  req.BaseURL,
		LastSeen: time.Now(),
		IsMain:   false,
	}

	if err := h.regionStorage.RegisterRegion(region); err != nil {
		h.logger.Error("Failed to register region", logger.F("error", err.Error()), logger.F("request_id", requestID))
		h.respondError(w, http.StatusInternalServerError, "failed to register region", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "registered", "region": req.Region})
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
	json.NewEncoder(w).Encode(models.ErrorResponse{
		Error:   errorMsg,
		Message: message,
	})
}

