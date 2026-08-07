// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_2_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.2 improves command launchers, installation guidance, and user-facing branding.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-terminal"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Login-shell PATH for app widgets
                    </div>
                    <div className="text-secondary leading-5">
                        The k9s, lazygit, and htop launchers present in this release now start through a login shell, so
                        Homebrew tools under <code>/opt/homebrew/bin</code> can be found on PATH.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-wrench"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Install and branding fixes
                    </div>
                    <div className="text-secondary leading-5">
                        <ul className="list-disc list-outside space-y-1 pl-5">
                            <li>Documented automatic quarantine clearing and forced Homebrew tap refreshes</li>
                            <li>Cleaned up remaining Wave-branded strings in dialogs and error messages</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_2_Content.displayName = "UpgradeOnboardingModal_v0_1_2_Content";

export { UpgradeOnboardingModal_v0_1_2_Content };
