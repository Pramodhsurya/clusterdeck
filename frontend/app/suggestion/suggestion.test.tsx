// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act, create, ReactTestRenderer } from "react-test-renderer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clampSuggestionIndex, SuggestionControlInner, SuggestionRequestCoordinator } from "./suggestion";

vi.mock("@floating-ui/react", () => ({
    offset: () => ({}),
    useFloating: () => ({
        refs: { setReference: vi.fn(), setFloating: vi.fn() },
        floatingStyles: {},
        middlewareData: { offset: {} },
    }),
}));

const OriginalDocument = globalThis.document;

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.document = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as Document;
});

afterAll(() => {
    globalThis.document = OriginalDocument;
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("SuggestionRequestCoordinator", () => {
    it("ignores stale completion and reports rejection/null for the latest request", async () => {
        const first = deferred<FetchSuggestionsResponse>();
        const second = deferred<FetchSuggestionsResponse>();
        const fetch = vi.fn((query: string) => (query === "first" ? first.promise : second.promise));
        const onResults = vi.fn();
        const onError = vi.fn();
        const coordinator = new SuggestionRequestCoordinator();
        coordinator.request(fetch, "first", "widget", onResults, onError);
        coordinator.request(fetch, "second", "widget", onResults, onError);
        second.resolve({ reqnum: 2, suggestions: [] });
        await second.promise;
        first.resolve({ reqnum: 1, suggestions: [{ suggestionid: "stale", type: "file", display: "stale" }] });
        await first.promise;
        await Promise.resolve();
        expect(onResults).toHaveBeenCalledOnce();
        expect(onResults).toHaveBeenCalledWith({ reqnum: 2, suggestions: [] });

        coordinator.request(async () => null, "null", "widget", onResults, onError);
        await Promise.resolve();
        await Promise.resolve();
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("no response") })
        );

        coordinator.request(
            async () => {
                throw new Error("offline");
            },
            "reject",
            "widget",
            onResults,
            onError
        );
        await Promise.resolve();
        await Promise.resolve();
        expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "offline" }));
    });

    it("catches disposal errors and invalidates an outstanding request", async () => {
        const pending = deferred<FetchSuggestionsResponse>();
        const onResults = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const coordinator = new SuggestionRequestCoordinator();
        coordinator.request(() => pending.promise, "query", "widget", onResults, vi.fn());
        coordinator.dispose(async () => {
            throw new Error("dispose");
        }, "widget");
        pending.resolve({ reqnum: 1, suggestions: [] });
        await pending.promise;
        await Promise.resolve();
        expect(onResults).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("clamps selection after result shrink", () => {
        expect(clampSuggestionIndex(8, 2)).toBe(1);
        expect(clampSuggestionIndex(1, 0)).toBe(0);
    });

    it("renders only options in the listbox and consumes Tab only when autocomplete handles it", async () => {
        const fetchSuggestions = vi.fn(async (_query: string, context: SuggestionRequestContext) =>
            context.dispose
                ? null
                : {
                      reqnum: context.reqnum,
                      suggestions: [{ suggestionid: "alpha", type: "url", display: "Alpha" }],
                  }
        );
        const onTab = vi.fn(() => "Alpha/");
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <SuggestionControlInner
                    anchorRef={{ current: {} as HTMLElement }}
                    onClose={vi.fn()}
                    onSelect={() => true}
                    onTab={onTab}
                    fetchSuggestions={fetchSuggestions}
                    placeholderText="Open File"
                />,
                {
                    createNodeMock: () => ({
                        focus: vi.fn(),
                        contains: vi.fn(() => false),
                        children: [],
                        scrollIntoView: vi.fn(),
                    }),
                }
            );
            await Promise.resolve();
        });
        const input = renderer!.root.findByType("input");
        const listbox = renderer!.root.find((node) => node.props.role === "listbox");
        expect(input.props.role).toBe("combobox");
        expect(input.props["aria-controls"]).toBe(listbox.props.id);
        expect(listbox.findAll((node) => node.props.role === "option")).toHaveLength(1);
        expect(listbox.findAll((node) => ["status", "alert"].includes(node.props.role))).toHaveLength(0);

        const consumedTab = { key: "Tab", preventDefault: vi.fn(), stopPropagation: vi.fn() };
        await act(async () => input.props.onKeyDown(consumedTab));
        expect(onTab).toHaveBeenCalledOnce();
        expect(consumedTab.preventDefault).toHaveBeenCalledOnce();
        expect(consumedTab.stopPropagation).toHaveBeenCalledOnce();
        await act(async () => renderer!.unmount());
    });

    it("leaves Tab unconsumed on errors so Retry is sequentially reachable outside the listbox", async () => {
        const fetchSuggestions = vi.fn(async (_query: string, context: SuggestionRequestContext) => {
            if (context.dispose) return null;
            throw new Error("offline");
        });
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <SuggestionControlInner
                    anchorRef={{ current: {} as HTMLElement }}
                    onClose={vi.fn()}
                    onSelect={() => false}
                    fetchSuggestions={fetchSuggestions}
                    placeholderText="Open File"
                />,
                {
                    createNodeMock: () => ({
                        focus: vi.fn(),
                        contains: vi.fn(() => false),
                        children: [],
                        scrollIntoView: vi.fn(),
                    }),
                }
            );
            await Promise.resolve();
        });
        const input = renderer!.root.findByType("input");
        const retry = renderer!.root.findAllByType("button").find((button) => button.children.includes("Retry"));
        expect(retry).toBeDefined();
        expect(renderer!.root.findAll((node) => node.props.role === "listbox")).toHaveLength(0);
        expect(renderer!.root.findAll((node) => node.props.role === "alert")).toHaveLength(1);
        const focusables = renderer!.root.findAll((node) => node.type === "input" || node.type === "button");
        expect(focusables.indexOf(input)).toBeLessThan(focusables.indexOf(retry!));

        const tab = { key: "Tab", preventDefault: vi.fn(), stopPropagation: vi.fn() };
        await act(async () => input.props.onKeyDown(tab));
        expect(tab.preventDefault).not.toHaveBeenCalled();
        expect(tab.stopPropagation).not.toHaveBeenCalled();
        await act(async () => {
            retry!.props.onClick();
            await Promise.resolve();
        });
        expect(fetchSuggestions.mock.calls.filter(([, context]) => !context.dispose)).toHaveLength(2);
        await act(async () => renderer!.unmount());
    });
});
