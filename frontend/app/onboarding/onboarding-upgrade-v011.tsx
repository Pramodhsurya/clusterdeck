// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_1_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.1 adds app widgets, Kubernetes cluster support, and a round of explorer/SSH
                    fixes.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-dharmachakra"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        App Widgets &amp; Kubernetes Clusters
                    </div>
                    <div className="text-secondary leading-5">
                        Launch k9s, lazygit, or htop bound to the active connection. Add kubeconfigs and switch
                        between registered clusters right from k9s's own dropdown — several clusters can be open at
                        once.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-folder-tree"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">Explorer Improvements</div>
                    <div className="text-secondary leading-5">
                        <ul className="list-disc list-outside space-y-1 pl-5">
                            <li>Fixed the explorer losing its SSH connection after an app restart</li>
                            <li>
                                VS Code-style right-click menus for the file tree and open editors (new
                                file/folder, rename, delete, cut/copy/paste, copy path)
                            </li>
                            <li>"Change root" now uses the same native folder picker as the file explorer</li>
                            <li>Explorer and editor panes can be reopened from the widget bar if closed</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-wrench"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">Other Changes</div>
                    <div className="text-secondary leading-5">
                        <ul className="list-disc list-outside space-y-1 pl-5">
                            <li>"Remember this password" for SSH password auth, so you're not prompted every reconnect</li>
                            <li>
                                Terminals can be switched to run locally instead of the workspace's SSH connection,
                                independent of other blocks
                            </li>
                            <li>The Welcome page's Recent list no longer loses an entry when you delete its workspace</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_1_Content.displayName = "UpgradeOnboardingModal_v0_1_1_Content";

export { UpgradeOnboardingModal_v0_1_1_Content };
