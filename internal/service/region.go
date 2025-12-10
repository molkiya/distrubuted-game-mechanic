package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/distrubuted-game-mechanic/internal/models"
	"github.com/distrubuted-game-mechanic/internal/storage"
)

// RegionService handles region registration and discovery
type RegionService struct {
	storage      storage.RegionStorage
	region       string
	baseURL      string
	mainServerURL string
	isMain       bool
	httpClient   *http.Client
}

// NewRegionService creates a new region service
func NewRegionService(
	storage storage.RegionStorage,
	region string,
	baseURL string,
	mainServerURL string,
	isMain bool,
) *RegionService {
	return &RegionService{
		storage:       storage,
		region:        region,
		baseURL:       baseURL,
		mainServerURL: mainServerURL,
		isMain:        isMain,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// RegisterSelf registers this instance with the main server
func (s *RegionService) RegisterSelf() error {
	if s.isMain {
		// Main server doesn't need to register itself
		return nil
	}

	if s.mainServerURL == "" {
		return fmt.Errorf("main server URL not configured")
	}

	req := models.RegisterRegionRequest{
		Region:  s.region,
		BaseURL: s.baseURL,
	}

	jsonData, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/regions/register", s.mainServerURL)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("registration failed with status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetBestRegion returns the best region for routing (simple round-robin for now)
func (s *RegionService) GetBestRegion(preferredRegion string) (*models.Region, error) {
	regions, err := s.storage.GetAllRegions()
	if err != nil {
		return nil, fmt.Errorf("failed to get regions: %w", err)
	}

	if len(regions) == 0 {
		return nil, fmt.Errorf("no regions available")
	}

	// If preferred region is specified and exists, use it
	if preferredRegion != "" {
		for _, region := range regions {
			if region.Region == preferredRegion && !region.IsMain {
				return region, nil
			}
		}
	}

	// Simple round-robin: find first non-main region
	// In a production system, this could use load balancing, latency, etc.
	for _, region := range regions {
		if !region.IsMain {
			return region, nil
		}
	}

	// Fallback: return any region
	return regions[0], nil
}

// ProxyGameStart proxies a game start request to another region
func (s *RegionService) ProxyGameStart(userID, targetRegion string) (*models.StartGameResponse, error) {
	region, err := s.GetBestRegion(targetRegion)
	if err != nil {
		return nil, err
	}

	req := models.StartGameRequest{
		UserID: userID,
		Region: region.Region,
	}

	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/game/start", region.BaseURL)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to proxy request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("proxy request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var gameResp models.StartGameResponse
	if err := json.Unmarshal(body, &gameResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &gameResp, nil
}

