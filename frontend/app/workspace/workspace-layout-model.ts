// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { isBuilderWindow } from "@/app/store/windowtype";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getLayoutModelForStaticTab } from "@/layout/lib/layoutModelHooks";
import { atoms, getOrefMetaKeyAtom, getSettingsKeyAtom, refocusNode } from "@/store/global";
import debug from "debug";
import * as jotai from "jotai";
import { debounce } from "lodash-es";
import { ImperativePanelGroupHandle, ImperativePanelHandle } from "react-resizable-panels";

const dlog = debug("wave:workspace");

const VTabBar_DefaultWidth = 220;
const VTabBar_MinWidth = 110;
const VTabBar_MaxWidth = 280;

function clampVTabWidth(w: number): number {
    return Math.max(VTabBar_MinWidth, Math.min(w, VTabBar_MaxWidth));
}

class WorkspaceLayoutModel {
    private static instance: WorkspaceLayoutModel | null = null;

    // piPanelRef kept as null for backward compat — pi-agent panel was removed.
    piPanelRef: ImperativePanelHandle | null;
    vtabPanelRef: ImperativePanelHandle | null;
    outerPanelGroupRef: ImperativePanelGroupHandle | null;
    innerPanelGroupRef: ImperativePanelGroupHandle | null;
    panelContainerRef: HTMLDivElement | null;
    vtabPanelWrapperRef: HTMLDivElement | null;
    panelVisibleAtom: jotai.PrimitiveAtom<boolean>;

    private inResize: boolean;
    private vtabWidth: number;
    private vtabVisible: boolean;
    private transitionTimeoutRef: NodeJS.Timeout | null = null;
    private debouncedPersistVTabWidth: () => void;
    widgetsSidebarVisibleAtom: jotai.Atom<boolean>;

