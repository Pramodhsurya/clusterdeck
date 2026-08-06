// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom, createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLayoutModel, clampVTabWidth, createWidgetsSidebarVisibleAtom } from "./workspace-layout-model";

afterEach(() => vi.useRealTimers());

function refs(initialWidth = 1000) {
    let width = initialWidth;
    const panel = { setLayout: vi.fn() };
    const container = {} as HTMLDivElement;
    Object.defineProperty(container, "clientWidth", { get: () => width });
    return { panel, container, setWidth: (next: number) => (width = next) };
}

describe("WorkspaceLayoutModel", () => {
    it("uses actual-container pixels, clamps, preserves pixels on resize, and supports one panel", () => {
        const saved = new Map([["A", 240]]);
        const model = new WorkspaceLayoutModel(vi.fn(), (id) => saved.get(id));
        const a = refs(1000);
        model.registerRefs(a.panel as never, a.container, true, "A");
        expect(a.panel.setLayout).toHaveBeenLastCalledWith([24, 76]);

        model.handlePanelLayout([5, 95], "A");
        expect(a.panel.setLayout).toHaveBeenLastCalledWith([11, 89]);
        expect(clampVTabWidth(50)).toBe(110);
        expect(clampVTabWidth(500)).toBe(280);

        a.setWidth(550);
        model.handleContainerResize();
        expect(a.panel.setLayout).toHaveBeenLastCalledWith([20, 80]);

        const narrow = refs(50);
        model.registerRefs(narrow.panel as never, narrow.container, true, "A");
        expect(narrow.panel.setLayout).toHaveBeenLastCalledWith([100, 0]);
        expect(model.getVTabInitialPercentage(50, true, "A")).toBe(100);

        const one = refs();
        model.registerRefs(one.panel as never, one.container, false, "A");
        expect(one.panel.setLayout).toHaveBeenLastCalledWith([100]);
        model.dispose();
    });

    it("flushes A before B and coalesces rapid writes with the captured workspace ID", () => {
        vi.useFakeTimers();
        const persist = vi.fn();
        const model = new WorkspaceLayoutModel(persist, () => null, 300);
        const a = refs();
        model.registerRefs(a.panel as never, a.container, true, "A");
        model.handlePanelLayout([20, 80], "A");
        model.handlePanelLayout([23, 77], "A");

        model.registerRefs(a.panel as never, a.container, true, "B");
        expect(persist).toHaveBeenCalledTimes(1);
        expect(persist).toHaveBeenCalledWith("A", 230);

        model.handlePanelLayout([19, 81], "A");
        model.handlePanelLayout([21, 79], "B");
        model.handlePanelLayout([22, 78], "B");
        vi.advanceTimersByTime(300);
        expect(persist).toHaveBeenLastCalledWith("B", 220);
        expect(persist).toHaveBeenCalledTimes(2);
        model.dispose();
    });

    it("tracks workspace identity when resolving widget visibility", () => {
        const workspaceId = atom("A");
        const visibility = { A: atom(false), B: atom(true) };
        const visible = createWidgetsSidebarVisibleAtom(workspaceId, (id) => visibility[id]);
        const store = createStore();
        expect(store.get(visible)).toBe(false);
        store.set(workspaceId, "B");
        expect(store.get(visible)).toBe(true);
        store.set(workspaceId, "");
        expect(store.get(visible)).toBe(true);
    });
});
