package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all configuration for the application
type Config struct {
	Host              string
	Port              string
	Region            string
	IsMain            bool
	MainServerURL     string
	RegisterInterval  time.Duration
	Cassandra         CassandraConfig
}

// CassandraConfig holds Cassandra-specific configuration
type CassandraConfig struct {
	Hosts       []string
	Keyspace    string
	Username    string
	Password    string
	Consistency string
	Timeout     time.Duration
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	host := getEnv("HOST", "0.0.0.0")
	port := getEnv("PORT", "8080")
	region := getEnv("REGION", "local")
	isMainStr := getEnv("IS_MAIN", "false")
	mainServerURL := getEnv("MAIN_SERVER_URL", "")
	registerIntervalStr := getEnv("REGISTER_INTERVAL_SECONDS", "30")

	isMain, err := strconv.ParseBool(isMainStr)
	if err != nil {
		return nil, fmt.Errorf("invalid IS_MAIN value: %w", err)
	}

	registerInterval, err := strconv.Atoi(registerIntervalStr)
	if err != nil {
		return nil, fmt.Errorf("invalid REGISTER_INTERVAL_SECONDS value: %w", err)
	}

	// Validate: non-main instances must have a main server URL
	if !isMain && mainServerURL == "" {
		return nil, fmt.Errorf("MAIN_SERVER_URL is required when IS_MAIN=false")
	}

	// Load Cassandra configuration
	cassandraHostsStr := getEnv("CASSANDRA_HOSTS", "localhost:9042")
	cassandraHosts := parseHosts(cassandraHostsStr)
	cassandraKeyspace := getEnv("CASSANDRA_KEYSPACE", "game_backend")
	cassandraUsername := getEnv("CASSANDRA_USERNAME", "")
	cassandraPassword := getEnv("CASSANDRA_PASSWORD", "")
	cassandraConsistency := getEnv("CASSANDRA_CONSISTENCY", "QUORUM")
	cassandraTimeoutStr := getEnv("CASSANDRA_TIMEOUT_SECONDS", "5")
	cassandraTimeout, err := strconv.Atoi(cassandraTimeoutStr)
	if err != nil {
		return nil, fmt.Errorf("invalid CASSANDRA_TIMEOUT_SECONDS value: %w", err)
	}

	return &Config{
		Host:             host,
		Port:             port,
		Region:           region,
		IsMain:           isMain,
		MainServerURL:    mainServerURL,
		RegisterInterval: time.Duration(registerInterval) * time.Second,
		Cassandra: CassandraConfig{
			Hosts:       cassandraHosts,
			Keyspace:    cassandraKeyspace,
			Username:    cassandraUsername,
			Password:    cassandraPassword,
			Consistency: cassandraConsistency,
			Timeout:     time.Duration(cassandraTimeout) * time.Second,
		},
	}, nil
}

// Address returns the full address (host:port)
func (c *Config) Address() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

// BaseURL returns the base URL for this instance
func (c *Config) BaseURL() string {
	return fmt.Sprintf("http://%s:%s", c.Host, c.Port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// parseHosts parses a comma-separated list of hosts
func parseHosts(hostsStr string) []string {
	if hostsStr == "" {
		return []string{"localhost:9042"}
	}
	parts := strings.Split(hostsStr, ",")
	hosts := make([]string, 0, len(parts))
	for _, part := range parts {
		host := strings.TrimSpace(part)
		if host != "" {
			hosts = append(hosts, host)
		}
	}
	if len(hosts) == 0 {
		return []string{"localhost:9042"}
	}
	return hosts
}

