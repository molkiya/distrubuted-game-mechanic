package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	httphandler "github.com/distrubuted-game-mechanic/deterministic-backend/internal/http"
	"github.com/distrubuted-game-mechanic/deterministic-backend/internal/store"
)

func main() {
	// Initialize Redis store
	// TTL: 1 hour (0 = no expiration)
	sessionStore, err := store.NewRedisStore(1 * time.Hour)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize Redis store: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected to Redis")

	// Initialize HTTP handler
	handler := httphandler.NewHandler(sessionStore)

	// Setup router
	router := chi.NewRouter()

	// Middleware
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Logger) // Simple logging middleware
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(10 * time.Second))

	// Routes
	router.Mount("/", handler.Routes())

	// Start HTTP server
	port := getEnv("PORT", "8080")
	addr := ":" + port

	server := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		fmt.Printf("Server starting on %s\n", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("Shutting down server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "Server forced to shutdown: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Server exited")
}

// getEnv gets an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
