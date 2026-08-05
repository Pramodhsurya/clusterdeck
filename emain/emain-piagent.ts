// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// IPC handlers for the pi-agent integration. Clusterdeck ships with pi as
// the recommended coding agent — the widget-rail button guarantees it's
// installed and up to date before opening a pi terminal, and the settings
// panel exposes an uninstall button. All four operations are async
// (npm install/uninstall/update can take a while on a cold cache).

import { ipcMain } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// PiPackageName is the npm package that provides the `pi` binary. The
// `pi` symlink in node_modules/.bin points at its dist/cli.js.
const PiPackageName = "@earendil-works/pi-coding-agent";

// versionRegexp pulls a semver-looking token out of `pi --version` and
// `npm view ... version` output. Tolerant of a leading `v` and any
// trailing junk so a future release that switches to `v0.84.0 (built ...)`
// style banners still parses.
const versionRegexp = /v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/;

// npm binary lookup is cached on first install/uninstall/update call so
// the renderer doesn't pay a PATH walk per click, but a Node.js install
// made earlier in the same session still gets picked up.
let cachedNpmPath: string | null = null;

// resolveNpm finds npm on PATH. Returns null if not found — that becomes
// the user-facing error "you need Node.js installed".
async function resolveNpm(): Promise<string | null> {
    if (cachedNpmPath != null) {
        return cachedNpmPath;
    }
    try {
        // `which npm` returns 0 + the path on Linux/macOS, non-zero if npm
        // is missing. Using execFile avoids shell-injection concerns even
        // though we control the input.
        const { stdout } = await execFileP("which", ["npm"]);
        const path = stdout.trim().split("\n")[0];
        if (path) {
            cachedNpmPath = path;
            return path;
        }
    } catch {
        // fall through
    }
    return null;
}

// PiAgentStatus mirrors the Go-side struct that the renderer's
// frontend/types/custom.d.ts declares. Keep the field names in sync.
export type PiAgentStatus = {
    installed: boolean;
    currentversion?: string;
    latestversion?: string;
    updateavailable: boolean;
};

// parseVersionFromOutput extracts the first semver-looking token from a
// command's combined output. Returns null if no match.
function parseVersionFromOutput(output: string): string | null {
    const m = versionRegexp.exec(output);
    return m && m[1] ? m[1] : null;
}

// getCurrentVersion runs `pi --version`, falling back to `npm ls -g <pkg>`
// if pi isn't on PATH (some npm installs only put the package's bin in
// /opt/homebrew/bin or similar without symlinking it locally).
async function getCurrentVersion(): Promise<string | null> {
    try {
        const { stdout, stderr } = await execFileP("pi", ["--version"], { timeout: 5000 });
        const v = parseVersionFromOutput(stdout + stderr);
        if (v) return v;
    } catch {
        // pi not installed; fall through to npm ls
    }
    try {
        const { stdout } = await execFileP("npm", ["ls", "-g", PiPackageName, "--json", "--depth=0"], {
            timeout: 10000,
        });
        const lines = stdout.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes(PiPackageName)) continue;
            for (let j = i + 1; j < i + 8 && j < lines.length; j++) {
                const m = /"version"\s*:\s*"([^"]+)"/.exec(lines[j]);
                if (m) return m[1];
            }
        }
    } catch {
        // npm ls failure — just return null
    }
    return null;
}

// getLatestVersion runs `npm view <pkg> version`. Returns null on failure
// (network down, npm not on PATH) — callers treat that as "don't know".
async function getLatestVersion(): Promise<string | null> {
    try {
        const { stdout } = await execFileP("npm", ["view", PiPackageName, "version"], { timeout: 10000 });
        return parseVersionFromOutput(stdout);
    } catch {
        return null;
    }
}

// compareVersions does a numeric three-part compare on semver-ish strings,
// ignoring pre-release/build tags. Used to decide "update available".
function compareVersions(a: string, b: string): number {
    const strip = (v: string) => {
        const i = v.search(/[-+]/);
        return i < 0 ? v : v.substring(0, i);
    };
    const as = strip(a).split(".");
    const bs = strip(b).split(".");
    for (let i = 0; i < 3; i++) {
        const ai = parseInt(as[i] || "0", 10) || 0;
        const bi = parseInt(bs[i] || "0", 10) || 0;
        if (ai !== bi) return ai < bi ? -1 : 1;
    }
    return 0;
}

// All four operations use ipcMain.handle. install/uninstall/update share a
// lock so a rapid double-click on "Update" can't spawn two npm processes
// (mirrors configureAutoUpdater in emain/updater.ts).
let piAgentOpLock = false;

ipcMain.handle("piagent-get-status", async (): Promise<PiAgentStatus> => {
    const current = await getCurrentVersion();
    const latest = await getLatestVersion();
    const installed = current != null;
    let updateAvailable = false;
    if (installed && latest) {
        updateAvailable = compareVersions(current!, latest) < 0;
    }
    return {
        installed,
        currentversion: current ?? "",
        latestversion: latest ?? "",
        updateavailable: updateAvailable,
    };
});

ipcMain.handle("piagent-install", async () => {
    if (piAgentOpLock) {
        return { ok: false, error: "another pi-agent operation is in progress" };
    }
    piAgentOpLock = true;
    try {
        const npm = await resolveNpm();
        if (!npm) {
            return { ok: false, error: "npm not found on PATH (install Node.js first)" };
        }
        await execFileP(npm, ["install", "-g", PiPackageName], {
            timeout: 180_000,
            env: { ...process.env, LC_ALL: "C", LANG: "C" },
        });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    } finally {
        piAgentOpLock = false;
    }
});

ipcMain.handle("piagent-uninstall", async () => {
    if (piAgentOpLock) {
        return { ok: false, error: "another pi-agent operation is in progress" };
    }
    piAgentOpLock = true;
    try {
        const npm = await resolveNpm();
        if (!npm) {
            return { ok: false, error: "npm not found on PATH (install Node.js first)" };
        }
        await execFileP(npm, ["uninstall", "-g", PiPackageName], {
            timeout: 180_000,
            env: { ...process.env, LC_ALL: "C", LANG: "C" },
        });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    } finally {
        piAgentOpLock = false;
    }
});

ipcMain.handle("piagent-update", async () => {
    if (piAgentOpLock) {
        return { ok: false, error: "another pi-agent operation is in progress" };
    }
    piAgentOpLock = true;
    try {
        const npm = await resolveNpm();
        if (!npm) {
            return { ok: false, error: "npm not found on PATH (install Node.js first)" };
        }
        await execFileP(npm, ["install", "-g", PiPackageName + "@latest"], {
            timeout: 180_000,
            env: { ...process.env, LC_ALL: "C", LANG: "C" },
        });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    } finally {
        piAgentOpLock = false;
    }
});