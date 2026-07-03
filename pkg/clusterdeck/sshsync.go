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

	connWorkspaceIcon = "server"

	// ConnWorkspaceColor is the single Clusterdeck accent (blue). Do not add
	// other accent colors for connection workspaces.
	ConnWorkspaceColor = "#429DFF"
)

// SyncSshConfigWorkspaces ensures that every concrete host in the user's ssh
// config (~/.ssh/config and /etc/ssh/config; wildcard and negated patterns
// excluded) has a saved workspace: name = host, meta clusterdeck:connection =
// host. Name/icon/color are always set so the workspace persists across
// workspace switches (unsaved workspaces are deleted on switch-away).
//
// Reconciliation is add-only: workspaces whose host disappeared from the ssh
// config are left untouched so no user layout is ever destroyed.
func SyncSshConfigWorkspaces(ctx context.Context) error {
	hosts, err := conncontroller.GetConnectionsFromConfig()
	if err != nil {
		// a missing or empty ssh config is a normal state, not a startup error
		log.Printf("clusterdeck: no ssh config connections found: %v\n", err)
		return nil
	}
	workspaces, err := wstore.DBGetAllObjsByType[*waveobj.Workspace](ctx, waveobj.OType_Workspace)
	if err != nil {
		return err
	}
	existing := make(map[string]bool)
	for _, ws := range workspaces {
		conn := ws.Meta.GetString(MetaKey_WorkspaceConnection, "")
		if conn != "" {
			existing[conn] = true
		}
	}
	created := 0
	for _, host := range hosts {
		if existing[host] {
			continue
		}
		ws, err := wcore.CreateWorkspace(ctx, displayName(host), connWorkspaceIcon, ConnWorkspaceColor, false, false)
		if err != nil {
			log.Printf("clusterdeck: error creating workspace for host %q: %v\n", host, err)
			continue
		}
		if ws.Meta == nil {
			ws.Meta = waveobj.MetaMapType{}
		}
		ws.Meta[MetaKey_WorkspaceConnection] = host
		if err := wstore.DBUpdate(ctx, ws); err != nil {
			log.Printf("clusterdeck: error setting connection meta on workspace %s: %v\n", ws.OID, err)
			continue
		}
		// Seed the IDE layout (§3.4) into the workspace's initial tab. The
		// connection meta is now persisted, so the explorer/editor/terminal
		// blocks inherit it. This replaces the bare terminal CreateWorkspace
		// created before the meta existed. Blocks don't connect until mounted,
		// so no SSH connection is opened here at startup.
		tabId := ws.ActiveTabId
		if tabId == "" && len(ws.TabIds) > 0 {
			tabId = ws.TabIds[0]
		}
		if tabId != "" {
			if err := wcore.SeedClusterdeckLayoutForTab(ctx, tabId); err != nil {
				log.Printf("clusterdeck: error seeding layout for workspace %s: %v\n", ws.OID, err)
			}
		}
		created++
	}
	if created > 0 {
		log.Printf("clusterdeck: created %d connection workspace(s) from ssh config\n", created)
	}
	return nil
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
