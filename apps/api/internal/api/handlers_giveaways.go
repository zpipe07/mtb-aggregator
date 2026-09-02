package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/sentryutil"
)

type publicGiveawayJSON struct {
	ID                int      `json:"id"`
	Slug              string   `json:"slug"`
	Kind              string   `json:"kind"`
	Title             string   `json:"title"`
	Summary           string   `json:"summary"`
	PrizeName         string   `json:"prize_name"`
	PrizeDescription  *string  `json:"prize_description"`
	ImageURL          *string  `json:"image_url"`
	HostName          string   `json:"host_name"`
	EntryURL          string   `json:"entry_url"`
	OfficialRulesURL  string   `json:"official_rules_url"`
	StartsAt          *string  `json:"starts_at"`
	EndsAt            string   `json:"ends_at"`
	Eligibility       *string  `json:"eligibility"`
	EntryRequirements *string  `json:"entry_requirements"`
	TicketPrice       *float64 `json:"ticket_price"`
	TicketCurrency    string   `json:"ticket_currency"`
	Beneficiary       *string  `json:"beneficiary"`
	Status            string   `json:"status"`
}

type adminGiveawayJSON struct {
	publicGiveawayJSON
	Published bool   `json:"published"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func rfc3339Ptr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

func giveawayStatusOf(g db.Giveaway, now time.Time) GiveawayStatus {
	startsSet := g.StartsAt != nil
	var starts time.Time
	if startsSet {
		starts = *g.StartsAt
	}
	return DeriveGiveawayStatus(now, starts, g.EndsAt, startsSet)
}

func toPublicGiveawayJSON(g db.Giveaway, now time.Time) publicGiveawayJSON {
	return publicGiveawayJSON{
		ID:                g.ID,
		Slug:              g.Slug,
		Kind:              g.Kind,
		Title:             g.Title,
		Summary:           g.Summary,
		PrizeName:         g.PrizeName,
		PrizeDescription:  g.PrizeDescription,
		ImageURL:          g.ImageURL,
		HostName:          g.HostName,
		EntryURL:          g.EntryURL,
		OfficialRulesURL:  g.OfficialRulesURL,
		StartsAt:          rfc3339Ptr(g.StartsAt),
		EndsAt:            g.EndsAt.UTC().Format(time.RFC3339),
		Eligibility:       g.Eligibility,
		EntryRequirements: g.EntryRequirements,
		TicketPrice:       g.TicketPrice,
		TicketCurrency:    g.TicketCurrency,
		Beneficiary:       g.Beneficiary,
		Status:            string(giveawayStatusOf(g, now)),
	}
}

func toAdminGiveawayJSON(g db.Giveaway, now time.Time) adminGiveawayJSON {
	return adminGiveawayJSON{
		publicGiveawayJSON: toPublicGiveawayJSON(g, now),
		Published:          g.Published,
		CreatedAt:          g.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:          g.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func writeGiveawayJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func giveawayUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "duplicate") || strings.Contains(s, "unique")
}

func writeGiveawayServerError(w http.ResponseWriter, err error, phase string) {
	log.Printf("[api] giveaways %s: %v", phase, err)
	sentryutil.CaptureError(err, map[string]string{"component": "api", "phase": phase})
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func (h *Handlers) GetGiveaways(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	now := time.Now().UTC()
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	rows, err := h.DB.ListPublicGiveaways(r.Context(), now, kind)
	if err != nil {
		writeGiveawayServerError(w, err, "list_public_giveaways")
		return
	}
	out := make([]publicGiveawayJSON, 0, len(rows))
	var openCount, upcomingCount, endedCount int
	for _, g := range rows {
		item := toPublicGiveawayJSON(g, now)
		switch item.Status {
		case string(GiveawayStatusOpen):
			openCount++
		case string(GiveawayStatusUpcoming):
			upcomingCount++
		case string(GiveawayStatusEnded):
			endedCount++
		}
		out = append(out, item)
	}
	writeGiveawayJSON(w, http.StatusOK, map[string]any{
		"giveaways":      out,
		"open_count":     openCount,
		"upcoming_count": upcomingCount,
		"ended_count":    endedCount,
	})
}

func (h *Handlers) AdminGiveawaysCollection(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/admin/giveaways" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.getAdminGiveaways(w, r)
	case http.MethodPost:
		h.postAdminGiveaway(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handlers) AdminGiveawayItem(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/admin/giveaways/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}
	id, err := strconv.Atoi(path)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.getAdminGiveaway(w, r, id)
	case http.MethodPut:
		h.putAdminGiveaway(w, r, id)
	case http.MethodDelete:
		h.deleteAdminGiveaway(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func parseAdminPublishedQuery(raw string) (*bool, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return nil, nil
	}
	switch raw {
	case "true", "1":
		v := true
		return &v, nil
	case "false", "0":
		v := false
		return &v, nil
	default:
		return nil, strconv.ErrSyntax
	}
}

func (h *Handlers) getAdminGiveaways(w http.ResponseWriter, r *http.Request) {
	published, err := parseAdminPublishedQuery(r.URL.Query().Get("published"))
	if err != nil {
		http.Error(w, "published must be true or false", http.StatusBadRequest)
		return
	}
	rows, err := h.DB.ListAdminGiveaways(r.Context(), db.ListAdminGiveawaysParams{
		Kind:      r.URL.Query().Get("kind"),
		Published: published,
	})
	if err != nil {
		writeGiveawayServerError(w, err, "list_admin_giveaways")
		return
	}
	now := time.Now().UTC()
	out := make([]adminGiveawayJSON, 0, len(rows))
	for _, g := range rows {
		out = append(out, toAdminGiveawayJSON(g, now))
	}
	writeGiveawayJSON(w, http.StatusOK, out)
}

func (h *Handlers) getAdminGiveaway(w http.ResponseWriter, r *http.Request, id int) {
	g, err := h.DB.GetGiveawayByID(r.Context(), id)
	if err != nil {
		writeGiveawayServerError(w, err, "get_admin_giveaway")
		return
	}
	if g == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeGiveawayJSON(w, http.StatusOK, toAdminGiveawayJSON(*g, time.Now().UTC()))
}

func decodeGiveawayWrite(r *http.Request) (parsedGiveaway, error) {
	var body giveawayWriteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return parsedGiveaway{}, errInvalidGiveawayJSON
	}
	return parseGiveawayWrite(body)
}

var errInvalidGiveawayJSON = &giveawayClientError{msg: "invalid json"}

type giveawayClientError struct{ msg string }

func (e *giveawayClientError) Error() string { return e.msg }

func (h *Handlers) resolveGiveawaySlug(r *http.Request, p parsedGiveaway, excludeID int) (string, int, error) {
	if p.SlugProvided {
		taken, err := h.DB.GiveawaySlugTaken(r.Context(), p.Slug, excludeID)
		if err != nil {
			return "", http.StatusInternalServerError, err
		}
		if taken {
			return "", http.StatusConflict, nil
		}
		return p.Slug, 0, nil
	}
	for i := 1; i <= 50; i++ {
		candidate := nextGiveawaySlug(p.Slug, i)
		taken, err := h.DB.GiveawaySlugTaken(r.Context(), candidate, excludeID)
		if err != nil {
			return "", http.StatusInternalServerError, err
		}
		if !taken {
			return candidate, 0, nil
		}
	}
	return "", http.StatusConflict, nil
}

func writeToGiveaway(p parsedGiveaway) db.GiveawayWrite {
	return db.GiveawayWrite{
		Slug:              p.Slug,
		Kind:              p.Kind,
		Title:             p.Title,
		Summary:           p.Summary,
		PrizeName:         p.PrizeName,
		PrizeDescription:  p.PrizeDescription,
		ImageURL:          p.ImageURL,
		HostName:          p.HostName,
		EntryURL:          p.EntryURL,
		OfficialRulesURL:  p.OfficialRulesURL,
		StartsAt:          p.StartsAt,
		EndsAt:            p.EndsAt,
		Eligibility:       p.Eligibility,
		EntryRequirements: p.EntryRequirements,
		TicketPrice:       p.TicketPrice,
		TicketCurrency:    p.TicketCurrency,
		Beneficiary:       p.Beneficiary,
		Published:         p.Published,
	}
}

func (h *Handlers) postAdminGiveaway(w http.ResponseWriter, r *http.Request) {
	p, err := decodeGiveawayWrite(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	slug, code, err := h.resolveGiveawaySlug(r, p, 0)
	if err != nil {
		writeGiveawayServerError(w, err, "resolve_giveaway_slug")
		return
	}
	if code == http.StatusConflict {
		http.Error(w, "slug already exists", http.StatusConflict)
		return
	}
	p.Slug = slug
	id, err := h.DB.CreateGiveaway(r.Context(), writeToGiveaway(p))
	if err != nil {
		if giveawayUniqueConflict(err) {
			http.Error(w, "slug or entry_url already exists", http.StatusConflict)
			return
		}
		writeGiveawayServerError(w, err, "create_giveaway")
		return
	}
	writeGiveawayJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *Handlers) putAdminGiveaway(w http.ResponseWriter, r *http.Request, id int) {
	p, err := decodeGiveawayWrite(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	existing, err := h.DB.GetGiveawayByID(r.Context(), id)
	if err != nil {
		writeGiveawayServerError(w, err, "get_admin_giveaway")
		return
	}
	if existing == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	slug, code, err := h.resolveGiveawaySlug(r, p, id)
	if err != nil {
		writeGiveawayServerError(w, err, "resolve_giveaway_slug")
		return
	}
	if code == http.StatusConflict {
		http.Error(w, "slug already exists", http.StatusConflict)
		return
	}
	p.Slug = slug
	err = h.DB.UpdateGiveaway(r.Context(), id, writeToGiveaway(p))
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if giveawayUniqueConflict(err) {
			http.Error(w, "slug or entry_url already exists", http.StatusConflict)
			return
		}
		writeGiveawayServerError(w, err, "update_giveaway")
		return
	}
	updated, err := h.DB.GetGiveawayByID(r.Context(), id)
	if err != nil {
		writeGiveawayServerError(w, err, "get_admin_giveaway")
		return
	}
	writeGiveawayJSON(w, http.StatusOK, toAdminGiveawayJSON(*updated, time.Now().UTC()))
}

func (h *Handlers) deleteAdminGiveaway(w http.ResponseWriter, r *http.Request, id int) {
	err := h.DB.DeleteGiveaway(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		writeGiveawayServerError(w, err, "delete_giveaway")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
