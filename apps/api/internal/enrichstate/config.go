package enrichstate

import (
	"os"
	"strconv"
	"time"
)

// LoadConfigFromEnv reads enrichment pipeline config from environment variables.
func LoadConfigFromEnv() Config {
	cfg := DefaultConfig()
	if s := os.Getenv("ENRICH_PDP_MAX_ATTEMPTS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			cfg.MaxPDPAttempts = n
		}
	}
	if s := os.Getenv("ENRICH_CLASSIFY_MAX_ATTEMPTS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			cfg.MaxClassifyAttempts = n
		}
	}
	if s := os.Getenv("ENRICH_EXTRACT_MAX_ATTEMPTS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			cfg.MaxExtractAttempts = n
		}
	}
	if s := os.Getenv("ENRICH_BACKOFF_BASE"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.BackoffBase = d
		}
	}
	if s := os.Getenv("ENRICH_BACKOFF_MAX"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.BackoffMax = d
		}
	}
	if s := os.Getenv("ENRICH_PDP_STALE_AFTER"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.PDPStaleAfter = d
		}
	}
	if s := os.Getenv("ENRICH_CLAIM_LEASE"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.ClaimLease = d
		}
	}
	if s := os.Getenv("ENRICH_PDP_MIN_INTERVAL"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.PDPMinInterval = d
		}
	}
	if s := os.Getenv("ENRICH_PDP_COOLDOWN"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			cfg.PDPCooldown = d
		}
	}
	return cfg
}

// CircuitBreakerThreshold returns consecutive PDP failures before skipping a store this job.
func CircuitBreakerThreshold() int {
	if s := os.Getenv("ENRICH_CIRCUIT_BREAKER_THRESHOLD"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return 5
}
