// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// SHELL CONNECTIONS rail — the workspace switcher reshaped as a full-height,
// collapsible left rail. Connection = workspace: clicking a row switches the
// whole window to that connection's workspace.

import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { Input } from "@/element/input";
import { WaveModal } from "@/element/modal";
import { atoms, createBlock, getApi, getConnStatusAtom, WOS } from "@/store/global";
import { isMacOS } from "@/util/platformutil";
import { fireAndForget, makeIconClass } from "@/util/util";
import clsx from "clsx";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { memo, useCallback, useState } from "react";
import "./connectionsrail.scss";

export const ClusterdeckConnectionMetaKey = "clusterdeck:connection";

const railCollapsedAtom = atomWithStorage<boolean>("clusterdeck:railcollapsed", false);
const addConnModalOpenAtom = atom<boolean>(false);

function isLocalConn(conn: string): boolean {
    return conn === "" || conn === "local" || conn.startsWith("local:");
}

function railDisplayName(conn: string): string {
    const at = conn.lastIndexOf("@");
    return at >= 0 ? conn.slice(at + 1) : conn;
}

// The rail lists Wave's saved connections (connections.json) plus the local
// machine; clicking a connection opens its workspace.
const railConnectionsAtom = atom<string[]>((get) => {
    const conns = get(atoms.fullConfigAtom)?.connections ?? {};
    const names = Object.keys(conns).filter((c) => !isLocalConn(c) && !c.startsWith("wsl://"));
    names.sort((a, b) => a.localeCompare(b));
    return ["local", ...names];
});

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
    for (const conn of get(railConnectionsAtom)) {
        if (!isLocalConn(conn) && get(getConnStatusAtom(conn))?.connected) {
            count++;
        }
    }
    return count;
});

function getWorkspaceConnection(workspace: Workspace): string {
    return (workspace?.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "";
}

// Open a workspace for a target — a local folder path (e.g. ~/Documents/proj)
// OR a connection (user@host) — creating + seeding the IDE layout if needed,
// then switch the window to it. A workspace is a root folder on a connection,
// so the same connection can back many folders.
function openTargetWorkspace(target: string) {
    fireAndForget(async () => {
        const workspaceId = await RpcApi.ClusterdeckOpenTargetCommand(TabRpcClient, target);
        if (workspaceId) {
            getApi().switchWorkspace(workspaceId);
        }
    });
}

// Open the nth connection in rail order (1-based) — used by Cmd+1..9.
export function openRailConnectionByIndex(index: number) {
    const conns = globalStore.get(railConnectionsAtom);
    const conn = conns[index - 1];
    if (conn != null) {
        openTargetWorkspace(conn);
    }
}

// "Open Folder" — native folder picker, then open it as a workspace.
function openFolderPicker() {
    fireAndForget(async () => {
        const dir = await getApi().selectDirectory();
        if (dir) {
            openTargetWorkspace(dir);
        }
    });
}

// Open connections.json inside Clusterdeck's own editor (a local preview block,
// Monaco) rather than the OS default app. connection:"local" is set explicitly
// so the workspace-connection lock (§3.3) doesn't bind it to a remote host.
function openConnectionsConfig() {
    fireAndForget(async () => {
        const path = await RpcApi.ClusterdeckConnectionsConfigPathCommand(TabRpcClient);
        if (!path) {
            return;
        }
        await createBlock({ meta: { view: "preview", file: path, connection: "local" } }, false, false);
    });
}

// The rail "+" — a two-option menu: pick a local folder, or add an ssh connection.
function openAddMenu(e: React.MouseEvent) {
    const menu: ContextMenuItem[] = [
        { label: "Open Folder…", click: () => openFolderPicker() },
        { label: "New Connection…", click: () => globalStore.set(addConnModalOpenAtom, true) },
    ];
    ContextMenuModel.getInstance().showContextMenu(menu, e);
}

// The rail "+" modal — one free-form input: a local folder path or a connection.
// Opening a remote target triggers Wave's normal connect/auth flow when the
// blocks mount.
const AddConnectionModal = memo(() => {
    const [open, setOpen] = useAtom(addConnModalOpenAtom);
    const [value, setValue] = useState("");
    if (!open) {
        return null;
    }
    const close = () => {
        setValue("");
        setOpen(false);
    };
    const submit = () => {
        const target = value.trim();
        if (target != "") {
            openTargetWorkspace(target);
        }
        close();
    };
    return (
        <WaveModal
            title="New Connection"
            description="Enter an SSH connection (e.g. user@host). It opens as a workspace with the Clusterdeck layout; Wave's connect/auth runs when the blocks mount."
            buttonLabel="Connect"
            onSubmit={submit}
            onCancel={close}
        >
            <Input
                value={value}
                onChange={setValue}
                placeholder="user@host"
                autoFocus={true}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        submit();
                    } else if (e.key === "Escape") {
                        close();
                    }
                }}
            />
        </WaveModal>
    );
});
AddConnectionModal.displayName = "AddConnectionModal";

function hotkeyLabel(num: number): string {
    return isMacOS() ? `⌘${num}` : `Alt+${num}`;
}

const RailItem = memo(({ conn, hotkeyNum }: { conn: string; hotkeyNum: number }) => {
    const activeWorkspace = useAtomValue(atoms.workspace);
    const collapsed = useAtomValue(railCollapsedAtom);
    const connStatus = useAtomValue(getConnStatusAtom(conn));
    const termCount = useAtomValue(activeTermCountAtom);

    const local = isLocalConn(conn);
    const activeConn = getWorkspaceConnection(activeWorkspace);
    const isActive = local ? isLocalConn(activeConn) : activeConn === conn;
    const isConnected = !local && !!connStatus?.connected;
    const iconName = local ? "laptop" : "server";
    const label = local ? "Local" : railDisplayName(conn);
    const title = local ? "Local" : conn;

    const onClick = useCallback(() => openTargetWorkspace(conn), [conn]);

    return (
        <div className={clsx("rail-item", { active: isActive })} onClick={onClick} title={title}>
            <div className="rail-item-row">
                <span className={clsx("status-dot", { connected: isConnected })} />
                <i className={makeIconClass(iconName, true)} />
                {!collapsed && (
                    <>
                        <span className="label">{label}</span>
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
    const connections = useAtomValue(railConnectionsAtom);
    const [collapsed, setCollapsed] = useAtom(railCollapsedAtom);
    const connectedCount = useAtomValue(connectedCountAtom);

    return (
        <div className={clsx("cd-connections-rail", { collapsed })}>
            <div className="rail-header">
                {!collapsed && <span className="rail-title">Connections</span>}
                <div className="rail-actions">
                    {!collapsed && (
                        <i
                            className={makeIconClass("plus", true)}
                            title="Open folder or add connection"
                            onClick={(e) => openAddMenu(e)}
                        />
                    )}
                    {!collapsed && (
                        <i
                            className={makeIconClass("gear", true)}
                            title="Edit connections.json"
                            onClick={() => openConnectionsConfig()}
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
                {connections.map((conn, i) => (
                    <RailItem key={conn} conn={conn} hotkeyNum={i < 9 ? i + 1 : null} />
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
            <AddConnectionModal />
        </div>
    );
});
ConnectionsRail.displayName = "ConnectionsRail";

export { ConnectionsRail };
