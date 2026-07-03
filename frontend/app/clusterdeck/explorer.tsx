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
import { WOS, refocusNode } from "@/store/global";
import { fireAndForget } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import "./explorer.scss";

function baseName(path: string): string {
    if (path === "~" || path === "") {
        return "Home";
    }
    const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

const CodeExts = new Set(["py", "js", "ts", "tsx", "jsx", "go", "rs", "java", "c", "cpp", "h", "sh", "rb"]);

function fileIcon(name: string, isDir: boolean): string {
    if (isDir) {
        return "folder";
    }
    const lower = name.toLowerCase();
    if (lower === "dockerfile") {
        return "brands@docker";
    }
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
    if (ext === "json") {
        return "brackets-curly";
    }
    if (ext === "md") {
        return "markdown";
    }
    if (CodeExts.has(ext)) {
        return "file-code";
    }
    return "file";
}

// List a directory over SFTP and map its entries to tree nodes. `parentId` is
// undefined for the top level so those rows render as roots.
async function listDir(path: string, connection: string, parentId: string | undefined, limit: number): Promise<TreeNodeData[]> {
    const uri = formatRemoteUri(path, connection);
    const files = await RpcApi.FileListCommand(TabRpcClient, { path: uri, opts: { limit } });
    return (files ?? [])
        .filter((f) => f.name && f.name !== "..")
        .map((f) => ({
            id: f.path,
            parentId,
            path: f.path,
            label: f.name,
            isDirectory: !!f.isdir,
            icon: fileIcon(f.name ?? "", !!f.isdir),
        }));
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
    }

    get viewComponent(): ViewComponent {
        return ClusterdeckExplorerView;
    }

    refresh() {
        globalStore.set(this.refreshVersion, globalStore.get(this.refreshVersion) + 1);
    }

    // Route a file into the designated editor-zone block in this tab (§3.5).
    openInEditor(path: string) {
        const tabId = this.tabModel?.tabId;
        if (tabId == null) {
            return;
        }
        const tab = globalStore.get(this.env.wos.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
        const editorId = tab?.blockids?.find((bid) => {
            if (bid === this.blockId) {
                return false;
            }
            const meta = globalStore.get(this.env.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", bid)))?.meta;
            return meta?.[ClusterdeckZoneMetaKey] === ClusterdeckZone_Editor;
        });
        if (editorId == null) {
            return;
        }
        fireAndForget(async () => {
            await RpcApi.SetMetaCommand(TabRpcClient, { oref: WOS.makeORef("block", editorId), meta: { file: path } });
            refocusNode(editorId);
        });
    }
}

const ClusterdeckExplorerView = memo(({ model }: { blockId: string; model: ClusterdeckExplorerModel }) => {
    const connection = useAtomValue(model.connectionAtom);
    const rootPath = useAtomValue(model.rootPathAtom);
    const refreshVersion = useAtomValue(model.refreshVersion);
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

    return (
        <div className="cd-explorer">
            <div className="cd-explorer-header">
                <span className="cd-explorer-root">{header}</span>
                <i
                    className="fa fa-sharp fa-solid fa-arrows-rotate cd-explorer-refresh"
                    title="Refresh"
                    onClick={() => model.refresh()}
                />
            </div>
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
                        width="100%"
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
});
ClusterdeckExplorerView.displayName = "ClusterdeckExplorerView";

export { ClusterdeckExplorerModel };
