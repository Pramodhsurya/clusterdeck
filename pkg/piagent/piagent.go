// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Package piagent manages the user's pi installation. Clusterdeck ships with
// pi as the recommended coding agent — the widget-rail button guarantees it's
// installed and up to date before opening a pi terminal.
//
// The install is just `npm install -g <package>`; the package name is the
// single source of truth here so a future rename only touches one constant.
package piagent

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// PiPackageName is the npm package that provides the `pi` binary.
const PiPackageName = "@earendil-works/pi-coding-agent"

// npmPath is the npm binary we shell out to. We resolve once at init so the
// subsequent GetStatus/Install/Update calls don't repeat the PATH lookup.
var npmPath = "npm"

// Status reports whether pi is installed and, if so, whether an update is
// available. CurrentVersion is empty when Installed is false. LatestVersion
// can be empty if the registry query failed (network down) — in that case
// UpdateAvailable is false and the caller should treat the install as
// up-to-date for "auto-update on open" purposes.
type Status struct {
	Installed       bool   `json:"installed"`
	CurrentVersion  string `json:"currentversion,omitempty"`
	LatestVersion   string `json:"latestversion,omitempty"`
	UpdateAvailable bool   `json:"updateavailable"`
}

// cmdTimeout is generous because `npm install -g` against a cold cache can
// easily take 30-60s; we don't want to kill a real install. GetStatus gets
// a shorter budget because it's called on every widget-rail click.
const (
	installTimeout = 3 * time.Minute
	statusTimeout  = 10 * time.Second
)

// versionRegexp pulls a semver-looking token out of `pi --version` output.
// pi currently prints `0.83.0` on its own line; the regex tolerates a
// leading `v` and any trailing junk so we don't break on a release that
// switches to `v0.84.0 (built ...)` style banners.
var versionRegexp = regexp.MustCompile(`v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)`)

// GetStatus returns whether pi is installed and the latest version. The
// function never returns an error for "pi not installed" — that's encoded
// in Status.Installed == false. An error means the npm registry query
// itself failed, in which case LatestVersion is empty and callers can
// fall back to "assume up-to-date".
func GetStatus(ctx context.Context) (Status, error) {
	sctx, cancel := context.WithTimeout(ctx, statusTimeout)
	defer cancel()

	st := Status{}

	// Step 1: figure out if pi is installed and at what version.
	// `pi --version` exits non-zero if the binary isn't on PATH, which is
	// the cleanest signal. We also try `npm ls -g <pkg>` as a fallback
	// because some npm installs (Homebrew on Apple Silicon) symlink pi
	// into /opt/homebrew/bin without putting node_modules/.bin on PATH.
	if cur, err := currentVersion(sctx); err == nil {
		st.Installed = true
		st.CurrentVersion = cur
	}

	// Step 2: ask the registry for the latest version.
	if latest, err := latestVersion(sctx); err == nil {
		st.LatestVersion = latest
		if st.Installed {
			st.UpdateAvailable = compareVersions(st.CurrentVersion, latest) < 0
		}
	}

	return st, nil
}

// Install runs `npm install -g <pkg>` and returns any error.
func Install(ctx context.Context) error {
	ictx, cancel := context.WithTimeout(ctx, installTimeout)
	defer cancel()

	if err := resolveNpm(ictx); err != nil {
		return err
	}

	out, err := runNpm(ictx, "install", "-g", PiPackageName)
	if err != nil {
		return fmt.Errorf("pi-agent: install failed: %w\n%s", err, out)
	}
	return nil
}

// Uninstall removes the package globally. Used by the settings panel.
func Uninstall(ctx context.Context) error {
	uctx, cancel := context.WithTimeout(ctx, installTimeout)
	defer cancel()

	if err := resolveNpm(uctx); err != nil {
		return err
	}

	out, err := runNpm(uctx, "uninstall", "-g", PiPackageName)
	if err != nil {
		return fmt.Errorf("pi-agent: uninstall failed: %w\n%s", err, out)
	}
	return nil
}

