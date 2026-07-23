package enrichstate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

// NormalizePayload returns canonical JSON bytes for hashing. Map keys are sorted;
// empty variant slices are omitted for stability.
func NormalizePayload(p SnapshotPayload) ([]byte, error) {
	n := normalizePayloadCopy(p)
	return json.Marshal(n)
}

// HashPayload returns a hex SHA-256 of normalized payload bytes.
func HashPayload(normalized []byte) string {
	sum := sha256.Sum256(normalized)
	return hex.EncodeToString(sum[:])
}

// HashSnapshotPayload normalizes and hashes a snapshot payload in one step.
func HashSnapshotPayload(p SnapshotPayload) (hash string, normalized []byte, err error) {
	normalized, err = NormalizePayload(p)
	if err != nil {
		return "", nil, err
	}
	return HashPayload(normalized), normalized, nil
}

func normalizePayloadCopy(p SnapshotPayload) snapshotNormalized {
	out := snapshotNormalized{
		CategoryPath: append([]string(nil), p.CategoryPath...),
		Unavailable:  p.Unavailable,
		Description:  p.Description,
	}
	if len(p.RawSpecs) > 0 {
		out.RawSpecs = make(map[string]string, len(p.RawSpecs))
		keys := make([]string, 0, len(p.RawSpecs))
		for k := range p.RawSpecs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			out.RawSpecs[k] = p.RawSpecs[k]
		}
	}
	if len(p.Variants) > 0 {
		out.Variants = make([]SnapshotVariant, len(p.Variants))
		copy(out.Variants, p.Variants)
	}
	return out
}

// snapshotNormalized is the JSON shape used for content hashing.
type snapshotNormalized struct {
	CategoryPath []string          `json:"category_path,omitempty"`
	RawSpecs     map[string]string `json:"raw_specs,omitempty"`
	Unavailable  bool              `json:"unavailable"`
	Description  *string           `json:"description,omitempty"`
	Variants     []SnapshotVariant `json:"variants,omitempty"`
}
