package db

import "testing"

func TestClampPipelineMetricsDays(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in, want int
	}{
		{0, 30},
		{-1, 30},
		{14, 14},
		{90, 90},
		{120, 90},
	}
	for _, tc := range tests {
		if got := ClampPipelineMetricsDays(tc.in); got != tc.want {
			t.Errorf("ClampPipelineMetricsDays(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
