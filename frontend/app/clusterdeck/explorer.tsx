// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Clusterdeck explorer — a VS Code–style file tree (change #6, Phase 1). A new
// isolated block view ("cdexplorer") so Wave's own directory view is untouched.
// It lists the workspace folder's contents as a lazy-loading tree over SFTP and
// routes file clicks into the designated editor block (§3.5).

import { BlockNodeModel } from "@/app/block/blocktypes";
import { ClusterdeckZone_Editor, ClusterdeckZone_Explorer, ClusterdeckZoneMetaKey } from "@/app/clusterdeck/connlock";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import type { TabModel } from "@/app/store/tab-model";
import { SuggestionControl } from "@/app/suggestion/suggestion";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { TreeNodeData, TreeView } from "@/app/treeview/treeview";
import { Input } from "@/element/input";
import { WaveModal } from "@/element/modal";
import { getLayoutModelForStaticTab, LayoutTreeActionType, type LayoutTreeResizeNodeAction } from "@/layout/index";
import { findParent } from "@/layout/lib/layoutNode";
import { atoms, createBlock, getApi, WOS, refocusNode } from "@/store/global";
import { makeNativeLabel } from "@/util/platformutil";
import { fireAndForget, isLocalConnName, makeConnRoute, makeIconClass } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import clsx from "clsx";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./explorer.scss";

