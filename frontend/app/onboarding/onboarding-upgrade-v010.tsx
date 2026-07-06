// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

const UpgradeOnboardingModal_v0_1_0_Content = () => {
    return (
        <div className="flex flex-col items-start gap-6 w-full mb-4 unselectable">
            <div className="text-secondary leading-relaxed">
                <p className="mb-0">
                    Clusterdeck v0.1.0 is the first release: a VS Code–style, multi-cluster SSH workspace built on
                    Wave Terminal, where a connection <em>is</em> the workspace.
                </p>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-server"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Connections Rail
                    </div>
                    <div className="text-secondary leading-5">
                        A vertical, collapsible workspace switcher — every saved SSH host and local folder gets its
                        own row with a status dot and hotkey; selecting one swaps the entire window to that
                        session's layout.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-table-columns"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">
                        Fixed IDE Layout
                    </div>
                    <div className="text-secondary leading-5">
                        Every connection workspace seeds a full-height explorer, a routed editor, and terminals —
                        clicking a file in the explorer always opens it in the same designated editor block.
                    </div>
                </div>
            </div>

            <div className="flex w-full items-start gap-4">
                <div className="flex-shrink-0">
                    <i className="text-[24px] text-accent fa-solid fa-lock"></i>
                </div>
                <div className="flex flex-col items-start gap-2 flex-1">
                    <div className="text-foreground text-base font-semibold leading-[18px]">Other Changes</div>
                    <div className="text-secondary leading-5">
                        <ul className="list-disc list-outside space-y-1 pl-5">
                            <li>Connections auto-seed as saved workspaces from <code>~/.ssh/config</code></li>
                            <li>New blocks in a connection workspace inherit its connection — no per-block picker</li>
                            <li>
                                Keeps Wave's durable SSH sessions, <code>wsh</code>, Monaco editor, terminal
                                blocks, and secret storage intact
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

UpgradeOnboardingModal_v0_1_0_Content.displayName = "UpgradeOnboardingModal_v0_1_0_Content";

export { UpgradeOnboardingModal_v0_1_0_Content };
