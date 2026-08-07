// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package wcore

import "testing"

func TestNoTelemetryTransitionValue(t *testing.T) {
	if got := noTelemetryValue(true); got {
		t.Fatalf("enabling telemetry sends no-telemetry value %t, want false", got)
	}
	if got := noTelemetryValue(false); !got {
		t.Fatalf("disabling telemetry sends no-telemetry value %t, want true", got)
	}
}
