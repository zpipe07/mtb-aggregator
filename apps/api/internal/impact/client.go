package impact

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client calls Impact Partner catalog REST endpoints (Basic auth).
type Client struct {
	AccountSID string
	AuthToken  string
	BaseURL    string
	IRVersion  int
	HTTP       *http.Client
}

// NewClient builds an API client from Config (caller must ensure CatalogConfigured).
func NewClient(cfg Config) *Client {
	ir := DefaultIRVersion
	return &Client{
		AccountSID: cfg.AccountSID,
		AuthToken:  cfg.AuthToken,
		BaseURL:    cfg.APIBaseURL,
		IRVersion:  ir,
		HTTP: &http.Client{
			Timeout: 5 * time.Minute,
		},
	}
}

func (c *Client) irQuery() url.Values {
	q := url.Values{}
	q.Set("IRVersion", strconv.Itoa(c.IRVersion))
	return q
}

func (c *Client) authHeader() string {
	pair := c.AccountSID + ":" + c.AuthToken
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(pair))
}

// Get performs an authenticated GET and returns body and HTTP status.
func (c *Client) Get(ctx context.Context, path string, query url.Values) ([]byte, int, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u := c.BaseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", c.authHeader())

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

// GetOK calls Get and returns an error for non-2xx or empty error bodies.
func (c *Client) GetOK(ctx context.Context, path string, query url.Values) ([]byte, error) {
	body, code, err := c.Get(ctx, path, query)
	if err != nil {
		return nil, err
	}
	if code < 200 || code >= 300 {
		return nil, fmt.Errorf("impact API %s: status %d: %s", path, code, truncate(string(body), 500))
	}
	return body, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
