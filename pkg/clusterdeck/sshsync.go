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
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wcore"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

const (
	// MetaKey_WorkspaceConnection marks a workspace as a Clusterdeck connection
	// workspace and records the connection it is bound to. All blocks in the
	// workspace inherit this connection.
	MetaKey_WorkspaceConnection = "clusterdeck:connection"

	// LocalConnName is Wave's local connection (resolves to the local
	// shell/filesystem via conncontroller.IsLocalConnName). The mockup lists
	// "Local · zsh" as the first connection, so the local machine is seeded as a
	// first-class connection workspace alongside ssh hosts.
	LocalConnName = "local"

	connWorkspaceIcon  = "server"
	localWorkspaceIcon = "laptop"

	// ConnWorkspaceColor is the single Clusterdeck accent (blue). Do not add
	// other accent colors for connection workspaces.
	ConnWorkspaceColor = "#429DFF"
)

// SyncSshConfigWorkspaces ensures that the local machine and every concrete
// host in the user's ssh config (~/.ssh/config and /etc/ssh/config; wildcard
// and negated patterns excluded) has a saved connection workspace: name = host,
// meta clusterdeck:connection = host, seeded with the default IDE layout.
// Name/icon/color are always set so the workspace persists across workspace
// switches (unsaved workspaces are deleted on switch-away).
//
// Reconciliation is add-only: workspaces whose host disappeared from the ssh
// config are left untouched so no user layout is ever destroyed.
func SyncSshConfigWorkspaces(ctx context.Context) error {
	workspaces, err := wstore.DBGetAllObjsByType[*waveobj.Workspace](ctx, waveobj.OType_Workspace)
	if err != nil {
		return err
	}
	existing := make(map[string]bool)
	for _, ws := range workspaces {
		if conn := ws.Meta.GetString(MetaKey_WorkspaceConnection, ""); conn != "" {
			existing[conn] = true
		}
	}
	created := 0

	// Local connection workspace (mockup: "Local · zsh"). Always ensured, even
	// when the ssh config is empty.
	if ensureConnectionWorkspace(ctx, existing, LocalConnName, "Local", localWorkspaceIcon) {
		created++
	}

	// SSH hosts from the user's ssh config. A missing/empty config is a normal
	// state, not a startup error — the local workspace above still applies.
	hosts, err := conncontroller.GetConnectionsFromConfig()
	if err != nil {
		log.Printf("clusterdeck: no ssh config connections found: %v\n", err)
	} else {
		for _, host := range hosts {
			if ensureConnectionWorkspace(ctx, existing, host, displayName(host), connWorkspaceIcon) {
				created++
			}
		}
	}

	if created > 0 {
		log.Printf("clusterdeck: created %d connection workspace(s)\n", created)
	}
	return nil
}

// ensureConnectionWorkspace creates a saved connection workspace for connName
// (if one does not already exist) and seeds it with the default IDE layout.
// Returns true if a workspace was created. Blocks in the workspace inherit
// connName; blocks don't connect until mounted, so no connection is opened here.
func ensureConnectionWorkspace(ctx context.Context, existing map[string]bool, connName, name, icon string) bool {
	if existing[connName] {
		return false
	}
	ws, err := wcore.CreateWorkspace(ctx, name, icon, ConnWorkspaceColor, false, false)
	if err != nil {
		log.Printf("clusterdeck: error creating workspace for %q: %v\n", connName, err)
		return false
	}
	if ws.Meta == nil {
		ws.Meta = waveobj.MetaMapType{}
	}
	ws.Meta[MetaKey_WorkspaceConnection] = connName
	if err := wstore.DBUpdate(ctx, ws); err != nil {
		log.Printf("clusterdeck: error setting connection meta on workspace %s: %v\n", ws.OID, err)
		return false
	}
	existing[connName] = true

	// Seed the IDE layout (§3.4) into the workspace's initial tab, replacing the
	// bare terminal CreateWorkspace created before the connection meta existed.
	tabId := ws.ActiveTabId
	if tabId == "" && len(ws.TabIds) > 0 {
		tabId = ws.TabIds[0]
	}
	if tabId != "" {
		if err := wcore.SeedClusterdeckLayoutForTab(ctx, tabId); err != nil {
			log.Printf("clusterdeck: error seeding layout for workspace %s: %v\n", ws.OID, err)
		}
	}
	return true
}

// displayName strips the user@ prefix from a normalized connection name; the
// rail shows bare hostnames while the connection meta keeps the full form.
func displayName(conn string) string {
	if idx := strings.LastIndex(conn, "@"); idx >= 0 {
		return conn[idx+1:]
	}
	return conn
}

// GoSyncSshConfigWorkspaces runs SyncSshConfigWorkspaces in a goroutine with
// panic handling, for use during server startup.
func GoSyncSshConfigWorkspaces() {
	go func() {
		defer func() {
			panichandler.PanicHandler("clusterdeck:SyncSshConfigWorkspaces", recover())
		}()
		ctx, cancelFn := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelFn()
		if err := SyncSshConfigWorkspaces(ctx); err != nil {
			log.Printf("clusterdeck: error syncing ssh config workspaces: %v\n", err)
		}
	}()
}
