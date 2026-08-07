// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Clusterdeck updater policy", () => {
    test("has no Wave updater implementation or feed", () => {
        const updater = read("emain/updater.ts");
        const builder = read("electron-builder.config.cjs");
        const manifest = JSON.parse(read("package.json"));
        const taskfile = read("Taskfile.yml");

        expect(updater).not.toContain("electron-updater");
        expect(updater).not.toContain("autoUpdater");
        expect(builder).not.toContain("releases-w2");
        expect(builder).not.toMatch(/publish\s*:/);
        expect(builder).not.toContain("generateUpdatesFilesForAllChannels");
        expect(taskfile).not.toContain("releases-w2");
        expect(taskfile).not.toMatch(/artifacts:(upload|download|publish)/);
        expect(manifest.dependencies["electron-updater"]).toBeUndefined();
        expect(manifest.dependencies.yaml).toBeUndefined();
    });

    test("keeps inherited updater settings disabled", () => {
        const settings = JSON.parse(read("pkg/wconfig/defaultconfig/settings.json"));
        expect(settings["autoupdate:enabled"]).toBe(false);
        expect(settings["autoupdate:installonquit"]).toBe(false);
    });
});
