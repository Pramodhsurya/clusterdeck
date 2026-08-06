// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { fetchPreviewFileSuggestions, getPreviewSuggestionCwd } from "@/app/view/preview/previewsuggestions";
import { describe, expect, it, vi } from "vitest";
import { makeMockWaveEnv } from "../mock/mockwaveenv";

describe("suggestion preview helpers", () => {
    it("uses a file's containing directory, a directory itself, and home fallback", () => {
        expect(getPreviewSuggestionCwd({ path: "/repo/file.ts", dir: "/repo", isdir: false } as FileInfo)).toBe(
            "/repo"
        );
        expect(getPreviewSuggestionCwd({ path: "/repo/src", dir: "/repo", isdir: true } as FileInfo)).toBe("/repo/src");
        expect(getPreviewSuggestionCwd(null)).toBe("~");
    });

    it("anchors file suggestions at the mock home directory without a PreviewModel", async () => {
        const env = makeMockWaveEnv();
        const result = await fetchPreviewFileSuggestions(env, "", { widgetid: "widget-1", reqnum: 1 });

        expect(result.reqnum).toBe(1);
        expect(result.suggestions.some((suggestion) => suggestion["file:path"] === "/Users/mike/Documents")).toBe(true);
        expect(result.suggestions.some((suggestion) => suggestion["file:path"] === "/Users/mike/Desktop")).toBe(true);
    });

    it("supports relative and absolute file queries through the mock WaveEnv rpc", async () => {
        const env = makeMockWaveEnv();
        const relativeResult = await fetchPreviewFileSuggestions(env, "Documents/not", {
            widgetid: "widget-2",
            reqnum: 2,
        });
        const absoluteResult = await fetchPreviewFileSuggestions(env, "/Users/mike/Doc", {
            widgetid: "widget-3",
            reqnum: 3,
        });

        expect(relativeResult.suggestions.some((suggestion) => suggestion.display.startsWith("Documents/not"))).toBe(
            true
        );
        expect(
            absoluteResult.suggestions.some((suggestion) => suggestion.display.startsWith("/Users/mike/Documents"))
        ).toBe(true);
    });

    it("disposes suggestions through the extracted helper", async () => {
        const disposeSuggestionsCommand = vi.fn(async () => null);
        const env = makeMockWaveEnv({
            rpc: {
                DisposeSuggestionsCommand: disposeSuggestionsCommand,
            },
        });

        const result = await fetchPreviewFileSuggestions(
            env,
            "",
            { widgetid: "widget-4", reqnum: 4, dispose: true },
            { cwd: "~" }
        );

        expect(result).toBeNull();
        expect(disposeSuggestionsCommand).toHaveBeenCalledOnce();
    });

    it("propagates disposal failures so callers can handle them", async () => {
        const env = makeMockWaveEnv({
            rpc: {
                DisposeSuggestionsCommand: vi.fn(async () => {
                    throw new Error("dispose failed");
                }),
            },
        });
        await expect(
            fetchPreviewFileSuggestions(env, "", { widgetid: "widget-5", reqnum: 5, dispose: true })
        ).rejects.toThrow("dispose failed");
    });

    it("uses the lowercase object service key exposed by WaveEnv", async () => {
        const updateObjectMeta = vi.fn(async () => null);
        const env = makeMockWaveEnv({
            services: {
                object: {
                    UpdateObjectMeta: updateObjectMeta,
                },
            },
        });

        await env.services.object.UpdateObjectMeta("block:test", { file: "/Users/mike/Documents/meeting-notes.md" });

        expect(updateObjectMeta).toHaveBeenCalledOnce();
        expect(updateObjectMeta).toHaveBeenCalledWith("block:test", { file: "/Users/mike/Documents/meeting-notes.md" });
    });
});
