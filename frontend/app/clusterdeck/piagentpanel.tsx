// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// pi-agent panel and widget-rail toggle.
//
// Behaviour:
//   1. pi is installed by default — the widget-rail button guarantees a
//      working pi terminal by auto-installing (via npm) on first click.
//   2. user can uninstall — the side panel exposes an "Uninstall" button.
//   3. auto-update on open — every widget-rail click checks the npm
//      registry for the latest pi version and upgrades in-place before
//      opening the terminal. The check is cheap (one npm view call) and
//      idempotent, so it's safe to do on every click.

import React from "react";
import { ClusterdeckRootDirMetaKey } from "@/app/clusterdeck/connlock";
import { atoms, createBlock, getApi, refocusNode } from "@/store/global";
import { globalStore } from "@/store/jotaiStore";
import * as WOS from "@/store/wos";
import { fireAndForget } from "@/util/util";
import "./piagentpanel.scss";

// PiAgentPanel is the right-side placeholder that replaced the Wave AI
// panel. It now doubles as a tiny settings page — shows the installed
// version and exposes install/update/uninstall buttons. The widget-rail
// button is the primary affordance; this panel is just discoverable.
export const PiAgentPanel: React.FC<{ roundTopLeft?: boolean }> = ({ roundTopLeft }) => {
    const [status, setStatus] = React.useState<PiAgentStatus | null>(null);
    const [busy, setBusy] = React.useState<"idle" | "install" | "uninstall" | "update">("idle");
    const [error, setError] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        try {
            const s = await getApi().getPiAgentStatus();
            setStatus(s);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    React.useEffect(() => {
        fireAndForget(refresh);
    }, [refresh]);

    const runOp = async <T extends "install" | "uninstall" | "update">(op: T): Promise<void> => {
        setBusy(op);
        setError(null);
        try {
            const handler = {
                install: () => getApi().installPiAgent(),
                uninstall: () => getApi().uninstallPiAgent(),
                update: () => getApi().updatePiAgent(),
            }[op];
            const r = await handler();
            if (!r.ok) {
                setError(r.error ?? "operation failed");
            }
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy("idle");
        }
    };

    return (
        <div className="cd-piagent-panel" style={{ borderRadius: roundTopLeft ? "8px 0 0 0" : undefined }}>
            <div className="cd-piagent-header">
                <i className="fa-solid fa-robot" />
                <span>pi-agent</span>
            </div>
            <div className="cd-piagent-body">
                <div className="cd-piagent-status">
                    <div className="cd-piagent-status-row">
                        <span className="cd-piagent-status-label">installed</span>
                        <span className="cd-piagent-status-value">
                            {status == null ? "…" : status.installed ? `v${status.currentversion}` : "no"}
                        </span>
                    </div>
                    {status?.installed && status.latestversion && (
                        <div className="cd-piagent-status-row">
                            <span className="cd-piagent-status-label">latest</span>
                            <span className="cd-piagent-status-value">v{status.latestversion}</span>
                        </div>
                    )}
                    {status?.installed && status.updateavailable && (
                        <div className="cd-piagent-status-row cd-piagent-status-update">
                            <span>update available</span>
                        </div>
                    )}
                    {error && <div className="cd-piagent-error">{error}</div>}
                    <div className="cd-piagent-actions">
                        {!status?.installed && (
                            <button
                                type="button"
                                className="cd-piagent-btn cd-piagent-btn-primary"
                                disabled={busy !== "idle"}
                                onClick={() => fireAndForget(() => runOp("install"))}
                            >
                                {busy === "install" ? "Installing…" : "Install pi"}
                            </button>
                        )}
                        {status?.installed && status.updateavailable && (
                            <button
                                type="button"
                                className="cd-piagent-btn cd-piagent-btn-primary"
                                disabled={busy !== "idle"}
                                onClick={() => fireAndForget(() => runOp("update"))}
                            >
                                {busy === "update" ? "Updating…" : `Update to v${status.latestversion}`}
                            </button>
                        )}
                        {status?.installed && (
                            <button
                                type="button"
                                className="cd-piagent-btn cd-piagent-btn-danger"
                                disabled={busy !== "idle"}
                                onClick={() => fireAndForget(() => runOp("uninstall"))}
                            >
                                {busy === "uninstall" ? "Uninstalling…" : "Uninstall"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PiAgentToggleButton: React.FC<{ isOpen: boolean; onClick: () => void }> = ({ isOpen, onClick }) => {
    return (
        <div
            className={`cd-piagent-toggle ${isOpen ? "active" : ""}`}
            onClick={onClick}
            title={isOpen ? "Close pi-agent" : "Open pi-agent"}
        >
            <i className="fa-solid fa-robot" />
        </div>
    );
};

// ensurePiAgentInstalled checks the npm registry and brings the user's
// install up to date before the caller opens a pi terminal. It's safe
// to call on every widget-rail click — the cost is one `npm view` plus
// at most one `npm install` (the install is a no-op if already current).
//
// Resolves once pi is ready (installed and either current or upgraded).
// Throws on install failure so the caller can decide whether to open
// the terminal anyway — we currently swallow the error and open the
// terminal so the user sees a clear "pi: command not found" message
// instead of a silent failure.
export async function ensurePiAgentInstalled(): Promise<void> {
    let status: PiAgentStatus | null = null;
    try {
        status = await getApi().getPiAgentStatus();
    } catch {
        // If status query itself fails, fall through to install — better
        // to attempt install and surface a clear error than to do nothing.
        status = null;
    }

    if (status && !status.installed) {
        const r = await getApi().installPiAgent();
        if (!r.ok) {
            throw new Error(r.error ?? "pi install failed");
        }
        return;
    }

    if (status && status.updateavailable) {
        const r = await getApi().updatePiAgent();
        if (!r.ok) {
            throw new Error(r.error ?? "pi update failed");
        }
    }
}

// openOrFocusPiAgent brings up a terminal block running `pi` in the
// current workspace project. If the tab already has a pi-agent block,
// just focus it (mirrors openOrFocusExplorer / openOrFocusEditor in
// explorer.tsx so a double-click doesn't spawn a second terminal).
//
// `pi` is launched via a cmd controller so it owns the block — when pi
// exits, the block surfaces its exit code and stays open for review.
// The `cmd:cwd` is the workspace's clusterdeck:rootdir so pi sees the
// project. Auto-install/auto-update happens before the terminal opens
// (see ensurePiAgentInstalled).
const piAgentBlockEnsures = new Map<string, Promise<void>>();

export function openOrFocusPiAgent() {
    const tabId = globalStore.get(atoms.staticTabId);
    if (tabId == null) {
        return;
    }
    const key = `${tabId}:piagent`;
    if (piAgentBlockEnsures.has(key)) {
        return;
    }
    const p = (async () => {
        try {
            await ensurePiAgentInstalled();
        } catch (e) {
            // We log and continue — the terminal will surface
            // "command not found" so the user sees what happened.
            console.error("pi-agent auto-install failed:", e);
        }
        const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
        const existingId = tab?.blockids?.find((bid) => {
            const meta = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", bid)))?.meta;
            return meta?.view === "term" && meta?.controller === "cmd" && meta?.["cmd"] === "pi";
        });
        if (existingId != null) {
            refocusNode(existingId);
            return;
        }
        const ws = globalStore.get(atoms.workspace);
        const rootDir = (ws?.meta?.[ClusterdeckRootDirMetaKey] as string) ?? "";
        const meta: MetaType = {
            view: "term",
            controller: "cmd",
            "cmd": "pi",
        };
        if (rootDir) {
            meta["cmd:cwd"] = rootDir;
        }
        const blockId = await createBlock({ meta });
        refocusNode(blockId);
    })().finally(() => {
        piAgentBlockEnsures.delete(key);
    });
    piAgentBlockEnsures.set(key, p);
    fireAndForget(() => p);
}

// uninstallPiAgent is exposed for callers (settings menu, future
// keyboard shortcut) that want to remove pi without going through the
// panel UI. The panel UI itself doesn't use this — it calls the IPC
// directly so it can show in-progress feedback.
export async function uninstallPiAgent(): Promise<void> {
    const r = await getApi().uninstallPiAgent();
    if (!r.ok) {
        throw new Error(r.error ?? "pi uninstall failed");
    }
}