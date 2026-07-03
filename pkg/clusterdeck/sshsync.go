// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Package clusterdeck holds Clusterdeck's additions on top of Wave Terminal.
// Keeping them in their own package minimizes the merge surface against
// upstream Wave.
package clusterdeck

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/wavetermdev/waveterm/pkg/panichandler"
	"github.com/wavetermdev/waveterm/pkg/remote/conncontroller"
	"github.com/wavetermdev/waveterm/pkg/wcore"
)

const (
	// MetaKey_WorkspaceConnection marks a workspace as a Clusterdeck connection
	// workspace and records the connection it is bound to. All blocks in the
	// workspace inherit this connection. (Same value as
	// wcore.ClusterdeckConnectionMetaKey.)
	MetaKey_WorkspaceConnection = "clusterdeck:connection"

	// LocalConnName is Wave's local connection (resolves to the local
	// shell/filesystem via conncontroller.IsLocalConnName). The mockup lists
	// "Local · zsh" as the first connection, so the local machine is a
	// first-class connection workspace alongside remote hosts.
	LocalConnName = "local"

	ConnWorkspaceIcon  = "server"
	LocalWorkspaceIcon = "laptop"

	// ConnWorkspaceColor is the single Clusterdeck accent (blue). Do not add
	// other accent colors for connection workspaces.
	ConnWorkspaceColor = "#429DFF"
)

// SyncConnectionWorkspaces ensures every connection Wave knows about — the local
// machine, plus every saved/internal connection and concrete ssh-config host —
// has a saved connection workspace seeded with the default IDE layout
// (connection = workspace). Reconciliation is add-only: workspaces for
// connections that disappear are left untouched so no user layout is destroyed.
func SyncConnectionWorkspaces(ctx context.Context) error {
	created := 0

	// Local machine first (mockup: "Local · zsh").
	if _, made, err := wcore.EnsureConnectionWorkspace(ctx, LocalConnName, "Local", LocalWorkspaceIcon, ConnWorkspaceColor); err != nil {
		log.Printf("clusterdeck: error ensuring local workspace: %v\n", err)
	} else if made {
		created++
	}

	// Every connection Wave knows (active + saved-internal + ssh config).
	conns, err := conncontroller.GetConnectionsList()
	if err != nil {
		// a missing/empty ssh config is normal; the local workspace still applies
		log.Printf("clusterdeck: no additional connections found: %v\n", err)
	} else {
		for _, conn := range conns {
			if conncontroller.IsLocalConnName(conn) {
				continue // already handled as the Local workspace
			}
			if _, made, err := wcore.EnsureConnectionWorkspace(ctx, conn, DisplayName(conn), ConnWorkspaceIcon, ConnWorkspaceColor); err != nil {
				log.Printf("clusterdeck: error ensuring workspace for %q: %v\n", conn, err)
			} else if made {
				created++
			}
		}
	}

	if created > 0 {
		log.Printf("clusterdeck: created %d connection workspace(s)\n", created)
	}
	return nil
}

// DisplayName strips the user@ prefix from a normalized connection name; the
// rail shows bare hostnames while the connection meta keeps the full form.
func DisplayName(conn string) string {
	if idx := strings.LastIndex(conn, "@"); idx >= 0 {
		return conn[idx+1:]
	}
	return conn
}

// WorkspaceIconForConn returns the rail icon for a connection: a laptop for the
// local machine, a server for remote hosts.
func WorkspaceIconForConn(conn string) string {
	if conncontroller.IsLocalConnName(conn) {
		return LocalWorkspaceIcon
	}
	return ConnWorkspaceIcon
}

// WorkspaceNameForConn returns the rail label for a connection.
func WorkspaceNameForConn(conn string) string {
	if conncontroller.IsLocalConnName(conn) {
		return "Local"
	}
	return DisplayName(conn)
}

// GoSyncConnectionWorkspaces runs SyncConnectionWorkspaces in a goroutine with
// panic handling, for use during server startup.
func GoSyncConnectionWorkspaces() {
	go func() {
		defer func() {
			panichandler.PanicHandler("clusterdeck:SyncConnectionWorkspaces", recover())
		}()
		ctx, cancelFn := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelFn()
		if err := SyncConnectionWorkspaces(ctx); err != nil {
			log.Printf("clusterdeck: error syncing connection workspaces: %v\n", err)
		}
	}()
}
