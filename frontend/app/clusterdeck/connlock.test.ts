// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ClusterdeckZoneMetaKey, isClusterdeckPinnedEditorMeta } from "./connlock";

describe("isClusterdeckPinnedEditorMeta", () => {
    it("requires both the editor zone and cdeditor view", () => {
        expect(
            isClusterdeckPinnedEditorMeta({ [ClusterdeckZoneMetaKey]: "editor", view: "cdeditor" } as MetaType)
        ).toBe(true);
        expect(isClusterdeckPinnedEditorMeta({ [ClusterdeckZoneMetaKey]: "editor", view: "term" } as MetaType)).toBe(
            false
        );
        expect(isClusterdeckPinnedEditorMeta({ view: "cdeditor" } as MetaType)).toBe(false);
        expect(isClusterdeckPinnedEditorMeta(undefined)).toBe(false);
    });
});
