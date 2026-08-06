// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"strings"
	"testing"
)

func TestValidateBlocksViewFilter(t *testing.T) {
	for _, filter := range []string{
		"", "term", "terminal", "shell", "console",
		"web", "browser", "url", "preview", "edit",
		"sysinfo", "sys", "system", " TERM ",
	} {
		if err := validateBlocksViewFilter(filter); err != nil {
			t.Errorf("expected filter %q to be accepted: %v", filter, err)
		}
	}

	for _, filter := range []string{"ai", "wave" + "ai", "assistant", "custom"} {
		err := validateBlocksViewFilter(filter)
		if err == nil {
			t.Errorf("expected filter %q to be rejected", filter)
			continue
		}
		if !strings.Contains(err.Error(), "supported values:") || !strings.Contains(err.Error(), "term/terminal") {
			t.Errorf("expected actionable error for %q, got: %v", filter, err)
		}
	}
}

func TestMatchesViewTypeRetainedAliases(t *testing.T) {
	tests := []struct {
		actual string
		filter string
		match  bool
	}{
		{actual: "term", filter: "terminal", match: true},
		{actual: "term", filter: "console", match: true},
		{actual: "web", filter: "browser", match: true},
		{actual: "preview", filter: "edit", match: true},
		{actual: "edit", filter: "preview", match: true},
		{actual: "sysinfo", filter: "system", match: true},
		{actual: "web", filter: "term", match: false},
	}
	for _, test := range tests {
		if got := matchesViewType(test.actual, test.filter); got != test.match {
			t.Errorf("matchesViewType(%q, %q) = %v, want %v", test.actual, test.filter, got, test.match)
		}
	}
}
