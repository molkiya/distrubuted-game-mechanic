package logger

import (
	"log"
	"os"
	"time"
)

// Level represents log level
type Level string

const (
	LevelInfo  Level = "INFO"
	LevelError Level = "ERROR"
	LevelDebug Level = "DEBUG"
)

// Logger provides structured logging
type Logger struct {
	*log.Logger
}

// New creates a new logger
func New() *Logger {
	return &Logger{
		Logger: log.New(os.Stdout, "", 0),
	}
}

// Log writes a structured log entry
func (l *Logger) Log(level Level, message string, fields ...Field) {
	timestamp := time.Now().Format(time.RFC3339)
	entry := formatLogEntry(timestamp, string(level), message, fields...)
	l.Logger.Println(entry)
}

// Info logs an info message
func (l *Logger) Info(message string, fields ...Field) {
	l.Log(LevelInfo, message, fields...)
}

// Error logs an error message
func (l *Logger) Error(message string, fields ...Field) {
	l.Log(LevelError, message, fields...)
}

// Debug logs a debug message
func (l *Logger) Debug(message string, fields ...Field) {
	l.Log(LevelDebug, message, fields...)
}

// Field represents a key-value pair for structured logging
type Field struct {
	Key   string
	Value string
}

// F creates a Field
func F(key, value string) Field {
	return Field{Key: key, Value: value}
}

func formatLogEntry(timestamp, level, message string, fields ...Field) string {
	entry := timestamp + " [" + level + "] " + message
	if len(fields) > 0 {
		entry += " |"
		for _, field := range fields {
			entry += " " + field.Key + "=" + field.Value
		}
	}
	return entry
}

