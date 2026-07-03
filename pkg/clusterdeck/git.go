// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package clusterdeck

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wavetermdev/waveterm/pkg/remote/conncontroller"
)

// GitStatus returns a map of absolute file path -> "modified" | "added" for the
// git repo containing rootDir on the given connection (change #6 G#). Local
// connections only for now; remote returns empty (best-effort, no decorations).
func GitStatus(ctx context.Context, connName, rootDir string) (map[string]string, error) {
	result := map[string]string{}
	if !conncontroller.IsLocalConnName(connName) {
		return result, nil
	}
	dir := expandDir(rootDir)
	topOut, err := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return result, nil // not a git repo
	}
	repoRoot := strings.TrimSpace(string(topOut))
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "status", "--porcelain").Output()
	if err != nil {
		return result, nil
	}
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 4 {
			continue
		}
		xy := line[:2]
		path := strings.TrimSpace(line[3:])
		if idx := strings.Index(path, " -> "); idx >= 0 { // rename: keep the new name
			path = strings.TrimSpace(path[idx+4:])
		}
		path = strings.Trim(path, "\"")
		abs := filepath.Join(repoRoot, path)
		if xy == "??" || strings.Contains(xy, "A") {
			result[abs] = "added"
		} else {
			result[abs] = "modified"
		}
	}
	return result, nil
}

func expandDir(p string) string {
	if p == "~" {
		if home, err := os.UserHomeDir(); err == nil {
			return home
		}
	} else if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[2:])
		}
	}
	return p
}
