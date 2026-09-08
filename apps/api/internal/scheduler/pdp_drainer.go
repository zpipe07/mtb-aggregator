package scheduler

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/enrichstate"
	"github.com/mtb-aggregator/api/internal/logutil"
	"github.com/mtb-aggregator/api/internal/sentryutil"
)

var pdpDrainerLog = logutil.Logger("pdp-drainer")

func pdpDrainerEnabled() bool {
	return os.Getenv("ENRICH_PDP_DRAINER") != "0"
}

// StartPDPDrainer runs the resident polite PDP fetch loop until Stop cancels it.
func (s *Scheduler) StartPDPDrainer(parent context.Context) {
	if !pdpDrainerEnabled() {
		pdpDrainerLog.Info("PDP drainer disabled (ENRICH_PDP_DRAINER=0)")
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.drainerCancel = cancel
	s.drainerDone = make(chan struct{})
	go func() {
		defer close(s.drainerDone)
		storeTypes, err := s.db.ListEnricherStoreTypes(context.Background())
		if err != nil {
			pdpDrainerLog.Error("failed to list enricher stores", logutil.ErrAttr(err))
			storeTypes = append([]string(nil), db.StoreTypesWithEnrichers...)
		}
		if len(storeTypes) == 0 {
			storeTypes = append([]string(nil), db.StoreTypesWithEnrichers...)
		}
		cfg := enrichstate.LoadConfigFromEnv()
		pipeline := s.buildEnrichmentPipeline(nil, nil, nil, false)
		drainer := &enrichstate.PDPDrainer{
			StoreTypes:   storeTypes,
			Pipeline:     pipeline,
			Pacer:        db.StorePDPPacer{DB: s.db},
			Config:       cfg,
			CBThreshold:  enrichstate.CircuitBreakerThreshold(),
			OnPDPSuccess: s.kickLLMJobDebounced,
			OnCooldownTrip: capturePDPCooldownTrip,
		}
		pdpDrainerLog.Info("started PDP drainer", "stores", len(storeTypes), "min_interval", cfg.PDPMinInterval.String())
		drainer.Run(ctx)
		pdpDrainerLog.Info("PDP drainer stopped")
	}()
}

func (s *Scheduler) kickLLMJobDebounced(storeType string) {
	if storeType == "" {
		return
	}
	s.llmInflightMu.Lock()
	if s.llmInflight == nil {
		s.llmInflight = make(map[string]bool)
	}
	if s.llmInflight[storeType] {
		s.llmInflightMu.Unlock()
		return
	}
	s.llmInflight[storeType] = true
	s.llmInflightMu.Unlock()

	go func() {
		defer func() {
			s.llmInflightMu.Lock()
			delete(s.llmInflight, storeType)
			s.llmInflightMu.Unlock()
		}()
		s.RunLLMJob(db.EnrichmentFilter{StoreType: storeType}, "pdp")
	}()
}

func (s *Scheduler) waitForPDPDrainerStop(timeout time.Duration) {
	if s.drainerDone == nil {
		return
	}
	select {
	case <-s.drainerDone:
	case <-time.After(timeout):
		pdpDrainerLog.Warn("PDP drainer shutdown timed out", "timeout", timeout.String())
	}
}

func capturePDPCooldownTrip(storeType string) {
	sentryutil.CaptureError(
		fmt.Errorf("PDP circuit breaker tripped for store %s: skipping until cooldown expires", storeType),
		map[string]string{"component": "scheduler", "job": "pdp_drainer", "phase": "circuit_breaker", "store_type": storeType},
	)
}
