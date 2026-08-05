// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package piagent

import "testing"

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"0.83.0", "0.83.0", 0},
		{"0.83.0", "0.84.0", -1},
		{"0.84.0", "0.83.0", 1},
		{"1.0.0", "0.99.99", 1},
		{"0.83.0", "1.0.0", -1},
		// Pre-release tags are stripped before compare, so 0.84.0-rc1 == 0.84.0
		// from this function's perspective. That's intentional — npm treats
		// "latest" as a stable tag, and a -rc1 shouldn't trigger an upgrade
		// prompt.
		{"0.84.0-rc1", "0.84.0", 0},
		{"0.84.0+build.1", "0.84.0", 0},
		// Two-part version strings still work (npm tolerates these).
		{"0.83", "0.84", -1},
		// Missing patch is treated as 0.
		{"0.83.0", "0.83", 0},
	}
	for _, c := range cases {
		if got := compareVersions(c.a, c.b); got != c.want {
			t.Errorf("compareVersions(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestExtractJSONStringValue(t *testing.T) {
	cases := []struct {
		line string
		want string
	}{
		{`"version": "0.83.0",`, "0.83.0"},
		{`"versions": ["0.83.0", "0.84.0"],`, ""}, // must not match versions
		{`"name": "@earendil-works/pi-coding-agent",`, ""}, // wrong key
		{`  "version"  :   "1.2.3"  `, "1.2.3"},
		{``, ""},
	}
	for _, c := range cases {
		if got := extractJSONStringValue(c.line, "version"); got != c.want {
			t.Errorf("extractJSONStringValue(%q) = %q, want %q", c.line, got, c.want)
		}
	}
}