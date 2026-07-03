// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package wcore

import (
	"context"
	"fmt"
	"log"

	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

// ClusterdeckConnectionMetaKey marks a workspace as a Clusterdeck connection
// workspace and records the connection all of its blocks are bound to.
// (Lives in wcore rather than pkg/clusterdeck so block creation can read it
// without an import cycle.)
const ClusterdeckConnectionMetaKey = "clusterdeck:connection"

// GetWorkspaceConnectionForTab returns the workspace-level connection for the
// workspace containing the given tab, or "" if the workspace is not a
// connection workspace (or on any lookup error — callers treat that as
// unlocked).
func GetWorkspaceConnectionForTab(ctx context.Context, tabId string) string {
	workspaceId, err := wstore.DBFindWorkspaceForTabId(ctx, tabId)
	if err != nil || workspaceId == "" {
		return ""
	}
	ws, err := wstore.DBGet[*waveobj.Workspace](ctx, workspaceId)
	if err != nil || ws == nil {
		return ""
	}
	return ws.Meta.GetString(ClusterdeckConnectionMetaKey, "")
}

// ClusterdeckZoneMetaKey tags a seeded block with its role in the IDE layout
// (§3.4). The explorer and editor blocks are tagged so explorer file-clicks
// can be routed into the designated editor block (§3.5).
const ClusterdeckZoneMetaKey = "clusterdeck:zone"

const (
	ClusterdeckZone_Explorer = "explorer"
	ClusterdeckZone_Editor   = "editor"
)

// GetClusterdeckLayout returns the default IDE layout seeded into a connection
// workspace's tab (§3.4): a narrow full-height explorer (remote directory tree)
// down the left, a file editor across the top of the main column, and a
// terminal below it. Every block inherits the workspace connection (see
// CreateBlockWithTelemetry), so explorer, editor, and terminal all target the
// same host — the "connection = workspace" model.
func GetClusterdeckLayout() PortableLayout {
	explorerSize := uint(3)
	terminalSize := uint(6)
	return PortableLayout{
		// Explorer — remote directory tree rooted at the connection's home dir.
		{IndexArr: []int{0}, Size: &explorerSize, BlockDef: &waveobj.BlockDef{
			Meta: waveobj.MetaMapType{
				waveobj.MetaKey_View:   "preview",
				waveobj.MetaKey_File:   "~",
				ClusterdeckZoneMetaKey: ClusterdeckZone_Explorer,
			},
		}},
		// Editor — designated file editor; explorer clicks open files here (§3.5).
		{IndexArr: []int{1}, BlockDef: &waveobj.BlockDef{
			Meta: waveobj.MetaMapType{
				waveobj.MetaKey_View:   "preview",
				ClusterdeckZoneMetaKey: ClusterdeckZone_Editor,
			},
		}},
		// Terminal — shell on the workspace connection; focused on open.
		{IndexArr: []int{1, 1}, Size: &terminalSize, BlockDef: &waveobj.BlockDef{
			Meta: waveobj.MetaMapType{
				waveobj.MetaKey_View:       "term",
				waveobj.MetaKey_Controller: "shell",
			},
		}, Focused: true},
	}
}

// SeedClusterdeckLayoutForTab applies the default IDE layout to the given tab.
// Used to seed a connection workspace's initial tab and to implement "reset
// layout to default". ApplyPortableLayout clears the tab first, so this is safe
// to call on an already-populated tab.
func SeedClusterdeckLayoutForTab(ctx context.Context, tabId string) error {
	return ApplyPortableLayout(ctx, tabId, GetClusterdeckLayout(), false)
}

// FindConnectionWorkspace returns the id of the connection workspace bound to
// connName, or "" if none exists.
func FindConnectionWorkspace(ctx context.Context, connName string) (string, error) {
	workspaces, err := wstore.DBGetAllObjsByType[*waveobj.Workspace](ctx, waveobj.OType_Workspace)
	if err != nil {
		return "", err
	}
	for _, ws := range workspaces {
		if ws.Meta.GetString(ClusterdeckConnectionMetaKey, "") == connName {
			return ws.OID, nil
		}
	}
	return "", nil
}

// EnsureConnectionWorkspace returns the id of the connection workspace bound to
// connName, creating and seeding it (default IDE layout) if one does not exist.
// `created` reports whether a new workspace was made. Blocks in the workspace
// inherit connName; they don't connect until mounted, so this opens no
// connection. This is the single primitive behind both startup sync and the
// rail's "add connection" action ("connection = workspace").
func EnsureConnectionWorkspace(ctx context.Context, connName, name, icon, color string) (workspaceId string, created bool, err error) {
	existingId, err := FindConnectionWorkspace(ctx, connName)
	if err != nil {
		return "", false, err
	}
	if existingId != "" {
		return existingId, false, nil
	}
	ws, err := CreateWorkspace(ctx, name, icon, color, false, false)
	if err != nil {
		return "", false, fmt.Errorf("error creating connection workspace for %q: %w", connName, err)
	}
	if ws.Meta == nil {
		ws.Meta = waveobj.MetaMapType{}
	}
	ws.Meta[ClusterdeckConnectionMetaKey] = connName
	if err := wstore.DBUpdate(ctx, ws); err != nil {
		return "", false, fmt.Errorf("error tagging connection workspace %s: %w", ws.OID, err)
	}
	tabId := ws.ActiveTabId
	if tabId == "" && len(ws.TabIds) > 0 {
		tabId = ws.TabIds[0]
	}
	if tabId != "" {
		if err := SeedClusterdeckLayoutForTab(ctx, tabId); err != nil {
			log.Printf("clusterdeck: error seeding layout for workspace %s: %v\n", ws.OID, err)
		}
	}
	return ws.OID, true, nil
}
