// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// CONNECTIONS rail — the single workspace switcher, a full-height collapsible
// left rail. It lists every workspace the user has opened (local folders and
// ssh connections); clicking a row switches the whole window to it. This
// replaces Wave's native workspace switcher.

import {
    addKubeClusters,
    kubeClustersListAtom,
    refreshKubeClusters,
    removeKubeCluster,
} from "@/app/clusterdeck/kubeclusters";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { WorkspaceEditor } from "@/app/tab/workspaceeditor";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { Input } from "@/element/input";
import { WaveModal } from "@/element/modal";
import { atoms, createBlock, getApi, getConnStatusAtom, WOS } from "@/store/global";
import { WorkspaceService } from "@/store/services";
import { waveEventSubscribeSingle } from "@/store/wps";
import { isMacOS } from "@/util/platformutil";
import { fireAndForget, makeIconClass } from "@/util/util";
import clsx from "clsx";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { memo, useCallback, useEffect } from "react";
import { useState } from "react";
import "./connectionsrail.scss";

export const ClusterdeckConnectionMetaKey = "clusterdeck:connection";
export const ClusterdeckLastOpenedMetaKey = "clusterdeck:lastopened";

const railCollapsedAtom = atomWithStorage<boolean>("clusterdeck:railcollapsed", false);
const addConnModalOpenAtom = atom<boolean>(false);

// The workspaces shown in the rail (Clusterdeck workspaces = folders +
// connections the user opened). Populated from WorkspaceService and refreshed on
// workspace updates.
const railWorkspacesAtom = atom<Workspace[]>([]);

function isLocalConn(conn: string): boolean {
    return conn === "" || conn === "local" || conn.startsWith("local:");
}

function getWorkspaceConnection(workspace: Workspace): string {
    return (workspace?.meta?.[ClusterdeckConnectionMetaKey] as string) ?? "";
}

// A Clusterdeck workspace is one opened via the rail (tagged with a connection).
function isClusterdeckWorkspace(workspace: Workspace): boolean {
    return workspace?.meta?.[ClusterdeckConnectionMetaKey] != null;
}

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
    for (const ws of get(railWorkspacesAtom)) {
        const conn = getWorkspaceConnection(ws);
        if (!isLocalConn(conn) && get(getConnStatusAtom(conn))?.connected) {
            count++;
        }
    }
    return count;
});

// Stamp both the workspace and its connection with "opened just now". The
// connection stamp (connections.json) is what the Welcome "Recent" list falls
// back to once a workspace is deleted, so recency survives that deletion.
async function recordWorkspaceOpened(oid: string): Promise<void> {
    const now = Date.now();
    await RpcApi.SetMetaCommand(TabRpcClient, {
        oref: WOS.makeORef("workspace", oid),
        meta: { [ClusterdeckLastOpenedMetaKey]: now } as MetaType,
    });
    const ws = await WorkspaceService.GetWorkspace(oid);
    const conn = ws ? getWorkspaceConnection(ws) : "";
    if (!isLocalConn(conn)) {
        await RpcApi.SetConnectionsConfigCommand(TabRpcClient, {
            host: conn,
            metamaptype: { "clusterdeck:lastopened": now } as MetaType,
        });
    }
}

// Open a workspace for a target — a local folder path (e.g. ~/Documents/proj)
// OR a connection (user@host) — creating + seeding the IDE layout if needed,
// then switch the window to it. Also used to "reopen" a connection from the
// Welcome "Recent" list whose workspace was since deleted.
export function openTargetWorkspace(target: string) {
    fireAndForget(async () => {
        const workspaceId = await RpcApi.ClusterdeckOpenTargetCommand(TabRpcClient, target);
        if (workspaceId) {
            await recordWorkspaceOpened(workspaceId);
            getApi().switchWorkspace(workspaceId);
        }
    });
}

// Switch to a workspace, recording recency for the Welcome "Recent" list.
export function switchToWorkspace(oid: string) {
    if (globalStore.get(atoms.workspace)?.oid === oid) {
        return;
    }
    fireAndForget(async () => {
        await recordWorkspaceOpened(oid);
        getApi().switchWorkspace(oid);
    });
}

// Switch to the nth workspace in rail order (1-based) — used by Cmd+1..9.
export function openRailConnectionByIndex(index: number) {
    const ws = globalStore.get(railWorkspacesAtom)[index - 1];
    if (ws != null) {
        switchToWorkspace(ws.oid);
    }
}

// "Open Folder" — native folder picker, then open it as a workspace.
export function openFolderPicker() {
    fireAndForget(async () => {
        const dir = await getApi().selectDirectory();
        if (dir) {
            openTargetWorkspace(dir);
        }
    });
}

