// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { buildVisibleRows, findTypeaheadRowIndex, TreeNodeData, TreeView } from "@/app/treeview/treeview";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";

function makeNodes(entries: TreeNodeData[]): Map<string, TreeNodeData> {
    return new Map(entries.map((entry) => [entry.id, entry]));
}

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("treeview visible rows", () => {
    it("sorts directories before files and alphabetically", () => {
        const nodes = makeNodes([
            {
                id: "root",
                isDirectory: true,
                childrenStatus: "loaded",
                childrenIds: ["c", "a", "b"],
            },
            { id: "a", parentId: "root", isDirectory: false, label: "z-last.txt" },
            { id: "b", parentId: "root", isDirectory: true, label: "docs", childrenStatus: "loaded", childrenIds: [] },
            { id: "c", parentId: "root", isDirectory: false, label: "a-first.txt" },
        ]);
        const rows = buildVisibleRows(nodes, ["root"], new Set(["root"]));
        expect(rows.map((row) => row.id)).toEqual(["root", "b", "c", "a"]);
    });

    it("finds the next selectable label for wrapping type-ahead", () => {
        const rows = buildVisibleRows(
            makeNodes([
                { id: "alpha", isDirectory: false, label: "Alpha" },
                { id: "beta", isDirectory: false, label: "Beta" },
                { id: "bravo", isDirectory: false, label: "Bravo" },
            ]),
            ["alpha", "beta", "bravo"],
            new Set()
        );
        expect(findTypeaheadRowIndex(rows, 0, "br")).toBe(2);
        expect(findTypeaheadRowIndex(rows, 2, "a")).toBe(0);
        expect(findTypeaheadRowIndex(rows, 0, "missing")).toBeNull();
    });

    it("renders loading and capped synthetic rows", () => {
        const nodes = makeNodes([
            { id: "root", isDirectory: true, childrenStatus: "loading" },
            {
                id: "dir",
                isDirectory: true,
                childrenStatus: "capped",
                childrenIds: ["f1"],
                capInfo: { max: 1 },
            },
            { id: "f1", parentId: "dir", isDirectory: false, label: "one.txt" },
        ]);
        const loadingRows = buildVisibleRows(nodes, ["root"], new Set(["root"]));
        expect(loadingRows.map((row) => row.kind)).toEqual(["node", "loading"]);

        const cappedRows = buildVisibleRows(nodes, ["dir"], new Set(["dir"]));
        expect(cappedRows.map((row) => row.kind)).toEqual(["node", "node", "capped"]);
    });
});

describe("rendered tree interactions", () => {
    it("keeps the active descendant mounted through navigation, typeahead, and context-menu keys", async () => {
        const entries = Array.from({ length: 30 }, (_, index) => ({
            id: `file-${index.toString().padStart(2, "0")}`,
            label: index === 0 ? "Alpha" : index === 1 ? "Beta" : index === 2 ? "Charlie" : `Item ${index}`,
            isDirectory: false,
        }));
        const initialNodes = Object.fromEntries(entries.map((entry) => [entry.id, entry]));
        const onOpenFile = vi.fn();
        const onContextMenu = vi.fn();
        const itemElement = {
            getBoundingClientRect: () => ({ left: 10, bottom: 20 }),
        };
        const ownerDocument = {
            getElementById: () => itemElement,
            defaultView: undefined,
        };
        const treeElement = { focus: vi.fn(), ownerDocument };
        const scrollElement = {
            ownerDocument,
            scrollHeight: 720,
            scrollWidth: 300,
            scrollTop: 0,
            scrollLeft: 0,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getBoundingClientRect: () => ({ width: 300, height: 48, top: 0, left: 0 }),
            scrollTo: vi.fn(),
        };
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <TreeView
                    ariaLabel="Test files"
                    rootIds={entries.map((entry) => entry.id)}
                    initialNodes={initialNodes}
                    height={48}
                    rowHeight={24}
                    overscan={0}
                    onOpenFile={onOpenFile}
                    onContextMenu={onContextMenu}
                />,
                {
                    createNodeMock: (element) =>
                        (element.props as Record<string, unknown>).role === "tree" ? treeElement : scrollElement,
                }
            );
        });

        const getTree = () => renderer!.root.find((node) => node.props.role === "tree");
        const assertActiveDescendantMounted = () => {
            const activeId = getTree().props["aria-activedescendant"];
            expect(activeId).toBeTruthy();
            expect(renderer!.root.findAll((node) => node.props.id === activeId)).toHaveLength(1);
        };
        const press = async (key: string, options: { shiftKey?: boolean } = {}) => {
            const preventDefault = vi.fn();
            const stopPropagation = vi.fn();
            await act(async () =>
                getTree().props.onKeyDown({
                    key,
                    shiftKey: options.shiftKey ?? false,
                    altKey: false,
                    ctrlKey: false,
                    metaKey: false,
                    target: treeElement,
                    currentTarget: treeElement,
                    preventDefault,
                    stopPropagation,
                })
            );
            return { preventDefault, stopPropagation };
        };

        assertActiveDescendantMounted();
        await press("ArrowDown");
        expect(renderer!.root.find((node) => node.props.title === "Beta").parent!.props["aria-selected"]).toBe(true);
        assertActiveDescendantMounted();
        await press("c");
        expect(renderer!.root.find((node) => node.props.title === "Charlie").parent!.props["aria-selected"]).toBe(true);
        await press("End");
        assertActiveDescendantMounted();
        await press("Enter");
        expect(onOpenFile).toHaveBeenLastCalledWith("file-09", expect.objectContaining({ id: "file-09" }));

        const menuKey = await press("F10", { shiftKey: true });
        expect(menuKey.preventDefault).toHaveBeenCalledOnce();
        expect(menuKey.stopPropagation).toHaveBeenCalledOnce();
        expect(onContextMenu).toHaveBeenLastCalledWith(
            "file-09",
            expect.objectContaining({ id: "file-09" }),
            expect.objectContaining({ clientX: 10, clientY: 20 })
        );

        const outerMenuEvent = {
            target: treeElement,
            currentTarget: treeElement,
            clientX: 30,
            clientY: 40,
            preventDefault: vi.fn(),
        };
        getTree().props.onContextMenu(outerMenuEvent);
        expect(outerMenuEvent.preventDefault).toHaveBeenCalledOnce();
        expect(onContextMenu).toHaveBeenLastCalledWith(
            "file-09",
            expect.objectContaining({ id: "file-09" }),
            expect.objectContaining({ clientX: 30, clientY: 40 })
        );
        await act(async () => renderer!.unmount());
    });
});
