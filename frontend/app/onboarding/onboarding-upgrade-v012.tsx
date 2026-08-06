// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_2_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.2 is a follow-up patch: a real fix for the htop
                    app widget, a per-terminal connection override, and a round of leftover
                    Wave-branding cleanup.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-dharmachakra"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Fixed "command not found" for app widgets
                    </div>
                    <div className="text-secondary leading-5">
                        The htop widget now launches in a login shell, so Homebrew-installed
                        tools (under <code>/opt/homebrew/bin</code>) are actually found on PATH.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-terminal"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Per-Terminal Connection Override
                    </div>
                    <div className="text-secondary leading-5">
                        A single terminal in an SSH workspace can now be switched to run locally
                        instead, without affecting the explorer, editor, or other terminals.
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
                            <li>Fixed a race in "remember this password" that could permanently save a rejected password</li>
                            <li>Homebrew installs now clear the quarantine flag automatically after install/upgrade</li>
                            <li>Cleaned up several leftover "Wave"-branded strings in dialogs and error messages</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_2_Content.displayName = "UpgradeOnboardingModal_v0_1_2_Content";

export { UpgradeOnboardingModal_v0_1_2_Content };
