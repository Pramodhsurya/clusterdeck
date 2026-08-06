// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// CONNECTIONS rail — the single workspace switcher, a full-height collapsible
// left rail. It lists every workspace the user has opened (local folders and
// ssh connections); clicking a row switches the whole window to it. This
// replaces Wave's native workspace switcher.

import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WorkspaceEditor } from "@/app/tab/workspaceeditor";
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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
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

export class WorkspaceSelectionCoordinator {
    private generation = 0;

    constructor(
        private readonly switchWorkspace: (workspaceId: string) => void,
        private readonly recordOpened: (workspaceId: string) => Promise<void>,
        private readonly openTarget: (target: string) => Promise<string>,
        private readonly openHomeWorkspace: () => Promise<string>
    ) {}

    private beginIntent(): number {
        return ++this.generation;
    }

    selectExisting(workspaceId: string): void {
        this.beginIntent();
        this.switchWorkspace(workspaceId);
        void this.recordOpened(workspaceId).catch((error) =>
            console.warn("Failed to record workspace recency:", error)
        );
    }

    selectByIndex(workspaces: Workspace[], oneBasedIndex: number): void {
        const workspace = workspaces[oneBasedIndex - 1];
        if (workspace) this.selectExisting(workspace.oid);
    }

    selectTarget(target: string): void {
        const generation = this.beginIntent();
        void this.openTarget(target)
            .then((workspaceId) => {
                if (!workspaceId || generation !== this.generation) return;
                this.switchWorkspace(workspaceId);
                void this.recordOpened(workspaceId).catch((error) =>
                    console.warn("Failed to record workspace recency:", error)
                );
            })
            .catch((error) => console.warn("Failed to open workspace target:", error));
    }

    selectHome(): void {
        const generation = this.beginIntent();
        void this.openHomeWorkspace()
            .then((workspaceId) => {
                if (workspaceId && generation === this.generation) this.switchWorkspace(workspaceId);
            })
            .catch((error) => console.warn("Failed to open Home workspace:", error));
    }
}

const workspaceSelection = new WorkspaceSelectionCoordinator(
    (workspaceId) => getApi().switchWorkspace(workspaceId),
    recordWorkspaceOpened,
    (target) => RpcApi.ClusterdeckOpenTargetCommand(TabRpcClient, target),
    () => RpcApi.ClusterdeckOpenHomeCommand(TabRpcClient)
);

export function openTargetWorkspace(target: string) {
    workspaceSelection.selectTarget(target);
}

// Navigation is immediate; recency persistence is deliberately best-effort.
export function switchToWorkspace(oid: string) {
    workspaceSelection.selectExisting(oid);
}

// Switch to the nth workspace in rail order (1-based) — used by Cmd+1..9.
export function openRailConnectionByIndex(index: number) {
    workspaceSelection.selectByIndex(globalStore.get(railWorkspacesAtom), index);
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

// Open the Welcome/home workspace (creating it if needed).
export function openHome() {
    workspaceSelection.selectHome();
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
            <div
                className="cd-editor-popup"
                style={{ top: target.y, left: target.x }}
                onClick={(e) => e.stopPropagation()}
            >
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
        <button
            type="button"
            className={clsx("rail-item", { active: isActive })}
            onClick={onClick}
            onContextMenu={(e) => showWorkspaceMenu(e, workspace)}
            aria-current={isActive ? "page" : undefined}
            aria-label={
                collapsed
                    ? `${workspace.name}, ${local ? "local folder" : isConnected ? "connected" : "disconnected"}`
                    : undefined
            }
            title={title}
        >
            <span className="rail-item-row">
                <span className={clsx("status-dot", { connected: isConnected, available: local })} aria-hidden="true" />
                <span className="sr-only">{local ? "Local folder" : isConnected ? "Connected" : "Disconnected"}</span>
                <i className={makeIconClass(iconName, true)} aria-hidden="true" />
                {!collapsed && (
                    <>
                        <span className="label">{workspace.name}</span>
                        {hotkeyNum != null && <span className="hotkey">{hotkeyLabel(hotkeyNum)}</span>}
                    </>
                )}
            </span>
            {!collapsed && isActive && termCount > 0 && (
                <span className="subline">
                    {termCount} terminal{termCount == 1 ? "" : "s"}
                </span>
            )}
        </button>
    );
});
RailItem.displayName = "RailItem";

export class WorkspaceRefreshCoordinator {
    private generation = 0;
    private disposed = false;

    constructor(
        private readonly listWorkspaces: () => Promise<Array<{ workspaceid: string }>>,
        private readonly getWorkspace: (workspaceId: string) => Promise<Workspace>,
        private readonly commit: (workspaces: Workspace[]) => void
    ) {}

