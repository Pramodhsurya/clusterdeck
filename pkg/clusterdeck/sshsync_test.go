// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package clusterdeck

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/wavebase"
	"github.com/wavetermdev/waveterm/pkg/wconfig"
)

// ClassifyTarget is the rail "+" entrypoint: parse the user's free-form input
// into (connection, rootDir, name, icon). It's pure logic — easy to cover
// with a table-driven test.
func TestClassifyTarget(t *testing.T) {
	cwd, _ := os.Getwd()
	home := mustHome(t)
	type expect struct {
		conn string
		root string
		name string
		icon string
	}
	cases := []struct {
		in  string
		exp expect
	}{
		// empty input → Home on local
		{"", expect{LocalConnName, "", "Home", LocalWorkspaceIcon}},
		{"   ", expect{LocalConnName, "", "Home", LocalWorkspaceIcon}},
		// leading-slash absolute path → local folder, basename name
		{"/etc", expect{LocalConnName, "/etc", "etc", LocalWorkspaceIcon}},
		{"~/.ssh", expect{LocalConnName, filepath.Join(home, ".ssh"), ".ssh", LocalWorkspaceIcon}},
		{".", expect{LocalConnName, cwd, filepath.Base(cwd), LocalWorkspaceIcon}},
		{"./foo", expect{LocalConnName, filepath.Join(cwd, "foo"), "foo", LocalWorkspaceIcon}},
		{"../foo", expect{LocalConnName, filepath.Join(filepath.Dir(cwd), "foo"), "foo", LocalWorkspaceIcon}},
		// a bare token that resolves to a real local directory is a folder
		{cwd, expect{LocalConnName, cwd, filepath.Base(cwd), LocalWorkspaceIcon}},
		// remote connection (user@host) → connection name, no root
		{"user@example.com", expect{"user@example.com", "", "example.com", ConnWorkspaceIcon}},
		{"dev@spark-prod-01", expect{"dev@spark-prod-01", "", "spark-prod-01", ConnWorkspaceIcon}},
		// bare hostname → treated as a remote connection
		{"prod-host", expect{"prod-host", "", "prod-host", ConnWorkspaceIcon}},
		// leading-tilde alone → expanded to home; the rail label is the
		// home folder's basename (so the empty-input case's "Home" name
		// is reserved for the truly-empty input — both root to "~" once
		// the layout applies them anyway, so they're equivalent on disk).
		{"~", expect{LocalConnName, home, filepath.Base(home), LocalWorkspaceIcon}},
	}
	for _, c := range cases {
		conn, root, name, icon := ClassifyTarget(c.in)
		if conn != c.exp.conn {
			t.Errorf("ClassifyTarget(%q) conn = %q, want %q", c.in, conn, c.exp.conn)
			continue
		}
		if root != c.exp.root {
			t.Errorf("ClassifyTarget(%q) root = %q, want %q", c.in, root, c.exp.root)
			continue
		}
		if name != c.exp.name {
			t.Errorf("ClassifyTarget(%q) name = %q, want %q", c.in, name, c.exp.name)
		}
		if icon != c.exp.icon {
			t.Errorf("ClassifyTarget(%q) icon = %q, want %q", c.in, icon, c.exp.icon)
		}
	}
}

func TestDisplayName(t *testing.T) {
	cases := map[string]string{
		"user@example.com":     "example.com",
		"dev@spark-prod-01":    "spark-prod-01",
		"prod-host":             "prod-host",
		"":                      "",
		"a@b@c":                 "c", // last @ wins
	}
	for in, want := range cases {
		got := DisplayName(in)
		if got != want {
			t.Errorf("DisplayName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLooksLikeLocalPath(t *testing.T) {
	cwd, _ := os.Getwd()
	cases := []struct {
		in  string
		exp bool
	}{
		{"/etc", true},
		{"~/.ssh", true},
		{".", true},
		{"./foo", true},
		{"../foo", true},
		{cwd, true},
		{"user@example.com", false},
		{"prod-host", false},
		{"PROD-HOST", false},
		{"", false},
		{"   /foo", false}, // leading whitespace breaks the prefix match — intentional
	}
	for _, c := range cases {
		if got := looksLikeLocalPath(c.in); got != c.exp {
			t.Errorf("looksLikeLocalPath(%q) = %v, want %v", c.in, got, c.exp)
		}
	}
}

// cleanLocalPath normalizes ~/ and leading-tilde paths to absolute paths so
// the same folder always maps to the same workspace.
func TestCleanLocalPath(t *testing.T) {
	home := mustHome(t)
	cases := map[string]string{
		"~":         home,
		"~/foo":     filepath.Join(home, "foo"),
		"/abs/path": "/abs/path",
		"./rel":     filepath.Join(mustGetwd(t), "rel"),
		"foo/":      filepath.Join(mustGetwd(t), "foo"), // trailing slash trimmed
	}
	for in, want := range cases {
		got := cleanLocalPath(in)
		if got != want {
			t.Errorf("cleanLocalPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFolderName(t *testing.T) {
	cases := map[string]string{
		"":                  "Home",
		"~":                 "Home",
		"/":                 "/",        // can't strip — keep as-is
		"/Users/me/work":    "work",
		"/Users/me/work/":   "work",
		"/etc/ssh":          "ssh",
		".":                 ".",
	}
	for in, want := range cases {
		got := folderName(in)
		if got != want {
			t.Errorf("folderName(%q) = %q, want %q", in, got, want)
		}
	}
}

// EnsureConnectionsConfigPath must return a path that exists (the function
// creates the config dir + file on demand) and live under the user's
// WaveConfigDir.
func TestEnsureConnectionsConfigPath(t *testing.T) {
	// CacheAndRemoveEnvVars requires both CONFIG and DATA homes to be set
	// (the DATA path is read but unused by EnsureConnectionsConfigPath);
	// without it set, the cached config dir is "" and the underlying
	// MkdirAll fails with an empty path. Set up temp dirs for both.
	tmp := t.TempDir()
	t.Setenv("WAVETERM_CONFIG_HOME", tmp)
	t.Setenv("WAVETERM_DATA_HOME", tmp)
	if err := wavebase.CacheAndRemoveEnvVars(); err != nil {
		t.Fatalf("CacheAndRemoveEnvVars: %v", err)
	}
	p, err := EnsureConnectionsConfigPath()
	if err != nil {
		t.Fatalf("EnsureConnectionsConfigPath: %v", err)
	}
	if p == "" {
		t.Fatal("got empty path")
	}
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("expected path to exist after call, got: %v", err)
	}
	if !strings.HasSuffix(p, wconfig.ConnectionsFile) {
		t.Errorf("path %q should end with %q", p, wconfig.ConnectionsFile)
	}
}

func mustHome(t *testing.T) string {
	h, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("os.UserHomeDir: %v", err)
	}
	return h
}

func mustGetwd(t *testing.T) string {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("os.Getwd: %v", err)
	}
	return cwd
}
