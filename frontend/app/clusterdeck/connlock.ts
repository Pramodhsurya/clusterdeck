// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Connection = workspace: in a connection workspace, every block is bound to
// the workspace connection, so per-block connection switching is disabled.

import { globalStore } from "@/app/store/jotaiStore";
import { atoms } from "@/store/global";
import { atom } from "jotai";

export const ClusterdeckConnectionMetaKey = "clusterdeck:connection";

export function getWorkspaceConnection(workspace: Workspace): string {
    return (workspace?.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "";
}

// true when the active workspace is a connection workspace (per-block
// connection UI should be hidden)
export const workspaceConnLockedAtom = atom((get) => {
    return getWorkspaceConnection(get(atoms.workspace)) != "";
});

export function isConnLockedWorkspace(): boolean {
    return globalStore.get(workspaceConnLockedAtom);
}
