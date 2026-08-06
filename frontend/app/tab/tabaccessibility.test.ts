// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { getTabNavigationIndex, handleTabListKeyDown } from "./tabaccessibility";

describe("ARIA tablist keyboard navigation", () => {
    it("wraps directional navigation for each orientation", () => {
        expect(getTabNavigationIndex(0, 3, "ArrowLeft", "horizontal")).toBe(2);
        expect(getTabNavigationIndex(2, 3, "ArrowRight", "horizontal")).toBe(0);
        expect(getTabNavigationIndex(0, 3, "ArrowUp", "vertical")).toBe(2);
        expect(getTabNavigationIndex(2, 3, "ArrowDown", "vertical")).toBe(0);
    });

    it("supports Home and End and ignores the other orientation's arrows", () => {
        expect(getTabNavigationIndex(1, 3, "Home", "horizontal")).toBe(0);
        expect(getTabNavigationIndex(1, 3, "End", "vertical")).toBe(2);
        expect(getTabNavigationIndex(1, 3, "ArrowDown", "horizontal")).toBeNull();
        expect(getTabNavigationIndex(1, 3, "ArrowRight", "vertical")).toBeNull();
    });

    it("focuses and activates the destination tab", () => {
        const makeTab = () => ({
            closest: () => null as unknown,
            focus: vi.fn(),
            click: vi.fn(),
            hasAttribute: () => false,
            getAttribute: () => null,
        });
        const tabs = [makeTab(), makeTab(), makeTab()];
        tabs[0].closest = () => tabs[0];
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const event = {
            key: "ArrowLeft",
            target: tabs[0],
            currentTarget: {
                contains: () => true,
                querySelectorAll: () => tabs,
            },
            preventDefault,
            stopPropagation,
        } as unknown as Parameters<typeof handleTabListKeyDown>[0];

        handleTabListKeyDown(event, "horizontal");

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(tabs[2].focus).toHaveBeenCalledOnce();
        expect(tabs[2].click).toHaveBeenCalledOnce();
    });
});
