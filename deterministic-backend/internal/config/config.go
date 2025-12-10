package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the application
type Config struct {
	Host         string
	Port         string
	Redis        RedisConfig
	SessionTTL   time.Duration
	StartDelay   time.Duration
}

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	host := getEnv("HOST", "0.0.0.0")
	port := getEnv("PORT", "8080")

	// Redis configuration
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")
	redisDBStr := getEnv("REDIS_DB", "0")
	redisDB, err := strconv.Atoi(redisDBStr)
	if err != nil {
		return nil, fmt.Errorf("invalid REDIS_DB value: %w", err)
	}

	// Session TTL (0 = no expiration)
	sessionTTLStr := getEnv("SESSION_TTL_SECONDS", "3600") // 1 hour default
	sessionTTL, err := strconv.Atoi(sessionTTLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid SESSION_TTL_SECONDS value: %w", err)
	}

	// Start delay (time before session actually starts)
	startDelayStr := getEnv("START_DELAY_SECONDS", "3") // 3 seconds default
	startDelay, err := strconv.Atoi(startDelayStr)
	if err != nil {
		return nil, fmt.Errorf("invalid START_DELAY_SECONDS value: %w", err)
	}

	return &Config{
		Host:   host,
		Port:   port,
		Redis: RedisConfig{
			Addr:     redisAddr,
			Password: redisPassword,
			DB:       redisDB,
		},
		SessionTTL: time.Duration(sessionTTL) * time.Second,
		StartDelay: time.Duration(startDelay) * time.Second,
	}, nil
}

// Address returns the full address (host:port)
func (c *Config) Address() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

