// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { isBuilderWindow } from "@/app/store/windowtype";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getLayoutModelForStaticTab } from "@/layout/lib/layoutModelHooks";
import { atoms, getApi, getOrefMetaKeyAtom, getSettingsKeyAtom, recordTEvent, refocusNode } from "@/store/global";
import debug from "debug";
import * as jotai from "jotai";
import { debounce } from "lodash-es";
import { ImperativePanelGroupHandle, ImperativePanelHandle } from "react-resizable-panels";

const dlog = debug("wave:workspace");

const PiPanel_DefaultWidth = 300;
const PiPanel_DefaultWidthRatio = 0.33;
const PiPanel_MinWidth = 300;
const PiPanel_MaxWidthRatio = 0.66;

const VTabBar_DefaultWidth = 220;
const VTabBar_MinWidth = 110;
const VTabBar_MaxWidth = 280;

function clampVTabWidth(w: number): number {
    return Math.max(VTabBar_MinWidth, Math.min(w, VTabBar_MaxWidth));
}

function clampPiPanelWidth(w: number, windowWidth: number): number {
    const maxWidth = Math.floor(windowWidth * PiPanel_MaxWidthRatio);
    if (PiPanel_MinWidth > maxWidth) return PiPanel_MinWidth;
    return Math.max(PiPanel_MinWidth, Math.min(w, maxWidth));
}

class WorkspaceLayoutModel {
    private static instance: WorkspaceLayoutModel | null = null;

    piPanelRef: ImperativePanelHandle | null;
    vtabPanelRef: ImperativePanelHandle | null;
    outerPanelGroupRef: ImperativePanelGroupHandle | null;
    innerPanelGroupRef: ImperativePanelGroupHandle | null;
    panelContainerRef: HTMLDivElement | null;
    piPanelWrapperRef: HTMLDivElement | null;
    vtabPanelWrapperRef: HTMLDivElement | null;
    panelVisibleAtom: jotai.PrimitiveAtom<boolean>;

    private inResize: boolean;
    private piPanelVisible: boolean;
    private piPanelWidth: number | null;
    private vtabWidth: number;
    private vtabVisible: boolean;
    private transitionTimeoutRef: NodeJS.Timeout | null = null;
    private debouncedPersistPiWidth: () => void;
    private debouncedPersistVTabWidth: () => void;
    widgetsSidebarVisibleAtom: jotai.Atom<boolean>;

