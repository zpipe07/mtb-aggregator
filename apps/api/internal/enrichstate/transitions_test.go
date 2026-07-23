package enrichstate

import (
	"testing"
	"time"
)

func TestStepDue_pdpNeverAttempted(t *testing.T) {
	t.Parallel()
	now := time.Now()
	in := StepDueInput{Now: now, Config: DefaultConfig(), State: ListingState{}}
	if !StepDue(StepPDP, in) {
		t.Fatal("never-attempted PDP should be due")
	}
}

func TestStepDue_pdpBackoffPending(t *testing.T) {
	t.Parallel()
	future := time.Now().Add(time.Hour)
	in := StepDueInput{
		Now:    time.Now(),
		Config: DefaultConfig(),
		State: ListingState{
			PDP: StepState{NextAttemptAt: &future, Attempts: 1},
		},
	}
	if StepDue(StepPDP, in) {
		t.Fatal("PDP should not be due during backoff")
	}
}

func TestStepDue_pdpStaleAfterSevenDays(t *testing.T) {
	t.Parallel()
	completed := time.Now().Add(-8 * 24 * time.Hour)
	in := StepDueInput{
		Now:    time.Now(),
		Config: DefaultConfig(),
		State: ListingState{
			PDP: StepState{CompletedAt: &completed},
		},
	}
	if !StepDue(StepPDP, in) {
		t.Fatal("PDP should be due after stale window")
	}
}

func TestStepDue_classifyRequiresPDP(t *testing.T) {
	t.Parallel()
	in := StepDueInput{Now: time.Now(), Config: DefaultConfig(), State: ListingState{}}
	if StepDue(StepClassify, in) {
		t.Fatal("classify should not run without PDP")
	}
}

func TestStepDue_classifySkippedWhenUnavailable(t *testing.T) {
	t.Parallel()
	completed := time.Now()
	in := StepDueInput{
		Now:    time.Now(),
		Config: DefaultConfig(),
		State:  ListingState{PDP: StepState{CompletedAt: &completed}},
		Snapshot: &Snapshot{
			Payload: SnapshotPayload{Unavailable: true},
		},
	}
	if StepDue(StepClassify, in) {
		t.Fatal("classify should skip unavailable listings")
	}
}

func TestStepDue_extractRequiresCanonicalAndProfile(t *testing.T) {
	t.Parallel()
	completed := time.Now()
	base := StepDueInput{
		Now:    time.Now(),
		Config: DefaultConfig(),
		State:  ListingState{PDP: StepState{CompletedAt: &completed}},
		Snapshot: &Snapshot{Payload: SnapshotPayload{}},
	}
	if StepDue(StepExtract, base) {
		t.Fatal("extract should require canonical category and profile")
	}
	base.HasCanonicalCategory = true
	if StepDue(StepExtract, base) {
		t.Fatal("extract should require prompt profile")
	}
}

func TestShouldSkipLLMStep_unchangedHashAndProfile(t *testing.T) {
	t.Parallel()
	now := time.Now()
	profileVer := now.Add(-time.Hour)
	completed := now.Add(-30 * time.Minute)
	hash := "abc123"
	in := StepDueInput{
		Now:                  now,
		Config:               DefaultConfig(),
		HasCanonicalCategory: true,
		HasPromptProfile:     true,
		State: ListingState{
			PDP:                  StepState{CompletedAt: &completed},
			Classify:             StepState{CompletedAt: &completed},
			PDPHash:              hash,
			PromptProfileVersion: &profileVer,
		},
		Snapshot:         &Snapshot{ContentHash: hash},
		ProfileUpdatedAt: &profileVer,
	}
	if !ShouldSkipLLMStep(StepClassify, in) {
		t.Fatal("should skip classify when hash and profile unchanged")
	}
}

func TestShouldSkipLLMStep_hashChangeInvalidates(t *testing.T) {
	t.Parallel()
	now := time.Now()
	completed := now.Add(-time.Minute)
	in := StepDueInput{
		Now:    now,
		Config: DefaultConfig(),
		State: ListingState{
			PDP:      StepState{CompletedAt: &completed},
			Classify: StepState{CompletedAt: &completed},
			PDPHash:  "old",
		},
		Snapshot: &Snapshot{ContentHash: "new"},
	}
	if ShouldSkipLLMStep(StepClassify, in) {
		t.Fatal("hash change should invalidate skip")
	}
	if !StepDue(StepClassify, in) {
		t.Fatal("classify should be due after hash change")
	}
}

func TestStepDue_forceBypassesStaleButNotDead(t *testing.T) {
	t.Parallel()
	in := StepDueInput{
		Now:    time.Now(),
		Force:  true,
		Config: DefaultConfig(),
		State: ListingState{
			PDP: StepState{Dead: true},
		},
	}
	if StepDue(StepPDP, in) {
		t.Fatal("force should not run dead steps")
	}
}

func TestStepDue_deadNeverRuns(t *testing.T) {
	t.Parallel()
	in := StepDueInput{
		Now:    time.Now(),
		Config: DefaultConfig(),
		State: ListingState{
			Classify: StepState{Dead: true, CompletedAt: nil},
			PDP:      StepState{CompletedAt: ptrTime(time.Now())},
		},
		Snapshot: &Snapshot{Payload: SnapshotPayload{}},
	}
	if StepDue(StepClassify, in) {
		t.Fatal("dead classify should never run")
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
