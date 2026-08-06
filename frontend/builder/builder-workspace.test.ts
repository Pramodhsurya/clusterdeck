// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderLayoutLoadCoordinator, BuilderLayoutWriter, normalizeBuilderLayout } from "./builder-workspace-model";

afterEach(() => vi.useRealTimers());

describe("normalizeBuilderLayout", () => {
    it("defaults absent, partial, corrupt, and non-finite layouts", () => {
        expect(normalizeBuilderLayout(null)).toEqual({ app: 80, build: 20 });
        expect(normalizeBuilderLayout({ app: 80 })).toEqual({ app: 80, build: 20 });
        expect(normalizeBuilderLayout({ app: Number.NaN, build: 20 })).toEqual({ app: 80, build: 20 });
        expect(normalizeBuilderLayout({ app: -1, build: 20 })).toEqual({ app: 80, build: 20 });
    });

    it("ignores legacy chat, normalizes to an exact complement, and enforces build constraints", () => {
        expect(normalizeBuilderLayout({ chat: 20, app: 60, build: 20 })).toEqual({ app: 75, build: 25 });
        const clampedLow = normalizeBuilderLayout({ app: 99, build: 1 });
        expect(clampedLow).toEqual({ app: 80, build: 20 });
        const clampedHigh = normalizeBuilderLayout({ app: 10, build: 90 });
        expect(clampedHigh).toEqual({ app: 50, build: 50 });
        const normalized = normalizeBuilderLayout({ app: 3, build: 2 });
        expect(normalized.app + normalized.build).toBe(100);
        expect(normalized).toEqual({ app: 60, build: 40 });
    });
});

describe("BuilderLayoutLoadCoordinator", () => {
    it("ignores an older builder load that resolves after the latest one", async () => {
        let resolveA!: (value: unknown) => void;
        let resolveB!: (value: unknown) => void;
        const a = new Promise<unknown>((resolve) => (resolveA = resolve));
        const b = new Promise<unknown>((resolve) => (resolveB = resolve));
        const coordinator = new BuilderLayoutLoadCoordinator();
        const loadA = coordinator.load("A", () => a);
        const loadB = coordinator.load("B", () => b);
        resolveB({ app: 60, build: 40 });
        await expect(loadB).resolves.toEqual({ app: 60, build: 40 });
        resolveA({ app: 70, build: 30 });
        await expect(loadA).resolves.toBeNull();
    });
});

describe("BuilderLayoutWriter", () => {
    it("coalesces saves and can flush the captured builder before lifecycle handoff", () => {
        vi.useFakeTimers();
        const save = vi.fn();
        const writer = new BuilderLayoutWriter(save, 500);
        writer.schedule("A", { app: 70, build: 30 });
        writer.schedule("A", { app: 65, build: 35 });
        vi.advanceTimersByTime(500);
        expect(save).toHaveBeenCalledOnce();
        expect(save).toHaveBeenCalledWith("A", { app: 65, build: 35 });

        writer.schedule("A", { app: 60, build: 40 });
        writer.flush();
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith("A", { app: 60, build: 40 });

        writer.schedule("B", { app: 55, build: 45 });
        writer.flush();
        vi.advanceTimersByTime(500);
        expect(save).toHaveBeenCalledTimes(3);
        expect(save).toHaveBeenLastCalledWith("B", { app: 55, build: 45 });
    });
});
