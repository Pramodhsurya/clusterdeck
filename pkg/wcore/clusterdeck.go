// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package wcore

import (
	"context"

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
