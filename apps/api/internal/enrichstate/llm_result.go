package enrichstate

import "errors"

// ErrStepDeferred means the provider cannot run this step right now (OpenAI
// quota). The listing stays due. The job must stop claiming more LLM work.
// Do not stamp classified_at / extracted_at and do not dead-letter.
var ErrStepDeferred = errors.New("enrichment step deferred")

// ErrStepNotReady means classify cannot run because the classifier is not
// configured (disabled, empty tree, or no API key). Do not stamp completion.
// Stop the current step so one not-ready result does not walk the whole due set.
var ErrStepNotReady = errors.New("enrichment step not ready")

// ErrStepSkipped means the step intentionally did not apply a category and the
// reason is persisted (manual override, or confidence below threshold).
// Completion may be stamped so the listing is not retried.
var ErrStepSkipped = errors.New("enrichment step skipped")
