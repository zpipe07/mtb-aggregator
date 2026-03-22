package api

import (
	"net/http"
	"testing"
	"time"
)

func TestAdminAuthLimiter_allowsThenBlocks(t *testing.T) {
	t.Setenv("ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW", "3")
	t.Setenv("ADMIN_AUTH_WINDOW_SECONDS", "60")

	l := &adminAuthLimiter{m: make(map[string]*authIPState)}
	ip := "10.0.0.1"

	if !l.allowAdminAuth(ip) {
		t.Fatal("expected allow initially")
	}
	l.recordAdminAuthFailure(ip)
	l.recordAdminAuthFailure(ip)
	if !l.allowAdminAuth(ip) {
		t.Fatal("expected allow under limit")
	}
	l.recordAdminAuthFailure(ip)
	if l.allowAdminAuth(ip) {
		t.Fatal("expected block at limit")
	}
}

func TestAdminAuthLimiter_resetClears(t *testing.T) {
	t.Setenv("ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW", "2")
	t.Setenv("ADMIN_AUTH_WINDOW_SECONDS", "60")

	l := &adminAuthLimiter{m: make(map[string]*authIPState)}
	ip := "10.0.0.2"

	l.recordAdminAuthFailure(ip)
	l.resetAdminAuth(ip)
	if !l.allowAdminAuth(ip) {
		t.Fatal("expected allow after reset")
	}
}

func TestAdminAuthLimiter_windowExpiry(t *testing.T) {
	t.Setenv("ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW", "2")
	t.Setenv("ADMIN_AUTH_WINDOW_SECONDS", "1")

	l := &adminAuthLimiter{m: make(map[string]*authIPState)}
	ip := "10.0.0.3"

	l.recordAdminAuthFailure(ip)
	l.recordAdminAuthFailure(ip)
	if l.allowAdminAuth(ip) {
		t.Fatal("expected block")
	}
	time.Sleep(1100 * time.Millisecond)
	if !l.allowAdminAuth(ip) {
		t.Fatal("expected allow after window")
	}
}

func TestAdminAuthRateLimitDisabled(t *testing.T) {
	t.Setenv("ADMIN_AUTH_RATE_LIMIT", "off")
	t.Setenv("ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW", "1")

	l := &adminAuthLimiter{m: make(map[string]*authIPState)}
	ip := "10.0.0.4"

	l.recordAdminAuthFailure(ip)
	if !l.allowAdminAuth(ip) {
		t.Fatal("expected allow when rate limit disabled")
	}
}

func TestClientIP_forwarded(t *testing.T) {
	req := mustReq(t, "GET", "/", "192.168.1.1:1234")
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	if got := clientIP(req); got != "203.0.113.5" {
		t.Fatalf("clientIP: got %q", got)
	}
}

func mustReq(t *testing.T, method, url, remoteAddr string) *http.Request {
	t.Helper()
	r, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	r.RemoteAddr = remoteAddr
	return r
}
