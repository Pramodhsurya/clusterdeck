// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { makeIconClass } from "@/util/util";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import clsx from "clsx";
import {
    CSSProperties,
    KeyboardEvent,
    MouseEvent,
    forwardRef,
    useCallback,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";

type TreeNodeChildrenStatus = "unloaded" | "loading" | "loaded" | "error" | "capped";

export interface TreeNodeData {
    id: string;
    parentId?: string;
    label?: string;
    path?: string;
    isDirectory: boolean;
    mimeType?: string;
    icon?: string;
    iconColor?: string;
    isReadonly?: boolean;
    notfound?: boolean;
    staterror?: string;
    childrenStatus?: TreeNodeChildrenStatus;
    childrenIds?: string[];
    capInfo?: { max: number; totalKnown?: number };
}

interface FetchDirResult {
    nodes: TreeNodeData[];
    capped?: boolean;
    totalKnown?: number;
}

export interface TreeViewVisibleRow {
    id: string;
    parentId?: string;
    depth: number;
    kind: "node" | "loading" | "error" | "capped";
    label: string;
    isDirectory?: boolean;
    isExpanded?: boolean;
    hasChildren?: boolean;
    icon?: string;
    node?: TreeNodeData;
}

export interface TreeViewProps {
    /** Accessible name announced for the tree composite. */
    ariaLabel?: string;
    rootIds: string[];
    initialNodes: Record<string, TreeNodeData>;
    fetchDir?: (id: string, limit: number) => Promise<FetchDirResult>;
    maxDirEntries?: number;
    rowHeight?: number;
    indentWidth?: number;
    overscan?: number;
    minWidth?: number;
    maxWidth?: number;
    width?: number | string;
    hideDirIcons?: boolean;
    singleClickOpen?: boolean;
    activeId?: string;
    // Git decorations: absolute path -> "modified" | "added". Applied at render
    // time (files get a colored name + letter badge; folders roll up to a color).
    gitStatus?: Record<string, string>;
    // If set, the tree's loaded/expanded/selected state is cached under this key
    // and restored across re-mounts (so expansion survives parent re-renders).
    persistKey?: string;
    // Durable expansion: ids to expand on first mount (restored from backend meta
    // so the tree survives a full page reload / app restart, not just a re-mount).
    // Expanded-but-unloaded dirs are lazily fetched to rebuild the subtree.
    restoreExpandedIds?: string[];
    // Called (deduped) whenever the set of expanded ids changes, so the caller can
    // persist it. Not called for the initial restore.
    onExpandedChange?: (expandedIds: string[]) => void;
    height?: number | string;
    className?: string;
    onOpenFile?: (id: string, node: TreeNodeData) => void;
    onSelectionChange?: (id: string, node: TreeNodeData) => void;
    // Right-click on a node row (not fired for loading/error/capped rows). The
    // row is selected first, matching VS Code's right-click-selects behavior.
    onContextMenu?: (id: string, node: TreeNodeData, e: MouseEvent<HTMLDivElement>) => void;
    // Right-click on empty space below/around the rows (not on any node).
    onBackgroundContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
    // Bump this to force every already-loaded folder to refetch its children.
    // Without it, a folder's contents are fetched once and then cached for the
    // component's lifetime — a rename/delete/paste inside an already-expanded
    // folder would otherwise never show up until the whole tree remounts.
    refreshVersion?: number;
}

export interface TreeViewRef {
    scrollToId: (id: string) => void;
}

const DefaultRowHeight = 24;
const DefaultIndentWidth = 16;
const DefaultOverscan = 10;
const ChevronWidth = 24;

function normalizeLabel(node: TreeNodeData): string {
    if (node.label?.trim()) {
        return node.label;
    }
    const path = node.path ?? node.id;
    const chunks = path.split("/").filter(Boolean);
    return chunks[chunks.length - 1] ?? path;
}

function sortIdsByNode(nodesById: Map<string, TreeNodeData>, ids: string[]): string[] {
    return [...ids].sort((leftId, rightId) => {
        const left = nodesById.get(leftId);
        const right = nodesById.get(rightId);
        const leftDir = left?.isDirectory ? 0 : 1;
        const rightDir = right?.isDirectory ? 0 : 1;
        if (leftDir !== rightDir) {
            return leftDir - rightDir;
        }
        const leftLabel = normalizeLabel(left ?? { id: leftId, isDirectory: false }).toLocaleLowerCase();
        const rightLabel = normalizeLabel(right ?? { id: rightId, isDirectory: false }).toLocaleLowerCase();
        if (leftLabel !== rightLabel) {
            return leftLabel.localeCompare(rightLabel);
        }
        return leftId.localeCompare(rightId);
    });
}

export function buildVisibleRows(
    nodesById: Map<string, TreeNodeData>,
    rootIds: string[],
    expandedIds: Set<string>
): TreeViewVisibleRow[] {
    const rows: TreeViewVisibleRow[] = [];

    const appendNode = (id: string, depth: number) => {
        const node = nodesById.get(id);
        if (node == null) {
            return;
        }
        const childIds = node.childrenIds ?? [];
        const hasChildren = node.isDirectory && (childIds.length > 0 || node.childrenStatus !== "loaded");
        const isExpanded = expandedIds.has(id);
        rows.push({
            id,
            parentId: node.parentId,
            depth,
            kind: "node",
            label: normalizeLabel(node),
            isDirectory: node.isDirectory,
            isExpanded,
            hasChildren,
            icon: node.icon,
            node,
        });
        if (!isExpanded || !node.isDirectory) {
            return;
        }
        const status = node.childrenStatus ?? "unloaded";
        if (status === "loading") {
            rows.push({
                id: `${id}::__loading`,
                parentId: id,
                depth: depth + 1,
                kind: "loading",
                label: "Loading…",
            });
            return;
        }
        if (status === "error") {
            rows.push({
                id: `${id}::__error`,
                parentId: id,
                depth: depth + 1,
                kind: "error",
                label: node.staterror ? `Error: ${node.staterror}` : "Unable to load directory",
            });
            return;
        }

        const sortedChildren = sortIdsByNode(nodesById, childIds);
        sortedChildren.forEach((childId) => appendNode(childId, depth + 1));
        if (status === "capped") {
            const capMax = node.capInfo?.max ?? childIds.length;
            rows.push({
                id: `${id}::__capped`,
                parentId: id,
                depth: depth + 1,
                kind: "capped",
                label: `Showing first ${capMax} entries`,
            });
        }
    };

    sortIdsByNode(nodesById, rootIds).forEach((id) => appendNode(id, 0));
    return rows;
}

function getNodeIcon(node: TreeNodeData, isExpanded: boolean): string {
    if (node.notfound || node.staterror) {
        return "triangle-exclamation";
    }
    if (node.icon) {
        return node.icon;
    }
    if (node.isDirectory) {
        return isExpanded ? "folder-open" : "folder";
    }
    const mime = node.mimeType ?? "";
    if (mime.startsWith("image/")) {
        return "image";
    }
    if (mime === "application/pdf") {
        return "file-pdf";
    }
    const extension = normalizeLabel(node).split(".").pop()?.toLocaleLowerCase();
    if (
        ["js", "jsx", "ts", "tsx", "go", "py", "java", "c", "cpp", "h", "hpp", "json", "yaml", "yml"].includes(
            extension
        )
    ) {
        return "file-code";
    }
    if (["md", "txt", "log"].includes(extension)) {
        return "file-lines";
    }
    return "file";
}

function gitColor(status?: string): string | undefined {
    if (status === "modified") return "var(--cd-git-modified, #e2c08d)";
    if (status === "added") return "var(--cd-git-added, #4fa6ff)";
    return undefined;
}

export function findTypeaheadRowIndex(rows: TreeViewVisibleRow[], currentIndex: number, query: string): number | null {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery || rows.length === 0) return null;
    for (let offset = 1; offset <= rows.length; offset++) {
        const index = (Math.max(currentIndex, -1) + offset) % rows.length;
        const row = rows[index];
        if (row.kind === "node" && row.label.toLocaleLowerCase().startsWith(normalizedQuery)) return index;
    }
    return null;
}

