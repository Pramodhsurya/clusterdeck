// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { LayoutModel } from "../lib/layoutModel";
import { DropDirection, FlexDirection, LayoutTreeActionType, LayoutTreeComputeMoveNodeAction } from "../lib/types";

function leaf(id: string, blockId: string) {
    return { id, data: { blockId }, flexDirection: FlexDirection.Row, size: 10 };
}

function root() {
    return {
        id: "root",
        flexDirection: FlexDirection.Row,
        size: 10,
        children: [leaf("protected", "editor"), leaf("ordinary", "term")],
    };
}

describe("LayoutModel mutation policies", () => {
    it("denies protected close before tree mutation and backend deletion", async () => {
        const onNodeDelete = vi.fn(async () => undefined);
        const treeReducer = vi.fn();
        const model = Object.assign(Object.create(LayoutModel.prototype), {
            treeState: { rootNode: root() },
            canCloseNode: (data: TabLayoutData) => data.blockId !== "editor",
            treeReducer,
            onNodeDelete,
            magnifiedNodeId: undefined,
        }) as LayoutModel;

        expect(model.canReplaceNode("protected")).toBe(false);
        expect(model.canReplaceNode("ordinary")).toBe(true);
        await expect(model.closeNode("protected")).resolves.toBe(false);
        expect(treeReducer).not.toHaveBeenCalled();
        expect(onNodeDelete).not.toHaveBeenCalled();

        await expect(model.closeNode("ordinary")).resolves.toBe(true);
        expect(treeReducer).toHaveBeenCalledWith(expect.objectContaining({ type: LayoutTreeActionType.DeleteNode }));
        expect(onNodeDelete).toHaveBeenCalledWith({ blockId: "term" });
    });

    it("clears protected source/target drag computations while ordinary moves remain available", () => {
        const setter = vi.fn();
        const model = Object.assign(Object.create(LayoutModel.prototype), {
            treeState: { rootNode: root(), pendingBackendActions: [] },
            canCloseNode: () => true,
            canMoveNode: (source: TabLayoutData, target?: TabLayoutData) =>
                source?.blockId !== "editor" && target?.blockId !== "editor",
            setter,
            pendingTreeAction: { throttledValueAtom: {} },
            magnifiedNodeId: undefined,
        }) as LayoutModel;

        model.treeReducer(
            {
                type: LayoutTreeActionType.ComputeMove,
                nodeId: "ordinary",
                nodeToMoveId: "protected",
                direction: DropDirection.Left,
            } as LayoutTreeComputeMoveNodeAction,
            false
        );
        expect(setter).toHaveBeenLastCalledWith(expect.anything(), undefined);

        model.treeReducer(
            {
                type: LayoutTreeActionType.ComputeMove,
                nodeId: "protected",
                nodeToMoveId: "ordinary",
                direction: DropDirection.Left,
            } as LayoutTreeComputeMoveNodeAction,
            false
        );
        expect(setter).toHaveBeenLastCalledWith(expect.anything(), undefined);

        model.canMoveNode = () => true;
        model.treeReducer(
            {
                type: LayoutTreeActionType.ComputeMove,
                nodeId: "protected",
                nodeToMoveId: "ordinary",
                direction: DropDirection.Left,
            } as LayoutTreeComputeMoveNodeAction,
            false
        );
        expect(setter).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ type: LayoutTreeActionType.Move })
        );
    });
});
