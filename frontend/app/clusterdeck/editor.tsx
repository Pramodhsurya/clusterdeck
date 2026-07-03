// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Clusterdeck editor — the designated editor block (§3.5, change #6 X#). A thin
// subclass of Wave's PreviewModel that renders an editor tab strip (the files in
// clusterdeck:openfiles) above the embedded preview/Monaco of the active file.

import { baseName, fileStyle } from "@/app/clusterdeck/explorer";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { PreviewView } from "@/app/view/preview/preview";
import { PreviewModel } from "@/app/view/preview/preview-model";
import { WOS } from "@/store/global";
import { fireAndForget, makeIconClass } from "@/util/util";
import clsx from "clsx";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo } from "react";

import "./editor.scss";

class ClusterdeckEditorModel extends PreviewModel {
    openFilesAtom: jotai.Atom<string[]>;
    activeFileAtom: jotai.Atom<string | null>;

    constructor(opts: ViewModelInitType) {
        super(opts);
        this.viewType = "cdeditor";
        this.openFilesAtom = jotai.atom(
            (get) => (get(this.blockAtom)?.meta?.["clusterdeck:openfiles"] as string[]) ?? []
        );
        this.activeFileAtom = jotai.atom((get) => (get(this.blockAtom)?.meta?.file as string) ?? null);
    }

    get viewComponent(): ViewComponent {
        return ClusterdeckEditorView;
    }

    setActiveFile(path: string) {
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, { oref: WOS.makeORef("block", this.blockId), meta: { file: path } })
        );
    }

    closeFile(path: string) {
        const meta = globalStore.get(this.blockAtom)?.meta;
        const openFiles = (meta?.["clusterdeck:openfiles"] as string[]) ?? [];
        const next = openFiles.filter((f) => f !== path);
        const active = meta?.file as string;
        const newActive = active === path ? (next[next.length - 1] ?? "") : active;
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { file: newActive, "clusterdeck:openfiles": next } as MetaType,
            })
        );
    }
}

const ClusterdeckEditorView = memo(
    ({
        blockId,
        blockRef,
        contentRef,
        model,
    }: {
        blockId: string;
        blockRef: React.RefObject<HTMLDivElement>;
        contentRef: React.RefObject<HTMLDivElement>;
        model: ClusterdeckEditorModel;
    }) => {
        const openFiles = useAtomValue(model.openFilesAtom);
        const activeFile = useAtomValue(model.activeFileAtom);
        return (
            <div className="cd-editor">
                {openFiles.length > 0 && (
                    <div className="cd-editor-tabs">
                        {openFiles.map((f) => {
                            const style = fileStyle(baseName(f));
                            return (
                                <div
                                    key={f}
                                    className={clsx("cd-editor-tab", { active: f === activeFile })}
                                    onClick={() => model.setActiveFile(f)}
                                    title={f}
                                >
                                    <i className={makeIconClass(style.icon, true)} style={{ color: style.color }} />
                                    <span className="cd-editor-tab-name">{baseName(f)}</span>
                                    <i
                                        className={clsx(makeIconClass("xmark", true), "cd-editor-tab-close")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            model.closeFile(f);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="cd-editor-content">
                    <PreviewView blockId={blockId} blockRef={blockRef} contentRef={contentRef} model={model} />
                </div>
            </div>
        );
    }
);
ClusterdeckEditorView.displayName = "ClusterdeckEditorView";

export { ClusterdeckEditorModel };