    activate(): void {
        this.disposed = false;
        this.generation++;
    }

    async refresh(): Promise<void> {
        const generation = ++this.generation;
        const list = await this.listWorkspaces();
        if (!list || this.disposed || generation !== this.generation) return;
        const details = await Promise.all(list.map((entry) => this.getWorkspace(entry.workspaceid)));
        if (this.disposed || generation !== this.generation) return;
        this.commit(details.filter((workspace) => workspace && isClusterdeckWorkspace(workspace)));
    }

    dispose(): void {
        this.disposed = true;
        this.generation++;
    }
}

const ConnectionsRail = memo(() => {
    const workspaces = useAtomValue(railWorkspacesAtom);
    const setWorkspaces = useSetAtom(railWorkspacesAtom);
    const [collapsed, setCollapsed] = useAtom(railCollapsedAtom);
    const connectedCount = useAtomValue(connectedCountAtom);
    const activeWorkspace = useAtomValue(atoms.workspace);
    const isWelcomeActive = activeWorkspace?.meta?.["clusterdeck:home"] != null;

    const refreshCoordinator = useMemo(
        () =>
            new WorkspaceRefreshCoordinator(
                () => WorkspaceService.ListWorkspaces(),
                (workspaceId) => WorkspaceService.GetWorkspace(workspaceId),
                setWorkspaces
            ),
        [setWorkspaces]
    );
    const updateWorkspaces = useCallback(() => refreshCoordinator.refresh(), [refreshCoordinator]);

    useEffect(() => {
        refreshCoordinator.activate();
        fireAndForget(updateWorkspaces);
        const unsubscribe = waveEventSubscribeSingle({
            eventType: "workspace:update",
            handler: () => fireAndForget(updateWorkspaces),
        });
        return () => {
            refreshCoordinator.dispose();
            unsubscribe();
        };
    }, [updateWorkspaces, refreshCoordinator]);

    return (
        <nav className={clsx("cd-connections-rail", { collapsed })} aria-label="Connections">
            <div className="rail-header">
                {!collapsed && <span className="rail-title">Connections</span>}
                <div className="rail-actions">
                    {!collapsed && (
                        <button
                            type="button"
                            className="rail-action"
                            aria-label="Open folder or add connection"
                            title="Open folder or add connection"
                            onClick={(e) => openAddMenu(e)}
                        >
                            <i className={makeIconClass("plus", true)} aria-hidden="true" />
                        </button>
                    )}
                    {!collapsed && (
                        <button
                            type="button"
                            className="rail-action"
                            aria-label="Edit connections configuration"
                            title="Edit connections.json"
                            onClick={() => openConnectionsConfig()}
                        >
                            <i className={makeIconClass("gear", true)} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        className="rail-action"
                        aria-label={collapsed ? "Expand connections" : "Collapse connections"}
                        title={collapsed ? "Expand connections" : "Collapse connections"}
                        onClick={() => setCollapsed(!collapsed)}
                    >
                        <i
                            className={makeIconClass(collapsed ? "angles-right" : "angles-left", true)}
                            aria-hidden="true"
                        />
                    </button>
                </div>
            </div>
            <OverlayScrollbarsComponent className="rail-list" options={{ scrollbars: { autoHide: "leave" } }}>
                <button
                    type="button"
                    className={clsx("rail-item rail-welcome", { active: isWelcomeActive })}
                    onClick={() => openHome()}
                    aria-current={isWelcomeActive ? "page" : undefined}
                    aria-label="Welcome"
                    title="Welcome"
                >
                    <span className="rail-item-row">
                        <span className="status-dot placeholder" aria-hidden="true" />
                        <i className={makeIconClass("house", true)} aria-hidden="true" />
                        {!collapsed && <span className="label">Welcome</span>}
                    </span>
                </button>
                {workspaces.map((ws, i) => (
                    <RailItem key={ws.oid} workspace={ws} hotkeyNum={i < 9 ? i + 1 : null} />
                ))}
            </OverlayScrollbarsComponent>
            <div
                className="rail-footer"
                role="status"
                aria-live="polite"
                aria-label={`${connectedCount} connections connected`}
                title={`${connectedCount} connected`}
            >
                <i className={makeIconClass("plug", true)} aria-hidden="true" />
                {!collapsed && (
                    <span>
                        {connectedCount} connected{connectedCount > 0 ? " · wsh" : ""}
                    </span>
                )}
            </div>
            <AddConnectionModal />
            <WorkspaceEditorPopup />
        </nav>
    );
});
ConnectionsRail.displayName = "ConnectionsRail";

export { ConnectionsRail };
