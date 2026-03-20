package api

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// adminAuthLimiter tracks failed POST /admin/auth attempts per client IP.
type adminAuthLimiter struct {
	mu sync.Mutex
	m  map[string]*authIPState
}

type authIPState struct {
	failures    int
	firstFailAt time.Time
}

var globalAdminAuthLimiter = &adminAuthLimiter{m: make(map[string]*authIPState)}

func adminAuthRateLimitEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_AUTH_RATE_LIMIT")))
	if v == "0" || v == "false" || v == "off" {
		return false
	}
	return true
}

func adminAuthMaxFailures() int {
	n := 5
	if v := strings.TrimSpace(os.Getenv("ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW")); v != "" {
		if x, err := strconv.Atoi(v); err == nil && x > 0 {
			n = x
		}
	}
	return n
}

func adminAuthWindow() time.Duration {
	d := 15 * time.Minute
	if v := strings.TrimSpace(os.Getenv("ADMIN_AUTH_WINDOW_SECONDS")); v != "" {
		if x, err := strconv.Atoi(v); err == nil && x > 0 {
			return time.Duration(x) * time.Second
		}
	}
	return d
}

// clientIP returns the best-effort client IP (X-Forwarded-For / X-Real-IP when behind a proxy).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// allowAdminAuth returns false if this IP has exceeded failed login attempts within the window.
func (l *adminAuthLimiter) allowAdminAuth(ip string) bool {
	if !adminAuthRateLimitEnabled() {
		return true
	}
	max := adminAuthMaxFailures()
	window := adminAuthWindow()
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	st, ok := l.m[ip]
	if !ok {
		return true
	}
	if now.Sub(st.firstFailAt) >= window {
		delete(l.m, ip)
		return true
	}
	return st.failures < max
}

func (l *adminAuthLimiter) recordAdminAuthFailure(ip string) {
	if !adminAuthRateLimitEnabled() {
		return
	}
	max := adminAuthMaxFailures()
	window := adminAuthWindow()
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	st, ok := l.m[ip]
	if !ok || now.Sub(st.firstFailAt) >= window {
		l.m[ip] = &authIPState{failures: 1, firstFailAt: now}
		return
	}
	st.failures++
	if st.failures > max {
		st.failures = max
	}
}

func (l *adminAuthLimiter) resetAdminAuth(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.m, ip)
}

// retryAfterSeconds returns seconds until the current window ends (for Retry-After), or 0 if unknown.
func (l *adminAuthLimiter) retryAfterSeconds(ip string) int {
	window := adminAuthWindow()
	l.mu.Lock()
	defer l.mu.Unlock()
	st, ok := l.m[ip]
	if !ok {
		return 0
	}
	until := time.Until(st.firstFailAt.Add(window))
	sec := int(until.Seconds()) + 1
	if sec < 1 {
		return 1
	}
	return sec
}