export function baseName(path: string): string {
    if (path === "~" || path === "") {
        return "Home";
    }
    const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

// VS Code–style file-type icons + colors (FontAwesome glyphs; brand glyphs and
// per-type colors approximating the Seti/Material icon themes).
type IconStyle = { icon: string; color: string };

const CodeBlue = "#519aba";
const Media = "#a074c4";
const ExtStyle: Record<string, IconStyle> = {
    js: { icon: "brands@js", color: "#f0db4f" },
    mjs: { icon: "brands@js", color: "#f0db4f" },
    cjs: { icon: "brands@js", color: "#f0db4f" },
    jsx: { icon: "brands@react", color: "#61dafb" },
    ts: { icon: "file-code", color: "#3178c6" },
    tsx: { icon: "brands@react", color: "#61dafb" },
    py: { icon: "brands@python", color: "#4b8bbe" },
    html: { icon: "brands@html5", color: "#e34c26" },
    htm: { icon: "brands@html5", color: "#e34c26" },
    css: { icon: "brands@css3", color: CodeBlue },
    scss: { icon: "brands@sass", color: "#cd6799" },
    sass: { icon: "brands@sass", color: "#cd6799" },
    java: { icon: "brands@java", color: "#cc3e44" },
    php: { icon: "brands@php", color: "#a074c4" },
    rs: { icon: "brands@rust", color: "#dea584" },
    go: { icon: "file-code", color: "#00add8" },
    rb: { icon: "file-code", color: "#cc342d" },
    c: { icon: "file-code", color: CodeBlue },
    cpp: { icon: "file-code", color: CodeBlue },
    h: { icon: "file-code", color: "#a074c4" },
    hpp: { icon: "file-code", color: "#a074c4" },
    sh: { icon: "terminal", color: "#89e051" },
    bash: { icon: "terminal", color: "#89e051" },
    zsh: { icon: "terminal", color: "#89e051" },
    json: { icon: "brackets-curly", color: "#cbcb41" },
    jsonc: { icon: "brackets-curly", color: "#cbcb41" },
    yaml: { icon: "file-code", color: "#cb171e" },
    yml: { icon: "file-code", color: "#cb171e" },
    toml: { icon: "file-code", color: "#9c4221" },
    xml: { icon: "code", color: "#e37933" },
    md: { icon: "brands@markdown", color: CodeBlue },
    markdown: { icon: "brands@markdown", color: CodeBlue },
    org: { icon: "file-lines", color: CodeBlue },
    txt: { icon: "file-lines", color: "#cfcfcf" },
    log: { icon: "file-lines", color: "#cfcfcf" },
    csv: { icon: "table", color: "#89e051" },
    lock: { icon: "lock", color: "#c5c5c5" },
    env: { icon: "gear", color: "#dfb52c" },
    sql: { icon: "database", color: "#dad8d8" },
    png: { icon: "image", color: Media },
    jpg: { icon: "image", color: Media },
    jpeg: { icon: "image", color: Media },
    gif: { icon: "image", color: Media },
    svg: { icon: "image", color: "#ffb13b" },
    webp: { icon: "image", color: Media },
    ico: { icon: "image", color: Media },
    pdf: { icon: "file-pdf", color: "#e34c26" },
    zip: { icon: "file-zipper", color: "#afb42b" },
    tar: { icon: "file-zipper", color: "#afb42b" },
    gz: { icon: "file-zipper", color: "#afb42b" },
};

const NameStyle: Record<string, IconStyle> = {
    dockerfile: { icon: "brands@docker", color: "#2496ed" },
    "docker-compose.yml": { icon: "brands@docker", color: "#2496ed" },
    ".gitignore": { icon: "brands@git-alt", color: "#f14e32" },
    ".gitattributes": { icon: "brands@git-alt", color: "#f14e32" },
    "package.json": { icon: "brands@npm", color: "#cb3837" },
    "package-lock.json": { icon: "brands@npm", color: "#cb3837" },
    "go.mod": { icon: "file-code", color: "#00add8" },
    "go.sum": { icon: "file-code", color: "#00add8" },
    makefile: { icon: "gear", color: "#6d8086" },
    "readme.md": { icon: "brands@markdown", color: CodeBlue },
    license: { icon: "certificate", color: "#d0b44c" },
};

const DefaultStyle: IconStyle = { icon: "file", color: "#8a9199" };

export function fileStyle(name: string): IconStyle {
    const lower = name.toLowerCase();
    if (NameStyle[lower]) {
        return NameStyle[lower];
    }
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
    return ExtStyle[ext] ?? DefaultStyle;
}

// Ensure the SSH connection is actually up before doing any file operation over
// it. Unlike the editor (whose PreviewModel awaits ConnEnsureCommand as part of
// resolving the file it's about to show), the explorer has no file-open step to
// hang this off of — without it, the initial directory listing races the
// connection: it usually wins if some other block (a terminal, the editor)
// already triggered a connect, but loses if the explorer is the first thing to
// touch the connection after an app restart, leaving the tree permanently
// empty/errored since nothing here ever retries on its own.
//
// The in-flight promise is shared per connection so a burst of concurrent
// calls (e.g. expanding several folders at once) collapses into one
// ConnEnsureCommand, but the cache entry is cleared the moment it settles
// (success or failure) rather than kept forever: ConnEnsureCommand already
// short-circuits cheaply server-side when the connection is healthy, so there's
// nothing to gain from caching success — and caching it would mean that if the
// connection later drops mid-session, every subsequent call here would skip
// re-ensuring it, silently reintroducing this exact bug.
const connectionEnsures = new Map<string, Promise<void>>();
function ensureConnection(connection: string): Promise<void> {
    if (!connection || isLocalConnName(connection)) {
        return Promise.resolve();
    }
    let p = connectionEnsures.get(connection);
    if (p == null) {
        p = RpcApi.ConnEnsureCommand(TabRpcClient, { connname: connection }, { timeout: 60000 });
        p.finally(() => {
            if (connectionEnsures.get(connection) === p) {
                connectionEnsures.delete(connection);
            }
        });
        connectionEnsures.set(connection, p);
    }
    return p;
}

// List a directory over SFTP and map its entries to tree nodes. `parentId` is
// undefined for the top level so those rows render as roots.
async function listDir(path: string, connection: string, parentId: string | undefined, limit: number): Promise<TreeNodeData[]> {
    await ensureConnection(connection);
    const uri = formatRemoteUri(path, connection);
    const files = await RpcApi.FileListCommand(TabRpcClient, { path: uri, opts: { limit } });
    return (files ?? [])
        .filter((f) => f.name && f.name !== "..")
        .map((f) => {
            const style = f.isdir ? null : fileStyle(f.name ?? "");
            return {
                id: f.path,
                parentId,
                path: f.path,
                label: f.name,
                isDirectory: !!f.isdir,
                icon: style?.icon,
                iconColor: style?.color,
            };
        });
}

function relativePath(path: string, rootPath: string): string {
    const root = rootPath.replace(/\/+$/, "");
    if (path === root) {
        return baseName(path);
    }
    if (path.startsWith(root + "/")) {
        return path.slice(root.length + 1);
    }
    return path;
}

// One shared cut/copy slot (matches the single-item OS clipboard model — plain
// module state is enough since paste is a direct user action, not something
// that needs to re-render a menu that isn't open).
type ClipboardEntry = { path: string; isDir: boolean; connection: string; mode: "copy" | "cut" };
let clipboardEntry: ClipboardEntry | null = null;

async function doDelete(connection: string, path: string, isDir: boolean, recursive: boolean): Promise<void> {
    try {
        await RpcApi.FileDeleteCommand(TabRpcClient, { path: formatRemoteUri(path, connection), recursive });
    } catch (e) {
        const msg = String(e);
        if (isDir && !recursive && msg.includes("recursive flag")) {
            if (window.confirm(`"${baseName(path)}" is a directory. Delete it and everything inside it?`)) {
                await doDelete(connection, path, isDir, true);
            }
            return;
        }
        window.alert(`Delete failed: ${msg}`);
    }
}

async function doRename(connection: string, oldPath: string, newPath: string, isDir: boolean): Promise<void> {
    try {
        let srcuri = formatRemoteUri(oldPath, connection);
        if (isDir) {
            srcuri += "/";
        }
        await RpcApi.FileMoveCommand(TabRpcClient, { srcuri, desturi: formatRemoteUri(newPath, connection) });
    } catch (e) {
        window.alert(`Rename failed: ${String(e)}`);
    }
}

// Paste the clipboard entry into destDir (a directory path). Directory copies
// aren't supported by the backend, so Copy is file-only (see the menu below);
// Cut works for both files and directories since it's a plain move/rename.
async function doPaste(connection: string, destDir: string): Promise<void> {
    if (clipboardEntry == null) {
        return;
    }
    const { path: srcPath, isDir, mode, connection: srcConn } = clipboardEntry;
    if (srcConn !== connection) {
        window.alert("Copying between different connections isn't supported yet.");
        return;
    }
    const destPath = `${destDir.replace(/\/+$/, "")}/${baseName(srcPath)}`;
    if (destPath === srcPath) {
        return;
    }
    try {
        const desturi = formatRemoteUri(destPath, connection);
        if (mode === "copy") {
            await RpcApi.FileCopyCommand(TabRpcClient, { srcuri: formatRemoteUri(srcPath, connection), desturi });
        } else {
            let srcuri = formatRemoteUri(srcPath, connection);
            if (isDir) {
                srcuri += "/";
            }
            await RpcApi.FileMoveCommand(TabRpcClient, { srcuri, desturi });
            clipboardEntry = null;
        }
    } catch (e) {
        window.alert(`Paste failed: ${String(e)}`);
    }
}

class ClusterdeckExplorerModel implements ViewModel {
    viewType = "cdexplorer";
    blockId: string;
    nodeModel: BlockNodeModel;
    tabModel: TabModel;
    env: WaveEnv;
    blockAtom: jotai.Atom<Block>;
    viewIcon: jotai.Atom<string>;
    viewName: jotai.Atom<string>;
    connectionAtom: jotai.Atom<string>;
    rootPathAtom: jotai.Atom<string>;
    collapsedAtom: jotai.Atom<boolean>;
    openFileAtom: jotai.Atom<string | null>;
    openFilesAtom: jotai.Atom<string[]>;
    expandedAtom: jotai.Atom<string[]>;
    gitStatusAtom: jotai.PrimitiveAtom<Record<string, string>>;
    refreshVersion = jotai.atom(0);
    // In-flight "create the missing editor" promise, so two near-simultaneous
    // file opens (editor missing, e.g. right after it was closed) share one
    // created block instead of racing to create two.
    private ensureEditorPromise: Promise<string> | null = null;

    constructor({ blockId, nodeModel, tabModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.tabModel = tabModel;
        this.env = waveEnv;
        this.blockAtom = waveEnv.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
        this.viewIcon = jotai.atom("folder-tree");
        this.viewName = jotai.atom("Explorer");
        this.connectionAtom = jotai.atom((get) => (get(this.blockAtom)?.meta?.connection as string) ?? "local");
        this.rootPathAtom = jotai.atom((get) => (get(this.blockAtom)?.meta?.file as string) || "~");
        this.collapsedAtom = jotai.atom((get) => !!get(this.blockAtom)?.meta?.["clusterdeck:explorercollapsed"]);
        // The file open in the designated editor block, for tree highlighting (T5).
        this.openFileAtom = jotai.atom((get) => {
            const meta = this.editorMeta(get);
            return (meta?.file as string) ?? null;
        });
        // The list of files open in the editor, for the OPEN EDITORS section (E#).
        this.openFilesAtom = jotai.atom((get) => {
            const meta = this.editorMeta(get);
            return (meta?.["clusterdeck:openfiles"] as string[]) ?? [];
        });
        // Directories the user expanded, persisted to meta so the tree survives a
        // full reload / app restart (not just a re-mount).
        this.expandedAtom = jotai.atom((get) => (get(this.blockAtom)?.meta?.["clusterdeck:expanded"] as string[]) ?? []);
        // Git decorations: absolute path -> "modified" | "added" (change #6 G#).
        this.gitStatusAtom = jotai.atom<Record<string, string>>({});
    }

    // Persist the expanded-directory set to block meta (durable across reloads).
    persistExpanded(ids: string[]) {
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "clusterdeck:expanded": ids } as MetaType,
            })
        );
    }

    // Resolve the designated editor-zone block's id in this tab (§3.5). `get` is
    // an atom getter (reactive) or globalStore.get.
    editorBlockId(get: <T>(a: jotai.Atom<T>) => T): string | null {
        const tabId = this.tabModel?.tabId;
        if (tabId == null) {
            return null;
        }
        const tab = get(this.env.wos.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
        const editorId = tab?.blockids?.find((bid) => {
            if (bid === this.blockId) {
                return false;
            }
            const m = get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", bid)))?.meta;
            return m?.[ClusterdeckZoneMetaKey] === ClusterdeckZone_Editor;
        });
        return editorId ?? null;
    }

    private editorMeta(get: <T>(a: jotai.Atom<T>) => T): MetaType | null {
        const editorId = this.editorBlockId(get);
        if (editorId == null) {
            return null;
        }
        return get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", editorId)))?.meta ?? null;
    }

    get viewComponent(): ViewComponent {
        return ClusterdeckExplorerView;
    }

    refresh() {
        globalStore.set(this.refreshVersion, globalStore.get(this.refreshVersion) + 1);
        void this.refreshGitStatus();
    }

    // Query git status over the connection and roll it up to ancestor folders, so
    // the tree can color changed files (M) and folders that contain them (§ G#).
    async refreshGitStatus() {
        const connection = globalStore.get(this.connectionAtom);
        const rootPath = globalStore.get(this.rootPathAtom);
        if (!rootPath) {
            return;
        }
        let raw: Record<string, string> = {};
        try {
            raw = await RpcApi.ClusterdeckGitStatusCommand(TabRpcClient, connection ?? "local", rootPath);
        } catch {
            raw = {};
        }
        const map: Record<string, string> = { ...raw };
        const root = rootPath.replace(/\/+$/, "");
        for (const [p, status] of Object.entries(raw)) {
            let dir = p.slice(0, p.lastIndexOf("/"));
            while (dir && dir.length >= root.length && dir.startsWith(root)) {
                if (status === "modified") {
                    map[dir] = "modified";
                } else if (map[dir] == null) {
                    map[dir] = "added";
                }
                if (dir === root) {
                    break;
                }
                dir = dir.slice(0, dir.lastIndexOf("/"));
            }
        }
        globalStore.set(this.gitStatusAtom, map);
    }

    // Find a layout node by blockId, searching the tree recursively.
    // The explorer may live at root.children[1].children[0] (after the
    // editor-at-top layout restructure), not as a direct child of root.
    private findNodeByBlockId(node: LayoutNode | undefined, blockId: string): LayoutNode | null {
        if (!node) return null;
        if (node.data?.blockId === blockId) return node;
        if (!node.children) return null;
        for (const child of node.children) {
            const found = this.findNodeByBlockId(child, blockId);
            if (found) return found;
        }
        return null;
    }

    // Resize the explorer's layout node to sizePercent (0-100) of its parent
    // row, sharing the rest among its siblings. Returns false if the node
    // wasn't found (e.g. the layout isn't ready or was rearranged).
    resizeExplorer(sizePercent: number): boolean {
        const lm = getLayoutModelForStaticTab();
        const root = lm?.treeState?.rootNode;
        if (!root?.children) {
            return false;
        }
        const explorerNode = this.findNodeByBlockId(root, this.blockId);
        if (!explorerNode) {
            return false;
        }
        // Find the parent container (the row that holds explorer + siblings)
        const parent = findParent(root, explorerNode.id);
        if (!parent?.children) {
            return false;
        }
        const siblings = parent.children.filter((n) => n.id !== explorerNode.id);
        if (siblings.length === 0) {
            return false;
        }
        const rest = (100 - sizePercent) / siblings.length;
        const action: LayoutTreeResizeNodeAction = {
            type: LayoutTreeActionType.ResizeNode,
            resizeOperations: [
                { nodeId: explorerNode.id, size: sizePercent },
                ...siblings.map((n) => ({ nodeId: n.id, size: rest })),
            ],
        };
        lm.treeReducer(action);
        return true;
    }

    // Collapse the explorer to a thin strip (or restore), persisting the flag.
    toggleCollapse() {
        const collapsed = !globalStore.get(this.collapsedAtom);
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "clusterdeck:explorercollapsed": collapsed } as MetaType,
            })
        );
        this.resizeExplorer(collapsed ? 3 : 18);
    }

    // Change the folder this explorer is rooted at (the "files" preview widget
    // already lets you browse to any folder at any time — the tree explorer was
    // stuck at whatever root it was seeded with; this brings the two in line).
    // Also clears persisted expansion/git state from the old root so the tree
    // doesn't show stale state from a different folder.
    setRootPath(newPath: string) {
        fireAndForget(async () => {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { file: newPath, "clusterdeck:expanded": [] } as MetaType,
            });
        });
    }

    // Apply the narrow default width once per block (fixes older/wide workspaces
    // without re-seeding; later manual resizes are left untouched).
    ensureDefaultWidth() {
        const meta = globalStore.get(this.blockAtom)?.meta;
        if (meta?.["clusterdeck:sized"] || meta?.["clusterdeck:explorercollapsed"]) {
            return;
        }
        if (this.resizeExplorer(17)) {
            fireAndForget(() =>
                RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("block", this.blockId),
                    meta: { "clusterdeck:sized": true } as MetaType,
                })
            );
        }
    }

    private editorMetaNow(): { editorId: string; meta: MetaType | null } | null {
        const editorId = this.editorBlockId(globalStore.get);
        if (editorId == null) {
            return null;
        }
        const meta = globalStore.get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", editorId)))?.meta;
        return { editorId, meta: meta ?? null };
    }

    // Find the tab's designated editor block, recreating it if it's missing
    // (closed, or — rarely — dropped during a bad app shutdown mid-seed). File
    // opens must never silently go nowhere: this is the one thing every
    // openInEditor/newUntitledFile call routes through. Concurrent callers (two
    // files opened back-to-back before the first create resolves) share one
    // in-flight create instead of each seeing "missing" and making their own.
    private async ensureEditorBlockId(): Promise<string> {
        const existing = this.editorBlockId(globalStore.get);
        if (existing != null) {
            return existing;
        }
        if (this.ensureEditorPromise != null) {
            return this.ensureEditorPromise;
        }
        const meta: MetaType = { view: "cdeditor" };
        meta[ClusterdeckZoneMetaKey] = ClusterdeckZone_Editor;
        const p = createBlock({ meta }).finally(() => {
            this.ensureEditorPromise = null;
        });
        this.ensureEditorPromise = p;
        return p;
    }

    // Route a file into the editor block (§3.5), adding it to OPEN EDITORS (E#).
    openInEditor(path: string) {
        fireAndForget(async () => {
            const editorId = await this.ensureEditorBlockId();
            const meta = globalStore.get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", editorId)))?.meta;
            const openFiles = (meta?.["clusterdeck:openfiles"] as string[]) ?? [];
            const next = openFiles.includes(path) ? openFiles : [...openFiles, path];
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", editorId),
                meta: { file: path, "clusterdeck:openfiles": next } as MetaType,
            });
            refocusNode(editorId);
        });
    }

    // Make an already-open file the active one in the editor.
    setActiveEditorFile(path: string) {
        const e = this.editorMetaNow();
        if (e == null) {
            return;
        }
        fireAndForget(async () => {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", e.editorId),
                meta: { file: path },
            });
            refocusNode(e.editorId);
        });
    }

    // Close a file: drop it from OPEN EDITORS; if it was active, activate another.
    closeEditorFile(path: string) {
        const e = this.editorMetaNow();
        if (e == null) {
            return;
        }
        const openFiles = (e.meta?.["clusterdeck:openfiles"] as string[]) ?? [];
        const next = openFiles.filter((f) => f !== path);
        const activeFile = e.meta?.file as string;
        const newActive = activeFile === path ? (next[next.length - 1] ?? "") : activeFile;
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", e.editorId),
                meta: { file: newActive, "clusterdeck:openfiles": next } as MetaType,
            })
        );
    }

    // Close every open file except keepPath ("Close Others").
    closeOtherEditorFiles(keepPath: string) {
        const e = this.editorMetaNow();
        if (e == null) {
            return;
        }
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", e.editorId),
                meta: { file: keepPath, "clusterdeck:openfiles": [keepPath] } as MetaType,
            })
        );
    }

    // Close every open file (OPEN EDITORS "close all").
    closeAllEditorFiles() {
        const e = this.editorMetaNow();
        if (e == null) {
            return;
        }
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", e.editorId),
                meta: { file: "", "clusterdeck:openfiles": [] } as MetaType,
            })
        );
    }

    // Create a new empty "untitled-N.txt" in targetDir (default: workspace root)
    // and open it in the editor (VS Code "new file" — the editor is file-backed,
    // so this is a real file).
    newUntitledFile(targetDir?: string) {
        const dir = (targetDir ?? globalStore.get(this.rootPathAtom)).replace(/\/+$/, "");
        const connection = globalStore.get(this.connectionAtom);
        fireAndForget(async () => {
            const editorId = await this.ensureEditorBlockId();
            const meta = globalStore.get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", editorId)))?.meta;
            const openFiles = (meta?.["clusterdeck:openfiles"] as string[]) ?? [];
            const taken = new Set(openFiles.map((f) => baseName(f)));
            let n = 1;
            while (taken.has(`untitled-${n}.txt`)) {
                n++;
            }
            const fullPath = `${dir}/untitled-${n}.txt`;
            await ensureConnection(connection);
            await RpcApi.FileCreateCommand(TabRpcClient, { info: { path: formatRemoteUri(fullPath, connection) } });
            this.openInEditor(fullPath);
            this.refresh();
        });
    }

    // Create "New Folder" (or "New Folder 2", "New Folder 3", ... on collision)
    // in targetDir (default: workspace root).
    newFolder(targetDir?: string) {
        const dir = (targetDir ?? globalStore.get(this.rootPathAtom)).replace(/\/+$/, "");
        const connection = globalStore.get(this.connectionAtom);
        fireAndForget(async () => {
            await ensureConnection(connection);
            for (let n = 1; n <= 50; n++) {
                const name = n === 1 ? "New Folder" : `New Folder ${n}`;
                try {
                    await RpcApi.FileMkdirCommand(TabRpcClient, {
                        info: { path: formatRemoteUri(`${dir}/${name}`, connection) },
                    });
                    break;
                } catch (e) {
                    if (!String(e).includes("already exists")) {
                        window.alert(`Create folder failed: ${String(e)}`);
                        break;
                    }
                }
            }
            this.refresh();
        });
    }

    deleteNode(path: string, isDir: boolean) {
        const connection = globalStore.get(this.connectionAtom);
        if (!window.confirm(`Delete "${baseName(path)}"?`)) {
            return;
        }
        fireAndForget(async () => {
            await doDelete(connection, path, isDir, false);
            this.refresh();
        });
    }

    renameNode(oldPath: string, newPath: string, isDir: boolean) {
        const connection = globalStore.get(this.connectionAtom);
        fireAndForget(async () => {
            await doRename(connection, oldPath, newPath, isDir);
            this.refresh();
        });
    }

    copyNode(path: string, isDir: boolean) {
        clipboardEntry = { path, isDir, connection: globalStore.get(this.connectionAtom), mode: "copy" };
    }

    cutNode(path: string, isDir: boolean) {
        clipboardEntry = { path, isDir, connection: globalStore.get(this.connectionAtom), mode: "cut" };
    }

    pasteInto(destDir: string) {
        const connection = globalStore.get(this.connectionAtom);
        fireAndForget(async () => {
            await doPaste(connection, destDir);
            this.refresh();
        });
    }
}

