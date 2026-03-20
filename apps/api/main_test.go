package main

import (
	"net/http/httptest"
	"testing"
)

func TestIsProduction(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("RENDER", "")
	if isProduction() {
		t.Fatal("expected false when APP_ENV and RENDER unset")
	}

	t.Setenv("APP_ENV", "production")
	t.Setenv("RENDER", "")
	if !isProduction() {
		t.Fatal("expected true for APP_ENV=production")
	}

	t.Setenv("APP_ENV", "development")
	t.Setenv("RENDER", "true")
	if !isProduction() {
		t.Fatal("expected true for RENDER=true")
	}
}

func TestValidateCronSecret_ProductionFailClosed(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CRON_SECRET", "")
	t.Setenv("ALLOW_OPEN_CRON", "")
	req := httptest.NewRequest("POST", "/scrape-now", nil)
	if validateCronSecret(req) {
		t.Fatal("expected false when CRON_SECRET unset in production")
	}
}

func TestValidateCronSecret_AllowOpenCron(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CRON_SECRET", "")
	t.Setenv("ALLOW_OPEN_CRON", "1")
	req := httptest.NewRequest("POST", "/scrape-now", nil)
	if !validateCronSecret(req) {
		t.Fatal("expected true when ALLOW_OPEN_CRON=1")
	}
}

func TestValidateCronSecret_WithSecret(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CRON_SECRET", "hunter2")
	t.Setenv("ALLOW_OPEN_CRON", "")

	req := httptest.NewRequest("POST", "/scrape-now", nil)
	if validateCronSecret(req) {
		t.Fatal("expected false without header")
	}
	req.Header.Set("X-Cron-Secret", "hunter2")
	if !validateCronSecret(req) {
		t.Fatal("expected true with matching header")
	}
}
