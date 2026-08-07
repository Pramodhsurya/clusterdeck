// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestDefaultTelemetryDisabled(t *testing.T) {
	data, err := os.ReadFile("../../pkg/wconfig/defaultconfig/settings.json")
	if err != nil {
		t.Fatalf("read default settings: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("decode default settings: %v", err)
	}
	value, ok := settings["telemetry:enabled"]
	if !ok || value != false {
		t.Fatalf("default telemetry:enabled = %#v (present=%t), want false", value, ok)
	}
}

func TestDiagnosticPingEnabled(t *testing.T) {
	tests := []struct {
		name             string
		telemetryEnabled bool
		noPingEnv        string
		want             bool
	}{
		{name: "disabled by default", telemetryEnabled: false, want: false},
		{name: "enabled is eligible", telemetryEnabled: true, want: true},
		{name: "environment override suppresses enabled telemetry", telemetryEnabled: true, noPingEnv: "1", want: false},
		{name: "environment override also suppresses disabled telemetry", telemetryEnabled: false, noPingEnv: "1", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := diagnosticPingEnabled(tc.telemetryEnabled, tc.noPingEnv); got != tc.want {
				t.Fatalf("diagnosticPingEnabled(%t, %q) = %t, want %t", tc.telemetryEnabled, tc.noPingEnv, got, tc.want)
			}
		})
	}
}
