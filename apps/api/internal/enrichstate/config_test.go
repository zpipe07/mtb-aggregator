package enrichstate

import (
	"os"
	"testing"
	"time"
)

func TestLoadConfigFromEnv_ClaimLeaseDefault(t *testing.T) {
	t.Setenv("ENRICH_CLAIM_LEASE", "")
	cfg := LoadConfigFromEnv()
	if cfg.ClaimLease != 10*time.Minute {
		t.Fatalf("ClaimLease = %v, want 10m", cfg.ClaimLease)
	}
}

func TestLoadConfigFromEnv_ClaimLeaseOverride(t *testing.T) {
	t.Setenv("ENRICH_CLAIM_LEASE", "15m")
	cfg := LoadConfigFromEnv()
	if cfg.ClaimLease != 15*time.Minute {
		t.Fatalf("ClaimLease = %v, want 15m", cfg.ClaimLease)
	}
}

func TestLoadConfigFromEnv_ClaimLeaseInvalidIgnored(t *testing.T) {
	t.Setenv("ENRICH_CLAIM_LEASE", "not-a-duration")
	cfg := LoadConfigFromEnv()
	if cfg.ClaimLease != 10*time.Minute {
		t.Fatalf("ClaimLease = %v, want default 10m", cfg.ClaimLease)
	}
}

func TestLoadConfigFromEnv_ClaimLeaseZeroIgnored(t *testing.T) {
	os.Setenv("ENRICH_CLAIM_LEASE", "0")
	t.Cleanup(func() { os.Unsetenv("ENRICH_CLAIM_LEASE") })
	cfg := LoadConfigFromEnv()
	if cfg.ClaimLease != 10*time.Minute {
		t.Fatalf("ClaimLease = %v, want default 10m", cfg.ClaimLease)
	}
}
