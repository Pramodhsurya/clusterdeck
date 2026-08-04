// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// pi-agent panel — placeholder that replaces the Wave AI panel.
// Will be wired to pi-agent's store once the integration is built.

import React from "react";
import "./piagentpanel.scss";

export const PiAgentPanel: React.FC<{ roundTopLeft?: boolean }> = ({ roundTopLeft }) => {
    return (
        <div className="cd-piagent-panel" style={{ borderRadius: roundTopLeft ? "8px 0 0 0" : undefined }}>
            <div className="cd-piagent-header">
                <i className="fa-solid fa-robot" />
                <span>pi-agent</span>
            </div>
            <div className="cd-piagent-body">
                <div className="cd-piagent-placeholder">
                    <i className="fa-solid fa-robot fa-3x" />
                    <p>pi-agent integration</p>
                    <p className="cd-piagent-sub">Coming soon</p>
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
