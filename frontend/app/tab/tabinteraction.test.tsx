// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TabV } from "./tab";
import { AccessibleTabList, TabOrientation } from "./tabaccessibility";
import { VTab } from "./vtab";

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const Items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Charlie" },
];

function TabHarness({ orientation = "horizontal" }: { orientation?: TabOrientation }) {
    const [activeId, setActiveId] = React.useState("a");
    return (
        <AccessibleTabList aria-label="Test tabs" orientation={orientation}>
            {Items.map((tab) => (
                <VTab
                    key={tab.id}
                    tab={tab}
                    active={activeId === tab.id}
                    isDragging={false}
                    isReordering={false}
                    onSelect={() => setActiveId(tab.id)}
                    onClose={() => undefined}
                    onDragStart={() => undefined}
                    onDragOver={() => undefined}
                    onDrop={() => undefined}
                    onDragEnd={() => undefined}
                />
            ))}
        </AccessibleTabList>
    );
}

function makeKeyEvent(renderer: ReactTestRenderer, key: string, targetIndex: number) {
    const tabInstances = renderer.root.findAll((node) => node.props.role === "tab");
    const domTabs = tabInstances.map((instance) => {
        const tab = {
            closest: () => tab,
            focus: vi.fn(),
            click: () => instance.parent!.props.onClick(),
            hasAttribute: () => false,
            getAttribute: () => null,
        };
        return tab;
    });
    return {
        key,
        target: domTabs[targetIndex],
        currentTarget: {
            contains: () => true,
            querySelectorAll: () => domTabs,
        },
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation: vi.fn(),
        domTabs,
    };
}

function selectedLabel(renderer: ReactTestRenderer): string {
    return renderer.root.find((node) => node.props.role === "tab" && node.props["aria-selected"] === true).props[
        "aria-label"
    ];
}

describe("rendered application tab interactions", () => {
    it("wires role, roving state, Arrow/Home/End, and Enter/Space activation", async () => {
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(<TabHarness />);
        });
        const tablist = renderer!.root.find((node) => node.props.role === "tablist");
        expect(tablist.props["aria-orientation"]).toBe("horizontal");
        expect(renderer!.root.findAll((node) => node.props.role === "tab").map((node) => node.props.tabIndex)).toEqual([
            0, -1, -1,
        ]);

        for (const [key, targetIndex, expected] of [
            ["ArrowRight", 0, "Beta"],
            ["End", 1, "Charlie"],
            ["Home", 2, "Alpha"],
            [" ", 2, "Charlie"],
            ["Enter", 1, "Beta"],
        ] as const) {
            const event = makeKeyEvent(renderer!, key, targetIndex);
            await act(async () => tablist.props.onKeyDown(event));
            expect(event.defaultPrevented).toBe(true);
            expect(selectedLabel(renderer!)).toBe(expected);
        }
        await act(async () => renderer!.unmount());
    });

    it("renders the horizontal tab before only its selected close in sequential focus", async () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();
        const onDragStart = vi.fn();
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AccessibleTabList aria-label="Horizontal tabs" orientation="horizontal">
                    <TabV
                        tabId="one"
                        tabName="One"
                        active={true}
                        showDivider={false}
                        isDragging={false}
                        tabWidth={130}
                        isNew={false}
                        onClick={onSelect}
                        onClose={onClose}
                        onDragStart={onDragStart}
                        onContextMenu={() => undefined}
                        onRename={() => undefined}
                    />
                </AccessibleTabList>
            );
        });
        const tab = renderer!.root.find((node) => node.props.role === "tab");
        const close = renderer!.root.findByType("button");
        const allNodes = renderer!.root.findAll(() => true);
        expect(allNodes.indexOf(tab)).toBeLessThan(allNodes.indexOf(close));
        expect(tab.props.tabIndex).toBe(0);
        expect(close.props.tabIndex).toBe(0);

        const mouseDown = { stopPropagation: vi.fn() };
        close.props.onMouseDown(mouseDown);
        close.props.onClick(null);
        expect(mouseDown.stopPropagation).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(onSelect).not.toHaveBeenCalled();
        expect(onDragStart).not.toHaveBeenCalled();
        await act(async () => renderer!.unmount());
    });

    it("orders the selected vertical tab before its close and isolates close from selection and drag", async () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();
        const onDragStart = vi.fn();
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AccessibleTabList aria-label="One tab" orientation="vertical">
                    <VTab
                        tab={{ id: "a", name: "Alpha" }}
                        active={true}
                        isDragging={false}
                        isReordering={false}
                        onSelect={onSelect}
                        onClose={onClose}
                        onDragStart={onDragStart}
                        onDragOver={() => undefined}
                        onDrop={() => undefined}
                        onDragEnd={() => undefined}
                    />
                    <VTab
                        tab={{ id: "b", name: "Beta" }}
                        active={false}
                        isDragging={false}
                        isReordering={false}
                        onSelect={onSelect}
                        onClose={onClose}
                        onDragStart={onDragStart}
                        onDragOver={() => undefined}
                        onDrop={() => undefined}
                        onDragEnd={() => undefined}
                    />
                </AccessibleTabList>
            );
        });
        const allNodes = renderer!.root.findAll(() => true);
        const selectedTab = renderer!.root.find((node) => node.props.role === "tab" && node.props["aria-selected"]);
        const closes = renderer!.root.findAllByType("button");
        expect(allNodes.indexOf(selectedTab)).toBeLessThan(allNodes.indexOf(closes[0]));
        expect(closes.map((button) => button.props.tabIndex)).toEqual([0, -1]);
        expect(closes[0].props.className).toContain("focus-visible:opacity-100");

        const mouseDown = { stopPropagation: vi.fn() };
        const dragStart = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
        const click = { stopPropagation: vi.fn() };
        closes[0].props.onMouseDown(mouseDown);
        closes[0].props.onDragStart(dragStart);
        closes[0].props.onClick(click);
        expect(mouseDown.stopPropagation).toHaveBeenCalledOnce();
        expect(dragStart.preventDefault).toHaveBeenCalledOnce();
        expect(dragStart.stopPropagation).toHaveBeenCalledOnce();
        expect(click.stopPropagation).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(onSelect).not.toHaveBeenCalled();
        expect(onDragStart).not.toHaveBeenCalled();
        await act(async () => renderer!.unmount());
    });
});
