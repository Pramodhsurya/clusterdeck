// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Clusterdeck explorer — a VS Code–style file tree (change #6, Phase 1). A new
// isolated block view ("cdexplorer") so Wave's own directory view is untouched.
// It lists the workspace folder's contents as a lazy-loading tree over SFTP and
// routes file clicks into the designated editor block (§3.5).

import { BlockNodeModel } from "@/app/block/blocktypes";
import { ClusterdeckZone_Editor, ClusterdeckZoneMetaKey } from "@/app/clusterdeck/connlock";
import { globalStore } from "@/app/store/jotaiStore";
import type { TabModel } from "@/app/store/tab-model";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { TreeNodeData, TreeView } from "@/app/treeview/treeview";
import { getLayoutModelForStaticTab, LayoutTreeActionType, type LayoutTreeResizeNodeAction } from "@/layout/index";
import { WOS, refocusNode } from "@/store/global";
import { fireAndForget, makeIconClass } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import clsx from "clsx";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

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

// List a directory over SFTP and map its entries to tree nodes. `parentId` is
// undefined for the top level so those rows render as roots.
async function listDir(path: string, connection: string, parentId: string | undefined, limit: number): Promise<TreeNodeData[]> {
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
    refreshVersion = jotai.atom(0);

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
    }

    // Resize the explorer's layout node to sizePercent (0-100) of its row,
    // sharing the rest among its siblings. Returns false if the node wasn't
    // found (e.g. the layout isn't ready or was rearranged).
    resizeExplorer(sizePercent: number): boolean {
        const lm = getLayoutModelForStaticTab();
        const children = lm?.treeState?.rootNode?.children;
        if (!children) {
            return false;
        }
        const explorerNode = children.find((n) => n.data?.blockId === this.blockId);
        const others = children.filter((n) => n.id !== explorerNode?.id);
        if (explorerNode == null || others.length === 0) {
            return false;
        }
        const rest = (100 - sizePercent) / others.length;
        const action: LayoutTreeResizeNodeAction = {
            type: LayoutTreeActionType.ResizeNode,
            resizeOperations: [
                { nodeId: explorerNode.id, size: sizePercent },
                ...others.map((n) => ({ nodeId: n.id, size: rest })),
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

    // Route a file into the editor block (§3.5), adding it to OPEN EDITORS (E#).
    openInEditor(path: string) {
        const e = this.editorMetaNow();
        if (e == null) {
            return;
        }
        const openFiles = (e.meta?.["clusterdeck:openfiles"] as string[]) ?? [];
        const next = openFiles.includes(path) ? openFiles : [...openFiles, path];
        fireAndForget(async () => {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", e.editorId),
                meta: { file: path, "clusterdeck:openfiles": next } as MetaType,
            });
            refocusNode(e.editorId);
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
}

const ClusterdeckExplorerView = memo(({ model }: { blockId: string; model: ClusterdeckExplorerModel }) => {
    const connection = useAtomValue(model.connectionAtom);
    const rootPath = useAtomValue(model.rootPathAtom);
    const refreshVersion = useAtomValue(model.refreshVersion);
    const openFile = useAtomValue(model.openFileAtom);
    const [rootIds, setRootIds] = useState<string[]>([]);
    const [initialNodes, setInitialNodes] = useState<Record<string, TreeNodeData>>({});
    const [error, setError] = useState<string>(null);

    useEffect(() => {
        let cancelled = false;
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
            } catch (e) {
                if (!cancelled) {
                    setError(String(e));
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
                    <div className="cd-open-editors-title">OPEN EDITORS</div>
                    {openFiles.map((f) => {
                        const style = fileStyle(baseName(f));
                        return (
                            <div
                                key={f}
                                className={clsx("cd-open-editor", { active: f === openFile })}
                                onClick={() => model.setActiveEditorFile(f)}
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
                        width="100%"
                        minWidth={0}
                        maxWidth={100000}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
});
ClusterdeckExplorerView.displayName = "ClusterdeckExplorerView";

export { ClusterdeckExplorerModel };
