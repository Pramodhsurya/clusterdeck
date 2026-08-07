// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { dialog, ipcMain } from "electron";
import { fireAndForget } from "../frontend/util/util";
import { focusedWaveWindow, getAllWaveWindows } from "./emain-window";

export const ClusterdeckAutoUpdaterEnabled = false;
export let updater: Updater;

const HomebrewUpdateMessage =
    "Clusterdeck does not use the inherited Wave automatic updater. Upgrade with `brew update && brew upgrade --cask clusterdeck`, or download a verified artifact from https://github.com/clusterdeck/releases.";

export class Updater {
    private _status: UpdaterStatus = "up-to-date";

    constructor(_settings?: SettingsType) {}

    get status(): UpdaterStatus {
        return this._status;
    }

    async start() {
        console.log("Clusterdeck automatic updater is disabled; releases are distributed through Homebrew and GitHub.");
    }

    stop() {}

    async checkForUpdates(userInput: boolean) {
        if (!userInput) {
            return;
        }
        const options: Electron.MessageBoxOptions = {
            type: "info",
            title: "Update Clusterdeck",
            message: "Update Clusterdeck with Homebrew",
            detail: HomebrewUpdateMessage,
        };
        const windows = getAllWaveWindows();
        if (focusedWaveWindow || windows.length > 0) {
            await dialog.showMessageBox(focusedWaveWindow ?? windows[0], options);
        } else {
            await dialog.showMessageBox(options);
        }
    }

    async promptToInstallUpdate() {
        await this.checkForUpdates(true);
    }

    async installUpdate() {
        await this.checkForUpdates(true);
    }
}

export function getResolvedUpdateChannel(): string {
    return "disabled";
}

ipcMain.on("install-app-update", () => fireAndForget(updater?.promptToInstallUpdate.bind(updater)));
ipcMain.on("get-app-update-status", (event) => {
    event.returnValue = updater?.status ?? "up-to-date";
});
ipcMain.on("get-updater-channel", (event) => {
    event.returnValue = getResolvedUpdateChannel();
});

export async function configureAutoUpdater() {
    updater = new Updater();
    await updater.start();
}
