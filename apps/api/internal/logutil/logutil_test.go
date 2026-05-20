package logutil

import (
	"net/http/httptest"
	"os"
	"testing"
)

func TestResolveHTTPAccess(t *testing.T) {
	t.Setenv("LOG_HTTP_ACCESS", "")
	t.Setenv("RENDER", "")
	t.Setenv("VERCEL", "")
	if !resolveHTTPAccess() {
		t.Fatal("expected access logging on locally with auto")
	}

	t.Setenv("RENDER", "true")
	if resolveHTTPAccess() {
		t.Fatal("expected access logging off on Render with auto")
	}

	t.Setenv("RENDER", "")
	t.Setenv("LOG_HTTP_ACCESS", "on")
	if !resolveHTTPAccess() {
		t.Fatal("expected access logging on when forced")
	}

	t.Setenv("LOG_HTTP_ACCESS", "off")
	if resolveHTTPAccess() {
		t.Fatal("expected access logging off when disabled")
	}
}

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
	if got := ClientIP(req); got != "203.0.113.1" {
		t.Fatalf("ClientIP() = %q, want 203.0.113.1", got)
	}
}

func TestRequestIDFromHeader(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Request-ID", "abc-123")
	if got := RequestID(req); got != "abc-123" {
		t.Fatalf("RequestID() = %q, want abc-123", got)
	}
}

func TestInitSetsDefaultLogger(t *testing.T) {
	os.Setenv("LOG_FORMAT", "json")
	Init("api-test")
	if root == nil {
		t.Fatal("root logger not set")
	}
}
