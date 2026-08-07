// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_4_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.4 sharpens the macOS-first shell, explorer, and editor experience and makes
                    telemetry private by default.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-layer-group"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">A leaner workspace</div>
                    <div className="text-secondary leading-5">
                        Built-in AI and the short-lived coding-agent integration are gone. The k9s and lazygit launchers
                        were removed; the simple login-shell htop widget remains. Editor-at-top layout and workspace
                        lifecycle handling are more reliable.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-shield-halved"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">Private by default</div>
                    <div className="text-secondary leading-5">
                        Usage telemetry is off until you opt in, pre-consent queues are discarded, and the diagnostic
                        ping follows that choice. The inherited Wave updater is disabled; update through Homebrew or a
                        verified Clusterdeck release artifact.
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_4_Content.displayName = "UpgradeOnboardingModal_v0_1_4_Content";

export { UpgradeOnboardingModal_v0_1_4_Content };
