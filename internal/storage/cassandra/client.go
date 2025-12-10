package cassandra

import (
	"fmt"

	"github.com/gocql/gocql"
	"github.com/distrubuted-game-mechanic/internal/config"
	"github.com/distrubuted-game-mechanic/pkg/logger"
)

// Client wraps a gocql.Session and provides connection management
type Client struct {
	session *gocql.Session
	config  config.CassandraConfig
	logger  *logger.Logger
}

// NewClient creates a new Cassandra client and establishes a connection
func NewClient(cfg config.CassandraConfig, log *logger.Logger) (*Client, error) {
	cluster := gocql.NewCluster(cfg.Hosts...)

	// Set connection options
	cluster.Timeout = cfg.Timeout
	cluster.ConnectTimeout = cfg.Timeout
	cluster.Consistency = parseConsistency(cfg.Consistency)

	// Authentication (if provided)
	if cfg.Username != "" {
		cluster.Authenticator = gocql.PasswordAuthenticator{
			Username: cfg.Username,
			Password: cfg.Password,
		}
	}

	// Connection pool settings
	cluster.NumConns = 2
	cluster.PoolConfig.HostSelectionPolicy = gocql.TokenAwareHostPolicy(gocql.RoundRobinHostPolicy())

	// Create session
	session, err := cluster.CreateSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create Cassandra session: %w", err)
	}

	log.Info("Connected to Cassandra", logger.F("hosts", fmt.Sprintf("%v", cfg.Hosts)), logger.F("keyspace", cfg.Keyspace))

	client := &Client{
		session: session,
		config:  cfg,
		logger:  log,
	}

	// Initialize schema
	if err := client.initializeSchema(); err != nil {
		session.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return client, nil
}

// Session returns the underlying gocql.Session
func (c *Client) Session() *gocql.Session {
	return c.session
}

// Keyspace returns the configured keyspace
func (c *Client) Keyspace() string {
	return c.config.Keyspace
}

// Close closes the Cassandra session
func (c *Client) Close() {
	if c.session != nil {
		c.session.Close()
		c.logger.Info("Cassandra session closed")
	}
}

// initializeSchema creates the keyspace and table if they don't exist
func (c *Client) initializeSchema() error {
	keyspace := c.config.Keyspace

	// Create keyspace if not exists
	createKeyspaceQuery := fmt.Sprintf(`
		CREATE KEYSPACE IF NOT EXISTS %s
		WITH replication = {
			'class': 'SimpleStrategy',
			'replication_factor': 1
		}`, keyspace)

	if err := c.session.Query(createKeyspaceQuery).Exec(); err != nil {
		return fmt.Errorf("failed to create keyspace: %w", err)
	}

	// Use the keyspace
	if err := c.session.Query(fmt.Sprintf("USE %s", keyspace)).Exec(); err != nil {
		return fmt.Errorf("failed to use keyspace: %w", err)
	}

	// Create sessions table
	// Schema design:
	// - Primary key: session_id (for fast lookups by session ID)
	// - Secondary index on user_id (for user-based queries)
	// - Clustering by started_at for time-based ordering (optional, not used in primary key for simplicity)
	createTableQuery := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s.sessions (
			session_id text PRIMARY KEY,
			user_id text,
			region text,
			started_at timestamp,
			status text
		)`, keyspace)

	if err := c.session.Query(createTableQuery).Exec(); err != nil {
		return fmt.Errorf("failed to create sessions table: %w", err)
	}

	// Create secondary index on user_id for efficient user-based queries
	createIndexQuery := fmt.Sprintf(`
		CREATE INDEX IF NOT EXISTS ON %s.sessions (user_id)`, keyspace)

	if err := c.session.Query(createIndexQuery).Exec(); err != nil {
		// Index creation might fail if it already exists, log but don't fail
		c.logger.Debug("Index creation result", logger.F("error", err.Error()))
	}

	c.logger.Info("Cassandra schema initialized", logger.F("keyspace", keyspace))
	return nil
}

// parseConsistency parses a consistency level string
func parseConsistency(consistencyStr string) gocql.Consistency {
	switch consistencyStr {
	case "ONE":
		return gocql.One
	case "TWO":
		return gocql.Two
	case "THREE":
		return gocql.Three
	case "QUORUM":
		return gocql.Quorum
	case "ALL":
		return gocql.All
	case "LOCAL_QUORUM":
		return gocql.LocalQuorum
	case "EACH_QUORUM":
		return gocql.EachQuorum
	case "LOCAL_ONE":
		return gocql.LocalOne
	default:
		return gocql.Quorum // Default to QUORUM for high availability
	}
}

// RetryPolicy provides simple retry logic for transient errors
func RetryPolicy(maxRetries int) gocql.RetryPolicy {
	return &simpleRetryPolicy{maxRetries: maxRetries}
}

type simpleRetryPolicy struct {
	maxRetries int
}

func (p *simpleRetryPolicy) Attempt(q gocql.RetryableQuery) bool {
	return q.Attempts() <= p.maxRetries
}

func (p *simpleRetryPolicy) GetRetryType(err error) gocql.RetryType {
	// Retry on timeout errors
	if err == gocql.ErrTimeoutNoResponse {
		return gocql.Retry
	}
	// Retry on connection errors (network issues)
	if err != nil {
		errStr := err.Error()
		if contains(errStr, "timeout") || contains(errStr, "connection") || contains(errStr, "unavailable") {
			return gocql.Retry
		}
	}
	return gocql.Ignore
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

