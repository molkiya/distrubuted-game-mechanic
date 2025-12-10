package storage

import (
	"context"
	"sync"
	"time"

	"github.com/distrubuted-game-mechanic/internal/models"
)

// MemoryStorage provides in-memory storage for sessions and regions
type MemoryStorage struct {
	mu       sync.RWMutex
	sessions map[string]*models.Session
	regions  map[string]*models.Region
}

// NewMemoryStorage creates a new in-memory storage
func NewMemoryStorage() *MemoryStorage {
	return &MemoryStorage{
		sessions: make(map[string]*models.Session),
		regions:  make(map[string]*models.Region),
	}
}

// SessionRepository defines operations on sessions with context support
// This interface is implemented by both in-memory and Cassandra storage
type SessionRepository interface {
	CreateSession(ctx context.Context, session *models.Session) error
	GetSession(ctx context.Context, sessionID string) (*models.Session, error)
	UpdateSession(ctx context.Context, sessionID string, status string) error
	GetSessionsByUserID(ctx context.Context, userID string) ([]*models.Session, error)
}

// SessionStorage is deprecated, use SessionRepository instead
// Kept for backward compatibility during migration
type SessionStorage = SessionRepository

// RegionStorage defines operations on regions
type RegionStorage interface {
	RegisterRegion(region *models.Region) error
	GetRegion(regionName string) (*models.Region, error)
	GetAllRegions() ([]*models.Region, error)
	UpdateRegionLastSeen(regionName string) error
}

// CreateSession creates a new session
func (s *MemoryStorage) CreateSession(ctx context.Context, session *models.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.sessions[session.SessionID]; exists {
		return ErrSessionExists
	}

	s.sessions[session.SessionID] = session
	return nil
}

// GetSession retrieves a session by ID
func (s *MemoryStorage) GetSession(ctx context.Context, sessionID string) (*models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return nil, ErrSessionNotFound
	}

	return session, nil
}

// UpdateSession updates a session's status
func (s *MemoryStorage) UpdateSession(ctx context.Context, sessionID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	session.Status = status
	return nil
}

// GetSessionsByUserID retrieves all sessions for a user
func (s *MemoryStorage) GetSessionsByUserID(ctx context.Context, userID string) ([]*models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var sessions []*models.Session
	for _, session := range s.sessions {
		if session.UserID == userID {
			sessions = append(sessions, session)
		}
	}

	return sessions, nil
}

// RegisterRegion registers or updates a region
func (s *MemoryStorage) RegisterRegion(region *models.Region) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.regions[region.Region] = region
	return nil
}

// GetRegion retrieves a region by name
func (s *MemoryStorage) GetRegion(regionName string) (*models.Region, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	region, exists := s.regions[regionName]
	if !exists {
		return nil, ErrRegionNotFound
	}

	return region, nil
}

// GetAllRegions retrieves all registered regions
func (s *MemoryStorage) GetAllRegions() ([]*models.Region, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	regions := make([]*models.Region, 0, len(s.regions))
	for _, region := range s.regions {
		regions = append(regions, region)
	}

	return regions, nil
}

// UpdateRegionLastSeen updates the last seen timestamp for a region
func (s *MemoryStorage) UpdateRegionLastSeen(regionName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	region, exists := s.regions[regionName]
	if !exists {
		return ErrRegionNotFound
	}

	region.LastSeen = time.Now()
	return nil
}

// Errors
var (
	ErrSessionNotFound = &StorageError{Message: "session not found"}
	ErrSessionExists   = &StorageError{Message: "session already exists"}
	ErrRegionNotFound  = &StorageError{Message: "region not found"}
)

// StorageError represents a storage error
type StorageError struct {
	Message string
}

func (e *StorageError) Error() string {
	return e.Message
}

