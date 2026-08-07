package enrichstate

import "time"

// StepDueInput is shared context for due/skip decisions.
type StepDueInput struct {
	Now                  time.Time
	Force                bool
	Config               Config
	State                ListingState
	Snapshot             *Snapshot
	ProfileUpdatedAt     *time.Time
	HasCanonicalCategory bool
	HasPromptProfile     bool
}

func stepStateFor(s ListingState, step Step) StepState {
	switch step {
	case StepPDP:
		return s.PDP
	case StepClassify:
		return s.Classify
	case StepExtract:
		return s.Extract
	default:
		return StepState{}
	}
}

// StepDue reports whether a listing should run the given step now.
func StepDue(step Step, in StepDueInput) bool {
	if in.Force {
		return !stepStateFor(in.State, step).Dead
	}
	st := stepStateFor(in.State, step)
	if st.Dead {
		return false
	}
	if st.NextAttemptAt != nil && in.Now.Before(*st.NextAttemptAt) {
		return false
	}
	switch step {
	case StepPDP:
		return pdpDue(in)
	case StepClassify:
		return classifyDue(in)
	case StepExtract:
		return extractDue(in)
	default:
		return false
	}
}

func pdpDue(in StepDueInput) bool {
	st := in.State.PDP
	if st.CompletedAt == nil {
		return true
	}
	if in.Config.PDPStaleAfter <= 0 {
		return false
	}
	return in.Now.Sub(*st.CompletedAt) >= in.Config.PDPStaleAfter
}

func classifyDue(in StepDueInput) bool {
	if in.State.PDP.CompletedAt == nil {
		return false
	}
	if in.Snapshot != nil && in.Snapshot.Payload.Unavailable {
		return false
	}
	if in.State.Classify.CompletedAt == nil {
		return true
	}
	return llmInvalidated(in)
}

func extractDue(in StepDueInput) bool {
	if in.State.PDP.CompletedAt == nil {
		return false
	}
	if in.Snapshot != nil && in.Snapshot.Payload.Unavailable {
		return false
	}
	if !in.HasCanonicalCategory {
		return false
	}
	if !in.HasPromptProfile {
		return false
	}
	if in.State.Extract.CompletedAt == nil {
		return true
	}
	return llmInvalidated(in)
}

// ShouldSkipLLMStep returns true when classify/extract can be skipped (unchanged inputs).
func ShouldSkipLLMStep(step Step, in StepDueInput) bool {
	if in.Force {
		return false
	}
	if step != StepClassify && step != StepExtract {
		return false
	}
	st := stepStateFor(in.State, step)
	if st.CompletedAt == nil {
		return false
	}
	return !llmInvalidated(in)
}

func llmInvalidated(in StepDueInput) bool {
	if in.Snapshot != nil && in.State.PDPHash != "" && in.Snapshot.ContentHash != in.State.PDPHash {
		return true
	}
	if in.ProfileUpdatedAt != nil && in.State.PromptProfileVersion != nil {
		if in.ProfileUpdatedAt.After(*in.State.PromptProfileVersion) {
			return true
		}
	}
	return false
}

// ResetStepState clears completion for a step (for admin retry).
func ResetStepState(state *ListingState, step Step) {
	switch step {
	case StepPDP:
		state.PDP = StepState{}
		state.PDPHash = ""
	case StepClassify:
		state.Classify = StepState{}
		state.LLMConfidence = nil
	case StepExtract:
		state.Extract = StepState{}
	}
}