// Bring a designated zone block (explorer or editor) back if it was closed.
// Wave blocks can always be closed (the "×" in the block header), but
// Clusterdeck's model depends on exactly one explorer and one editor existing
// per tab — losing either one must not be a dead end. If the current tab
// already has a block in that zone, just focus it; otherwise seed a fresh one.
// Concurrent calls for the same tab+zone (e.g. an impatient double-click on the
// widget) share one in-flight create instead of racing to make two.
const zoneBlockEnsures = new Map<string, Promise<void>>();
function openOrFocusZoneBlock(zone: string, view: string) {
    const tabId = globalStore.get(atoms.staticTabId);
    if (tabId == null) {
        return;
    }
    const key = `${tabId}:${zone}`;
    if (zoneBlockEnsures.has(key)) {
        return;
    }
    const p = (async () => {
        const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
        const existingId = tab?.blockids?.find((bid) => {
            const meta = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", bid)))?.meta;
            return meta?.[ClusterdeckZoneMetaKey] === zone;
        });
        if (existingId != null) {
            refocusNode(existingId);
            return;
        }
        const meta: MetaType = { view };
        meta[ClusterdeckZoneMetaKey] = zone;
        const blockId = await createBlock({ meta });
        refocusNode(blockId);
    })().finally(() => {
        zoneBlockEnsures.delete(key);
    });
    zoneBlockEnsures.set(key, p);
    fireAndForget(() => p);
}

