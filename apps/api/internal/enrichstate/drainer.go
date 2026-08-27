package enrichstate

import (
	"context"
	"log"
	"time"
)

const defaultDrainerIdleSleep = 2 * time.Second

// PDPDrainer continuously claims and runs one PDP fetch per store at a polite pace.
type PDPDrainer struct {
	StoreTypes []string
	Pipeline   *Pipeline
	Pacer      StorePDPPacer
	Config     Config
	// BypassMinInterval is true for burst jobs; the drainer always uses min-interval pacing.
	BypassMinInterval bool
	Force             bool
	OnPDPSuccess      func(storeType string)
	OnCooldownTrip    func(storeType string)
	CBThreshold       int
	Now               func() time.Time
	Sleep             func(time.Duration)
	IdleSleep         time.Duration
}

// Run executes the drainer loop until ctx is canceled.
func (d *PDPDrainer) Run(ctx context.Context) {
	if d.Pipeline == nil || d.Pacer == nil || len(d.StoreTypes) == 0 {
		return
	}
	cfg := d.Config
	if cfg.ClaimLease <= 0 {
		cfg = DefaultConfig()
	}
	if d.IdleSleep <= 0 {
		d.IdleSleep = defaultDrainerIdleSleep
	}
	nowFn := d.Now
	if nowFn == nil {
		nowFn = time.Now
	}
	sleepFn := d.Sleep
	if sleepFn == nil {
		sleepFn = time.Sleep
	}
	idx := 0
	for {
		if ctx.Err() != nil {
			return
		}
		didWork := false
		for n := 0; n < len(d.StoreTypes); n++ {
			if ctx.Err() != nil {
				return
			}
			storeType := d.StoreTypes[idx%len(d.StoreTypes)]
			idx++
			now := nowFn()
			canFetch, err := d.Pacer.CanDrainerFetch(ctx, storeType, now, cfg.PDPMinInterval)
			if err != nil {
				log.Printf("[pdp-drainer] pacing check %s: %v", storeType, err)
				continue
			}
			if !canFetch {
				continue
			}
			leaseUntil := now.Add(cfg.ClaimLease)
			items, err := d.Pipeline.State.ClaimForStep(ctx, StepPDP, ClaimFilter{StoreType: storeType}, 1, d.Force, now, leaseUntil, cfg.PDPStaleAfter)
			if err != nil {
				log.Printf("[pdp-drainer] claim %s: %v", storeType, err)
				continue
			}
			if len(items) == 0 {
				continue
			}
			item := items[0]
			if err := d.Pacer.RecordPDPFetch(ctx, storeType, now); err != nil {
				log.Printf("[pdp-drainer] record fetch %s: %v", storeType, err)
			}
			didWork = true
			ok, runErr := d.Pipeline.RunWorkItem(ctx, StepPDP, item, d.Force, nil, cfg, d.BypassMinInterval)
			if runErr != nil {
				threshold := d.CBThreshold
				if threshold <= 0 {
					threshold = CircuitBreakerThreshold()
				}
				tripped, perr := d.Pacer.RecordPDPFailure(ctx, storeType, threshold, cfg.PDPCooldown, nowFn())
				if perr != nil {
					log.Printf("[pdp-drainer] record failure %s: %v", storeType, perr)
				}
				if tripped {
					log.Printf("[pdp-drainer] circuit breaker tripped for store %s", storeType)
					if d.OnCooldownTrip != nil {
						d.OnCooldownTrip(storeType)
					}
				}
				continue
			}
			if ok {
				if err := d.Pacer.RecordPDPSuccess(ctx, storeType); err != nil {
					log.Printf("[pdp-drainer] record success %s: %v", storeType, err)
				}
				if d.OnPDPSuccess != nil {
					d.OnPDPSuccess(storeType)
				}
			}
		}
		if !didWork {
			sleepFn(d.IdleSleep)
		}
	}
}
