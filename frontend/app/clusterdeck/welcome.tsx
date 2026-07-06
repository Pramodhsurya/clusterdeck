// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Clusterdeck Welcome — the home/startup page (VS Code–style): a Start column
// (Open Folder / New Connection) and a Recent list (last 5 opened workspaces).

import { BlockNodeModel } from "@/app/block/blocktypes";
import {
    ClusterdeckConnectionMetaKey,
    ClusterdeckLastOpenedMetaKey,
    openFolderPicker,
    openNewConnection,
    openTargetWorkspace,
    switchToWorkspace,
} from "@/app/clusterdeck/connectionsrail";
import type { TabModel } from "@/app/store/tab-model";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { WorkspaceService } from "@/store/services";
import { fireAndForget, makeIconClass } from "@/util/util";
import * as jotai from "jotai";
import { memo, useEffect, useState } from "react";

import "./welcome.scss";

const ClusterdeckRootDirMetaKey = "clusterdeck:rootdir";

function recentSubtitle(ws: Workspace): string {
    const root = ws.meta?.[ClusterdeckRootDirMetaKey] as string;
    if (root) {
        return root;
    }
    return (ws.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "";
}

function isLocalConn(conn: string): boolean {
    return !conn || conn === "local" || conn.startsWith("local:");
}

// A Recent entry is either a live workspace, or a "ghost" — a connection whose
// workspace was deleted. Recency for ghosts lives on the connection itself
// (connections.json), which deleting a workspace never touches, so history
// survives the workspace going away.
type RecentEntry = { kind: "workspace"; ws: Workspace } | { kind: "connection"; conn: string; lastOpened: number };

function recentLastOpened(e: RecentEntry): number {
    return e.kind === "workspace" ? Number(e.ws.meta?.[ClusterdeckLastOpenedMetaKey] ?? 0) : e.lastOpened;
}

class ClusterdeckWelcomeModel implements ViewModel {
    viewType = "cdwelcome";
    blockId: string;
    nodeModel: BlockNodeModel;
    tabModel: TabModel;
    env: WaveEnv;
    viewIcon: jotai.Atom<string>;
    viewName: jotai.Atom<string>;

    constructor({ blockId, nodeModel, tabModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.tabModel = tabModel;
        this.env = waveEnv;
        this.viewIcon = jotai.atom("house");
        this.viewName = jotai.atom("Welcome");
    }

    get viewComponent(): ViewComponent {
        return ClusterdeckWelcomeView;
    }
}

const ClusterdeckWelcomeView = memo(() => {
    const [recent, setRecent] = useState<RecentEntry[]>([]);

    useEffect(() => {
        fireAndForget(async () => {
            const list = await WorkspaceService.ListWorkspaces();
            const connsWithWorkspace = new Set<string>();
            const entries: RecentEntry[] = [];
            for (const entry of list ?? []) {
                const ws = await WorkspaceService.GetWorkspace(entry.workspaceid);
                if (ws && ws.meta?.[ClusterdeckConnectionMetaKey] != null) {
                    entries.push({ kind: "workspace", ws });
                    connsWithWorkspace.add((ws.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "");
                }
            }

            // Connections opened before but with no live workspace right now
            // (its workspace was deleted) still show up, sourced from the
            // recency stamp kept on the connection itself.
            const fullConfig = await RpcApi.GetFullConfigCommand(TabRpcClient);
            for (const [conn, kw] of Object.entries(fullConfig?.connections ?? {})) {
                const lastOpened = kw?.["clusterdeck:lastopened"];
                if (lastOpened == null || isLocalConn(conn) || connsWithWorkspace.has(conn)) {
                    continue;
                }
                entries.push({ kind: "connection", conn, lastOpened });
            }

            entries.sort((a, b) => recentLastOpened(b) - recentLastOpened(a));
            setRecent(entries.slice(0, 8));
        });
    }, []);

    return (
        <div className="cd-welcome">
            <div className="cd-welcome-inner">
                <div className="cd-welcome-title">Clusterdeck</div>
                <div className="cd-welcome-subtitle">Multi-cluster SSH workspaces</div>

                <div className="cd-welcome-cols">
                    <div className="cd-welcome-col">
                        <div className="cd-welcome-heading">Start</div>
                        <div className="cd-welcome-action" onClick={() => openFolderPicker()}>
                            <i className={makeIconClass("folder-open", false)} />
                            <span>Open Folder…</span>
                        </div>
                        <div className="cd-welcome-action" onClick={() => openNewConnection()}>
                            <i className={makeIconClass("server", false)} />
                            <span>New Connection…</span>
                        </div>
                    </div>

                    <div className="cd-welcome-col">
                        <div className="cd-welcome-heading">Recent</div>
                        {recent.length === 0 ? (
                            <div className="cd-welcome-empty">
                                No recent workspaces yet.
                                <br />
                                Use <b>Open Folder…</b> or <b>New Connection…</b> to get started.
                            </div>
                        ) : (
                            recent.map((entry) =>
                                entry.kind === "workspace" ? (
                                    <div
                                        key={entry.ws.oid}
                                        className="cd-welcome-recent"
                                        onClick={() => switchToWorkspace(entry.ws.oid)}
                                        title={recentSubtitle(entry.ws)}
                                    >
                                        <i
                                            className={makeIconClass(entry.ws.icon || "folder", true)}
                                            style={{ color: entry.ws.color || undefined }}
                                        />
                                        <span className="cd-welcome-recent-name">{entry.ws.name}</span>
                                        <span className="cd-welcome-recent-path">{recentSubtitle(entry.ws)}</span>
                                    </div>
                                ) : (
                                    <div
                                        key={`conn:${entry.conn}`}
                                        className="cd-welcome-recent cd-welcome-recent-ghost"
                                        onClick={() => openTargetWorkspace(entry.conn)}
                                        title={`${entry.conn} — workspace deleted, click to reopen`}
                                    >
                                        <i className={makeIconClass("server", false)} />
                                        <span className="cd-welcome-recent-name">{entry.conn}</span>
                                        <span className="cd-welcome-recent-path">Deleted — click to reopen</span>
                                    </div>
                                )
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
ClusterdeckWelcomeView.displayName = "ClusterdeckWelcomeView";

export { ClusterdeckWelcomeModel };
