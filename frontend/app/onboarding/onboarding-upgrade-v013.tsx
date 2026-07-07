// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_3_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.3 focuses on the editor: it now autosaves, and switching
                    between open files always shows the right file's content.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-file-lines"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Correct Content When Switching Files
                    </div>
                    <div className="text-secondary leading-5">
                        Fixed a bug where switching between open files in the editor could keep
                        showing the previous file's content. Each file now renders its own content
                        immediately, with no stale flash.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-floppy-disk"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">Autosave</div>
                    <div className="text-secondary leading-5">
                        The editor now saves automatically a moment after you stop typing — no more
                        manual save. Undo (Cmd+Z) is unaffected, and a not-yet-saved edit is flushed
                        to the right file when you switch away.
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_3_Content.displayName = "UpgradeOnboardingModal_v0_1_3_Content";

export { UpgradeOnboardingModal_v0_1_3_Content };
