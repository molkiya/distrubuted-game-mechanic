package store

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/types"
	"github.com/redis/go-redis/v9"
)

// RedisStore implements the Store interface using Redis.
// Sessions are stored as JSON with a TTL for automatic cleanup.
type RedisStore struct {
	client *redis.Client
	ttl    time.Duration // Time-to-live for sessions (0 = no expiration)
}

// NewRedisStore creates a new Redis store instance.
// Reads configuration from environment variables:
//   - REDIS_ADDR: Redis address (default: localhost:6379)
//   - REDIS_PASSWORD: Redis password (default: empty)
//   - REDIS_DB: Redis database number (default: 0)
//
// Parameters:
//   - ttl: Time-to-live for sessions (0 = no expiration)
func NewRedisStore(ttl time.Duration) (*RedisStore, error) {
	addr := getEnv("REDIS_ADDR", "localhost:6379")
	password := getEnv("REDIS_PASSWORD", "")
	dbStr := getEnv("REDIS_DB", "0")

	db, err := strconv.Atoi(dbStr)
	if err != nil {
		return nil, fmt.Errorf("invalid REDIS_DB value: %w", err)
	}

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisStore{
		client: client,
		ttl:    ttl,
	}, nil
}

// CreateSession creates a new session in Redis.
func (s *RedisStore) CreateSession(ctx context.Context, session *types.Session) error {
	key := sessionKey(session.ID)

	// Check if session already exists
	exists, err := s.client.Exists(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("failed to check session existence: %w", err)
	}
	if exists > 0 {
		return ErrSessionExists
	}

	// Serialize session to JSON
	data, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	// Store in Redis with optional TTL
	if s.ttl > 0 {
		err = s.client.Set(ctx, key, data, s.ttl).Err()
	} else {
		err = s.client.Set(ctx, key, data, 0).Err()
	}

	if err != nil {
		return fmt.Errorf("failed to store session: %w", err)
	}

	return nil
}

// GetSession retrieves a session from Redis.
func (s *RedisStore) GetSession(ctx context.Context, id string) (*types.Session, error) {
	key := sessionKey(id)

	data, err := s.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, ErrSessionNotFound
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	var session types.Session
	if err := json.Unmarshal([]byte(data), &session); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session: %w", err)
	}

	return &session, nil
}

// UpdateSession updates an existing session in Redis.
func (s *RedisStore) UpdateSession(ctx context.Context, session *types.Session) error {
	key := sessionKey(session.ID)

	// Check if session exists
	exists, err := s.client.Exists(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("failed to check session existence: %w", err)
	}
	if exists == 0 {
		return ErrSessionNotFound
	}

	// Serialize and update
	data, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	// Update with same TTL (extend if needed)
	if s.ttl > 0 {
		err = s.client.Set(ctx, key, data, s.ttl).Err()
	} else {
		err = s.client.Set(ctx, key, data, 0).Err()
	}

	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

// DeleteSession deletes a session from Redis.
func (s *RedisStore) DeleteSession(ctx context.Context, id string) error {
	key := sessionKey(id)
	err := s.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

// sessionKey generates a Redis key for a session.
func sessionKey(id string) string {
	return fmt.Sprintf("session:%s", id)
}

// getEnv gets an environment variable or returns a default value.
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

