// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { WorkspaceRefreshCoordinator, WorkspaceSelectionCoordinator } from "./connectionsrail";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const workspace = (oid: string) =>
    ({
        oid,
        otype: "workspace",
        version: 1,
        tabids: [],
        activetabid: "",
        meta: { "clusterdeck:connection": "local" },
    }) as Workspace;

describe("WorkspaceSelectionCoordinator", () => {
    it("makes the last intent win when opens resolve in reverse order", async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const switchWorkspace = vi.fn();
        const coordinator = new WorkspaceSelectionCoordinator(
            switchWorkspace,
            async () => undefined,
            (target) => (target === "first" ? first.promise : second.promise),
            async () => "home"
        );
        coordinator.selectTarget("first");
        coordinator.selectTarget("second");
        second.resolve("B");
        await second.promise;
        first.resolve("A");
        await first.promise;
        await Promise.resolve();
        expect(switchWorkspace).toHaveBeenCalledOnce();
        expect(switchWorkspace).toHaveBeenCalledWith("B");
    });

    it("routes index selection through the same intent coordinator", () => {
        const switchWorkspace = vi.fn();
        const coordinator = new WorkspaceSelectionCoordinator(
            switchWorkspace,
            async () => undefined,
            async () => "target",
            async () => "home"
        );
        coordinator.selectByIndex([workspace("A"), workspace("B")], 2);
        expect(switchWorkspace).toHaveBeenCalledWith("B");
    });

    it("switches existing workspaces immediately despite recency rejection and invalidates pending opens", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const pending = deferred<string>();
        const switchWorkspace = vi.fn();
        const coordinator = new WorkspaceSelectionCoordinator(
            switchWorkspace,
            async () => {
                throw new Error("metadata unavailable");
            },
            async () => pending.promise,
            async () => "home"
        );
        coordinator.selectTarget("slow");
        coordinator.selectExisting("direct");
        expect(switchWorkspace).toHaveBeenCalledWith("direct");
        pending.resolve("stale");
        await pending.promise;
        await Promise.resolve();
        expect(switchWorkspace).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("WorkspaceRefreshCoordinator", () => {
    it("preserves list order and rejects stale or post-dispose refreshes", async () => {
        const oldList = deferred<Array<{ workspaceid: string }>>();
        const newList = deferred<Array<{ workspaceid: string }>>();
        let call = 0;
        const commit = vi.fn();
        const coordinator = new WorkspaceRefreshCoordinator(
            () => (++call === 1 ? oldList.promise : newList.promise),
            async (id) => workspace(id),
            commit
        );
        const oldRefresh = coordinator.refresh();
        const newRefresh = coordinator.refresh();
        newList.resolve([{ workspaceid: "B" }, { workspaceid: "C" }]);
        await newRefresh;
        oldList.resolve([{ workspaceid: "A" }]);
        await oldRefresh;
        expect(commit).toHaveBeenCalledOnce();
        expect(commit.mock.calls[0][0].map((ws: Workspace) => ws.oid)).toEqual(["B", "C"]);

        coordinator.dispose();
        await coordinator.refresh();
        expect(commit).toHaveBeenCalledOnce();
    });
});
