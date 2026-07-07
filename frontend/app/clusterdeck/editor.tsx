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

        // Stale-content fix. model.fileContent checks two override buffers
        // (fileContentSaved / newFileContent) *before* the freshly-fetched file,
        // and both are shared across every file this one editor block shows — so
        // once autosave populates fileContentSaved for one file, the next file
        // would render that stale content. We clear them synchronously here when
        // the active file changes (React's blessed "reset state on prop change"
        // pattern) — doing it in render rather than an effect means the keyed
        // remount below reads cleared buffers on its very first paint, with no
        // stale flash. Any not-yet-autosaved edit to the file being left is
        // stashed for an effect to flush (a write RPC shouldn't run during
        // render), targeting that file's path explicitly since meta.file has
        // already moved on.
        const prevActiveFile = useRef(activeFile);
        const pendingFlushRef = useRef<{ path: string; content: string } | null>(null);
        if (prevActiveFile.current !== activeFile) {
            const leavingFile = prevActiveFile.current;
            const pending = globalStore.get(model.newFileContent);
            if (pending != null && leavingFile) {
                pendingFlushRef.current = { path: leavingFile, content: pending };
            }
            globalStore.set(model.fileContentSaved, null);
            globalStore.set(model.newFileContent, null);
            prevActiveFile.current = activeFile;
        }
        useEffect(() => {
            const f = pendingFlushRef.current;
            if (f == null) {
                return;
            }
            pendingFlushRef.current = null;
            fireAndForget(() => model.flushPendingSave(f.path, f.content));
        });

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
                {/* key on the active file so the whole preview subtree (Monaco
                    included) remounts per file. The block is shared across every
                    file opened from the explorer, and Monaco keeps one model per
                    editor instance keyed by path — without a hard remount, a
                    freshly-selected file could render against the previously
                    mounted model and show stale content. Keying on the
                    synchronous activeFile (meta.file) is more reliable than the
                    async statFilePath key Wave uses internally, which resolves
                    later and can briefly be undefined. */}
                <div className="cd-editor-content" key={activeFile ?? ""}>
                    <PreviewView blockId={blockId} blockRef={blockRef} contentRef={contentRef} model={model} />
                </div>
            </div>
        );
    }
);
ClusterdeckEditorView.displayName = "ClusterdeckEditorView";

export { ClusterdeckEditorModel };
