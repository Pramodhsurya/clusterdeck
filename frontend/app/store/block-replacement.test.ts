// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { replaceBlockWithPolicy } from "./block-replacement";

describe("replaceBlockWithPolicy", () => {
    it("leaves a protected original untouched without creating an orphan replacement", async () => {
        const create = vi.fn(async () => "new");
        const deleteNew = vi.fn(async () => undefined);
        const deleteOriginal = vi.fn();
        const commit = vi.fn(() => true);
        const result = await replaceBlockWithPolicy(
            {
                findTargetNodeId: () => "editor-node",
                canReplaceNode: () => false,
                commitReplacement: commit,
            },
            "editor",
            create,
            deleteNew,
            deleteOriginal
        );
        expect(result).toBe("editor");
        expect(create).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
        expect(deleteNew).not.toHaveBeenCalled();
        expect(deleteOriginal).not.toHaveBeenCalled();
    });

    it("deletes the original only after an accepted normal replacement", async () => {
        const deleteNew = vi.fn(async () => undefined);
        const deleteOriginal = vi.fn();
        const result = await replaceBlockWithPolicy(
            {
                findTargetNodeId: () => "term-node",
                canReplaceNode: () => true,
                commitReplacement: () => true,
            },
            "term",
            async () => "launcher",
            deleteNew,
            deleteOriginal
        );
        expect(result).toBe("launcher");
        expect(deleteNew).not.toHaveBeenCalled();
        expect(deleteOriginal).toHaveBeenCalledWith("term");
    });

    it("cleans up a newly created block if layout acceptance changes", async () => {
        const deleteNew = vi.fn(async () => undefined);
        const deleteOriginal = vi.fn();
        let checks = 0;
        const result = await replaceBlockWithPolicy(
            {
                findTargetNodeId: () => "term-node",
                canReplaceNode: () => ++checks === 1,
                commitReplacement: vi.fn(() => true),
            },
            "term",
            async () => "orphan",
            deleteNew,
            deleteOriginal
        );
        expect(result).toBe("term");
        expect(deleteNew).toHaveBeenCalledWith("orphan");
        expect(deleteOriginal).not.toHaveBeenCalled();
    });
});
