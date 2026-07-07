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
import { fireAndForget, makeIconClass, stringToBase64 } from "@/util/util";
import clsx from "clsx";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import { memo, useEffect, useRef } from "react";

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

    // Autosave for a file we're navigating away from. Takes the path/content
    // explicitly (rather than reusing handleFileSave, which resolves the path
    // from the block's *current* file meta) because by the time this runs the
    // active-file effect has already detected the switch — meta.file points at
    // the file we're switching TO, not the one this pending edit belongs to.
    async flushPendingSave(filePath: string, content: string) {
        try {
            const path = await this.formatRemoteUri(filePath, globalStore.get);
            await this.env.rpc.FileWriteCommand(TabRpcClient, {
                info: { path },
                data64: stringToBase64(content),
            });
        } catch (e) {
            console.log("autosave flush-on-switch failed", filePath, e);
        }
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

        // This block is shared across every file opened from the explorer (§3.5
        // routing) — switching the active file only changes the `file` meta
        // directly (explorer.tsx's openInEditor/setActiveEditorFile, and
        // setActiveFile above), bypassing Wave's own goHistory, which is the only
        // other place that changes `file` on a live preview block and which
        // clears these same two buffers when it does. Without this, whichever
        // file was last saved/typed into keeps overriding freshly-fetched content
        // for every file opened afterward — not just visually stale, but a real
        // risk of saving the wrong content into the wrong file.
        const prevActiveFile = useRef(activeFile);
        useEffect(() => {
            if (prevActiveFile.current === activeFile) {
                return;
            }
            const leavingFile = prevActiveFile.current;
            const pending = globalStore.get(model.newFileContent);
            prevActiveFile.current = activeFile;
            globalStore.set(model.fileContentSaved, null);
            globalStore.set(model.newFileContent, null);
            // Flush a not-yet-autosaved edit to the file we're leaving instead of
            // just discarding it — targets leavingFile explicitly since meta.file
            // has already moved to the new file by the time this runs.
            if (pending != null && leavingFile) {
                fireAndForget(() => model.flushPendingSave(leavingFile, pending));
            }
        }, [activeFile]);

        // Autosave: debounced so normal typing doesn't hammer the (possibly
        // remote/SSH) filesystem with a write per keystroke. Reuses Wave's own
        // handleFileSave — it only performs the RPC write and updates the
        // fileContentSaved/newFileContent buffers, never touches the Monaco
        // model/editor, so it has no effect on Cmd+Z/Cmd+Shift+Z (Monaco's undo
        // stack is independent of when/whether the content has been saved).
        const newFileContent = useAtomValue(model.newFileContent);
        useEffect(() => {
            if (newFileContent == null) {
                return;
            }
            const timer = setTimeout(() => {
                fireAndForget(() => model.handleFileSave());
            }, 600);
            return () => clearTimeout(timer);
        }, [newFileContent, model]);

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
