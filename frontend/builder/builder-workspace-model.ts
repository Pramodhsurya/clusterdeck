// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type BuilderLayout = {
    app: number;
    build: number;
};

export const DefaultBuilderLayout: BuilderLayout = { app: 80, build: 20 };

export function normalizeBuilderLayout(value: unknown): BuilderLayout {
    if (value == null || typeof value !== "object") return { ...DefaultBuilderLayout };
    const candidate = value as Partial<BuilderLayout>;
    if (
        !Number.isFinite(candidate.app) ||
        !Number.isFinite(candidate.build) ||
        candidate.app < 0 ||
        candidate.build < 0
    ) {
        return { ...DefaultBuilderLayout };
    }
    const total = candidate.app + candidate.build;
    if (total <= 0) return { ...DefaultBuilderLayout };
    const normalizedBuild = (candidate.build / total) * 100;
    const build = Math.max(20, Math.min(50, normalizedBuild));
    return { app: 100 - build, build };
}

export class BuilderLayoutLoadCoordinator {
    private generation = 0;

    async load(builderId: string, loader: () => Promise<unknown>): Promise<BuilderLayout | null> {
        const generation = ++this.generation;
        if (!builderId) return { ...DefaultBuilderLayout };
        try {
            const value = await loader();
            if (generation !== this.generation) return null;
            return normalizeBuilderLayout(value);
        } catch (error) {
            if (generation !== this.generation) return null;
            throw error;
        }
    }

    cancel(): void {
        this.generation++;
    }
}

export class BuilderLayoutWriter {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending: { builderId: string; layout: BuilderLayout } | null = null;

    constructor(
        private readonly save: (builderId: string, layout: BuilderLayout) => void | Promise<void>,
        private readonly delay = 500
    ) {}

    schedule(builderId: string, layout: BuilderLayout): void {
        this.pending = { builderId, layout };
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.delay);
    }

    flush(): void {
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = null;
        const pending = this.pending;
        this.pending = null;
        if (pending) {
            void Promise.resolve(this.save(pending.builderId, pending.layout)).catch((error) =>
                console.error("Failed to persist builder layout:", error)
            );
        }
    }

    cancel(): void {
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = null;
        this.pending = null;
    }
}
