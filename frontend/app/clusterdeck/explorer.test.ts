// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { baseName, fileStyle } from "@/app/clusterdeck/explorer";

describe("baseName", () => {
    it("returns 'Home' for the empty path and '~'", () => {
        expect(baseName("")).toBe("Home");
        expect(baseName("~")).toBe("Home");
    });

    it("returns the last segment of an absolute path", () => {
        expect(baseName("/Users/me/projects/foo")).toBe("foo");
        expect(baseName("/etc/ssh/ssh_config")).toBe("ssh_config");
    });

    it("strips trailing slashes", () => {
        expect(baseName("/Users/me/projects/foo/")).toBe("foo");
        expect(baseName("/etc//ssh//")).toBe("ssh");
    });

    it("returns the input unchanged when nothing usable is left", () => {
        // baseName("/") -> parts=[""] (filter false), parts[-1] undefined -> returns path
        expect(baseName("/")).toBe("/");
    });
});

describe("fileStyle", () => {
    it("returns a special-name style for known filenames (case-insensitive)", () => {
        const docker = fileStyle("Dockerfile");
        expect(docker.icon).toMatch(/docker/i);
        expect(docker.color).toBeTruthy();

        const makefile = fileStyle("Makefile");
        expect(makefile.icon).toBeTruthy();

        const readme = fileStyle("README.md");
        expect(readme.icon).toMatch(/markdown/i);
    });

    it("resolves well-known source extensions to their style entries", () => {
        expect(fileStyle("foo.ts").icon).toBeTruthy();
        expect(fileStyle("foo.tsx").icon).toBeTruthy();
        expect(fileStyle("foo.py").icon).toMatch(/python/i);
        expect(fileStyle("foo.go").color).toBeTruthy();
        expect(fileStyle("foo.json").icon).toMatch(/brackets/i);
        expect(fileStyle("foo.md").icon).toMatch(/markdown/i);
        expect(fileStyle("foo.png").icon).toMatch(/image/i);
        expect(fileStyle("foo.zip").icon).toMatch(/zipper/i);
    });

    it("falls back to the default style for unknown extensions", () => {
        const style = fileStyle("foo.weird-unknown-extension");
        expect(style.icon).toBeTruthy();
        expect(style.color).toBeTruthy();
    });

    it("returns a sensible style for files with no extension at all", () => {
        const style = fileStyle("LICENSE");
        expect(style.icon).toBeTruthy();
    });
});