// Powers the "explorer" app widget (see also enhancement in the widget bar).
export function openOrFocusExplorer() {
    openOrFocusZoneBlock(ClusterdeckZone_Explorer, "cdexplorer");
}

// Powers the "editor" app widget — a manual way to bring the editor pane back
// without first clicking a file (openInEditor/newUntitledFile self-heal it
// automatically the moment they're used, via ensureEditorBlockId above).
export function openOrFocusEditor() {
    openOrFocusZoneBlock(ClusterdeckZone_Editor, "cdeditor");
}

// In-app folder browser for remote connections (no native OS picker is
// possible over SSH). Reuses Wave's own file-suggestion control (the exact
// fuzzy-search + directory listing the "files" widget's address bar uses,
// backed by FetchSuggestionsCommand) instead of a hand-rolled input, so typing
// a path and browsing behave identically to the native file preview. Local
// connections skip this entirely and use the native folder picker instead (see
// openChangeRootFlow below).
const ChangeRootModal = memo(
    ({
        connection,
        initialPath,
        onClose,
        onSelect,
    }: {
        connection: string;
        initialPath: string;
        onClose: () => void;
        onSelect: (path: string) => void;
    }) => {
        const [currentDir, setCurrentDir] = useState(initialPath);
        const [isOpen, setIsOpen] = useState(true);
        const headerRef = useRef<HTMLDivElement>(null);

        const fetchSuggestionsFn = useCallback(
            async (query: string, ctx: SuggestionRequestContext): Promise<FetchSuggestionsResponse> => {
                const route = makeConnRoute(connection);
                if (ctx?.dispose) {
                    RpcApi.DisposeSuggestionsCommand(TabRpcClient, ctx.widgetid, { noresponse: true, route });
                    return null;
                }
                const sdata: FetchSuggestionsData = {
                    suggestiontype: "file",
                    "file:cwd": currentDir,
                    query,
                    widgetid: ctx.widgetid,
                    reqnum: ctx.reqnum,
                    "file:connection": connection,
                };
                const resp = await RpcApi.FetchSuggestionsCommand(TabRpcClient, sdata, { route });
                // The backend suggestion endpoint doesn't support a dirs-only
                // filter (file:dironly isn't wired up server-side), so filter
                // client-side — this picker is folders only.
                return {
                    ...resp,
                    suggestions: (resp?.suggestions ?? []).filter(
                        (s) => s["file:mimetype"] === "directory" || s.display === ".."
                    ),
                };
            },
            [currentDir, connection]
        );

        // Enter: a selected folder (or a typed path with none selected) becomes
        // the new current directory; the popup re-anchors to it automatically
        // (see the effect below) so browsing can continue without re-clicking.
        const handleSelect = useCallback(
            (s: SuggestionType, queryStr: string): boolean => {
                if (s == null) {
                    const typed = queryStr.trim();
                    if (!typed) {
                        return false;
                    }
                    const next =
                        typed.startsWith("/") || typed.startsWith("~")
                            ? typed
                            : `${currentDir.replace(/\/+$/, "")}/${typed}`;
                    setCurrentDir(next);
                    return true;
                }
                if (s["file:path"]) {
                    setCurrentDir(s["file:path"]);
                }
                return true;
            },
            [currentDir]
        );

        // Tab: autocomplete into a directory without leaving the popup, same as
        // the native file address bar.
        const handleTab = useCallback((s: SuggestionType, query: string): string => {
            if (s["file:mimetype"] === "directory") {
                return (s["file:name"] ?? "") + "/";
            }
            return s["file:name"] ?? query;
        }, []);

        // Enter/click closes the popup after committing a directory; reopen it
        // for the new one automatically so drilling down feels continuous.
        useEffect(() => setIsOpen(true), [currentDir]);

        return (
            <WaveModal
                title="Change Explorer Folder"
                description="Type to search, Tab to descend into a folder, Enter to select it."
                onCancel={onClose}
                onSubmit={() => onSelect(currentDir)}
                buttonLabel="Use This Folder"
            >
                <div className="cd-rootpicker">
                    <div className="cd-rootpicker-header" ref={headerRef} onClick={() => setIsOpen(true)}>
                        <i className={makeIconClass("folder-open", true)} />
                        <span>{currentDir}</span>
                    </div>
                    <SuggestionControl
                        key={currentDir}
                        anchorRef={headerRef}
                        isOpen={isOpen}
                        onClose={() => setIsOpen(false)}
                        onSelect={handleSelect}
                        onTab={handleTab}
                        fetchSuggestions={fetchSuggestionsFn}
                        placeholderText="Type to search folders…"
                    />
                </div>
            </WaveModal>
        );
    }
);
ChangeRootModal.displayName = "ChangeRootModal";

