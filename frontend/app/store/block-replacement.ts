// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type BlockReplacementAdapter = {
    findTargetNodeId: (blockId: string) => string | undefined;
    canReplaceNode: (nodeId: string) => boolean;
    commitReplacement: (targetNodeId: string, newBlockId: string) => boolean;
};

/**
 * Creates and deletes blocks only around a layout-accepted replacement.
 * A policy denial is a side-effect-free no-op. A rejection after creation
 * cleans up only the newly created block and leaves the original untouched.
 */
export async function replaceBlockWithPolicy(
    adapter: BlockReplacementAdapter,
    blockId: string,
    createNewBlock: () => Promise<string>,
    deleteNewBlock: (blockId: string) => Promise<void>,
    deleteAcceptedOriginal: (blockId: string) => void
): Promise<string> {
    const initialTargetNodeId = adapter.findTargetNodeId(blockId);
    if (initialTargetNodeId == null) throw new Error(`targetNodeId not found for blockId: ${blockId}`);
    if (!adapter.canReplaceNode(initialTargetNodeId)) return blockId;

    const newBlockId = await createNewBlock();
    const targetNodeId = adapter.findTargetNodeId(blockId);
    const accepted =
        targetNodeId === initialTargetNodeId &&
        adapter.canReplaceNode(targetNodeId) &&
        adapter.commitReplacement(targetNodeId, newBlockId);
    if (!accepted) {
        await deleteNewBlock(newBlockId);
        return blockId;
    }

    deleteAcceptedOriginal(blockId);
    return newBlockId;
}