type CachedTreeState = { nodesById: Map<string, TreeNodeData>; expandedIds: Set<string>; selectedId: string };
const treeStateCache = new Map<string, CachedTreeState>();

export const TreeView = forwardRef<TreeViewRef, TreeViewProps>((props, ref) => {
    const {
        ariaLabel = "File tree",
        rootIds,
        initialNodes,
        fetchDir,
        maxDirEntries = 500,
        rowHeight = DefaultRowHeight,
        indentWidth = DefaultIndentWidth,
        overscan = DefaultOverscan,
        minWidth = 100,
        maxWidth = 400,
        width = "100%",
        height = 360,
        className,
        hideDirIcons = false,
        singleClickOpen = false,
        activeId,
        gitStatus,
        persistKey,
        restoreExpandedIds,
        onExpandedChange,
        onOpenFile,
        onSelectionChange,
        onContextMenu,
        onBackgroundContextMenu,
        refreshVersion,
    } = props;
    const cached = persistKey ? treeStateCache.get(persistKey) : undefined;
    const [nodesById, setNodesById] = useState<Map<string, TreeNodeData>>(() =>
        cached
            ? new Map(cached.nodesById)
            : new Map(
                  Object.entries(initialNodes).map(([id, node]) => [
                      id,
                      { ...node, childrenStatus: node.childrenStatus ?? "unloaded" },
                  ])
              )
    );
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
        cached ? new Set(cached.expandedIds) : new Set(restoreExpandedIds ?? [])
    );
    const [selectedId, setSelectedId] = useState<string>(() => cached?.selectedId ?? rootIds[0]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const treeRef = useRef<HTMLDivElement>(null);
    const treeId = useId();
    const typeaheadRef = useRef("");
    const typeaheadTimeRef = useRef(0);

    // Persist state so it survives re-mounts (expansion holds when a file opens).
    useEffect(() => {
        if (persistKey) {
            treeStateCache.set(persistKey, { nodesById, expandedIds, selectedId });
        }
    }, [persistKey, nodesById, expandedIds, selectedId]);

    // Notify the caller of expansion changes (to persist durably to backend meta),
    // skipping the initial restore so we don't rewrite what we just read.
    const didMountExpandRef = useRef(false);
    useEffect(() => {
        if (!didMountExpandRef.current) {
            didMountExpandRef.current = true;
            return;
        }
        onExpandedChange?.([...expandedIds]);
    }, [expandedIds]);

    // Merge new root nodes without wiping already-loaded children (non-destructive).
    useEffect(() => {
        setNodesById((prev) => {
            const next = new Map(prev);
            for (const [id, node] of Object.entries(initialNodes)) {
                if (!next.has(id)) {
                    next.set(id, { ...node, childrenStatus: node.childrenStatus ?? "unloaded" });
                }
            }
            return next;
        });
    }, [initialNodes]);

    const visibleRows = useMemo(
        () => buildVisibleRows(nodesById, rootIds, expandedIds),
        [nodesById, rootIds, expandedIds]
    );
    const idToIndex = useMemo(() => new Map(visibleRows.map((row, index) => [row.id, index])), [visibleRows]);
    const selectedRowIndex = selectedId != null ? idToIndex.get(selectedId) : undefined;
    const rangeExtractor = useCallback(
        (range: Range) => {
            const indexes = defaultRangeExtractor(range);
            if (selectedRowIndex == null || indexes.includes(selectedRowIndex)) return indexes;
            return [...indexes, selectedRowIndex].sort((left, right) => left - right);
        },
        [selectedRowIndex]
    );
    const virtualizer = useVirtualizer({
        count: visibleRows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        initialRect: {
            width: typeof width === "number" ? width : maxWidth,
            height: typeof height === "number" ? height : 360,
        },
        overscan,
        rangeExtractor,
    });
    const virtualRows = virtualizer.getVirtualItems();
    const selectedRowIsMounted =
        selectedRowIndex != null && virtualRows.some((virtualRow) => virtualRow.index === selectedRowIndex);

    const commitSelection = (id: string) => {
        const node = nodesById.get(id);
        if (node == null) {
            return;
        }
        setSelectedId(id);
        onSelectionChange?.(id, node);
    };

    const scrollToId = (id: string) => {
        const index = idToIndex.get(id);
        if (index == null) {
            return;
        }
        virtualizer.scrollToIndex(index, { align: "auto" });
    };

    useImperativeHandle(
        ref,
        () => ({
            scrollToId,
        }),
        [idToIndex, virtualizer]
    );

    // Follow an externally-driven active node (e.g. the file open in the editor).
    useEffect(() => {
        if (activeId != null && nodesById.has(activeId)) {
            setSelectedId(activeId);
            scrollToId(activeId);
        }
    }, [activeId, nodesById]);

    const loadChildren = async (id: string) => {
        const currentNode = nodesById.get(id);
        if (
            currentNode == null ||
            !currentNode.isDirectory ||
            currentNode.notfound ||
            currentNode.staterror ||
            fetchDir == null
        ) {
            return;
        }
        const status = currentNode.childrenStatus ?? "unloaded";
        if (status !== "unloaded") {
            return;
        }
        setNodesById((prev) => {
            const next = new Map(prev);
            next.set(id, { ...currentNode, childrenStatus: "loading" });
            return next;
        });
        try {
            const result = await fetchDir(id, maxDirEntries);
            setNodesById((prev) => {
                const next = new Map(prev);
                result.nodes.forEach((node) => {
                    const merged: TreeNodeData = {
                        ...node,
                        parentId: node.parentId ?? id,
                        childrenStatus: node.childrenStatus ?? (node.isDirectory ? "unloaded" : "loaded"),
                    };
                    next.set(merged.id, merged);
                });
                const childrenIds = sortIdsByNode(
                    next,
                    result.nodes.map((entry) => entry.id)
                );
                const source = next.get(id) ?? currentNode;
                next.set(id, {
                    ...source,
                    childrenIds,
                    childrenStatus: result.capped ? "capped" : "loaded",
                    capInfo: result.capped ? { max: maxDirEntries, totalKnown: result.totalKnown } : undefined,
                });
                return next;
            });
        } catch (error) {
            setNodesById((prev) => {
                const next = new Map(prev);
                const source = next.get(id) ?? currentNode;
                next.set(id, {
                    ...source,
                    childrenStatus: "error",
                    staterror: error instanceof Error ? error.message : "Unknown error",
                });
                return next;
            });
        }
    };

    // Rebuild a restored subtree: lazily load any expanded-but-unloaded directory.
    // Loading a dir reveals its children; if one of those is also expanded, this
    // effect re-fires and loads it too, cascading down the restored paths.
    useEffect(() => {
        for (const id of expandedIds) {
            const node = nodesById.get(id);
            if (node?.isDirectory && (node.childrenStatus ?? "unloaded") === "unloaded") {
                loadChildren(id);
            }
        }
    }, [expandedIds, nodesById]);

    // Force every already-loaded folder to refetch when refreshVersion changes
    // (e.g. after a delete/rename/paste): loadChildren only ever fetches a given
    // folder once and then treats it as done for the component's lifetime, so
    // without this a change made inside an already-expanded folder would never
    // show up until the whole tree remounted. Resetting to "unloaded" is enough
    // — the effect above already refetches anything currently expanded.
    const didMountRefreshRef = useRef(false);
    useEffect(() => {
        if (refreshVersion == null) {
            return;
        }
        if (!didMountRefreshRef.current) {
            didMountRefreshRef.current = true;
            return;
        }
        setNodesById((prev) => {
            const next = new Map(prev);
            let changed = false;
            for (const [id, node] of prev) {
                if (node.isDirectory && (node.childrenStatus === "loaded" || node.childrenStatus === "capped")) {
                    next.set(id, { ...node, childrenStatus: "unloaded" });
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [refreshVersion]);

    const toggleExpand = (id: string) => {
        const node = nodesById.get(id);
        if (node == null || !node.isDirectory || node.notfound || node.staterror) {
            return;
        }
        const expanded = expandedIds.has(id);
        if (!expanded) {
            loadChildren(id);
        }
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (expanded) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
        scrollToId(id);
    };

    const selectVisibleNodeAt = (index: number) => {
        if (index < 0 || index >= visibleRows.length) {
            return;
        }
        const row = visibleRows[index];
        if (row.kind !== "node") {
            return;
        }
        commitSelection(row.id);
        scrollToId(row.id);
    };

    const dispatchSelectedContextMenu = (clientX = 0, clientY = 0): boolean => {
        if (selectedId == null || selectedRowIndex == null || !selectedRowIsMounted || treeRef.current == null)
            return false;
        const node = nodesById.get(selectedId);
        const item = treeRef.current.ownerDocument?.getElementById(`${treeId}-item-${selectedRowIndex}`);
        if (node == null || item == null) return false;
        const rect = item.getBoundingClientRect();
        const x = clientX || rect.left;
        const y = clientY || rect.bottom;
        const NativeMouseEvent = treeRef.current.ownerDocument?.defaultView?.MouseEvent;
        if (NativeMouseEvent != null && typeof item.dispatchEvent === "function") {
            item.dispatchEvent(
                new NativeMouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                })
            );
            return true;
        }
        const contextEvent = {
            clientX: x,
            clientY: y,
            currentTarget: item,
            target: item,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
        } as unknown as MouseEvent<HTMLDivElement>;
        onContextMenu?.(selectedId, node, contextEvent);
        return true;
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const selectedIndex = selectedId != null ? idToIndex.get(selectedId) : undefined;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            let index = (selectedIndex ?? (direction > 0 ? -1 : visibleRows.length)) + direction;
            while (index >= 0 && index < visibleRows.length) {
                if (visibleRows[index].kind === "node") {
                    selectVisibleNodeAt(index);
                    break;
                }
                index += direction;
            }
            return;
        }
        if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const start = event.key === "Home" ? 0 : visibleRows.length - 1;
            const direction = event.key === "Home" ? 1 : -1;
            for (let index = start; index >= 0 && index < visibleRows.length; index += direction) {
                if (visibleRows[index].kind === "node") {
                    selectVisibleNodeAt(index);
                    break;
                }
            }
            return;
        }
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            event.stopPropagation();
            dispatchSelectedContextMenu();
            return;
        }
        const node = selectedId ? nodesById.get(selectedId) : null;
        if (node == null) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (node.isDirectory) toggleExpand(node.id);
            else onOpenFile?.(node.id, node);
            return;
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (node.isDirectory && expandedIds.has(node.id)) {
                toggleExpand(node.id);
                return;
            }
            if (node.parentId != null) {
                commitSelection(node.parentId);
                scrollToId(node.parentId);
            }
            return;
        }
        if (event.key === "ArrowRight") {
            event.preventDefault();
            if (node.isDirectory && !expandedIds.has(node.id)) {
                toggleExpand(node.id);
                return;
            }
            if (node.isDirectory && expandedIds.has(node.id) && node.childrenIds?.[0]) {
                commitSelection(node.childrenIds[0]);
                scrollToId(node.childrenIds[0]);
            }
            return;
        }
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const now = Date.now();
            const nextBuffer = now - typeaheadTimeRef.current > 700 ? event.key : typeaheadRef.current + event.key;
            typeaheadTimeRef.current = now;
            typeaheadRef.current = nextBuffer;
            const repeatedCharacter = [...nextBuffer].every(
                (character) => character.toLocaleLowerCase() === event.key.toLocaleLowerCase()
            );
            const matchIndex = findTypeaheadRowIndex(
                visibleRows,
                selectedIndex ?? -1,
                repeatedCharacter ? event.key : nextBuffer
            );
            if (matchIndex != null) {
                event.preventDefault();
                selectVisibleNodeAt(matchIndex);
            }
        }
    };

    const containerStyle: CSSProperties = {
        width,
        minWidth,
        maxWidth,
        height,
    };

    return (
        <div
            ref={treeRef}
            className={clsx("rounded-md border border-border bg-panel", className)}
            style={containerStyle}
            role="tree"
            aria-label={ariaLabel}
            aria-activedescendant={
                selectedRowIndex != null && selectedRowIsMounted ? `${treeId}-item-${selectedRowIndex}` : undefined
            }
            tabIndex={0}
            onKeyDown={onKeyDown}
            onContextMenu={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                if (!dispatchSelectedContextMenu(event.clientX, event.clientY)) onBackgroundContextMenu?.(event);
            }}
        >
            <div ref={scrollRef} className="h-full overflow-auto">
                <div
                    className="relative w-max min-w-full"
                    style={{ height: virtualizer.getTotalSize(), minHeight: "100%" }}
                    onContextMenu={(e: MouseEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        onBackgroundContextMenu?.(e);
                    }}
                >
                    {virtualRows.map((virtualRow) => {
                        const row = visibleRows[virtualRow.index];
                        if (row.kind === "node" && row.node == null) {
                            return null;
                        }
                        const selected = row.id === selectedId;
                        const gitState = row.kind === "node" && row.node?.path ? gitStatus?.[row.node.path] : undefined;
                        const gs = gitState ? { status: gitState, color: gitColor(gitState) } : undefined;
                        return (
                            <div
                                key={row.id}
                                id={row.kind === "node" ? `${treeId}-item-${virtualRow.index}` : undefined}
                                role={row.kind === "node" ? "treeitem" : row.kind === "error" ? "alert" : "status"}
                                aria-live={
                                    row.kind === "node" ? undefined : row.kind === "error" ? "assertive" : "polite"
                                }
                                aria-level={row.kind === "node" ? row.depth + 1 : undefined}
                                aria-selected={row.kind === "node" ? selected : undefined}
                                aria-expanded={row.kind === "node" && row.isDirectory ? !!row.isExpanded : undefined}
                                className={clsx(
                                    "absolute left-0 right-0 flex items-center whitespace-nowrap text-sm",
                                    row.kind === "node" ? "cursor-pointer" : "text-muted",
                                    row.kind === "node" &&
                                        (selected
                                            ? "bg-accent/25 text-foreground"
                                            : "text-foreground hover:bg-muted/50")
                                )}
                                style={{
                                    top: 0,
                                    height: rowHeight,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                                onClick={() => {
                                    if (row.kind !== "node") {
                                        return;
                                    }
                                    treeRef.current?.focus();
                                    commitSelection(row.id);
                                    if (singleClickOpen) {
                                        if (row.isDirectory) {
                                            toggleExpand(row.id);
                                        } else if (row.node != null) {
                                            onOpenFile?.(row.id, row.node);
                                        }
                                    }
                                }}
                                onDoubleClick={() => {
                                    if (singleClickOpen || row.kind !== "node") {
                                        return;
                                    }
                                    if (row.isDirectory) {
                                        toggleExpand(row.id);
                                        return;
                                    }
                                    if (row.node != null) {
                                        onOpenFile?.(row.id, row.node);
                                    }
                                }}
                                onContextMenu={(e: MouseEvent<HTMLDivElement>) => {
                                    if (row.kind !== "node" || row.node == null) {
                                        return;
                                    }
                                    e.preventDefault();
                                    e.stopPropagation();
                                    commitSelection(row.id);
                                    onContextMenu?.(row.id, row.node, e);
                                }}
                            >
                                <div
                                    className="flex items-center"
                                    style={{
                                        paddingLeft: row.depth * indentWidth,
                                        width: ChevronWidth + row.depth * indentWidth,
                                    }}
                                >
                                    {row.kind === "node" && row.isDirectory && row.hasChildren ? (
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            className="h-6 w-6 rounded text-muted hover:text-foreground cursor-pointer"
                                            aria-label={`${row.isExpanded ? "Collapse" : "Expand"} ${row.label}`}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                                event.stopPropagation();
                                                treeRef.current?.focus();
                                                commitSelection(row.id);
                                                toggleExpand(row.id);
                                            }}
                                        >
                                            <i
                                                aria-hidden="true"
                                                className={clsx(
                                                    "fa-sharp fa-solid text-[11px]",
                                                    row.isExpanded ? "fa-chevron-down" : "fa-chevron-right"
                                                )}
                                            />
                                        </button>
                                    ) : (
                                        <span className="inline-block h-6 w-6" />
                                    )}
                                </div>
                                {row.kind === "node" ? (
                                    <>
                                        {hideDirIcons && row.node.isDirectory ? (
                                            <span className="inline-block h-4 w-4" />
                                        ) : (
                                            <i
                                                className={makeIconClass(getNodeIcon(row.node, row.isExpanded), true)}
                                                aria-hidden="true"
                                                style={{
                                                    color:
                                                        row.node.notfound || row.node.staterror
                                                            ? "var(--color-error)"
                                                            : (row.node.iconColor ?? "inherit"),
                                                }}
                                            />
                                        )}
                                        <span
                                            className={clsx("ml-2 pr-3", row.node.isReadonly && "text-muted")}
                                            style={gs ? { color: gs.color } : undefined}
                                            title={row.label}
                                        >
                                            {row.label}
                                        </span>
                                        {gs && !row.node.isDirectory && (
                                            <span
                                                className="ml-auto pr-2 text-[11px] font-semibold"
                                                style={{ color: gs.color }}
                                            >
                                                {gs.status === "modified" ? "M" : "U"}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <span className="ml-6 pr-3 text-xs">{row.label}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

TreeView.displayName = "TreeView";
