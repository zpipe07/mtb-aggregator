package logutil

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
)

var (
	root              *slog.Logger
	once              sync.Once
	httpAccessEnabled bool
)

// Init configures the process-wide slog logger. Call once at startup before other packages log.
func Init(service string) {
	once.Do(func() {
		level := parseLevel(os.Getenv("LOG_LEVEL"))
		format := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT")))
		if format == "" {
			format = "json"
		}

		opts := &slog.HandlerOptions{
			Level:       level,
			ReplaceAttr: replaceAttr,
		}

		var handler slog.Handler
		if format == "text" {
			handler = slog.NewTextHandler(os.Stdout, opts)
		} else {
			handler = slog.NewJSONHandler(os.Stdout, opts)
		}

		root = slog.New(handler).With("service", service)
		slog.SetDefault(root)
		httpAccessEnabled = resolveHTTPAccess()
	})
}

func replaceAttr(_ []string, a slog.Attr) slog.Attr {
	switch a.Key {
	case slog.TimeKey:
		a.Key = "ts"
	case slog.LevelKey:
		a.Key = "level"
		if lvl, ok := a.Value.Any().(slog.Level); ok {
			a.Value = slog.StringValue(strings.ToLower(lvl.String()))
		}
	case slog.MessageKey:
		a.Key = "msg"
	}
	return a
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func resolveHTTPAccess() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_HTTP_ACCESS")))
	switch v {
	case "on", "true", "1":
		return true
	case "off", "false", "0":
		return false
	default:
		if strings.EqualFold(strings.TrimSpace(os.Getenv("RENDER")), "true") {
			return false
		}
		if strings.TrimSpace(os.Getenv("VERCEL")) == "1" {
			return false
		}
		return true
	}
}

// Logger returns a child logger with component bound.
func Logger(component string) *slog.Logger {
	if root == nil {
		Init("api")
	}
	return root.With("component", component)
}

// HTTPAccessEnabled reports whether app-level HTTP access logs should be emitted.
func HTTPAccessEnabled() bool {
	if root == nil {
		Init("api")
	}
	return httpAccessEnabled
}

// ClientIP returns the best-effort client IP from proxy headers or RemoteAddr.
func ClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if i := strings.Index(xff, ","); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return xff
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

// RequestID reads an incoming request ID or generates one for correlation.
func RequestID(r *http.Request) string {
	for _, key := range []string{"X-Request-ID", "X-Request-Id", "Rndr-Id", "Render-Request-Id"} {
		if id := strings.TrimSpace(r.Header.Get(key)); id != "" {
			return id
		}
	}
	return newRequestID()
}

func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b[:])
}

// ErrAttr returns a structured error attribute when err is non-nil.
func ErrAttr(err error) slog.Attr {
	if err == nil {
		return slog.Attr{}
	}
	return slog.String("err", err.Error())
}
