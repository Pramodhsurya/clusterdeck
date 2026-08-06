// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigStringField } from "./configwidgets";

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const baseProps = {
    configKey: "test:key",
    label: "Test field",
    defaultValue: "inherited",
    validation: { required: true },
};

async function renderField(props: Partial<React.ComponentProps<typeof ConfigStringField>> = {}) {
    let renderer: ReactTestRenderer;
    await act(async () => {
        renderer = create(<ConfigStringField {...baseProps} onValueChange={vi.fn()} {...props} />);
    });
    return renderer!;
}

describe("ConfigStringField", () => {
    it("keeps a pristine inherited required field error-free until edited", async () => {
        const onValueChange = vi.fn();
        const renderer = await renderField({ onValueChange });
        let input = renderer.root.findByType("input");
        expect(input.props.value).toBe("");
        expect(input.props["aria-invalid"]).toBe(false);
        expect(JSON.stringify(renderer.toJSON())).not.toContain("Required");

        await act(async () => input.props.onChange({ target: { value: "" } }));
        input = renderer.root.findByType("input");
        expect(input.props["aria-invalid"]).toBe(true);
        expect(JSON.stringify(renderer.toJSON())).toContain("Required");
        expect(onValueChange).not.toHaveBeenCalled();

        await act(async () => input.props.onChange({ target: { value: "  corrected  " } }));
        expect(onValueChange).toHaveBeenCalledOnce();
        expect(onValueChange).toHaveBeenCalledWith("corrected");
        expect(renderer.root.findByType("input").props["aria-invalid"]).toBe(false);
        await act(async () => renderer.unmount());
    });

    it("Use Default clears an invalid draft and its touched error", async () => {
        const onValueChange = vi.fn();
        const renderer = await renderField({ value: "override", onValueChange });
        let input = renderer.root.findByType("input");
        await act(async () => input.props.onChange({ target: { value: "" } }));
        expect(renderer.root.findByType("input").props["aria-invalid"]).toBe(true);

        const useDefault = renderer.root
            .findAllByType("button")
            .find((button) => button.children.includes("Use Default"));
        expect(useDefault).toBeDefined();
        await act(async () => useDefault!.props.onClick());
        input = renderer.root.findByType("input");
        expect(input.props.value).toBe("");
        expect(input.props["aria-invalid"]).toBe(false);
        expect(JSON.stringify(renderer.toJSON())).not.toContain("Required");
        expect(onValueChange).toHaveBeenLastCalledWith(undefined);
        await act(async () => renderer.unmount());
    });

    it("resynchronizes a changed prop and resets touched validation state", async () => {
        const onValueChange = vi.fn();
        const renderer = await renderField({ value: "old", onValueChange });
        const input = renderer.root.findByType("input");
        await act(async () => input.props.onChange({ target: { value: "" } }));
        expect(renderer.root.findByType("input").props["aria-invalid"]).toBe(true);

        await act(async () => {
            renderer.update(<ConfigStringField {...baseProps} value="server" onValueChange={onValueChange} />);
        });
        expect(renderer.root.findByType("input").props.value).toBe("server");
        expect(renderer.root.findByType("input").props["aria-invalid"]).toBe(false);
        expect(JSON.stringify(renderer.toJSON())).not.toContain("Required");
        await act(async () => renderer.unmount());
    });
});
