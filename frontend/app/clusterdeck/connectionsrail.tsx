// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// SHELL CONNECTIONS rail — the workspace switcher reshaped as a full-height,
// collapsible left rail. Connection = workspace: clicking a row switches the
// whole window to that connection's workspace.

import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { atoms, getApi, getConnStatusAtom, WOS } from "@/store/global";
import { WorkspaceService } from "@/store/services";
import { waveEventSubscribeSingle } from "@/store/wps";
import { isMacOS } from "@/util/platformutil";
import { fireAndForget, makeIconClass } from "@/util/util";
import clsx from "clsx";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { memo, useCallback, useEffect } from "react";
import "./connectionsrail.scss";

export const ClusterdeckConnectionMetaKey = "clusterdeck:connection";

type RailEntry = {
    windowId: string;
    workspace: Workspace;
};

const railEntriesAtom = atom<RailEntry[]>([]);
const railCollapsedAtom = atomWithStorage<boolean>("clusterdeck:railcollapsed", false);

// number of terminal blocks in the current tab (subline for the active row)
const activeTermCountAtom = atom((get) => {
    const tabId = get(atoms.staticTabId);
    if (!tabId) {
        return 0;
    }
    const tab = get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
    if (!tab?.blockids) {
        return 0;
    }
    let count = 0;
    for (const blockId of tab.blockids) {
        const block = get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)));
        if (block?.meta?.view == "term") {
            count++;
        }
    }
    return count;
});

const connectedCountAtom = atom((get) => {
    let count = 0;
    for (const entry of get(railEntriesAtom)) {
        const conn = entry.workspace?.meta?.[ClusterdeckConnectionMetaKey] as string;
        if (conn && get(getConnStatusAtom(conn))?.connected) {
            count++;
        }
    }
    return count;
});

