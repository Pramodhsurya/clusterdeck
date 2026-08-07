// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"errors"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/telemetry/telemetrydata"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

func TestApplyTelemetryConsentPurgesBeforeEnabling(t *testing.T) {
	telemetryRecordingEnabled.Store(true)
	t.Cleanup(func() { telemetryRecordingEnabled.Store(false) })

	purged := false
	err := applyTelemetryConsent(true, func() error {
		purged = true
		if IsTelemetryRecordingEnabled() {
			t.Fatal("recording must be closed while the pre-consent queue is purged")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("apply consent: %v", err)
	}
	if !purged || !IsTelemetryRecordingEnabled() {
		t.Fatalf("purged=%t recording=%t, want both true", purged, IsTelemetryRecordingEnabled())
	}
}

func TestApplyTelemetryConsentDisabledAndPurgeFailureStayClosed(t *testing.T) {
	telemetryRecordingEnabled.Store(true)
	t.Cleanup(func() { telemetryRecordingEnabled.Store(false) })

	if err := applyTelemetryConsent(false, func() error { return nil }); err != nil {
		t.Fatalf("disable consent: %v", err)
	}
	if IsTelemetryRecordingEnabled() {
		t.Fatal("disabled consent must leave recording closed")
	}

	wantErr := errors.New("purge failed")
	if err := applyTelemetryConsent(true, func() error { return wantErr }); !errors.Is(err, wantErr) {
		t.Fatalf("apply consent error = %v, want %v", err, wantErr)
	}
	if IsTelemetryRecordingEnabled() {
		t.Fatal("a failed pre-consent purge must leave recording closed")
	}
}

func TestDisabledTelemetryDoesNotRecordEventsOrActivity(t *testing.T) {
	telemetryRecordingEnabled.Store(false)
	tevent := &telemetrydata.TEvent{Event: "test:disabled"}
	if err := RecordTEvent(context.Background(), tevent); err != nil {
		t.Fatalf("disabled RecordTEvent: %v", err)
	}
	if tevent.Uuid != "" || tevent.Ts != 0 || tevent.TsLocal != "" {
		t.Fatalf("disabled event was prepared for upload: %#v", tevent)
	}
	if err := UpdateActivity(context.Background(), wshrpc.ActivityUpdate{ActiveMinutes: 1}); err != nil {
		t.Fatalf("legacy activity no-op: %v", err)
	}
}
