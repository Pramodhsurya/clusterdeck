// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Package clusterdeck holds Clusterdeck's additions on top of Wave Terminal.
// Keeping them in their own package minimizes the merge surface against
// upstream Wave.
package clusterdeck

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wavebase"
	"github.com/wavetermdev/waveterm/pkg/wconfig"
)

const (
	// MetaKey_WorkspaceConnection marks a workspace as a Clusterdeck connection
	// workspace. (Same value as wcore.ClusterdeckConnectionMetaKey.)
	MetaKey_WorkspaceConnection = "clusterdeck:connection"

	// LocalConnName is Wave's local connection (resolves to the local
	// shell/filesystem via conncontroller.IsLocalConnName).
	LocalConnName = "local"

	ConnWorkspaceIcon  = "server"
	LocalWorkspaceIcon = "folder"

	// ConnWorkspaceColor is the single Clusterdeck accent (blue). Do not add
	// other accent colors for connection workspaces.
	ConnWorkspaceColor = "#429DFF"
)

// ClassifyTarget interprets a free-form "+" input as either a local folder or a
// remote connection, returning the connection name, root folder, rail label,
// and rail icon.
//
// Rules: an explicit path (leading /, ~, ./, ../, ".", or an existing local
// directory) is a folder on the "local" connection, rooted there. Anything else
// (user@host, a bare hostname, a Wave connection string) is a remote connection
// rooted at its home. A connection can back many workspaces at different roots.
func ClassifyTarget(target string) (connName, rootDir, name, icon string) {
	t := strings.TrimSpace(target)
	if t == "" {
		return LocalConnName, "", "Home", LocalWorkspaceIcon
	}
	if looksLikeLocalPath(t) {
		root := cleanLocalPath(t)
		return LocalConnName, root, folderName(root), LocalWorkspaceIcon
	}
	return t, "", DisplayName(t), ConnWorkspaceIcon
}

func looksLikeLocalPath(t string) bool {
	if t == "." || strings.HasPrefix(t, "/") || strings.HasPrefix(t, "~") ||
		strings.HasPrefix(t, "./") || strings.HasPrefix(t, "../") {
		return true
	}
	// a bare token that resolves to an existing local directory is a folder
	if fi, err := os.Stat(t); err == nil && fi.IsDir() {
		return true
	}
	return false
}

// cleanLocalPath normalizes a folder path to an absolute path so the same
// folder always maps to the same workspace (~/X and /Users/you/X dedupe).
func cleanLocalPath(t string) string {
	expanded := t
	if t == "~" {
		if home, err := os.UserHomeDir(); err == nil {
			expanded = home
		}
	} else if strings.HasPrefix(t, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			expanded = filepath.Join(home, t[2:])
		}
	}
	if abs, err := filepath.Abs(expanded); err == nil {
		return abs
	}
	return strings.TrimRight(expanded, "/")
}

// folderName is the rail label for a folder root (its basename).
func folderName(root string) string {
	if root == "" || root == "~" {
		return "Home"
	}
	base := filepath.Base(strings.TrimRight(root, "/"))
	if base == "" || base == "." || base == "/" {
		return root
	}
	return base
}

// DisplayName strips the user@ prefix from a normalized connection name; the
// rail shows bare hostnames while the connection meta keeps the full form.
func DisplayName(conn string) string {
	if idx := strings.LastIndex(conn, "@"); idx >= 0 {
		return conn[idx+1:]
	}
	return conn
}

// EnsureConnectionRegistered adds connName to connections.json if it is not
// already there, so a connection added via the rail "+" shows up in the
// connections list (the rail is driven by connections.json).
func EnsureConnectionRegistered(connName string) error {
	config := wconfig.GetWatcher().GetFullConfig()
	if _, ok := config.Connections[connName]; ok {
		return nil
	}
	return wconfig.SetConnectionsConfigValue(connName, waveobj.MetaMapType{})
}

// EnsureConnectionsConfigPath returns the absolute path to connections.json,
// creating an empty file (and the config dir) if it does not exist yet, so the
// rail's gear can always open something editable.
func EnsureConnectionsConfigPath() (string, error) {
	dir := wavebase.GetWaveConfigDir()
	path := filepath.Join(dir, wconfig.ConnectionsFile)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
		if err := os.WriteFile(path, []byte("{}\n"), 0o644); err != nil {
			return "", err
		}
	}
	return path, nil
}
