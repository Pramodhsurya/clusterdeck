// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Clusterdeck editor — the designated editor block (§3.5, change #6 X#). Renders
// an editor tab strip (clusterdeck:openfiles) and keeps a mounted PreviewView
// per open file (each pinned to its file), showing only the active one — so
// switching tabs is instant and already-open files stay loaded (cached).

import { BlockNodeModel } from "@/app/block/blocktypes";
import { baseName, fileStyle } from "@/app/clusterdeck/explorer";
import { globalStore } from "@/app/store/jotaiStore";
import type { TabModel } from "@/app/store/tab-model";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { PreviewView } from "@/app/view/preview/preview";
import { PreviewModel } from "@/app/view/preview/preview-model";
import { WOS } from "@/store/global";
import { fireAndForget, makeIconClass } from "@/util/util";
import clsx from "clsx";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo, useRef } from "react";

import "./editor.scss";

class ClusterdeckEditorModel implements ViewModel {
    viewType = "cdeditor";
    blockId: string;
    nodeModel: BlockNodeModel;
    tabModel: TabModel;
    env: WaveEnv;
    blockAtom: jotai.Atom<Block>;
    viewIcon: jotai.Atom<string>;
    viewName: jotai.Atom<string>;
    openFilesAtom: jotai.Atom<string[]>;
    activeFileAtom: jotai.Atom<string | null>;

    private initOpts: ViewModelInitType;
    private fileModels = new Map<string, PreviewModel>();

    constructor(opts: ViewModelInitType) {
        this.initOpts = opts;
        this.blockId = opts.blockId;
        this.nodeModel = opts.nodeModel;
        this.tabModel = opts.tabModel;
        this.env = opts.waveEnv;
        this.blockAtom = opts.waveEnv.wos.getWaveObjectAtom<Block>(WOS.makeORef("block", opts.blockId));
        this.openFilesAtom = jotai.atom(
            (get) => (get(this.blockAtom)?.meta?.["clusterdeck:openfiles"] as string[]) ?? []
        );
        this.activeFileAtom = jotai.atom((get) => (get(this.blockAtom)?.meta?.file as string) ?? null);
        this.viewIcon = jotai.atom((get) => {
            const f = get(this.activeFileAtom);
            return f ? fileStyle(baseName(f)).icon : "file-lines";
        });
        this.viewName = jotai.atom((get) => {
            const f = get(this.activeFileAtom);
            return f ? baseName(f) : "Editor";
        });
    }

    get viewComponent(): ViewComponent {
        return ClusterdeckEditorView;
    }

    // A PreviewModel pinned to a fixed file (cached), so its editor stays mounted.
    getFileModel(file: string): PreviewModel {
        let pm = this.fileModels.get(file);
        if (pm == null) {
            pm = new PreviewModel(this.initOpts);
            // Pin this model to `file` regardless of the block's active file.
            pm.metaFilePath = jotai.atom(() => file);
            this.fileModels.set(file, pm);
        }
        return pm;
    }

    private disposeFileModel(file: string) {
        const pm = this.fileModels.get(file);
        if (pm != null) {
            (pm as { dispose?: () => void }).dispose?.();
            this.fileModels.delete(file);
        }
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
        this.disposeFileModel(path);
        fireAndForget(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { file: newActive, "clusterdeck:openfiles": next } as MetaType,
            })
        );
    }
}

const FilePane = memo(
    ({
        blockId,
        blockRef,
        model,
        visible,
    }: {
        blockId: string;
        blockRef: React.RefObject<HTMLDivElement>;
        model: PreviewModel;
        visible: boolean;
    }) => {
        const contentRef = useRef<HTMLDivElement>(null);
        return (
            <div className="cd-editor-pane" style={{ display: visible ? "flex" : "none" }}>
                <PreviewView blockId={blockId} blockRef={blockRef} contentRef={contentRef} model={model} />
            </div>
        );
    }
);
FilePane.displayName = "FilePane";

const ClusterdeckEditorView = memo(
    ({
        blockId,
        blockRef,
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
                    {openFiles.map((f) => (
                        <FilePane
                            key={f}
                            blockId={blockId}
                            blockRef={blockRef}
                            model={model.getFileModel(f)}
                            visible={f === activeFile}
                        />
                    ))}
                </div>
            </div>
        );
    }
);
ClusterdeckEditorView.displayName = "ClusterdeckEditorView";

export { ClusterdeckEditorModel };