// Update is install@latest — npm treats `install -g <pkg>@latest` as an
// idempotent upgrade.
func Update(ctx context.Context) error {
	uctx, cancel := context.WithTimeout(ctx, installTimeout)
	defer cancel()

	if err := resolveNpm(uctx); err != nil {
		return err
	}

	out, err := runNpm(uctx, "install", "-g", PiPackageName+"@latest")
	if err != nil {
		return fmt.Errorf("pi-agent: update failed: %w\n%s", err, out)
	}
	return nil
}

// resolveNpm looks up npm on PATH and updates the package-level npmPath.
// Returns an error if npm isn't found — that error gets surfaced to the
// user as a clear "you need Node.js installed" message.
func resolveNpm(ctx context.Context) error {
	resolved, err := exec.LookPath("npm")
	if err != nil {
		return fmt.Errorf("pi-agent: npm not found on PATH (install Node.js first): %w", err)
	}
	npmPath = resolved
	return nil
}

// currentVersion tries two ways to discover pi's installed version:
//   1. `pi --version` — the canonical path, requires pi on PATH.
//   2. `npm ls -g <pkg> --json` — works even when only the symlink target
//      is on PATH (e.g. Homebrew).
func currentVersion(ctx context.Context) (string, error) {
	if v, err := runAndParseVersion(ctx, "pi", "--version"); err == nil {
		return v, nil
	}
	out, err := runNpm(ctx, "ls", "-g", PiPackageName, "--json", "--depth=0")
	if err != nil {
		return "", err
	}
	return parseNpmVersion(string(out), PiPackageName)
}

// latestVersion runs `npm view <pkg> version`. Returns "" with no error
// if the registry query failed — callers treat that as "don't know".
func latestVersion(ctx context.Context) (string, error) {
	return runAndParseVersion(ctx, "npm", "view", PiPackageName, "version")
}

// runAndParseVersion runs a command and pulls the first semver-looking
// token out of its combined stdout+stderr.
func runAndParseVersion(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", err
	}
	m := versionRegexp.FindStringSubmatch(string(out))
	if len(m) < 2 {
		return "", fmt.Errorf("no version in output: %q", strings.TrimSpace(string(out)))
	}
	return m[1], nil
}

// runNpm runs npm with the given args, returning the combined output and
// any non-zero exit error.
func runNpm(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, npmPath, args...)
	cmd.Env = append(cmd.Environ(), "LC_ALL=C", "LANG=C")
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

// parseNpmVersion pulls a string value out of `npm ls -g --json` for the
// given package. We don't pull in encoding/json to keep this file
// dependency-free.
func parseNpmVersion(jsonStr, pkgName string) (string, error) {
	lines := strings.Split(jsonStr, "\n")
	for i, line := range lines {
		if !strings.Contains(line, pkgName) {
			continue
		}
		for j := i + 1; j < i+8 && j < len(lines); j++ {
			if v := extractJSONStringValue(lines[j], "version"); v != "" {
				return v, nil
			}
		}
	}
	return "", fmt.Errorf("package %s not found in npm ls output", pkgName)
}

// extractJSONStringValue pulls a string value out of a line shaped like
// `"key": "value"`. Tolerates whitespace around the colon because npm's
// pretty-printed JSON sometimes inserts spaces. Returns "" if the line
// doesn't match.
func extractJSONStringValue(line, key string) string {
	pattern := `"` + regexp.QuoteMeta(key) + `"\s*:\s*"([^"]*)"`
	re := regexp.MustCompile(pattern)
	m := re.FindStringSubmatch(line)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

// compareVersions does a three-part numeric compare on semver-ish strings.
// Non-numeric pre-release/build suffixes (-rc1, +build) are ignored.
func compareVersions(a, b string) int {
	as := strings.SplitN(stripBuild(a), ".", 3)
	bs := strings.SplitN(stripBuild(b), ".", 3)
	for i := 0; i < 3; i++ {
		ai, _ := atoiOrZero(nthOr(as, i, "0"))
		bi, _ := atoiOrZero(nthOr(bs, i, "0"))
		if ai != bi {
			if ai < bi {
				return -1
			}
			return 1
		}
	}
	return 0
}

func stripBuild(v string) string {
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		return v[:i]
	}
	return v
}

func nthOr(parts []string, i int, fallback string) string {
	if i < len(parts) {
		return parts[i]
	}
	return fallback
}

func atoiOrZero(s string) (int, bool) {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	if s == "" {
		return 0, false
	}
	return n, true
}