    private constructor() {
        this.piPanelRef = null;
        this.vtabPanelRef = null;
        this.outerPanelGroupRef = null;
        this.innerPanelGroupRef = null;
        this.panelContainerRef = null;
        this.piPanelWrapperRef = null;
        this.vtabPanelWrapperRef = null;
        this.inResize = false;
        this.piPanelVisible = false;
        this.piPanelWidth = null;
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

        this.debouncedPersistPiWidth = debounce(() => {
            if (!this.piPanelVisible) return;
            const width = this.piPanelWrapperRef?.offsetWidth;
            if (width == null || width <= 0) return;
            try {
                RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("tab", this.getTabId()),
                    meta: { "cdpi:panelwidth": width },
                });
            } catch (e) {
                console.warn("Failed to persist pi-agent panel width:", e);
            }
        }, 300);

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

    private getPanelOpenAtom(): jotai.Atom<boolean> {
        return getOrefMetaKeyAtom(WOS.makeORef("tab", this.getTabId()), "cdpi:panelopen");
    }

    private getPanelWidthAtom(): jotai.Atom<number> {
        return getOrefMetaKeyAtom(WOS.makeORef("tab", this.getTabId()), "cdpi:panelwidth");
    }

    private getVTabBarWidthAtom(): jotai.Atom<number> {
        return getOrefMetaKeyAtom(WOS.makeORef("workspace", this.getWorkspaceId()), "layout:vtabbarwidth");
    }

    private initializeFromMeta(): void {
        try {
            const savedVisible = globalStore.get(this.getPanelOpenAtom());
            const savedPiWidth = globalStore.get(this.getPanelWidthAtom());
            const savedVTabWidth = globalStore.get(this.getVTabBarWidthAtom());
            if (savedVisible != null) {
                this.piPanelVisible = savedVisible;
                globalStore.set(this.panelVisibleAtom, savedVisible);
            }
            if (savedPiWidth != null) {
                this.piPanelWidth = savedPiWidth;
            }
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

    private getResolvedPiWidth(windowWidth: number): number {
        let w = this.piPanelWidth;
        if (w == null) {
            w = Math.max(PiPanel_DefaultWidth, windowWidth * PiPanel_DefaultWidthRatio);
            this.piPanelWidth = w;
        }
        return clampPiPanelWidth(w, windowWidth);
    }

    private getResolvedVTabWidth(): number {
        return clampVTabWidth(this.vtabWidth);
    }

    // ---- Core layout computation ----

    private computeLayout(windowWidth: number): { outer: number[]; inner: number[] } {
        const vtabW = this.vtabVisible ? this.getResolvedVTabWidth() : 0;
        const piW = this.piPanelVisible ? this.getResolvedPiWidth(windowWidth) : 0;
        const leftGroupW = vtabW + piW;

        // outer: [leftGroupPct, contentPct]
        const leftPct = windowWidth > 0 ? (leftGroupW / windowWidth) * 100 : 0;
        const contentPct = Math.max(0, 100 - leftPct);

        // inner: [vtabPct, piPanelPct] relative to leftGroupW
        let vtabPct: number;
        let piPct: number;
        if (leftGroupW > 0) {
            vtabPct = (vtabW / leftGroupW) * 100;
            piPct = 100 - vtabPct;
        } else {
            vtabPct = 50;
            piPct = 50;
        }

        return { outer: [leftPct, contentPct], inner: [vtabPct, piPct] };
    }

    private commitLayouts(windowWidth: number): void {
        if (!this.outerPanelGroupRef || !this.innerPanelGroupRef) return;
        const { outer, inner } = this.computeLayout(windowWidth);
        this.inResize = true;
        this.outerPanelGroupRef.setLayout(outer);
        this.innerPanelGroupRef.setLayout(inner);
        this.inResize = false;
        this.updateWrapperWidth();
    }

    // ---- Drag handlers ----

    handleOuterPanelLayout(sizes: number[]): void {
        if (this.inResize) return;
        const windowWidth = window.innerWidth;
        const newLeftGroupPx = (sizes[0] / 100) * windowWidth;

        if (this.vtabVisible && this.piPanelVisible) {
            const vtabW = this.getResolvedVTabWidth();
            this.piPanelWidth = clampPiPanelWidth(newLeftGroupPx - vtabW, windowWidth);
            this.debouncedPersistPiWidth();
        } else if (this.vtabVisible) {
            this.vtabWidth = clampVTabWidth(newLeftGroupPx);
            this.debouncedPersistVTabWidth();
        } else if (this.piPanelVisible) {
            this.piPanelWidth = clampPiPanelWidth(newLeftGroupPx, windowWidth);
            this.debouncedPersistPiWidth();
        }

        this.commitLayouts(windowWidth);
    }

    handleInnerPanelLayout(sizes: number[]): void {
        if (this.inResize) return;
        if (!this.vtabVisible || !this.piPanelVisible) return;

        const windowWidth = window.innerWidth;
        const vtabW = this.getResolvedVTabWidth();
        const piW = this.getResolvedPiWidth(windowWidth);
        const leftGroupW = vtabW + piW;

        const newVTabW = (sizes[0] / 100) * leftGroupW;
        const clampedVTab = clampVTabWidth(newVTabW);
        const newPiW = clampPiPanelWidth(leftGroupW - clampedVTab, windowWidth);

        if (clampedVTab !== this.vtabWidth) {
            this.vtabWidth = clampedVTab;
            this.debouncedPersistVTabWidth();
        }
        if (newPiW !== this.piPanelWidth) {
            this.piPanelWidth = newPiW;
            this.debouncedPersistPiWidth();
        }

        this.commitLayouts(windowWidth);
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
        piPanelRef: ImperativePanelHandle,
        outerPanelGroupRef: ImperativePanelGroupHandle,
        innerPanelGroupRef: ImperativePanelGroupHandle,
        panelContainerRef: HTMLDivElement,
        piPanelWrapperRef: HTMLDivElement,
        vtabPanelRef?: ImperativePanelHandle,
        vtabPanelWrapperRef?: HTMLDivElement,
        showLeftTabBar?: boolean
    ): void {
        this.piPanelRef = piPanelRef;
        this.vtabPanelRef = vtabPanelRef ?? null;
        this.outerPanelGroupRef = outerPanelGroupRef;
        this.innerPanelGroupRef = innerPanelGroupRef;
        this.panelContainerRef = panelContainerRef;
        this.piPanelWrapperRef = piPanelWrapperRef;
        this.vtabPanelWrapperRef = vtabPanelWrapperRef ?? null;
        this.vtabVisible = showLeftTabBar ?? false;
        this.syncPanelCollapse();
        this.commitLayouts(window.innerWidth);
    }

    private syncPanelCollapse(): void {
        if (this.piPanelRef) {
            if (this.piPanelVisible) {
                this.piPanelRef.expand();
            } else {
                this.piPanelRef.collapse();
            }
        }
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

    // ---- Wrapper width ----

    updateWrapperWidth(): void {
        if (!this.piPanelWrapperRef) return;
        const width = this.getResolvedPiWidth(window.innerWidth);
        this.piPanelWrapperRef.style.width = `${width}px`;
    }

    // ---- Public getters ----

    getPiPanelVisible(): boolean {
        return this.piPanelVisible;
    }

    getPiPanelWidth(): number {
        return this.getResolvedPiWidth(window.innerWidth);
    }

    // ---- Initial percentage helpers ----

    getLeftGroupInitialPercentage(windowWidth: number, showLeftTabBar: boolean): number {
        const vtabW = showLeftTabBar && !isBuilderWindow() ? this.getResolvedVTabWidth() : 0;
        const piW = this.piPanelVisible ? this.getResolvedPiWidth(windowWidth) : 0;
        return ((vtabW + piW) / windowWidth) * 100;
    }

    getInnerVTabInitialPercentage(windowWidth: number, showLeftTabBar: boolean): number {
        if (!showLeftTabBar || isBuilderWindow()) return 0;
        const vtabW = this.getResolvedVTabWidth();
        const piW = this.piPanelVisible ? this.getResolvedPiWidth(windowWidth) : 0;
        const total = vtabW + piW;
        if (total === 0) return 50;
        return (vtabW / total) * 100;
    }

    getInnerPiPanelInitialPercentage(windowWidth: number, showLeftTabBar: boolean): number {
        const vtabW = showLeftTabBar && !isBuilderWindow() ? this.getResolvedVTabWidth() : 0;
        const piW = this.piPanelVisible ? this.getResolvedPiWidth(windowWidth) : 0;
        const total = vtabW + piW;
        if (total === 0) return 50;
        return (piW / total) * 100;
    }

    // ---- Toggle visibility ----

    setPiPanelVisible(visible: boolean): void {
        if (this.focusTimeoutRef != null) {
            clearTimeout(this.focusTimeoutRef);
            this.focusTimeoutRef = null;
        }
        this.piPanelVisible = visible;
        globalStore.set(this.panelVisibleAtom, visible);
        getApi().setPiAgentOpen(visible);
        RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("tab", this.getTabId()),
            meta: { "cdpi:panelopen": visible },
        });
        this.enableTransitions(250);
        this.syncPanelCollapse();
        this.commitLayouts(window.innerWidth);

        if (!visible) {
            const layoutModel = getLayoutModelForStaticTab();
            const focusedNode = globalStore.get(layoutModel.focusedNode);
            if (focusedNode == null) {
                layoutModel.focusFirstNode();
                return;
            }
            const blockId = focusedNode?.data?.blockId;
            if (blockId != null) {
                refocusNode(blockId);
            }
        }
    }

    setShowLeftTabBar(showLeftTabBar: boolean): void {
        if (this.vtabVisible === showLeftTabBar) return;
        this.vtabVisible = showLeftTabBar;
        this.enableTransitions(250);
        this.syncPanelCollapse();
        this.commitLayouts(window.innerWidth);
    }

    // ---- Deprecated AI panel compatibility (removed) ----
    // These methods were removed along with the Wave AI panel.
    // Use setPiPanelVisible / getPiPanelVisible instead.

    private focusTimeoutRef: NodeJS.Timeout | null = null;
}

export { WorkspaceLayoutModel };