    private constructor() {
        this.piPanelRef = null;
        this.vtabPanelRef = null;
        this.outerPanelGroupRef = null;
        this.innerPanelGroupRef = null;
        this.panelContainerRef = null;
        this.vtabPanelWrapperRef = null;
        this.inResize = false;
        this.vtabWidth = VTabBar_DefaultWidth;
        this.vtabVisible = false;
        this.panelVisibleAtom = jotai.atom(false);
        this.widgetsSidebarVisibleAtom = jotai.atom(
            (get) =>
                get(getOrefMetaKeyAtom(WOS.makeORef("workspace", this.getWorkspaceId()), "layout:widgetsvisible")) ??
                true
        );
        this.initializeFromMeta();

        this.handleWindowResize = this.handleWindowResize.bind(this);
        this.handleOuterPanelLayout = this.handleOuterPanelLayout.bind(this);
        this.handleInnerPanelLayout = this.handleInnerPanelLayout.bind(this);

        this.debouncedPersistVTabWidth = debounce(() => {
            if (!this.vtabVisible) return;
            const width = this.vtabPanelWrapperRef?.offsetWidth;
            if (width == null || width <= 0) return;
            try {
                RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("workspace", this.getWorkspaceId()),
                    meta: { "layout:vtabbarwidth": width },
                });
            } catch (e) {
                console.warn("Failed to persist vtabbar width:", e);
            }
        }, 300);
    }

    static getInstance(): WorkspaceLayoutModel {
        if (!WorkspaceLayoutModel.instance) {
            WorkspaceLayoutModel.instance = new WorkspaceLayoutModel();
        }
        return WorkspaceLayoutModel.instance;
    }

    // ---- Meta / persistence helpers ----

    private getTabId(): string {
        return globalStore.get(atoms.staticTabId);
    }

    private getWorkspaceId(): string {
        return globalStore.get(atoms.workspace)?.oid ?? "";
    }

    private getVTabBarWidthAtom(): jotai.Atom<number> {
        return getOrefMetaKeyAtom(WOS.makeORef("workspace", this.getWorkspaceId()), "layout:vtabbarwidth");
    }

    private initializeFromMeta(): void {
        try {
            const savedVTabWidth = globalStore.get(this.getVTabBarWidthAtom());
            if (savedVTabWidth != null && savedVTabWidth > 0) {
                this.vtabWidth = savedVTabWidth;
            }
            const tabBarPosition = globalStore.get(getSettingsKeyAtom("app:tabbar")) ?? "top";
            const showLeftTabBar = tabBarPosition === "left" && !isBuilderWindow();
            this.vtabVisible = showLeftTabBar;
        } catch (e) {
            console.warn("Failed to initialize from tab meta:", e);
        }
    }

    // ---- Resolved width getters (always clamped) ----

    private getResolvedVTabWidth(): number {
        return clampVTabWidth(this.vtabWidth);
    }

    // ---- Core layout computation ----

    private computeLayout(windowWidth: number): { outer: number[]; inner: number[] } {
        const vtabW = this.vtabVisible ? this.getResolvedVTabWidth() : 0;

        // outer: [leftGroupPct, contentPct] — pi-agent panel removed; left group is just vtab.
        const leftPct = windowWidth > 0 ? (vtabW / windowWidth) * 100 : 0;
        const contentPct = Math.max(0, 100 - leftPct);

        // inner: [vtabPct, 0] — pi-agent panel removed; inner panel always 100% vtab.
        return { outer: [leftPct, contentPct], inner: [100, 0] };
    }

    private commitLayouts(windowWidth: number): void {
        if (!this.outerPanelGroupRef || !this.innerPanelGroupRef) return;
        const { outer, inner } = this.computeLayout(windowWidth);
        this.inResize = true;
        this.outerPanelGroupRef.setLayout(outer);
        this.innerPanelGroupRef.setLayout(inner);
        this.inResize = false;
    }

    // ---- Drag handlers ----

    handleOuterPanelLayout(sizes: number[]): void {
        if (this.inResize) return;
        const windowWidth = window.innerWidth;
        const newLeftGroupPx = (sizes[0] / 100) * windowWidth;

        if (this.vtabVisible) {
            this.vtabWidth = clampVTabWidth(newLeftGroupPx);
            this.debouncedPersistVTabWidth();
        }

        this.commitLayouts(windowWidth);
    }

    handleInnerPanelLayout(_sizes: number[]): void {
        if (this.inResize) return;
        // pi-agent panel removed — inner panel is always 100% vtab. No-op.
    }

    handleWindowResize(): void {
        this.commitLayouts(window.innerWidth);
    }

    // ---- Registration & sync ----

    syncVTabWidthFromMeta(): void {
        const savedVTabWidth = globalStore.get(this.getVTabBarWidthAtom());
        if (savedVTabWidth != null && savedVTabWidth > 0 && savedVTabWidth !== this.vtabWidth) {
            this.vtabWidth = savedVTabWidth;
            this.commitLayouts(window.innerWidth);
        }
    }

    registerRefs(
        outerPanelGroupRef: ImperativePanelGroupHandle,
        innerPanelGroupRef: ImperativePanelGroupHandle,
        panelContainerRef: HTMLDivElement,
        vtabPanelRef?: ImperativePanelHandle,
        vtabPanelWrapperRef?: HTMLDivElement,
        showLeftTabBar?: boolean
    ): void {
        this.vtabPanelRef = vtabPanelRef ?? null;
        this.outerPanelGroupRef = outerPanelGroupRef;
        this.innerPanelGroupRef = innerPanelGroupRef;
        this.panelContainerRef = panelContainerRef;
        this.vtabPanelWrapperRef = vtabPanelWrapperRef ?? null;
        this.vtabVisible = showLeftTabBar ?? false;
        this.syncPanelCollapse();
        this.commitLayouts(window.innerWidth);
    }

    private syncPanelCollapse(): void {
        if (this.vtabPanelRef) {
            if (this.vtabVisible) {
                this.vtabPanelRef.expand();
            } else {
                this.vtabPanelRef.collapse();
            }
        }
    }

    // ---- Transitions ----

    enableTransitions(duration: number): void {
        if (!this.panelContainerRef) return;
        const panels = this.panelContainerRef.querySelectorAll("[data-panel]");
        panels.forEach((panel: HTMLElement) => {
            panel.style.transition = "flex 0.2s ease-in-out";
        });
        if (this.transitionTimeoutRef) {
            clearTimeout(this.transitionTimeoutRef);
        }
        this.transitionTimeoutRef = setTimeout(() => {
            if (!this.panelContainerRef) return;
            const panels = this.panelContainerRef.querySelectorAll("[data-panel]");
            panels.forEach((panel: HTMLElement) => {
                panel.style.transition = "none";
            });
        }, duration);
    }

    // ---- Public getters (pi-panel stubs for backward compat) ----

    getPiPanelVisible(): boolean {
        // pi-agent panel removed — always false.
        return false;
    }

    getPiPanelWidth(): number {
        // pi-agent panel removed — always 0.
        return 0;
    }

    // ---- Initial percentage helpers ----

    getLeftGroupInitialPercentage(windowWidth: number, showLeftTabBar: boolean): number {
        const vtabW = showLeftTabBar && !isBuilderWindow() ? this.getResolvedVTabWidth() : 0;
        return (vtabW / windowWidth) * 100;
    }

    getInnerVTabInitialPercentage(_windowWidth: number, showLeftTabBar: boolean): number {
        if (!showLeftTabBar || isBuilderWindow()) return 0;
        // pi-agent panel removed — vtab always gets 100%.
        return 100;
    }

    getInnerPiPanelInitialPercentage(_windowWidth: number, _showLeftTabBar: boolean): number {
        // pi-agent panel removed — always 0.
        return 0;
    }

    // ---- Toggle visibility ----

    setPiPanelVisible(_visible: boolean): void {
        // pi-agent panel removed — no-op.
    }

    setShowLeftTabBar(showLeftTabBar: boolean): void {
        if (this.vtabVisible === showLeftTabBar) return;
        this.vtabVisible = showLeftTabBar;
        this.enableTransitions(250);
        this.syncPanelCollapse();
        this.commitLayouts(window.innerWidth);
    }
}

export { WorkspaceLayoutModel };