// "New Connection" — open the ssh connection modal.
export function openNewConnection() {
    globalStore.set(addConnModalOpenAtom, true);
}

// The k9s cluster-picker state: the k9s block template to launch once the user
// picks which cluster it should target. A workspace can hold several k9s blocks,
// each bound to a different cluster.
type KubeAppLaunch = { blockDef: BlockDef; magnified: boolean };
const kubeAppPickerAtom = atom(null as KubeAppLaunch | null);

// Called by the k9s widget (marked `cdapp:kube` in widgets.json): instead of
// launching k9s directly, ask which cluster it should open against.
export function openKubeAppPicker(blockDef: BlockDef, magnified: boolean) {
    globalStore.set(kubeAppPickerAtom, { blockDef, magnified });
}

// Open the Welcome/home workspace (creating it if needed).
export function openHome() {
    fireAndForget(async () => {
        const oid = await RpcApi.ClusterdeckOpenHomeCommand(TabRpcClient);
        if (oid) {
            getApi().switchWorkspace(oid);
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

// The rail "+" modal — an ssh connection (user@host). Opening it triggers Wave's
// normal connect/auth flow when the blocks mount.
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
            description="Enter an SSH connection (e.g. user@host). It opens as a workspace with the Clusterdeck layout; connect/auth runs when the blocks mount."
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

// Shown when the k9s widget is clicked: pick which registered cluster this k9s
// block should watch. Creates a k9s block bound to that cluster (merged
// kubeconfig + --context) on the local connection — k9s runs on the Mac (where
// the kubeconfigs live) even inside an ssh workspace. Several k9s blocks for
// different clusters can live in the same workspace. The inline "+" adds more
// configs live (no separate workspace is created).
const KubeAppPickerModal = memo(() => {
    const [launch, setLaunch] = useAtom(kubeAppPickerAtom);
    const clusters = useAtomValue(kubeClustersListAtom);
    useEffect(() => {
        if (launch != null) {
            refreshKubeClusters();
        }
    }, [launch]);
    if (launch == null) {
        return null;
    }
    const close = () => setLaunch(null);
    const launchFor = (cluster: ClusterdeckKubeClusterInfo) => {
        const meta: MetaType = { ...launch.blockDef.meta };
        delete meta["cdapp:kube"];
        // Bind k9s to the chosen cluster via explicit flags. cmd:shell=false so the
        // args apply and no login shell re-sources the user's ambient $KUBECONFIG.
        // The kubeconfig is the MERGED registry file (--context selects the cluster)
        // so k9s's :ctx and the header dropdown can switch among all registered.
        // connection=local so k9s runs on the Mac (where the kubeconfigs are).
        meta["connection"] = "local";
        meta["cmd:shell"] = false;
        meta["cmd:args"] = ["--kubeconfig", cluster.kubeconfigpath, "--context", cluster.context];
        meta["cdk9s"] = true;
        fireAndForget(async () => {
            await createBlock({ ...launch.blockDef, meta }, launch.magnified, false);
        });
        close();
    };
    return (
        <WaveModal
            title="Open k9s"
            description="Pick the cluster this k9s should watch. You can add more k9s blocks in the same workspace for other clusters."
            onCancel={close}
            onSubmit={close}
            buttonLabel="Cancel"
        >
            <div className="cd-kube-context-list">
                {clusters.length === 0 && (
                    <div className="cd-kube-context-empty">No clusters registered yet.</div>
                )}
                {clusters.map((c) => (
                    <div key={c.kubeconfigpath + c.context} className="cd-kube-context-item">
                        <div className="cd-kube-context-main" onClick={() => launchFor(c)}>
                            <i className={makeIconClass("dharmachakra", true)} />
                            <span>{c.name}</span>
                        </div>
                        <i
                            className={clsx(makeIconClass("xmark", true), "cd-kube-remove")}
                            title={`Remove ${c.name}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                removeKubeCluster(c.context);
                            }}
                        />
                    </div>
                ))}
                <div className="cd-kube-context-item cd-kube-context-add" onClick={() => addKubeClusters()}>
                    <i className={makeIconClass("plus", true)} />
                    <span>Add Kubernetes config(s)…</span>
                </div>
            </div>
        </WaveModal>
    );
});
KubeAppPickerModal.displayName = "KubeAppPickerModal";

function hotkeyLabel(num: number): string {
    return isMacOS() ? `⌘${num}` : `Alt+${num}`;
}

// Right-click a rail workspace to edit it (name / color / icon / delete) using
// the same editor UI as Wave's native switcher, shown in a popup at the cursor.
const editTargetAtom = atom(null as { workspace: Workspace; x: number; y: number } | null);

function showWorkspaceMenu(e: React.MouseEvent, ws: Workspace) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 250));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 320));
    globalStore.set(editTargetAtom, { workspace: ws, x, y });
}

const WorkspaceEditorPopup = memo(() => {
    const [target, setTarget] = useAtom(editTargetAtom);
    const [ws, setWs] = useState<Workspace | null>(null);
    useEffect(() => {
        setWs(target?.workspace ?? null);
    }, [target]);
    if (target == null || ws == null) {
        return null;
    }
    const close = () => setTarget(null);
    const update = (next: Workspace) => {
        setWs(next);
        fireAndForget(() =>
            WorkspaceService.UpdateWorkspace(next.oid, next.name ?? "", next.icon ?? "", next.color ?? "", false)
        );
    };
    return (
        <>
            <div className="cd-editor-backdrop" onClick={close} />
            <div className="cd-editor-popup" style={{ top: target.y, left: target.x }} onClick={(e) => e.stopPropagation()}>
                <WorkspaceEditor
                    title={ws.name ?? ""}
                    icon={ws.icon ?? ""}
                    color={ws.color ?? ""}
                    focusInput={true}
                    onTitleChange={(t) => update({ ...ws, name: t })}
                    onColorChange={(c) => update({ ...ws, color: c })}
                    onIconChange={(i) => update({ ...ws, icon: i })}
                    onDeleteWorkspace={() => {
                        getApi().deleteWorkspace(ws.oid);
                        close();
                    }}
                />
            </div>
        </>
    );
});
WorkspaceEditorPopup.displayName = "WorkspaceEditorPopup";

function workspaceIcon(workspace: Workspace, conn: string): string {
    if (workspace.icon && workspace.icon != "custom@wave-logo-solid") {
        return workspace.icon;
    }
    return isLocalConn(conn) ? "folder" : "server";
}

const RailItem = memo(({ workspace, hotkeyNum }: { workspace: Workspace; hotkeyNum: number }) => {
    const activeWorkspace = useAtomValue(atoms.workspace);
    const collapsed = useAtomValue(railCollapsedAtom);
    const conn = getWorkspaceConnection(workspace);
    const connStatus = useAtomValue(getConnStatusAtom(conn));
    const termCount = useAtomValue(activeTermCountAtom);

    const isActive = activeWorkspace?.oid === workspace.oid;
    const local = isLocalConn(conn);
    const isConnected = !local && !!connStatus?.connected;
    const iconName = workspaceIcon(workspace, conn);
    const title = conn && !isLocalConn(conn) ? `${workspace.name} (${conn})` : workspace.name;

    const onClick = useCallback(() => switchToWorkspace(workspace.oid), [workspace.oid]);

    return (
        <div
            className={clsx("rail-item", { active: isActive })}
            onClick={onClick}
            onContextMenu={(e) => showWorkspaceMenu(e, workspace)}
            title={title}
        >
            <div className="rail-item-row">
                <span className={clsx("status-dot", { connected: isConnected, available: local })} />
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
    const workspaces = useAtomValue(railWorkspacesAtom);
    const setWorkspaces = useSetAtom(railWorkspacesAtom);
    const [collapsed, setCollapsed] = useAtom(railCollapsedAtom);
    const connectedCount = useAtomValue(connectedCountAtom);

    const updateWorkspaces = useCallback(async () => {
        const list = await WorkspaceService.ListWorkspaces();
        if (!list) {
            return;
        }
        const result: Workspace[] = [];
        for (const entry of list) {
            const ws = await WorkspaceService.GetWorkspace(entry.workspaceid);
            if (ws && isClusterdeckWorkspace(ws)) {
                result.push(ws);
            }
        }
        setWorkspaces(result);
    }, [setWorkspaces]);

    useEffect(() => {
        fireAndForget(updateWorkspaces);
        // Populate the k9s cluster list once on mount (the header dropdown reads
        // this atom during render, so it must not refresh itself there).
        refreshKubeClusters();
        return waveEventSubscribeSingle({
            eventType: "workspace:update",
            handler: () => fireAndForget(updateWorkspaces),
        });
    }, [updateWorkspaces]);

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
                <div className="rail-item rail-welcome" onClick={() => openHome()} title="Welcome">
                    <div className="rail-item-row">
                        <span className="status-dot placeholder" />
                        <i className={makeIconClass("house", true)} />
                        {!collapsed && <span className="label">Welcome</span>}
                    </div>
                </div>
                {workspaces.map((ws, i) => (
                    <RailItem key={ws.oid} workspace={ws} hotkeyNum={i < 9 ? i + 1 : null} />
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
            <KubeAppPickerModal />
            <WorkspaceEditorPopup />
        </div>
    );
});
ConnectionsRail.displayName = "ConnectionsRail";

export { ConnectionsRail };
