// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { atoms, getOrefMetaKeyAtom } from "@/store/global";
import * as jotai from "jotai";
import { debounce } from "lodash-es";
import { ImperativePanelGroupHandle } from "react-resizable-panels";

const VTabBar_DefaultWidth = 220;
const VTabBar_MinWidth = 110;
const VTabBar_MaxWidth = 280;

function clampVTabWidth(width: number): number {
    return Math.max(VTabBar_MinWidth, Math.min(width, VTabBar_MaxWidth));
}

class WorkspaceLayoutModel {
    private static instance: WorkspaceLayoutModel | null = null;

    private panelGroupRef: ImperativePanelGroupHandle | null = null;
    private panelGroupContainerRef: HTMLDivElement | null = null;
    private currentWorkspaceId = "";
    private inResize = false;
    private vtabWidth = VTabBar_DefaultWidth;
    private vtabVisible = false;
    private debouncedPersistVTabWidth: ReturnType<typeof debounce>;

    widgetsSidebarVisibleAtom: jotai.Atom<boolean>;

    private constructor() {
        this.widgetsSidebarVisibleAtom = jotai.atom(
            (get) =>
                get(getOrefMetaKeyAtom(WOS.makeORef("workspace", this.getWorkspaceId()), "layout:widgetsvisible")) ??
                true
        );

        this.handleContainerResize = this.handleContainerResize.bind(this);

        this.debouncedPersistVTabWidth = debounce((workspaceId: string, width: number) => {
            void RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("workspace", workspaceId),
                meta: { "layout:vtabbarwidth": width },
            }).catch((error) => {
                console.warn("Failed to persist vtabbar width:", error);
            });
        }, 300);
    }

    static getInstance(): WorkspaceLayoutModel {
        if (!WorkspaceLayoutModel.instance) {
            WorkspaceLayoutModel.instance = new WorkspaceLayoutModel();
        }
        return WorkspaceLayoutModel.instance;
    }

    private getWorkspaceId(): string {
        return globalStore.get(atoms.workspace)?.oid ?? "";
    }

    private getVTabBarWidthAtom(workspaceId: string): jotai.Atom<number> {
        return getOrefMetaKeyAtom(WOS.makeORef("workspace", workspaceId), "layout:vtabbarwidth");
    }

    private loadWorkspaceWidth(workspaceId: string): void {
        if (workspaceId === this.currentWorkspaceId) return;

        // Preserve a final resize from the workspace being left instead of
        // allowing the shared debouncer to be replaced by the next workspace.
        this.debouncedPersistVTabWidth.flush();
        this.currentWorkspaceId = workspaceId;
        this.vtabWidth = VTabBar_DefaultWidth;
        if (!workspaceId) return;

        try {
            const savedWidth = globalStore.get(this.getVTabBarWidthAtom(workspaceId));
            if (savedWidth != null && savedWidth > 0) {
                this.vtabWidth = clampVTabWidth(savedWidth);
            }
        } catch (error) {
            console.warn("Failed to load vtabbar width:", error);
        }
    }

    private getContainerWidth(): number {
        return this.panelGroupContainerRef?.clientWidth ?? window.innerWidth;
    }

    private getLayout(containerWidth: number): number[] {
        if (!this.vtabVisible) return [100];
        const vtabPercentage = containerWidth > 0 ? (clampVTabWidth(this.vtabWidth) / containerWidth) * 100 : 0;
        return [vtabPercentage, Math.max(0, 100 - vtabPercentage)];
    }

    private applyLayout(): void {
        if (!this.panelGroupRef) return;
        this.inResize = true;
        this.panelGroupRef.setLayout(this.getLayout(this.getContainerWidth()));
        this.inResize = false;
    }

    handlePanelLayout(sizes: number[], workspaceId: string): void {
        if (this.inResize || !this.vtabVisible || sizes.length < 2 || workspaceId !== this.currentWorkspaceId) {
            return;
        }

        const containerWidth = this.getContainerWidth();
        if (containerWidth <= 0) return;

        const requestedWidth = (sizes[0] / 100) * containerWidth;
        const width = clampVTabWidth(requestedWidth);
        this.vtabWidth = width;
        this.debouncedPersistVTabWidth(workspaceId, width);

        if (Math.abs(width - requestedWidth) > 0.5) {
            this.applyLayout();
        }
    }

    handleContainerResize(): void {
        this.applyLayout();
    }

    syncVTabWidthFromMeta(): void {
        if (!this.currentWorkspaceId) return;
        const savedWidth = globalStore.get(this.getVTabBarWidthAtom(this.currentWorkspaceId));
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

    getVTabInitialPercentage(windowWidth: number, showLeftTabBar: boolean, workspaceId: string): number {
        this.loadWorkspaceWidth(workspaceId);
        if (!showLeftTabBar || windowWidth <= 0) return 0;
        return (clampVTabWidth(this.vtabWidth) / windowWidth) * 100;
    }
}

export { WorkspaceLayoutModel };