const ClusterdeckExplorerView = memo(({ model }: { blockId: string; model: ClusterdeckExplorerModel }) => {
    const connection = useAtomValue(model.connectionAtom);
    const rootPath = useAtomValue(model.rootPathAtom);
    const refreshVersion = useAtomValue(model.refreshVersion);
    const openFile = useAtomValue(model.openFileAtom);
    const gitStatus = useAtomValue(model.gitStatusAtom);
    const restoreExpandedIds = useAtomValue(model.expandedAtom);
    const [rootIds, setRootIds] = useState<string[]>([]);
    const [initialNodes, setInitialNodes] = useState<Record<string, TreeNodeData>>({});
    const [error, setError] = useState<string>(null);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setConnecting(!isLocalConnName(connection));
        fireAndForget(async () => {
            try {
                const nodes = await listDir(rootPath, connection, undefined, 1000);
                if (cancelled) {
                    return;
                }
                const map: Record<string, TreeNodeData> = {};
                for (const n of nodes) {
                    map[n.id] = n;
                }
                setInitialNodes(map);
                setRootIds(nodes.map((n) => n.id));
                setError(null);
                setConnecting(false);
            } catch (e) {
                if (!cancelled) {
                    setError(String(e));
                    setConnecting(false);
                }
            }
        });
        return () => {
            cancelled = true;
        };
    }, [connection, rootPath, refreshVersion]);

    // Apply the narrow default width once (after the layout is ready).
    useEffect(() => {
        const t = setTimeout(() => model.ensureDefaultWidth(), 150);
        return () => clearTimeout(t);
    }, [model]);

    // Refresh git decorations on load, on manual refresh, and on a light poll
    // (catches edits/saves/commits made anywhere).
    useEffect(() => {
        void model.refreshGitStatus();
        const iv = setInterval(() => void model.refreshGitStatus(), 5000);
        return () => clearInterval(iv);
    }, [model, connection, rootPath, refreshVersion]);

    const fetchDir = useCallback(
        async (id: string, limit: number) => {
            const nodes = await listDir(id, connection, id, limit);
            return { nodes, capped: nodes.length >= limit };
        },
        [connection]
    );

    const onOpenFile = useCallback(
        (_id: string, node: TreeNodeData) => {
            if (!node.isDirectory) {
                model.openInEditor(node.path ?? node.id);
            }
        },
        [model]
    );

    const [renameTarget, setRenameTarget] = useState<{ path: string; isDir: boolean } | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [showRootPicker, setShowRootPicker] = useState(false);

    // Local connections get the native OS folder picker (fast, familiar — the
    // same one "Open Folder" uses); remote connections get the in-app browser
    // since there's no native dialog for a remote filesystem.
    const openChangeRootFlow = useCallback(() => {
        if (isLocalConnName(connection)) {
            fireAndForget(async () => {
                const dir = await getApi().selectDirectory();
                if (dir) {
                    model.setRootPath(dir);
                }
            });
        } else {
            setShowRootPicker(true);
        }
    }, [connection, model]);

    const openRenameModal = useCallback((path: string, isDir: boolean) => {
        setRenameTarget({ path, isDir });
        setRenameValue(baseName(path));
    }, []);

    const submitRename = useCallback(() => {
        if (renameTarget != null) {
            const trimmed = renameValue.trim();
            if (trimmed && trimmed !== baseName(renameTarget.path)) {
                const dir = renameTarget.path.slice(0, renameTarget.path.lastIndexOf("/")) || rootPath;
                model.renameNode(renameTarget.path, `${dir}/${trimmed}`, renameTarget.isDir);
            }
        }
        setRenameTarget(null);
    }, [renameTarget, renameValue, model, rootPath]);

    // VS Code-style right-click menu for a tree row (file or folder).
    const buildNodeContextMenu = useCallback(
        (path: string, isDir: boolean): ContextMenuItem[] => {
            const dir = path.slice(0, path.lastIndexOf("/")) || rootPath;
            const createDir = isDir ? path : dir;
            const menu: ContextMenuItem[] = [];
            if (!isDir) {
                menu.push({ label: "Open", click: () => model.openInEditor(path) });
                menu.push({ type: "separator" });
            }
            menu.push(
                { label: "New File", click: () => model.newUntitledFile(createDir) },
                { label: "New Folder", click: () => model.newFolder(createDir) },
                { label: "Rename", click: () => openRenameModal(path, isDir) },
                { type: "separator" },
                { label: "Cut", click: () => model.cutNode(path, isDir) }
            );
            if (!isDir) {
                // Directory copying isn't supported by the backend yet.
                menu.push({ label: "Copy", click: () => model.copyNode(path, isDir) });
            }
            if (clipboardEntry != null) {
                menu.push({ label: "Paste", click: () => model.pasteInto(createDir) });
            }
            menu.push(
                { type: "separator" },
                { label: "Copy Path", click: () => fireAndForget(() => navigator.clipboard.writeText(path)) },
                {
                    label: "Copy Relative Path",
                    click: () => fireAndForget(() => navigator.clipboard.writeText(relativePath(path, rootPath))),
                },
                { type: "separator" }
            );
            if (isLocalConnName(connection)) {
                menu.push({ label: makeNativeLabel(true), click: () => getApi().openNativePath(createDir) });
                if (!isDir) {
                    menu.push({ label: makeNativeLabel(false), click: () => getApi().openNativePath(path) });
                }
            } else if (!isDir) {
                menu.push({
                    label: "Download File",
                    click: () => getApi().downloadFile(formatRemoteUri(path, connection)),
                });
            }
            menu.push({
                label: "Open Terminal Here",
                click: () =>
                    fireAndForget(async () => {
                        await createBlock({
                            meta: { view: "term", controller: "shell", "cmd:cwd": createDir, connection },
                        });
                    }),
            });
            menu.push({ type: "separator" }, { label: "Delete", click: () => model.deleteNode(path, isDir) });
            return menu;
        },
        [model, connection, rootPath, openRenameModal]
    );

    // Right-click on empty tree space: same New File/New Folder/Paste, rooted
    // at the explorer's root, plus Refresh.
    const buildBackgroundContextMenu = useCallback((): ContextMenuItem[] => {
        const menu: ContextMenuItem[] = [
            { label: "New File", click: () => model.newUntitledFile() },
            { label: "New Folder", click: () => model.newFolder() },
        ];
        if (clipboardEntry != null) {
            menu.push({ label: "Paste", click: () => model.pasteInto(rootPath) });
        }
        menu.push({ type: "separator" }, { label: "Refresh", click: () => model.refresh() });
        return menu;
    }, [model, rootPath]);

    // Right-click menu for an OPEN EDITORS row.
    const buildOpenEditorContextMenu = useCallback(
        (path: string): ContextMenuItem[] => {
            const menu: ContextMenuItem[] = [
                {
                    label: "Open in New Block",
                    click: () =>
                        fireAndForget(async () => {
                            await createBlock({ meta: { view: "preview", file: path, connection } });
                        }),
                },
            ];
            if (isLocalConnName(connection)) {
                menu.push({ label: makeNativeLabel(false), click: () => getApi().openNativePath(path) });
            } else {
                menu.push({
                    label: "Download File",
                    click: () => getApi().downloadFile(formatRemoteUri(path, connection)),
                });
            }
            menu.push(
                { type: "separator" },
                { label: "Copy Path", click: () => fireAndForget(() => navigator.clipboard.writeText(path)) },
                {
                    label: "Copy Relative Path",
                    click: () => fireAndForget(() => navigator.clipboard.writeText(relativePath(path, rootPath))),
                },
                { type: "separator" },
                { label: "Close", click: () => model.closeEditorFile(path) },
                { label: "Close Others", click: () => model.closeOtherEditorFiles(path) },
                { label: "Close All", click: () => model.closeAllEditorFiles() }
            );
            return menu;
        },
        [model, connection, rootPath]
    );

    const header = useMemo(() => baseName(rootPath).toUpperCase(), [rootPath]);
    const collapsed = useAtomValue(model.collapsedAtom);
    const openFiles = useAtomValue(model.openFilesAtom);

    if (collapsed) {
        return (
            <div className="cd-explorer collapsed" onClick={() => model.toggleCollapse()} title="Expand explorer">
                <i className={makeIconClass("angles-right", false)} />
            </div>
        );
    }

    return (
        <div className="cd-explorer">
            <div className="cd-explorer-header">
                <span className="cd-explorer-root">{header}</span>
                <span className="cd-explorer-actions">
                    <i
                        className={makeIconClass("folder-open", false)}
                        title="Change folder"
                        onClick={openChangeRootFlow}
                    />
                    <i
                        className={makeIconClass("file-circle-plus", false)}
                        title="New file"
                        onClick={() => model.newUntitledFile()}
                    />
                    <i
                        className={makeIconClass("arrows-rotate", false)}
                        title="Refresh"
                        onClick={() => model.refresh()}
                    />
                    <i
                        className={makeIconClass("angles-left", false)}
                        title="Collapse explorer"
                        onClick={() => model.toggleCollapse()}
                    />
                </span>
            </div>
            {openFiles.length > 0 && (
                <div className="cd-open-editors">
                    <div className="cd-open-editors-title">
                        <span>OPEN EDITORS</span>
                        <span className="cd-open-editors-actions">
                            <i
                                className={clsx(makeIconClass("file-circle-plus", true), "cd-open-editors-action")}
                                title="New file"
                                onClick={() => model.newUntitledFile()}
                            />
                            <i
                                className={clsx(makeIconClass("xmark", true), "cd-open-editors-action")}
                                title="Close all editors"
                                onClick={() => model.closeAllEditorFiles()}
                            />
                        </span>
                    </div>
                    {openFiles.map((f) => {
                        const style = fileStyle(baseName(f));
                        return (
                            <div
                                key={f}
                                className={clsx("cd-open-editor", { active: f === openFile })}
                                onClick={() => model.setActiveEditorFile(f)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    ContextMenuModel.getInstance().showContextMenu(buildOpenEditorContextMenu(f), e);
                                }}
                                title={f}
                            >
                                <i
                                    className={clsx(makeIconClass("xmark", true), "cd-open-editor-close")}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        model.closeEditorFile(f);
                                    }}
                                />
                                <i className={makeIconClass(style.icon, true)} style={{ color: style.color }} />
                                <span className="cd-open-editor-name">{baseName(f)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="cd-explorer-tree">
                {error != null ? (
                    <div className="cd-explorer-error">{error}</div>
                ) : connecting && rootIds.length === 0 ? (
                    <div className="cd-explorer-connecting">Connecting to {connection}…</div>
                ) : (
                    <TreeView
                        key={`${connection}:${rootPath}`}
                        rootIds={rootIds}
                        initialNodes={initialNodes}
                        fetchDir={fetchDir}
                        onOpenFile={onOpenFile}
                        hideDirIcons={true}
                        singleClickOpen={true}
                        activeId={openFile ?? undefined}
                        gitStatus={gitStatus}
                        restoreExpandedIds={restoreExpandedIds}
                        onExpandedChange={(ids) => model.persistExpanded(ids)}
                        persistKey={`${model.blockId}:${connection}:${rootPath}`}
                        refreshVersion={refreshVersion}
                        onContextMenu={(_id, node, e) => {
                            const path = node.path ?? node.id;
                            ContextMenuModel.getInstance().showContextMenu(
                                buildNodeContextMenu(path, node.isDirectory),
                                e
                            );
                        }}
                        onBackgroundContextMenu={(e) => {
                            ContextMenuModel.getInstance().showContextMenu(buildBackgroundContextMenu(), e);
                        }}
                        width="100%"
                        minWidth={0}
                        maxWidth={100000}
                        height="100%"
                    />
                )}
            </div>
            {renameTarget != null && (
                <WaveModal
                    title="Rename"
                    onSubmit={submitRename}
                    onCancel={() => setRenameTarget(null)}
                    buttonLabel="Rename"
                >
                    <Input
                        value={renameValue}
                        onChange={setRenameValue}
                        autoFocus={true}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                submitRename();
                            } else if (e.key === "Escape") {
                                setRenameTarget(null);
                            }
                        }}
                    />
                </WaveModal>
            )}
            {showRootPicker && (
                <ChangeRootModal
                    connection={connection}
                    initialPath={rootPath}
                    onClose={() => setShowRootPicker(false)}
                    onSelect={(path) => {
                        model.setRootPath(path);
                        setShowRootPicker(false);
                    }}
                />
            )}
        </div>
    );
});
ClusterdeckExplorerView.displayName = "ClusterdeckExplorerView";

export { ClusterdeckExplorerModel };
