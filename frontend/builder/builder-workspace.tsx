// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { BuilderAppPanel } from "@/builder/builder-apppanel";
import { BuilderBuildPanel } from "@/builder/builder-buildpanel";
import {
    BuilderLayout,
    BuilderLayoutLoadCoordinator,
    BuilderLayoutWriter,
    DefaultBuilderLayout,
    normalizeBuilderLayout,
} from "@/builder/builder-workspace-model";
import { atoms } from "@/store/global";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

const BuilderWorkspace = memo(() => {
    const builderId = useAtomValue(atoms.builderId);
    const [layout, setLayout] = useState<BuilderLayout>(null);
    const [isLoading, setIsLoading] = useState(true);
    const layoutLoader = useRef(new BuilderLayoutLoadCoordinator());
    const layoutWriter = useMemo(
        () =>
            new BuilderLayoutWriter((capturedBuilderId, newLayout) =>
                RpcApi.SetRTInfoCommand(TabRpcClient, {
                    oref: `builder:${capturedBuilderId}`,
                    data: { "builder:layout": newLayout },
                }).catch((error) => console.error("Failed to save builder layout:", error))
            ),
        []
    );

    useEffect(() => {
        let cancelled = false;
        layoutWriter.flush();
        setIsLoading(true);
        setLayout(null);

        void layoutLoader.current
            .load(builderId, async () => {
                const rtInfo = await RpcApi.GetRTInfoCommand(TabRpcClient, { oref: `builder:${builderId}` });
                return rtInfo?.["builder:layout"];
            })
            .then((loadedLayout) => {
                if (cancelled || loadedLayout == null) return;
                setLayout(loadedLayout);
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Failed to load builder layout:", error);
                setLayout({ ...DefaultBuilderLayout });
                setIsLoading(false);
            });
        return () => {
            cancelled = true;
            layoutLoader.current.cancel();
            layoutWriter.flush();
        };
    }, [builderId, layoutWriter]);

    const handleVerticalLayout = useCallback(
        (sizes: number[]) => {
            if (!builderId || sizes.length < 2 || !Number.isFinite(sizes[0]) || !Number.isFinite(sizes[1])) return;
            const newLayout = normalizeBuilderLayout({ app: sizes[0], build: sizes[1] });
            setLayout(newLayout);
            layoutWriter.schedule(builderId, newLayout);
        },
        [builderId, layoutWriter]
    );

    if (isLoading || !layout) return null;

    return (
        <div className="flex-1 overflow-hidden">
            <div
                className="flex flex-col relative h-full border-2 border-transparent"
                style={{ borderBottomRightRadius: 8 }}
            >
                <PanelGroup key={builderId || "default"} direction="vertical" onLayout={handleVerticalLayout}>
                    <Panel defaultSize={layout.app} minSize={50}>
                        <BuilderAppPanel />
                    </Panel>
                    <PanelResizeHandle className="h-0.5 bg-transparent hover:bg-gray-500/20 transition-colors" />
                    <Panel defaultSize={layout.build} minSize={20} maxSize={50} style={{ borderBottomRightRadius: 8 }}>
                        <BuilderBuildPanel />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
});

BuilderWorkspace.displayName = "BuilderWorkspace";

export { BuilderWorkspace };
