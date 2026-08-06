// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { atoms, getOrefMetaKeyAtom } from "@/store/global";
import * as jotai from "jotai";
import { ImperativePanelGroupHandle } from "react-resizable-panels";

export const VTabBar_DefaultWidth = 220;
export const VTabBar_MinWidth = 110;
export const VTabBar_MaxWidth = 280;

export function clampVTabWidth(width: number): number {
    return Math.max(VTabBar_MinWidth, Math.min(width, VTabBar_MaxWidth));
}

type PersistWidth = (workspaceId: string, width: number) => void | Promise<void>;
type ReadWidth = (workspaceId: string) => number | null | undefined;

export class TrailingWidthWriter {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending: { workspaceId: string; width: number } | null = null;

    constructor(
        private readonly persist: PersistWidth,
        private readonly delay = 300
    ) {}

    schedule(workspaceId: string, width: number): void {
        this.pending = { workspaceId, width };
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.delay);
    }

    flush(): void {
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = null;
        const pending = this.pending;
        this.pending = null;
        if (pending) {
            void Promise.resolve(this.persist(pending.workspaceId, pending.width)).catch((error) =>
                console.warn("Failed to persist vtabbar width:", error)
            );
        }
    }

    cancel(): void {
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = null;
        this.pending = null;
    }
}

export function createWidgetsSidebarVisibleAtom(
    workspaceIdAtom: jotai.Atom<string>,
    getVisibleAtom: (workspaceId: string) => jotai.Atom<boolean | null | undefined>
): jotai.Atom<boolean> {
    return jotai.atom((get) => {
        const workspaceId = get(workspaceIdAtom);
        if (!workspaceId) return true;
        return get(getVisibleAtom(workspaceId)) ?? true;
    });
}

export class WorkspaceLayoutModel {
    private static instance: WorkspaceLayoutModel | null = null;

    private panelGroupRef: ImperativePanelGroupHandle | null = null;
    private panelGroupContainerRef: HTMLDivElement | null = null;
    private currentWorkspaceId = "";
    private inResize = false;
    private vtabWidth = VTabBar_DefaultWidth;
    private vtabVisible = false;
    private readonly widthWriter: TrailingWidthWriter;
    private readonly readWidth: ReadWidth;

    readonly widgetsSidebarVisibleAtom: jotai.Atom<boolean>;

    constructor(persistWidth?: PersistWidth, readWidth?: ReadWidth, debounceMs = 300) {
        this.widgetsSidebarVisibleAtom = createWidgetsSidebarVisibleAtom(
            atoms?.workspaceId ?? jotai.atom(""),
            (workspaceId) => getOrefMetaKeyAtom(WOS.makeORef("workspace", workspaceId), "layout:widgetsvisible")
        );

        this.readWidth =
            readWidth ??
            ((workspaceId) =>
                globalStore.get(getOrefMetaKeyAtom(WOS.makeORef("workspace", workspaceId), "layout:vtabbarwidth")));
        this.widthWriter = new TrailingWidthWriter(
            persistWidth ??
                ((workspaceId, width) =>
                    RpcApi.SetMetaCommand(TabRpcClient, {
                        oref: WOS.makeORef("workspace", workspaceId),
                        meta: { "layout:vtabbarwidth": width },
                    }).catch((error) => console.warn("Failed to persist vtabbar width:", error))),
            debounceMs
        );
        this.handleContainerResize = this.handleContainerResize.bind(this);
    }

    static getInstance(): WorkspaceLayoutModel {
        if (!WorkspaceLayoutModel.instance) WorkspaceLayoutModel.instance = new WorkspaceLayoutModel();
        return WorkspaceLayoutModel.instance;
    }

    private loadWorkspaceWidth(workspaceId: string): void {
        if (workspaceId === this.currentWorkspaceId) return;
        this.widthWriter.flush();
        this.currentWorkspaceId = workspaceId;
        this.vtabWidth = VTabBar_DefaultWidth;
        if (!workspaceId) return;
        try {
            const savedWidth = this.readWidth(workspaceId);
            if (savedWidth != null && savedWidth > 0) this.vtabWidth = clampVTabWidth(savedWidth);
        } catch (error) {
            console.warn("Failed to load vtabbar width:", error);
        }
    }

    private getContainerWidth(): number {
        return this.panelGroupContainerRef?.clientWidth ?? 0;
    }

    getLayout(containerWidth: number): number[] {
        if (!this.vtabVisible) return [100];
        const vtabPercentage =
            containerWidth > 0 ? Math.min(100, (clampVTabWidth(this.vtabWidth) / containerWidth) * 100) : 0;
        return [vtabPercentage, 100 - vtabPercentage];
    }

    private applyLayout(): void {
        if (!this.panelGroupRef) return;
        const containerWidth = this.getContainerWidth();
        if (containerWidth <= 0 && this.vtabVisible) return;
        this.inResize = true;
        this.panelGroupRef.setLayout(this.getLayout(containerWidth));
        this.inResize = false;
    }

    handlePanelLayout(sizes: number[], workspaceId: string): void {
        if (this.inResize || !this.vtabVisible || sizes.length < 2 || workspaceId !== this.currentWorkspaceId) return;
        const containerWidth = this.getContainerWidth();
        if (containerWidth <= 0 || !Number.isFinite(sizes[0])) return;
        const requestedWidth = (sizes[0] / 100) * containerWidth;
        const width = clampVTabWidth(requestedWidth);
        this.vtabWidth = width;
        this.widthWriter.schedule(workspaceId, width);
        if (Math.abs(width - requestedWidth) > 0.5) this.applyLayout();
    }

    handleContainerResize(): void {
        this.applyLayout();
    }

    syncVTabWidthFromMeta(): void {
        if (!this.currentWorkspaceId) return;
        const savedWidth = this.readWidth(this.currentWorkspaceId);
        if (savedWidth != null && savedWidth > 0) {
            const width = clampVTabWidth(savedWidth);
            if (width !== this.vtabWidth) {
                this.vtabWidth = width;
                this.applyLayout();
            }
        }
    }

    registerRefs(
        panelGroupRef: ImperativePanelGroupHandle,
        panelGroupContainerRef: HTMLDivElement,
        showLeftTabBar: boolean,
        workspaceId: string
    ): void {
        this.panelGroupRef = panelGroupRef;
        this.panelGroupContainerRef = panelGroupContainerRef;
        this.vtabVisible = showLeftTabBar;
        this.loadWorkspaceWidth(workspaceId);
        this.applyLayout();
    }

    unregisterRefs(): void {
        this.panelGroupRef = null;
        this.panelGroupContainerRef = null;
    }

    dispose(): void {
        this.widthWriter.flush();
        this.widthWriter.cancel();
        this.unregisterRefs();
        this.currentWorkspaceId = "";
    }

    getVTabInitialPercentage(fallbackWidth: number, showLeftTabBar: boolean, workspaceId: string): number {
        this.loadWorkspaceWidth(workspaceId);
        if (!showLeftTabBar || fallbackWidth <= 0) return 0;
        return Math.min(100, (clampVTabWidth(this.vtabWidth) / fallbackWidth) * 100);
    }
}
