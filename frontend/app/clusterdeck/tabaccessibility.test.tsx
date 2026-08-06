// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { act, create, ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AccessibleTabList } from "../tab/tabaccessibility";
import { ClusterdeckFileTab } from "./filetabs";

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function assertTabCloseOrder(renderer: ReactTestRenderer, activeLabel: string, inactiveLabel: string) {
    const nodes = renderer.root.findAll(() => true);
    const activeTab = renderer.root.find(
        (node) => node.props.role === "tab" && node.props["aria-label"] === activeLabel
    );
    const activeClose = renderer.root.findByProps({ "aria-label": `Close ${activeLabel}` });
    const inactiveTab = renderer.root.find(
        (node) => node.props.role === "tab" && node.props["aria-label"] === inactiveLabel
    );
    const inactiveClose = renderer.root.findByProps({ "aria-label": `Close ${inactiveLabel}` });
    expect(nodes.indexOf(activeTab)).toBeLessThan(nodes.indexOf(activeClose));
    expect(nodes.indexOf(inactiveTab)).toBeLessThan(nodes.indexOf(inactiveClose));
    expect(activeTab.props.tabIndex).toBe(0);
    expect(activeClose.props.tabIndex).toBe(0);
    expect(inactiveTab.props.tabIndex).toBe(-1);
    expect(inactiveClose.props.tabIndex).toBe(-1);
    return { activeTab, activeClose };
}

describe("rendered Clusterdeck file tabs", () => {
    for (const [variant, orientation] of [
        ["editor", "horizontal"],
        ["open-editor", "vertical"],
    ] as const) {
        it(`wires ${variant} selection before its isolated close control`, async () => {
            const onSelect = vi.fn();
            const onClose = vi.fn();
            let renderer: ReactTestRenderer;
            await act(async () => {
                renderer = create(
                    <AccessibleTabList aria-label={`${variant} tabs`} orientation={orientation}>
                        <ClusterdeckFileTab
                            variant={variant}
                            path="/tmp/alpha.ts"
                            label="alpha.ts"
                            icon="file-code"
                            iconColor="#fff"
                            active={true}
                            onSelect={onSelect}
                            onClose={onClose}
                        />
                        <ClusterdeckFileTab
                            variant={variant}
                            path="/tmp/beta.ts"
                            label="beta.ts"
                            icon="file-code"
                            iconColor="#fff"
                            active={false}
                            onSelect={onSelect}
                            onClose={onClose}
                        />
                    </AccessibleTabList>
                );
            });
            expect(renderer!.root.findByProps({ role: "tablist" }).props["aria-orientation"]).toBe(orientation);
            const { activeTab, activeClose } = assertTabCloseOrder(renderer!, "alpha.ts", "beta.ts");
            activeTab.props.onClick();
            expect(onSelect).toHaveBeenCalledOnce();
            const closeEvent = { stopPropagation: vi.fn() };
            activeClose.props.onMouseDown(closeEvent);
            activeClose.props.onClick(closeEvent);
            expect(closeEvent.stopPropagation).toHaveBeenCalledTimes(2);
            expect(onClose).toHaveBeenCalledOnce();
            expect(onSelect).toHaveBeenCalledOnce();
            await act(async () => renderer!.unmount());
        });
    }
});
