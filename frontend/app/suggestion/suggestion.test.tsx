// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { clampSuggestionIndex, SuggestionControlInner, SuggestionRequestCoordinator } from "./suggestion";

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

    it("renders the combobox/listbox ARIA contract with linked IDs", () => {
        const html = renderToStaticMarkup(
            <SuggestionControlInner
                anchorRef={{ current: {} as HTMLElement }}
                onClose={vi.fn()}
                onSelect={() => true}
                fetchSuggestions={async () => ({ reqnum: 1, suggestions: [] })}
                placeholderText="Open File"
            />
        );
        expect(html).toContain('role="combobox"');
        expect(html).toContain('aria-label="Open File"');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toMatch(/aria-controls="([^"]+)-listbox"/);
        expect(html).toMatch(/id="([^"]+)-listbox" role="listbox"/);
    });
});
