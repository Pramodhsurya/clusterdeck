// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createElement, forwardRef } from "react";

export type TabOrientation = "horizontal" | "vertical";

/** Returns the next tab index for an ARIA tablist navigation key. */
export function getTabNavigationIndex(
    currentIndex: number,
    tabCount: number,
    key: string,
    orientation: TabOrientation
): number | null {
    if (tabCount <= 0 || currentIndex < 0 || currentIndex >= tabCount) return null;
    if (key === "Home") return 0;
    if (key === "End") return tabCount - 1;
    const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (key === previousKey) return (currentIndex - 1 + tabCount) % tabCount;
    if (key === nextKey) return (currentIndex + 1) % tabCount;
    return null;
}

/**
 * Implements automatic-activation keyboard behavior for a tablist. Interactive
 * controls nested in a tab (rename fields and close buttons) remain independent.
 */
export function handleTabListKeyDown(event: ReactKeyboardEvent<HTMLElement>, orientation: TabOrientation): void {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>('[role="tab"]');
    if (tab == null || !event.currentTarget.contains(tab)) return;
    if (target !== tab && target.closest("button, input, textarea, [role='textbox']") != null) return;

    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
        (candidate) => !candidate.hasAttribute("disabled") && candidate.getAttribute("aria-disabled") !== "true"
    );
    const currentIndex = tabs.indexOf(tab);
    const nextIndex = getTabNavigationIndex(currentIndex, tabs.length, event.key, orientation);
    if (nextIndex != null) {
        event.preventDefault();
        event.stopPropagation();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
        return;
    }
    if ((event.key === "Enter" || event.key === " ") && target === tab) {
        event.preventDefault();
        event.stopPropagation();
        tab.click();
    }
}

export interface AccessibleTabListProps extends HTMLAttributes<HTMLDivElement> {
    orientation: TabOrientation;
}

/** Shared semantic wrapper used by every application/editor tab consumer. */
export const AccessibleTabList = forwardRef<HTMLDivElement, AccessibleTabListProps>(
    ({ orientation, onKeyDown, ...props }, ref) =>
        createElement("div", {
            ...props,
            ref,
            role: "tablist",
            "aria-orientation": orientation,
            onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
                onKeyDown?.(event);
                if (!event.defaultPrevented) handleTabListKeyDown(event, orientation);
            },
        })
);
AccessibleTabList.displayName = "AccessibleTabList";