function getWorkspaceConnection(workspace: Workspace): string {
    return (workspace?.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "";
}

function railDisplayName(conn: string): string {
    const at = conn.lastIndexOf("@");
    return at >= 0 ? conn.slice(at + 1) : conn;
}

function isLocalConn(conn: string): boolean {
    return conn === "" || conn === "local" || conn.startsWith("local:");
}

// Open the connection's workspace (create + seed the IDE layout if missing),
// then switch the window to it. Connection = workspace.
function openConnectionWorkspace(conn: string) {
    fireAndForget(async () => {
        const workspaceId = await RpcApi.ClusterdeckEnsureConnWorkspaceCommand(TabRpcClient, conn);
        if (workspaceId) {
            getApi().switchWorkspace(workspaceId);
        }
    });
}

// Rail "+" — pick any connection (Local, or a saved/ssh host) and open its
// connection workspace. Selecting an existing one just switches to it.
async function openAddConnectionMenu(e: React.MouseEvent) {
    let conns: string[] = [];
    try {
        conns = (await RpcApi.ConnListCommand(TabRpcClient)) ?? [];
    } catch (err) {
        console.error("clusterdeck: failed to list connections", err);
    }
    const seen = new Set<string>();
    const remotes = conns.filter((c) => {
        if (isLocalConn(c) || seen.has(c)) {
            return false;
        }
        seen.add(c);
        return true;
    });
    const menu: ContextMenuItem[] = [{ label: "Local", click: () => openConnectionWorkspace("local") }];
    if (remotes.length > 0) {
        menu.push({ type: "separator" });
        for (const conn of remotes) {
            menu.push({ label: railDisplayName(conn), click: () => openConnectionWorkspace(conn) });
        }
    }
    ContextMenuModel.getInstance().showContextMenu(menu, e);
}

function hotkeyLabel(num: number): string {
    return isMacOS() ? `⌘${num}` : `Alt+${num}`;
}

const RailItem = memo(({ entry, hotkeyNum }: { entry: RailEntry; hotkeyNum: number }) => {
    const activeWorkspace = useAtomValue(atoms.workspace);
    const workspace = entry.workspace;
    const collapsed = useAtomValue(railCollapsedAtom);
    const conn = getWorkspaceConnection(workspace);
    const connStatus = useAtomValue(getConnStatusAtom(conn));
    const termCount = useAtomValue(activeTermCountAtom);

    const isActive = activeWorkspace?.oid === workspace.oid;
    const isConnected = conn != "" && !!connStatus?.connected;

    // local (non-connection) workspaces render as a laptop; never show Wave branding
    let iconName = conn ? "server" : "laptop";
    if (workspace.icon && workspace.icon != "custom@wave-logo-solid") {
        iconName = workspace.icon;
    }

    const onClick = useCallback(() => {
        if (globalStore.get(atoms.workspace)?.oid !== workspace.oid) {
            getApi().switchWorkspace(workspace.oid);
        }
    }, [workspace.oid]);

    const title = conn ? `${workspace.name} (${conn})` : workspace.name;

    return (
        <div className={clsx("rail-item", { active: isActive })} onClick={onClick} title={title}>
            <div className="rail-item-row">
                <span className={clsx("status-dot", { connected: isConnected })} />
                <i className={makeIconClass(iconName, true)} />
                {!collapsed && (
                    <>
                        <span className="label">{workspace.name}</span>
                        {hotkeyNum != null && <span className="hotkey">{hotkeyLabel(hotkeyNum)}</span>}
                    </>
                )}
            </div>
            {!collapsed && isActive && termCount > 0 && (
                <div className="subline">
                    {termCount} terminal{termCount == 1 ? "" : "s"}
                </div>
            )}
        </div>
    );
});
RailItem.displayName = "RailItem";

const ConnectionsRail = memo(() => {
    const entries = useAtomValue(railEntriesAtom);
    const setEntries = useSetAtom(railEntriesAtom);
    const [collapsed, setCollapsed] = useAtom(railCollapsedAtom);
    const connectedCount = useAtomValue(connectedCountAtom);

    const updateEntries = useCallback(async () => {
        const list = await WorkspaceService.ListWorkspaces();
        if (!list) {
            return;
        }
        const newEntries: RailEntry[] = [];
        for (const entry of list) {
            newEntries.push({
                windowId: entry.windowid,
                workspace: await WorkspaceService.GetWorkspace(entry.workspaceid),
            });
        }
        setEntries(newEntries);
    }, []);

    useEffect(() => {
        fireAndForget(updateEntries);
        return waveEventSubscribeSingle({
            eventType: "workspace:update",
            handler: () => fireAndForget(updateEntries),
        });
    }, []);

    return (
        <div className={clsx("cd-connections-rail", { collapsed })}>
            <div className="rail-header">
                {!collapsed && <span className="rail-title">Connections</span>}
                <div className="rail-actions">
                    {!collapsed && (
                        <i
                            className={makeIconClass("plus", true)}
                            title="Add connection"
                            onClick={(e) => fireAndForget(() => openAddConnectionMenu(e))}
                        />
                    )}
                    <i
                        className={makeIconClass(collapsed ? "angles-right" : "angles-left", true)}
                        title={collapsed ? "Expand connections" : "Collapse connections"}
                        onClick={() => setCollapsed(!collapsed)}
                    />
                </div>
            </div>
            <OverlayScrollbarsComponent className="rail-list" options={{ scrollbars: { autoHide: "leave" } }}>
                {entries.map((entry, i) => (
                    <RailItem key={entry.workspace.oid} entry={entry} hotkeyNum={i < 9 ? i + 1 : null} />
                ))}
            </OverlayScrollbarsComponent>
            <div className="rail-footer" title={`${connectedCount} connected`}>
                <i className={makeIconClass("plug", true)} />
                {!collapsed && (
                    <span>
                        {connectedCount} connected{connectedCount > 0 ? " · wsh" : ""}
                    </span>
                )}
            </div>
        </div>
    );
});
ConnectionsRail.displayName = "ConnectionsRail";

export { ConnectionsRail };
