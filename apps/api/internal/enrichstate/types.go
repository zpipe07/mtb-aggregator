// Package enrichstate models per-listing enrichment step state, PDP snapshots,
// and the event ledger for durable, retryable enrichment without a queue library.
package enrichstate

import (
	"context"
	"time"
)

// Step identifies one enrichment pipeline stage.
type Step string

const (
	StepPDP      Step = "pdp"
	StepClassify Step = "classify"
	StepExtract  Step = "extract"
)

// ValidStep reports whether s is a known enrichment step.
func ValidStep(s Step) bool {
	switch s {
	case StepPDP, StepClassify, StepExtract:
		return true
	default:
		return false
	}
}

// ParseStep parses a query/path step name.
func ParseStep(raw string) (Step, bool) {
	s := Step(raw)
	return s, ValidStep(s)
}

// EventStatus is the outcome recorded in the enrichment event ledger.
type EventStatus string

const (
	StatusSuccess EventStatus = "success"
	StatusFailure EventStatus = "failure"
	StatusSkipped EventStatus = "skipped"
)

// StepState holds durable state for one pipeline step on a listing.
type StepState struct {
	CompletedAt   *time.Time
	Attempts      int
	Error         string
	NextAttemptAt *time.Time
	Dead          bool
}

// ListingState is the per-listing enrichment state across all steps.
type ListingState struct {
	ListingID            int
	PDP                  StepState
	Classify             StepState
	Extract              StepState
	PDPHash              string
	LLMConfidence        *float64
	PromptProfileVersion *time.Time
}

// SnapshotPayload is the normalized PDP parse result persisted for LLM retries.
type SnapshotPayload struct {
	CategoryPath []string          `json:"category_path"`
	RawSpecs     map[string]string `json:"raw_specs"`
	Unavailable  bool              `json:"unavailable"`
	Description  *string           `json:"description,omitempty"`
	// Variants omitted from hash when empty; stored for fan-out replay.
	Variants []SnapshotVariant `json:"variants,omitempty"`
}

// SnapshotVariant is a lightweight variant row from PDP enrich.
type SnapshotVariant struct {
	SKU            string            `json:"sku,omitempty"`
	VariantOptions map[string]string `json:"variant_options,omitempty"`
	IsOrderable    bool              `json:"is_orderable"`
	CurrentPrice   *float64          `json:"current_price,omitempty"`
	OriginalPrice  *float64          `json:"original_price,omitempty"`
}

// Snapshot is the latest PDP snapshot for a listing.
type Snapshot struct {
	ListingID   int
	Payload     SnapshotPayload
	ContentHash string
	FetchedAt   time.Time
}

// Event is one append-only enrichment ledger row.
type Event struct {
	ListingID  int
	Step       Step
	Status     EventStatus
	Error      string
	Model      string
	Confidence *float64
	DurationMs int
	JobID      *int
}

// WorkItem is a listing claimed for a pipeline step.
type WorkItem struct {
	ListingID  int
	StoreID    int
	StoreType  string
	ProductURL string
	StoreSKU   string
}

// ClaimFilter scopes which listings can be claimed (mirrors db.EnrichmentFilter).
type ClaimFilter struct {
	StoreType          string
	CanonicalCategory  []string
	LlmConfidenceBelow *float64
}

// StepSuccessMeta carries step-specific fields written on success.
type StepSuccessMeta struct {
	// PDPHash is the snapshot content hash the LLM step just processed.
	// Set on classify/extract success only; PDP success must leave the stored
	// hash untouched so "content changed since classification" stays detectable.
	PDPHash              string
	LLMConfidence        *float64
	PromptProfileVersion *time.Time
}

// Config holds backoff and attempt-cap settings for the pipeline.
type Config struct {
	MaxPDPAttempts      int
	MaxClassifyAttempts int
	MaxExtractAttempts  int
	BackoffBase         time.Duration
	BackoffMax          time.Duration
	PDPStaleAfter       time.Duration
	ClaimLease          time.Duration
}

// DefaultConfig returns production defaults matching existing 7-day staleness.
func DefaultConfig() Config {
	return Config{
		MaxPDPAttempts:      5,
		MaxClassifyAttempts: 5,
		MaxExtractAttempts:  5,
		BackoffBase:         5 * time.Minute,
		BackoffMax:          6 * time.Hour,
		PDPStaleAfter:       7 * 24 * time.Hour,
		ClaimLease:          10 * time.Minute,
	}
}

// StateStore persists per-listing step state and claims work items.
type StateStore interface {
	ClaimForStep(ctx context.Context, step Step, filter ClaimFilter, limit int, force bool, now, leaseUntil time.Time) ([]WorkItem, error)
	GetState(ctx context.Context, listingID int) (*ListingState, error)
	RecordStepSuccess(ctx context.Context, listingID int, step Step, meta StepSuccessMeta, completedAt time.Time) error
	RecordStepFailure(ctx context.Context, listingID int, step Step, errMsg string, nextAttempt time.Time, dead bool) error
	ResetStep(ctx context.Context, listingID int, step Step) error
	ReleaseLease(ctx context.Context, listingID int, step Step) error
	EnsureRow(ctx context.Context, listingID int) error
}

// SnapshotStore persists latest PDP snapshots.
type SnapshotStore interface {
	Save(ctx context.Context, snap Snapshot) error
	Get(ctx context.Context, listingID int) (*Snapshot, error)
}

// EventRecorder appends enrichment events.
type EventRecorder interface {
	Record(ctx context.Context, ev Event) error
}

// ListingStore persists PDP merges and reads listing fields for LLM steps.
type ListingStore interface {
	UpdateListingEnrichment(ctx context.Context, id int, categoryPath []string, rawSpecs map[string]string, unavailable bool, description *string) error
	GetListingForLLM(ctx context.Context, listingID int) (*ListingLLMView, error)
	GetListingForCategoryClassification(ctx context.Context, listingID int) (*ListingClassifyView, error)
	GetPromptProfileUpdatedAt(ctx context.Context, canonicalCategory []string) (*time.Time, error)
}

// ListingLLMView is listing data needed for extract/skip decisions.
type ListingLLMView struct {
	CanonicalCategory []string
}

// ListingClassifyView is listing data needed after classification.
type ListingClassifyView struct {
	Metadata []byte
}

// ErrStepDead is returned when a listing step exceeded max attempts.
var ErrStepDead = errStepDead{}

type errStepDead struct{}

func (errStepDead) Error() string { return "enrichment step exceeded max attempts" }
