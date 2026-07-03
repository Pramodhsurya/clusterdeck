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
    switchToWorkspace,
} from "@/app/clusterdeck/connectionsrail";
import type { TabModel } from "@/app/store/tab-model";
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
    const [recent, setRecent] = useState<Workspace[]>([]);

    useEffect(() => {
        fireAndForget(async () => {
            const list = await WorkspaceService.ListWorkspaces();
            const wss: Workspace[] = [];
            for (const entry of list ?? []) {
                const ws = await WorkspaceService.GetWorkspace(entry.workspaceid);
                if (ws && ws.meta?.[ClusterdeckConnectionMetaKey] != null) {
                    wss.push(ws);
                }
            }
            wss.sort(
                (a, b) =>
                    Number(b.meta?.[ClusterdeckLastOpenedMetaKey] ?? 0) -
                    Number(a.meta?.[ClusterdeckLastOpenedMetaKey] ?? 0)
            );
            setRecent(wss.slice(0, 5));
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
                            <div className="cd-welcome-empty">No recent workspaces yet.</div>
                        ) : (
                            recent.map((ws) => (
                                <div
                                    key={ws.oid}
                                    className="cd-welcome-recent"
                                    onClick={() => switchToWorkspace(ws.oid)}
                                    title={recentSubtitle(ws)}
                                >
                                    <i
                                        className={makeIconClass(ws.icon || "folder", true)}
                                        style={{ color: ws.color || undefined }}
                                    />
                                    <span className="cd-welcome-recent-name">{ws.name}</span>
                                    <span className="cd-welcome-recent-path">{recentSubtitle(ws)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
ClusterdeckWelcomeView.displayName = "ClusterdeckWelcomeView";

export { ClusterdeckWelcomeModel };
