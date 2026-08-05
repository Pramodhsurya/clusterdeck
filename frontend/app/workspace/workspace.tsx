// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ConnectionsRail } from "@/app/clusterdeck/connectionsrail";
import { ErrorBoundary } from "@/app/element/errorboundary";
import { CenteredDiv } from "@/app/element/quickelems";
import { ModalsRenderer } from "@/app/modals/modalsrenderer";
import { TabBar } from "@/app/tab/tabbar";
import { TabContent } from "@/app/tab/tabcontent";
import { VTabBar } from "@/app/tab/vtabbar";
import { Widgets } from "@/app/workspace/widgets";
import { WorkspaceLayoutModel } from "@/app/workspace/workspace-layout-model";
import { atoms, getSettingsKeyAtom } from "@/store/global";
import { isMacOS } from "@/util/platformutil";
import { useAtomValue } from "jotai";
import { memo, useEffect, useRef } from "react";
import { ImperativePanelGroupHandle, Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

const MacOSTabBarSpacer = memo(() => {
    return (
        <div
            className="w-full shrink-0"
            style={
                {
                    height: "calc(8px * var(--zoomfactor-inv))",
                    WebkitAppRegion: "drag",
                    backdropFilter: "blur(20px)",
                    background: "rgba(0, 0, 0, 0.35)",
                } as React.CSSProperties
            }
        />
    );
});
MacOSTabBarSpacer.displayName = "MacOSTabBarSpacer";

const WorkspaceElem = memo(() => {
    const workspaceLayoutModel = WorkspaceLayoutModel.getInstance();
    const tabId = useAtomValue(atoms.staticTabId);
    const ws = useAtomValue(atoms.workspace);
    const tabBarPosition = useAtomValue(getSettingsKeyAtom("app:tabbar")) ?? "top";
    const showLeftTabBar = tabBarPosition === "left";
    const widgetsSidebarVisible = useAtomValue(workspaceLayoutModel.widgetsSidebarVisibleAtom);
    const vtabInitialPct = workspaceLayoutModel.getVTabInitialPercentage(window.innerWidth, showLeftTabBar, ws.oid);
    const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
    const panelGroupContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (panelGroupRef.current && panelGroupContainerRef.current) {
            workspaceLayoutModel.registerRefs(
                panelGroupRef.current,
                panelGroupContainerRef.current,
                showLeftTabBar,
                ws.oid
            );
        }
    }, [showLeftTabBar, ws.oid]);

    useEffect(() => {
        if (!panelGroupContainerRef.current) return;
        const resizeObserver = new ResizeObserver(workspaceLayoutModel.handleContainerResize);
        resizeObserver.observe(panelGroupContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const handleFocus = () => workspaceLayoutModel.syncVTabWidthFromMeta();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, []);

    return (
        <div className="flex flex-col w-full flex-grow overflow-hidden">
            {!(showLeftTabBar && isMacOS()) && <TabBar key={ws.oid} workspace={ws} noTabs={showLeftTabBar} />}
            {showLeftTabBar && isMacOS() && <MacOSTabBarSpacer />}
            <div className="flex flex-row flex-grow overflow-hidden">
                <ConnectionsRail />
                <div ref={panelGroupContainerRef} className="flex flex-1 min-w-0 overflow-hidden">
                    <PanelGroup
                        direction="horizontal"
                        onLayout={(sizes) => workspaceLayoutModel.handlePanelLayout(sizes, ws.oid)}
                        ref={panelGroupRef}
                    >
                        {showLeftTabBar && (
                            <>
                                <Panel
                                    id="vtab-panel"
                                    order={0}
                                    defaultSize={vtabInitialPct}
                                    minSize={0}
                                    maxSize={100}
                                    className="overflow-hidden"
                                >
                                    <div className="w-full h-full">
                                        <VTabBar workspace={ws} />
                                    </div>
                                </Panel>
                                <PanelResizeHandle
                                    id="vtab-resize-handle"
                                    className="w-0.5 bg-transparent hover:bg-zinc-500/20 transition-colors"
                                />
                            </>
                        )}
                        <Panel
                            id="workspace-content-panel"
                            order={showLeftTabBar ? 1 : 0}
                            defaultSize={100 - vtabInitialPct}
                        >
                            <ErrorBoundary key={tabId}>
                                {tabId === "" ? (
                                    <CenteredDiv>No Active Tab</CenteredDiv>
                                ) : (
                                    <div className="flex flex-row h-full">
                                        <TabContent
                                            key={tabId}
                                            tabId={tabId}
                                            noTopPadding={showLeftTabBar && isMacOS()}
                                        />
                                        {widgetsSidebarVisible && <Widgets />}
                                    </div>
                                )}
                                <ModalsRenderer />
                            </ErrorBoundary>
                        </Panel>
                    </PanelGroup>
                </div>
            </div>
        </div>
    );
});

WorkspaceElem.displayName = "WorkspaceElem";

export { WorkspaceElem as Workspace };
